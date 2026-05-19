import type { QueueTicketStatus } from "@/lib/queueReception";

export function canOpenDiagnosticQueueRequest(
  status: QueueTicketStatus,
  requestId: string | null | undefined,
): boolean {
  if (!(requestId ?? "").trim()) return false;
  return (
    status === "Called" ||
    status === "Collected" ||
    status === "Serving" ||
    status === "Completed"
  );
}

const RESULTS_BLOCKED: QueueTicketStatus[] = ["Cancelled", "Skipped", "No Show"];

/** Results page: allow opening linked requests for most ticket statuses. */
export function canOpenImagingResultsQueueTicket(
  status: QueueTicketStatus,
  imagingRequestId: string | null | undefined,
): boolean {
  if (!(imagingRequestId ?? "").trim()) return false;
  return !RESULTS_BLOCKED.includes(status);
}

export function diagnosticQueueRequestButtonTooltip(
  status: QueueTicketStatus,
  requestId: string | null | undefined,
  label: string,
): string {
  if (!(requestId ?? "").trim()) return `No ${label} linked`;
  if (status === "Waiting") return "Call the patient first";
  if (canOpenDiagnosticQueueRequest(status, requestId)) {
    return `Open ${label} request`;
  }
  return "Request is not available for this ticket status";
}
