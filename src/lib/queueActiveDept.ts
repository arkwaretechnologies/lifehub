import type { QueueTicketStatus } from "@/lib/queueReception";

/** Which department currently holds the patient on a shared lab+imaging ticket. */
export type QueueActiveDept = "LAB" | "IMAG" | null;

const ACTIVE_DEPT_TAG = "[Active]";
const ACTIVE_DEPT_RE = /^\[Active\]\s+dept=(LAB|IMAG)\s*$/im;

export function parseActiveDeptFromNotes(notes: string | null | undefined): QueueActiveDept {
  const m = String(notes ?? "").match(ACTIVE_DEPT_RE);
  if (!m) return null;
  const dept = m[1]?.toUpperCase();
  return dept === "LAB" || dept === "IMAG" ? dept : null;
}

export function applyActiveDeptToNotes(
  notes: string | null | undefined,
  dept: QueueActiveDept,
): string {
  const base = String(notes ?? "").replace(/\r\n/g, "\n");
  const lines = base ? base.split("\n") : [];
  const filtered = lines.filter((l) => !l.trim().startsWith(ACTIVE_DEPT_TAG));
  if (dept) filtered.push(`${ACTIVE_DEPT_TAG} dept=${dept}`);
  return filtered.join("\n").trim();
}

/**
 * Compute the next ticket status and active-department tag for a shared lab+imaging ticket.
 * Used by:
 *  - lab call (source = "call_lab"): patient called to lab
 *  - imaging call (source = "call_imaging"): patient called to imaging
 *  - lab specimen toggle (source = "lab_collect")
 *  - imaging capture toggle (source = "imaging_capture")
 */
export type SharedQueueStateInput = {
  hasLab: boolean;
  hasImaging: boolean;
  labAllCollected: boolean;
  imagingAllCaptured: boolean;
  /** All lab result rows have values. */
  allLabResults: boolean;
  /** All imaging items completed (findings entered). */
  imagingAllCompleted: boolean;
  currentStatus: QueueTicketStatus;
  currentActive: QueueActiveDept;
  source: "call_lab" | "call_imaging" | "lab_collect" | "imaging_capture";
};

export type SharedQueueStateResult = {
  status: QueueTicketStatus;
  active: QueueActiveDept;
};

export function nextSharedQueueState(input: SharedQueueStateInput): SharedQueueStateResult {
  const {
    hasLab,
    hasImaging,
    labAllCollected,
    imagingAllCaptured,
    allLabResults,
    imagingAllCompleted,
    currentStatus,
    currentActive,
    source,
  } = input;

  const labDone = !hasLab || labAllCollected;
  const imagingDone = !hasImaging || imagingAllCaptured;
  const labResultsDone = !hasLab || allLabResults;
  const imagingResultsDone = !hasImaging || imagingAllCompleted;

  if (labDone && imagingDone && labResultsDone && imagingResultsDone) {
    return { status: "Completed", active: null };
  }

  if (labDone && imagingDone) {
    return { status: "Collected", active: null };
  }

  if (source === "call_lab") {
    return { status: "Called", active: "LAB" };
  }
  if (source === "call_imaging") {
    return { status: "Called", active: "IMAG" };
  }

  if (source === "lab_collect") {
    if (labDone && !imagingDone) {
      return { status: "Waiting", active: null };
    }
    if (!labDone) {
      if (currentActive === "LAB") {
        return { status: "Called", active: "LAB" };
      }
      return { status: currentStatus, active: currentActive };
    }
  }

  if (source === "imaging_capture") {
    if (imagingDone && !labDone) {
      // Imaging done; lab still pending — return to Waiting so lab can call/collect.
      return { status: "Waiting", active: null };
    }
    if (!imagingDone) {
      if (currentActive === "IMAG") {
        return { status: "Called", active: "IMAG" };
      }
      return { status: currentStatus, active: currentActive };
    }
  }

  return { status: currentStatus, active: currentActive };
}
