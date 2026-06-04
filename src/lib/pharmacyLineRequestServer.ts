import type { SupabaseClient } from "@supabase/supabase-js";
import type { MenuAccessState } from "@/lib/menuAccess";
import { canApprovePharmacyLineRequests } from "@/lib/navPermissionCatalog";
import { getMenuAccessForRoleName } from "@/lib/roleMenuAccessServer";

export const PHARMACY_APPROVE_LINE_REQUESTS_KEY = "pharmacy/approve-line-requests" as const;

export { canApprovePharmacyLineRequests };

export type CartLineRequestAction = "delete" | "quantity_change";
export type CartLineRequestStatus = "pending" | "approved" | "rejected";

export type CartLineSnapshot = {
  product_id: string;
  generic_name: string;
  brand_name?: string | null;
  unit_price: number;
  /** Qty on cart when the request was submitted. */
  qty: number;
  /** Target qty after approval (set quantity / +/-). */
  requested_qty?: number | null;
  prescription_item_id?: string | null;
};

/** Quantity to apply when a `quantity_change` request is approved. */
export function resolveApprovedCartQuantity(row: PharmacyCartLineRequestRow): number | null {
  if (row.action !== "quantity_change") return null;

  const snap = row.line_snapshot;
  const fromSnap = snap?.requested_qty;
  if (typeof fromSnap === "number" && Number.isFinite(fromSnap) && fromSnap >= 1) {
    return Math.round(fromSnap);
  }

  const note = row.note ?? "";
  const setMatch = note.match(/set quantity to\s+(\d+)/i);
  if (setMatch) {
    const n = Number.parseInt(setMatch[1] ?? "", 10);
    if (Number.isFinite(n) && n >= 1) return n;
  }

  const snapQty = Math.round(Number(snap?.qty) || 0);
  if (snapQty < 1) return null;
  if (/increase quantity/i.test(note)) return snapQty + 1;
  if (/decrease quantity/i.test(note)) return Math.max(1, snapQty - 1);

  return null;
}

export type PharmacyCartLineRequestRow = {
  id: string;
  requested_by_user_id: number;
  status: CartLineRequestStatus;
  action: CartLineRequestAction;
  cart_line_key: string;
  line_snapshot: CartLineSnapshot;
  note: string | null;
  resolved_by_user_id: number | null;
  resolved_at: string | null;
  created_at: string;
};

export type NotificationRow = {
  id: string;
  user_id: number;
  type: string;
  title: string;
  body: string;
  payload: { requestId?: string; queueTicketId?: string; labRequestId?: string; href?: string };
  read_at: string | null;
  created_at: string;
  /** Set by GET /api/notifications for pharmacy line requests (pending → show Approve/Reject). */
  cartLineRequestStatus?: CartLineRequestStatus | null;
};

export const NOTIFICATION_TYPE_PHARMACY_CART_LINE = "pharmacy_cart_line_request" as const;

export function userCanApprovePharmacyLineRequests(menuAccess: MenuAccessState): boolean {
  if (!menuAccess.rbac) return false;
  return canApprovePharmacyLineRequests(menuAccess.pageKeys);
}

/** User IDs whose role has `pharmacy/approve-line-requests`. */
export async function listUserIdsWithLineApprovalPermission(
  admin: SupabaseClient,
): Promise<number[]> {
  const { data: pages, error: pagesErr } = await admin
    .from("role_pages")
    .select("role_id")
    .eq("page_key", PHARMACY_APPROVE_LINE_REQUESTS_KEY);

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
    if (lowerNames.has(role.toLowerCase())) {
      ids.push(row.user_id);
    }
  }
  return [...new Set(ids)];
}

export async function roleNameHasLineApprovalPermission(
  admin: SupabaseClient,
  roleName: string,
): Promise<boolean> {
  const access = await getMenuAccessForRoleName(admin, roleName.trim());
  if (!access.rbac) return false;
  return canApprovePharmacyLineRequests(access.pageKeys);
}
