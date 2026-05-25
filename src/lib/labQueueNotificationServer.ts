import type { SupabaseClient } from "@supabase/supabase-js";
import type { MenuAccessState } from "@/lib/menuAccess";

export const NOTIFICATION_TYPE_LAB_QUEUE_NEW = "lab_queue_new_request" as const;

export const LAB_QUEUE_NOTIFICATION_PAGE_KEYS = ["laboratory", "laboratory/results"] as const;

export type LabQueueNotificationPayload = {
  queueTicketId?: string;
  labRequestId?: string;
  href?: string;
};

export function canReceiveLabQueueNotifications(
  pageKeys: ReadonlySet<string> | Iterable<string>,
): boolean {
  const s = pageKeys instanceof Set ? pageKeys : new Set(pageKeys);
  for (const key of LAB_QUEUE_NOTIFICATION_PAGE_KEYS) {
    if (s.has(key)) return true;
  }
  return false;
}

export function userCanReceiveLabQueueNotifications(menuAccess: MenuAccessState): boolean {
  if (!menuAccess.rbac) return false;
  return canReceiveLabQueueNotifications(menuAccess.pageKeys);
}

/** User IDs whose role has Lab Appointments or Lab Results menu access. */
export async function listUserIdsWithLabQueueNotificationPermission(
  admin: SupabaseClient,
): Promise<number[]> {
  const { data: pages, error: pagesErr } = await admin
    .from("role_pages")
    .select("role_id")
    .in("page_key", [...LAB_QUEUE_NOTIFICATION_PAGE_KEYS]);

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

export async function insertLabQueueNewRequestNotifications(
  admin: SupabaseClient,
  args: {
    queueDisplay: string;
    patientName: string;
    queueTicketId: string;
    labRequestId?: string | null;
  },
): Promise<void> {
  const queueDisplay = (args.queueDisplay ?? "").trim() || "—";
  const patientName = (args.patientName ?? "").trim() || "—";
  const queueTicketId = (args.queueTicketId ?? "").trim();
  if (!queueTicketId) return;

  const labRequestId = (args.labRequestId ?? "").trim() || null;
  const title = "New laboratory request";
  const body = `${queueDisplay} · ${patientName}`;
  const payload: LabQueueNotificationPayload = {
    queueTicketId,
    labRequestId: labRequestId ?? undefined,
    href: "/laboratory",
  };

  const recipientIds = await listUserIdsWithLabQueueNotificationPermission(admin);
  if (recipientIds.length === 0) return;

  const rows = recipientIds.map((userId) => ({
    user_id: userId,
    type: NOTIFICATION_TYPE_LAB_QUEUE_NEW,
    title,
    body,
    payload,
  }));

  const { error } = await admin.from("notifications").insert(rows);
  if (error) {
    console.error("lab queue notifications insert:", error.message);
  }
}
