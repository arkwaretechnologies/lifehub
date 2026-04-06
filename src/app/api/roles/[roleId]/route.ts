import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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

export async function PATCH(
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

  const { roleId: roleIdParam } = await context.params;
  const roleId = parseRoleId(roleIdParam);
  if (roleId === null) {
    return NextResponse.json({ error: "Invalid role id." }, { status: 400 });
  }

  const body = (await req.json().catch(() => null)) as {
    name?: string;
    description?: string | null;
  } | null;

  if (!body || (body.name === undefined && body.description === undefined)) {
    return NextResponse.json({ error: "Provide name and/or description." }, { status: 400 });
  }

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (!name) {
      return NextResponse.json({ error: "name cannot be empty." }, { status: 400 });
    }
    if (name.length > 50) {
      return NextResponse.json({ error: "name must be at most 50 characters." }, { status: 400 });
    }
    patch.name = name;
  }

  if (body.description !== undefined) {
    patch.description =
      body.description === null ? null : String(body.description).trim() || null;
  }

  const { data, error } = await supabase
    .from("roles")
    .update(patch)
    .eq("role_id", roleId)
    .select("role_id, name, description, created_at, updated_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  if (!data) {
    return NextResponse.json({ error: "Role not found." }, { status: 404 });
  }

  return NextResponse.json({ role: data });
}

export async function DELETE(
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

  const { error } = await supabase.from("roles").delete().eq("role_id", roleId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
