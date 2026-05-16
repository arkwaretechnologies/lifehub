import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getMenuAccessForRoleName } from "@/lib/roleMenuAccessServer";

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

  const menuAccess = await getMenuAccessForRoleName(supabase, roleName);
  if (menuAccess.rbac) {
    return NextResponse.json({ rbac: true, pageKeys: menuAccess.pageKeys });
  }
  return NextResponse.json({ rbac: false, pageKeys: [] as string[] });
}
