import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getMenuAccessForRoleName } from "@/lib/roleMenuAccessServer";
import { getBearerSessionUserId } from "@/lib/requireSession";

/** Comma-separated role names from `users.role`; match is case-insensitive. */
export function parseAdminRoleNames(): string[] {
  const raw = process.env.ADMIN_ROLE_NAMES?.trim();
  if (!raw) return ["Administrator", "ADMIN"];
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

async function sessionUserRoleName(admin: SupabaseClient, userId: number): Promise<string | null> {
  const { data, error } = await admin.from("users").select("role").eq("user_id", userId).maybeSingle();
  if (error || !data?.role) return null;
  const role = String(data.role).trim();
  return role || null;
}

export async function userHasAdminRole(admin: SupabaseClient, userId: number): Promise<boolean> {
  const names = parseAdminRoleNames();
  if (names.length === 0) return false;
  const lower = names.map((n) => n.toLowerCase());
  const roleName = await sessionUserRoleName(admin, userId);
  if (!roleName) return false;
  return lower.includes(roleName.toLowerCase());
}

/**
 * RBAC page access for the signed-in user (matches sidebar rules).
 * When RBAC is off for the role (legacy), all pages are allowed.
 */
export async function userHasRbacPageAccess(
  admin: SupabaseClient,
  userId: number,
  pageKey: string,
): Promise<boolean> {
  const roleName = await sessionUserRoleName(admin, userId);
  if (!roleName) return false;
  const menuAccess = await getMenuAccessForRoleName(admin, roleName);
  if (!menuAccess.rbac) return true;
  return menuAccess.pageKeys.includes(pageKey);
}

export async function userCanManageUsers(admin: SupabaseClient, userId: number): Promise<boolean> {
  if (await userHasAdminRole(admin, userId)) return true;
  return userHasRbacPageAccess(admin, userId, "user-management/users");
}

export async function userCanManageRoles(admin: SupabaseClient, userId: number): Promise<boolean> {
  if (await userHasAdminRole(admin, userId)) return true;
  return userHasRbacPageAccess(admin, userId, "user-management/roles");
}

/** Returns null when OK, or a JSON NextResponse for 401/403. */
export async function assertAdminSession(req: Request, admin: SupabaseClient): Promise<NextResponse | null> {
  return assertCanManageRoles(req, admin);
}

/** Returns null when OK, or a JSON NextResponse for 401/403. */
export async function assertCanManageUsers(req: Request, admin: SupabaseClient): Promise<NextResponse | null> {
  const sid = await getBearerSessionUserId(req);
  if (sid == null) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (!(await userCanManageUsers(admin, sid))) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }
  return null;
}

/** Returns null when OK, or a JSON NextResponse for 401/403. */
export async function assertCanManageRoles(req: Request, admin: SupabaseClient): Promise<NextResponse | null> {
  const sid = await getBearerSessionUserId(req);
  if (sid == null) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (!(await userCanManageRoles(admin, sid))) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }
  return null;
}
