import type { QueueTicketStatus } from "@/lib/queueReception";
import type { QueueActiveDept } from "@/lib/queueActiveDept";

const SPECIMEN_TICKET_TAG = "[Specimen]";

export function isSpecimenCollectedOnTicket(notes: string | null | undefined): boolean {
  return /^\[Specimen\]\s+collected_at=.+/m.test(notes ?? "");
}

export function applySpecimenCollectedTagToNotes(
  notes: string | null | undefined,
  collected: boolean,
): string {
  const now = new Date().toISOString();
  const base = String(notes ?? "").replace(/\r\n/g, "\n").trim();
  const lines = base ? base.split("\n") : [];
  const filtered = lines.filter((l) => !l.startsWith(SPECIMEN_TICKET_TAG));
  filtered.push(
    collected ? `${SPECIMEN_TICKET_TAG} collected_at=${now}` : `${SPECIMEN_TICKET_TAG} collected_at=`,
  );
  return filtered.join("\n").trim();
}

export type LabCallPatientOptions = {
  includesImaging?: boolean | null;
  specimenCollected?: boolean;
  /** At least one result-entry line marked collected (partial or complete). */
  labAnyCollected?: boolean;
  /** All billable/entry lab_request_items marked collected. */
  labAllCollected?: boolean;
  /** All imaging_request_items marked Captured (or better). */
  imagingAllCaptured?: boolean;
  activeDept?: QueueActiveDept;
};

/** Lab may call only while Waiting, before any specimen collection started. */
export function canLabCallPatient(status: QueueTicketStatus, opts?: LabCallPatientOptions): boolean {
  if (status !== "Waiting") return false;
  if (opts?.specimenCollected === true) return false;
  if (opts?.labAnyCollected === true) return false;
  if (opts?.labAllCollected === true) return false;
  return true;
}

export function labCallButtonTooltip(status: QueueTicketStatus, opts?: LabCallPatientOptions): string {
  if (canLabCallPatient(status, opts)) return "Call patient";
  const atImaging =
    opts?.activeDept === "IMAG" ||
    (opts?.includesImaging === true && opts?.activeDept !== "LAB");
  if ((status === "Called" || status === "Serving") && atImaging) {
    return opts?.imagingAllCaptured
      ? "Patient is at imaging — finish capturing before calling to laboratory"
      : "Patient is at imaging — mark all studies as Captured before calling to laboratory";
  }
  if (opts?.activeDept === "LAB") return "Patient was already called to laboratory";
  if (opts?.labAnyCollected || opts?.specimenCollected || opts?.labAllCollected) {
    return "Specimen collection already started — open Request to continue";
  }
  if (status === "Collected") return "Specimen already collected — enter results";
  if (status === "Completed") return "Visit completed";
  if (status === "Called" || status === "Serving") return "Patient was already called to laboratory";
  return "This ticket cannot be called right now";
}

export type LabOpenRequestOptions = {
  /** Waiting ticket with partial collection — patient already at lab. */
  labAnyCollected?: boolean;
};

/** Lab queue: open request / results after call, or when partial collection already started. */
export function canOpenLabQueueRequest(
  status: QueueTicketStatus,
  labRequestId: string | null | undefined,
  opts?: LabOpenRequestOptions,
): boolean {
  if (!(labRequestId ?? "").trim()) return false;
  if (status === "Waiting" && opts?.labAnyCollected === true) return true;
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
  opts?: LabOpenRequestOptions,
): string {
  if (!(labRequestId ?? "").trim()) return "No lab request linked";
  if (status === "Waiting" && opts?.labAnyCollected) {
    return "View requested tests & specimen status";
  }
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
