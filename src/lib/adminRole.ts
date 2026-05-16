import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getBearerSessionUserId } from "@/lib/requireSession";

/** Comma-separated role names from `users.role`; match is case-insensitive. Default allows `Administrator`. */
export function parseAdminRoleNames(): string[] {
  const raw = process.env.ADMIN_ROLE_NAMES?.trim();
  if (!raw) return ["Administrator"];
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

export async function userHasAdminRole(admin: SupabaseClient, userId: number): Promise<boolean> {
  const names = parseAdminRoleNames();
  if (names.length === 0) return false;
  const lower = names.map((n) => n.toLowerCase());
  const { data, error } = await admin.from("users").select("role").eq("user_id", userId).maybeSingle();
  if (error || !data?.role) return false;
  const role = String(data.role).trim().toLowerCase();
  return lower.includes(role);
}

/** Returns null when OK, or a JSON NextResponse for 401/403. */
export async function assertAdminSession(req: Request, admin: SupabaseClient): Promise<NextResponse | null> {
  const sid = await getBearerSessionUserId(req);
  if (sid == null) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (!(await userHasAdminRole(admin, sid))) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }
  return null;
}
