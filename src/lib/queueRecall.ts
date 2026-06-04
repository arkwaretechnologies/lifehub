import type { QueueTicketStatus } from "@/lib/queueReception";

export const RECALLABLE_QUEUE_STATUSES: QueueTicketStatus[] = ["Called", "Serving", "Collected"];

export function canRecallQueueTicket(status: QueueTicketStatus): boolean {
  return RECALLABLE_QUEUE_STATUSES.includes(status);
}

export function recallQueueButtonTooltip(status: QueueTicketStatus): string {
  if (canRecallQueueTicket(status)) return "Re-announce on queue displays (no status change)";
  if (status === "Waiting") return "Call the patient first";
  if (status === "Completed") return "Visit completed";
  return "Recall is only available after the patient has been called";
}
