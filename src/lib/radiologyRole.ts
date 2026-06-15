import type { SupabaseClient } from "@supabase/supabase-js";
import { userHasAdminRole, userHasRbacPageAccess } from "@/lib/adminRole";

export const RADIOLOGIST_ROLE_NAME = "RADIOLOGIST";

async function sessionUserRoleName(admin: SupabaseClient, userId: number): Promise<string | null> {
  const { data, error } = await admin.from("users").select("role").eq("user_id", userId).maybeSingle();
  if (error || !data?.role) return null;
  const role = String(data.role).trim();
  return role || null;
}

export function isRadiologistRoleName(roleName: string | null | undefined): boolean {
  if (!roleName) return false;
  return roleName.trim().toLowerCase() === RADIOLOGIST_ROLE_NAME.toLowerCase();
}

export async function userIsRadiologist(admin: SupabaseClient, userId: number): Promise<boolean> {
  const roleName = await sessionUserRoleName(admin, userId);
  return isRadiologistRoleName(roleName);
}

export async function userCanAssignRadiology(admin: SupabaseClient, userId: number): Promise<boolean> {
  if (await userHasAdminRole(admin, userId)) return true;
  return userHasRbacPageAccess(admin, userId, "radiology/assignment");
}

export async function userCanViewRadiologyAssignmentList(admin: SupabaseClient, userId: number): Promise<boolean> {
  return userCanAssignRadiology(admin, userId);
}

export async function userCanViewRadiologyPatients(admin: SupabaseClient, userId: number): Promise<boolean> {
  if (await userHasAdminRole(admin, userId)) return true;
  if (await userIsRadiologist(admin, userId)) return true;
  return userHasRbacPageAccess(admin, userId, "radiology/patients");
}

/** Admin may filter any radiologist; radiologist is forced to own user id. */
export async function resolveRadiologistFilterUserId(
  admin: SupabaseClient,
  sessionUserId: number,
  requestedRadiologistUserId: number | null,
): Promise<{ radiologistUserId: number | null; canFilterRadiologists: boolean; error: string | null }> {
  const isAdmin = await userHasAdminRole(admin, sessionUserId);
  const isRad = await userIsRadiologist(admin, sessionUserId);

  if (isAdmin) {
    return {
      radiologistUserId:
        requestedRadiologistUserId != null && Number.isFinite(requestedRadiologistUserId) && requestedRadiologistUserId > 0
          ? requestedRadiologistUserId
          : null,
      canFilterRadiologists: true,
      error: null,
    };
  }

  if (isRad) {
    return { radiologistUserId: sessionUserId, canFilterRadiologists: false, error: null };
  }

  const hasPage = await userHasRbacPageAccess(admin, sessionUserId, "radiology/patients");
  if (!hasPage) {
    return { radiologistUserId: null, canFilterRadiologists: false, error: "Forbidden." };
  }

  return { radiologistUserId: sessionUserId, canFilterRadiologists: false, error: null };
}

export async function assertRadiologistMayEditItem(
  admin: SupabaseClient,
  userId: number,
  imagingRequestItemId: string,
): Promise<{ ok: boolean; error: string | null }> {
  const trimmed = imagingRequestItemId.trim();
  if (!trimmed) return { ok: false, error: "Invalid imaging study." };

  if (await userHasAdminRole(admin, userId)) return { ok: true, error: null };

  const isRad = await userIsRadiologist(admin, userId);
  if (!isRad) return { ok: true, error: null };

  const { data, error } = await admin
    .from("imaging_radiologist_assignments")
    .select("id")
    .eq("imaging_request_item_id", trimmed)
    .eq("radiologist_user_id", userId)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "This study is not assigned to you." };
  return { ok: true, error: null };
}

export async function listRadiologistUsers(
  admin: SupabaseClient,
): Promise<{ rows: Array<{ user_id: number; fullname: string }>; error: string | null }> {
  const { data, error } = await admin
    .from("users")
    .select("user_id, fullname")
    .ilike("role", RADIOLOGIST_ROLE_NAME)
    .order("fullname", { ascending: true });

  if (error) return { rows: [], error: error.message };
  const rows = ((data ?? []) as Array<{ user_id: number; fullname: string }>).map((r) => ({
    user_id: r.user_id,
    fullname: String(r.fullname ?? "").trim() || `User ${r.user_id}`,
  }));
  return { rows, error: null };
}
