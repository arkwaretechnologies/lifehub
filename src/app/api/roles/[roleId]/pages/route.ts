import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { assertCanManageRoles } from "@/lib/adminRole";
import { isAllowedPageKey } from "@/lib/navPermissionCatalog";

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

function parseRoleId(roleId: string): number | null {
  const id = Number.parseInt(roleId, 10);
  return Number.isFinite(id) ? id : null;
}

export async function GET(
  _req: Request,
  context: { params: Promise<{ roleId: string }> },
) {
  const supabase = adminClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Server missing SUPABASE_SERVICE_ROLE_KEY or Supabase URL." },
      { status: 500 },
    );
  }

  const { roleId: roleIdParam } = await context.params;
  const roleId = parseRoleId(roleIdParam);
  if (roleId === null) {
    return NextResponse.json({ error: "Invalid role id." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("role_pages")
    .select("page_key")
    .eq("role_id", roleId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const pageKeys = (data ?? []).map((r) => r.page_key as string);
  return NextResponse.json({ pageKeys });
}

export async function PUT(
  req: Request,
  context: { params: Promise<{ roleId: string }> },
) {
  const supabase = adminClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Server missing SUPABASE_SERVICE_ROLE_KEY or Supabase URL." },
      { status: 500 },
    );
  }

  const forbidden = await assertCanManageRoles(req, supabase);
  if (forbidden) return forbidden;

  const { roleId: roleIdParam } = await context.params;
  const roleId = parseRoleId(roleIdParam);
  if (roleId === null) {
    return NextResponse.json({ error: "Invalid role id." }, { status: 400 });
  }

  const body = (await req.json().catch(() => null)) as { pageKeys?: unknown } | null;
  if (!body || !Array.isArray(body.pageKeys)) {
    return NextResponse.json({ error: "pageKeys array is required." }, { status: 400 });
  }

  const raw = body.pageKeys as unknown[];
  const pageKeys: string[] = [];
  for (const x of raw) {
    if (typeof x !== "string") {
      return NextResponse.json({ error: "Each page key must be a string." }, { status: 400 });
    }
    const k = x.trim();
    if (k.length > 80) {
      return NextResponse.json({ error: `Invalid page key (too long): ${k.slice(0, 20)}…` }, { status: 400 });
    }
    if (!isAllowedPageKey(k)) {
      return NextResponse.json({ error: `Unknown page key: ${k}` }, { status: 400 });
    }
    if (!pageKeys.includes(k)) pageKeys.push(k);
  }

  const { error: delErr } = await supabase.from("role_pages").delete().eq("role_id", roleId);
  if (delErr) {
    return NextResponse.json({ error: delErr.message }, { status: 400 });
  }

  if (pageKeys.length > 0) {
    const rows = pageKeys.map((page_key) => ({ role_id: roleId, page_key }));
    const { error: insErr } = await supabase.from("role_pages").insert(rows);
    if (insErr) {
      return NextResponse.json({ error: insErr.message }, { status: 400 });
    }
  }

  const { error: roleErr } = await supabase
    .from("roles")
    .update({ updated_at: new Date().toISOString() })
    .eq("role_id", roleId);

  if (roleErr) {
    return NextResponse.json({ error: roleErr.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, pageKeys });
}
