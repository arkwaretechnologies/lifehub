import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

/**
 * Returns `role_pages.page_key` list for a role name from `public.roles`.
 * If the name is not in `roles`, `rbac: false` → client shows full menu (legacy users).
 */
export async function GET(req: Request) {
  const roleName = new URL(req.url).searchParams.get("roleName")?.trim();
  if (!roleName) {
    return NextResponse.json({ error: "roleName query parameter is required." }, { status: 400 });
  }

  const supabase = adminClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Server missing SUPABASE_SERVICE_ROLE_KEY or Supabase URL." },
      { status: 500 },
    );
  }

  const { data: role, error: roleError } = await supabase
    .from("roles")
    .select("role_id")
    .ilike("name", roleName)
    .maybeSingle();

  if (roleError) {
    return NextResponse.json({ error: roleError.message }, { status: 400 });
  }

  if (!role) {
    return NextResponse.json({ rbac: false, pageKeys: [] as string[] });
  }

  const { data: pages, error: pagesError } = await supabase
    .from("role_pages")
    .select("page_key")
    .eq("role_id", role.role_id);

  if (pagesError) {
    return NextResponse.json({ error: pagesError.message }, { status: 400 });
  }

  const pageKeys = [...new Set((pages ?? []).map((p) => String(p.page_key)))];
  return NextResponse.json({ rbac: true, pageKeys });
}
