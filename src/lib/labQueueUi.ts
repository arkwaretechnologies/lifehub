import type { QueueTicketStatus } from "@/lib/queueReception";

/** Lab queue: open request / results only after the patient has been called. */
export function canOpenLabQueueRequest(
  status: QueueTicketStatus,
  labRequestId: string | null | undefined,
): boolean {
  if (!(labRequestId ?? "").trim()) return false;
  return (
    status === "Called" ||
    status === "Collected" ||
    status === "Serving" ||
    status === "Completed"
  );
}

export function labQueueRequestButtonTooltip(
  status: QueueTicketStatus,
  labRequestId: string | null | undefined,
): string {
  if (!(labRequestId ?? "").trim()) return "No lab request linked";
  if (status === "Waiting") return "Call the patient first";
  if (canOpenLabQueueRequest(status, labRequestId)) {
    return "View requested tests & specimen status";
  }
  return "Request is not available for this ticket status";
}

const LAB_RESULTS_BLOCKED: QueueTicketStatus[] = ["Cancelled", "Skipped", "No Show"];

/** Lab Results search: open prior tickets (incl. Waiting/Completed) when a lab request is linked. */
export function canOpenLabResultsQueueTicket(
  status: QueueTicketStatus,
  labRequestId: string | null | undefined,
  options?: { fromHistoricalSearch?: boolean },
): boolean {
  if (!(labRequestId ?? "").trim()) return false;
  if (options?.fromHistoricalSearch) {
    return !LAB_RESULTS_BLOCKED.includes(status);
  }
  return canOpenLabQueueRequest(status, labRequestId);
}
