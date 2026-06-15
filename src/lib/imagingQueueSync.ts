import type { SupabaseClient } from "@supabase/supabase-js";
import { parsePartialLabReleaseFromNotes } from "@/lib/labPartialCollection";
import type { QueueTicketStatus } from "@/lib/queueReception";
import { computeLabRequestQueueCollectionState } from "@/lib/labQueueTicketSync";
import {
  applyActiveDeptToNotes,
  nextSharedQueueState,
  parseActiveDeptFromNotes,
} from "@/lib/queueActiveDept";

export type ImagingRequestItemStatusRow = {
  id: string;
  status?: string | null;
  findings?: string | null;
};

/** Radiologist finished reading (terminal study status). */
export function isImagingItemInterpreted(status: string | null | undefined): boolean {
  const s = String(status ?? "").trim();
  return s === "Interpreted" || s === "Completed";
}

/** User-facing label for imaging_request_items.status. */
export function imagingItemStatusLabel(status: string | null | undefined): string {
  if (isImagingItemInterpreted(status)) return "Interpreted";
  return String(status ?? "").trim() || "—";
}

/** Study performed (X-ray taken) — same role as laboratory specimen Collected. */
export function isImagingItemCaptured(status: string | null | undefined): boolean {
  const s = String(status ?? "").trim();
  return s === "Captured" || s === "Received" || s === "Completed" || s === "Interpreted";
}

/** Result/film is available and ready to enter or upload findings. */
export function isImagingItemResultReceived(status: string | null | undefined): boolean {
  const s = String(status ?? "").trim();
  return s === "Received" || s === "Completed" || s === "Interpreted";
}

export function isImagingItemCompleted(status: string | null | undefined, findings?: string | null): boolean {
  if (isImagingItemInterpreted(status)) return true;
  if (String(findings ?? "").trim()) return true;
  return String(status ?? "").trim() === "Completed";
}

/** Collection + report completeness for imaging queue tickets. */
export async function computeImagingRequestQueueState(
  admin: SupabaseClient,
  imagingRequestId: string,
): Promise<{
  error: string | null;
  allCaptured: boolean;
  allResultReceived: boolean;
  allCompleted: boolean;
}> {
  const { data: items, error: itemsErr } = await admin
    .from("imaging_request_items")
    .select("id, status, findings")
    .eq("imaging_request_id", imagingRequestId);
  if (itemsErr) {
    return {
      error: itemsErr.message,
      allCaptured: false,
      allResultReceived: false,
      allCompleted: false,
    };
  }

  const rows = (items ?? []) as ImagingRequestItemStatusRow[];
  if (rows.length === 0) {
    return { error: null, allCaptured: false, allResultReceived: false, allCompleted: false };
  }

  const allCaptured = rows.every((r) => isImagingItemCaptured(r.status));
  const allResultReceived = rows.every((r) => isImagingItemResultReceived(r.status));
  const allCompleted = rows.every((r) => isImagingItemCompleted(r.status, r.findings));
  return { error: null, allCaptured, allResultReceived, allCompleted };
}

export function nextImagingQueueTicketStatus(
  allCaptured: boolean,
  allCompleted: boolean,
  gate?: Pick<ImagingQueueLabGate, "includesLab" | "labAllCollected">,
): QueueTicketStatus {
  if (allCompleted) return "Completed";
  if (!allCaptured) return "Serving";
  if (gate?.includesLab && !gate.labAllCollected) return "Serving";
  return "Collected";
}

export async function syncImagingQueueTicketsForRequest(
  admin: SupabaseClient,
  imagingRequestId: string,
): Promise<{
  error: string | null;
  allCaptured: boolean;
  allResultReceived: boolean;
  allCompleted: boolean;
}> {
  const state = await computeImagingRequestQueueState(admin, imagingRequestId);
  if (state.error) {
    return {
      error: state.error,
      allCaptured: state.allCaptured,
      allResultReceived: state.allResultReceived,
      allCompleted: state.allCompleted,
    };
  }

  const { data: tickets, error: tickErr } = await admin
    .from("queue_tickets")
    .select("id, notes, status, includes_lab, includes_imaging, lab_request_id")
    .eq("imaging_request_id", imagingRequestId);
  if (tickErr) {
    return {
      error: tickErr.message,
      allCaptured: state.allCaptured,
      allResultReceived: state.allResultReceived,
      allCompleted: state.allCompleted,
    };
  }

  const now = new Date().toISOString();

  for (const t of (tickets ?? []) as Array<{
    id: string;
    notes: string | null;
    status: QueueTicketStatus;
    includes_lab?: boolean | null;
    includes_imaging?: boolean | null;
    lab_request_id?: string | null;
  }>) {
    const labId = String(t.lab_request_id ?? "").trim();
    const hasLab = t.includes_lab === true || Boolean(labId);
    let labAllCollected = true;
    let allLabResults = true;
    if (hasLab && labId) {
      const labState = await computeLabRequestQueueCollectionState(admin, labId);
      if (labState.error) {
        return {
          error: labState.error,
          allCaptured: state.allCaptured,
          allResultReceived: state.allResultReceived,
          allCompleted: state.allCompleted,
        };
      }
      labAllCollected = labState.allCollected;
      allLabResults = labState.allHasResults;
    }

    const next = nextSharedQueueState({
      hasLab,
      hasImaging: true,
      labAllCollected,
      imagingAllCaptured: state.allCaptured,
      allLabResults,
      imagingAllCompleted: state.allCompleted,
      currentStatus: t.status,
      currentActive: parseActiveDeptFromNotes(t.notes),
      source: "imaging_capture",
    });

    const nextNotes = applyActiveDeptToNotes(t.notes ?? "", next.active);

    const { error: tErr } = await admin
      .from("queue_tickets")
      .update({ status: next.status, notes: nextNotes, updated_at: now })
      .eq("id", t.id);

    if (tErr) {
      return {
        error: tErr.message,
        allCaptured: state.allCaptured,
        allResultReceived: state.allResultReceived,
        allCompleted: state.allCompleted,
      };
    }
  }

  return {
    error: null,
    allCaptured: state.allCaptured,
    allResultReceived: state.allResultReceived,
    allCompleted: state.allCompleted,
  };
}

export type ImagingQueueLabGate = {
  includesLab: boolean;
  labAllCollected: boolean;
  labPartialReleased: boolean;
};

/** Whether lab specimen collection is finished for a shared diagnostic ticket. */
export async function loadLabCollectionGateForTickets<
  T extends {
    lab_request_id?: string | null;
    includes_lab?: boolean | null;
  },
>(admin: SupabaseClient, rows: T[]): Promise<{ error: string | null; byLabRequestId: Map<string, boolean> }> {
  const byLabRequestId = new Map<string, boolean>();
  const labIds = [
    ...new Set(
      rows
        .filter((r) => r.includes_lab === true || Boolean(String(r.lab_request_id ?? "").trim()))
        .map((r) => String(r.lab_request_id ?? "").trim())
        .filter(Boolean),
    ),
  ];

  for (const labId of labIds) {
    const state = await computeLabRequestQueueCollectionState(admin, labId);
    if (state.error) return { error: state.error, byLabRequestId };
    byLabRequestId.set(labId, state.allCollected);
  }

  return { error: null, byLabRequestId };
}

export function labCollectionGateForRow<
  T extends {
    lab_request_id?: string | null;
    includes_lab?: boolean | null;
    notes?: string | null;
  },
>(row: T, byLabRequestId: ReadonlyMap<string, boolean>): ImagingQueueLabGate {
  const includesLab = row.includes_lab === true || Boolean(String(row.lab_request_id ?? "").trim());
  const labPartialReleased = parsePartialLabReleaseFromNotes(row.notes);
  if (!includesLab) {
    return { includesLab: false, labAllCollected: true, labPartialReleased: false };
  }
  const labId = String(row.lab_request_id ?? "").trim();
  return {
    includesLab: true,
    labAllCollected: labId ? (byLabRequestId.get(labId) ?? false) : false,
    labPartialReleased,
  };
}
