import type { QueueTicketStatus } from "@/lib/queueReception";
import type { QueueActiveDept } from "@/lib/queueActiveDept";

export function isSpecimenCollectedOnTicket(notes: string | null | undefined): boolean {
  return /^\[Specimen\]\s+collected_at=.+/m.test(notes ?? "");
}

export type LabCallPatientOptions = {
  includesImaging?: boolean | null;
  specimenCollected?: boolean;
  /** All billable/entry lab_request_items marked collected. */
  labAllCollected?: boolean;
  /** All imaging_request_items marked Captured (or better). */
  imagingAllCaptured?: boolean;
  activeDept?: QueueActiveDept;
};

/** Lab may call only while Waiting, before specimens are collected, and not while at imaging. */
export function canLabCallPatient(status: QueueTicketStatus, opts?: LabCallPatientOptions): boolean {
  if (opts?.activeDept === "IMAG") return false;
  if (opts?.specimenCollected === true) return false;
  if (opts?.labAllCollected === true) return false;
  return status === "Waiting";
}

export function labCallButtonTooltip(status: QueueTicketStatus, opts?: LabCallPatientOptions): string {
  if (canLabCallPatient(status, opts)) return "Call patient";
  if (opts?.activeDept === "IMAG") {
    return opts?.imagingAllCaptured
      ? "Patient is at imaging — finish capturing before calling"
      : "Patient is at imaging — mark all studies as Captured first";
  }
  if (opts?.activeDept === "LAB") return "Patient was already called to laboratory";
  if (opts?.specimenCollected || opts?.labAllCollected) return "Specimen already collected";
  if (status === "Collected") return "Specimen already collected — enter results";
  if (status === "Completed") return "Visit completed";
  if (status === "Called" || status === "Serving") return "Patient was already called to laboratory";
  return "This ticket cannot be called right now";
}

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
