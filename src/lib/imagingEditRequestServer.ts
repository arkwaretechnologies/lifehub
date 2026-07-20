import type { SupabaseClient } from "@supabase/supabase-js";
import type { MenuAccessState } from "@/lib/menuAccess";
import { canApproveImagingEditRequests } from "@/lib/navPermissionCatalog";

export const IMAGING_APPROVE_EDIT_KEY = "radiology/approve-tech-findings" as const;
export const NOTIFICATION_TYPE_IMAGING_EDIT = "imaging_edit_request" as const;

export const IMAGING_EDIT_REQUESTS_TABLE = "imaging_edit_requests" as const;

export { canApproveImagingEditRequests };

export type ImagingEditRequestStatus = "pending" | "approved" | "rejected";

export type ImagingEditStudySnapshot = {
  study_name: string;
  view_text?: string | null;
  patient_name?: string | null;
  imaging_request_id?: string | null;
};

export type ImagingEditRequestRow = {
  id: string;
  requested_by_user_id: number;
  imaging_request_item_id: string;
  imaging_request_id: string | null;
  status: ImagingEditRequestStatus;
  study_snapshot: ImagingEditStudySnapshot | null;
  note: string | null;
  resolved_by_user_id: number | null;
  resolved_at: string | null;
  consumed_at: string | null;
  created_at: string;
};

/** Per-study edit capability for the current viewer on the Imaging Results page. */
export type ImagingItemEditState = "none" | "can_request" | "pending" | "approved";

export function userCanApproveImagingEditRequests(menuAccess: MenuAccessState): boolean {
  if (!menuAccess.rbac) return false;
  return canApproveImagingEditRequests(menuAccess.pageKeys);
}

/** User IDs whose role has `radiology/approve-tech-findings`. */
export async function listUserIdsWhoCanApproveImagingEdits(admin: SupabaseClient): Promise<number[]> {
  const { data: pages, error: pagesErr } = await admin
    .from("role_pages")
    .select("role_id")
    .eq("page_key", IMAGING_APPROVE_EDIT_KEY);

  if (pagesErr || !pages?.length) return [];

  const roleIds = [...new Set(pages.map((p) => (p as { role_id: number }).role_id))];
  const { data: roles, error: rolesErr } = await admin.from("roles").select("name").in("role_id", roleIds);
  if (rolesErr || !roles?.length) return [];

  const roleNames = roles.map((r) => String((r as { name: string }).name).trim()).filter(Boolean);
  if (roleNames.length === 0) return [];

  const { data: users, error: usersErr } = await admin.from("users").select("user_id, role");
  if (usersErr || !users?.length) return [];

  const lowerNames = new Set(roleNames.map((n) => n.toLowerCase()));
  const ids: number[] = [];
  for (const u of users) {
    const row = u as { user_id: number; role: string | null };
    const role = (row.role ?? "").trim();
    if (!role) continue;
    if (lowerNames.has(role.toLowerCase())) ids.push(row.user_id);
  }
  return [...new Set(ids)];
}

/** True when the tech has an approved, not-yet-consumed edit request for this study item. */
export async function techHasApprovedEdit(
  admin: SupabaseClient,
  imagingRequestItemId: string,
  userId: number,
): Promise<boolean> {
  const itemId = imagingRequestItemId.trim();
  if (!itemId) return false;
  const { data, error } = await admin
    .from(IMAGING_EDIT_REQUESTS_TABLE)
    .select("id")
    .eq("imaging_request_item_id", itemId)
    .eq("requested_by_user_id", userId)
    .eq("status", "approved")
    .is("consumed_at", null)
    .limit(1)
    .maybeSingle();
  if (error) return false;
  return Boolean(data);
}

/**
 * Mark all active approved request(s) for a study item as consumed (after reading is done).
 * Locks the study for every requester so ENABLE FINDINGS is required again.
 */
export async function consumeApprovedImagingEdit(
  admin: SupabaseClient,
  imagingRequestItemId: string,
): Promise<void> {
  const itemId = imagingRequestItemId.trim();
  if (!itemId) return;
  await admin
    .from(IMAGING_EDIT_REQUESTS_TABLE)
    .update({ consumed_at: new Date().toISOString() })
    .eq("imaging_request_item_id", itemId)
    .eq("status", "approved")
    .is("consumed_at", null);
}
