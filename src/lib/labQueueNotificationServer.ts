import type { SupabaseClient } from "@supabase/supabase-js";

export const NOTIFICATION_TYPE_LAB_QUEUE_NEW = "lab_queue_new_request" as const;

/** `users.role` values that receive lab queue alerts (bell + sound). */
export const LAB_QUEUE_NOTIFY_ROLE_NAMES = ["ADMIN", "LAB ADMIN"] as const;

export type LabQueueNotificationPayload = {
  queueTicketId?: string;
  labRequestId?: string;
  href?: string;
};

export function userCanReceiveLabQueueNotifications(role: string | null | undefined): boolean {
  const r = String(role ?? "").trim().toUpperCase();
  return (LAB_QUEUE_NOTIFY_ROLE_NAMES as readonly string[]).includes(r);
}

/** Active users whose account role is ADMIN or LAB ADMIN. */
export async function listUserIdsWithLabQueueNotificationPermission(
  admin: SupabaseClient,
): Promise<number[]> {
  const { data: users, error: usersErr } = await admin.from("users").select("user_id, role");
  if (usersErr || !users?.length) return [];

  const ids: number[] = [];
  for (const u of users) {
    const row = u as { user_id: number; role: string | null };
    if (userCanReceiveLabQueueNotifications(row.role)) {
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
