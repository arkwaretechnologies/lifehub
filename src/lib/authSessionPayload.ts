import type { SupabaseClient } from "@supabase/supabase-js";
import type { UserProfile } from "@/lib/types";
import { defaultMenuAccess, type MenuAccessState } from "@/lib/menuAccess";
import { userCanReadImaging } from "@/lib/radiologyRole";
import { getMenuAccessForRoleName } from "@/lib/roleMenuAccessServer";

const IMAGING_READER_PAGE_KEY = "radiology/patients";

export function withImagingReaderMenuAccess(
  menuAccess: MenuAccessState,
  canReadImaging: boolean,
): MenuAccessState {
  if (!canReadImaging || !menuAccess.rbac) return menuAccess;
  if (menuAccess.pageKeys.includes(IMAGING_READER_PAGE_KEY)) return menuAccess;
  return { ...menuAccess, pageKeys: [...menuAccess.pageKeys, IMAGING_READER_PAGE_KEY] };
}

const USER_SELECT = [
  "user_id",
  "username",
  "fullname",
  "address",
  "email_address",
  "phone_no",
  "role",
  "branch_code",
  "specialty",
  "license_no",
  "s2_no",
  "ptr_no",
  "signature_storage_path",
  "created_at",
  "updated_at",
].join(",");

export async function fetchUserProfileById(
  admin: SupabaseClient,
  userId: number,
): Promise<{ profile: UserProfile | null; error: string | null }> {
  const { data, error } = await admin.from("users").select(USER_SELECT).eq("user_id", userId).maybeSingle();
  if (error) return { profile: null, error: error.message };
  return { profile: (data ?? null) as UserProfile | null, error: null };
}

/** Minimal `user` object compatible with {@link numericSessionUserId}. */
export function sessionUserFromProfile(profile: UserProfile): { user_id: number } {
  return { user_id: profile.user_id };
}

export async function buildAuthSessionPayload(
  admin: SupabaseClient,
  userId: number,
): Promise<
  | { ok: true; user: { user_id: number }; profile: UserProfile; menuAccess: MenuAccessState }
  | { ok: false; error: string }
> {
  const { profile, error } = await fetchUserProfileById(admin, userId);
  if (error) return { ok: false, error };
  if (!profile) return { ok: false, error: "User not found." };
  const baseMenu = profile.role ? await getMenuAccessForRoleName(admin, String(profile.role)) : defaultMenuAccess;
  const canReadImaging = await userCanReadImaging(admin, userId);
  const menuAccess = withImagingReaderMenuAccess(baseMenu, canReadImaging);
  return { ok: true, user: sessionUserFromProfile(profile), profile, menuAccess };
}
