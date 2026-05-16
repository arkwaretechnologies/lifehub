import type { SupabaseClient } from "@supabase/supabase-js";
import { defaultMenuAccess, type MenuAccessState } from "@/lib/menuAccess";

/**
 * Resolve RBAC menu keys for a role name (same rules as GET /api/role-menu-access).
 * For use from Route Handlers with a service-role Supabase client.
 */
export async function getMenuAccessForRoleName(
  admin: SupabaseClient,
  roleName: string,
): Promise<MenuAccessState> {
  const trimmed = roleName.trim();
  if (!trimmed) return defaultMenuAccess;

  const { data: role, error: roleError } = await admin
    .from("roles")
    .select("role_id")
    .ilike("name", trimmed)
    .maybeSingle();

  if (roleError) return defaultMenuAccess;
  if (!role) return defaultMenuAccess;

  const { data: pages, error: pagesError } = await admin
    .from("role_pages")
    .select("page_key")
    .eq("role_id", (role as { role_id: string | number }).role_id);

  if (pagesError) return defaultMenuAccess;

  const pageKeys = [...new Set((pages ?? []).map((p) => String((p as { page_key: string }).page_key)))];
  return { rbac: true, pageKeys };
}
