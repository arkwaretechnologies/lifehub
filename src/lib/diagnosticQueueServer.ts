import type { SupabaseClient } from "@supabase/supabase-js";
import { LAB_SALES_TABLE, LAB_SALE_ITEMS_TABLE } from "@/lib/cashierPayments";
import { computeImagingRequestQueueState } from "@/lib/imagingQueueSync";
import { computeLabRequestQueueCollectionState } from "@/lib/labQueueTicketSync";
import { applyPartialLabReleaseToNotes, parsePartialLabReleaseFromNotes } from "@/lib/labPartialCollection";
import {
  applySpecimenCollectedTagToNotes,
  isSpecimenCollectedOnTicket,
} from "@/lib/labQueueUi";
import { applyActiveDeptToNotes, parseActiveDeptFromNotes } from "@/lib/queueActiveDept";
import type { QueueTicketStatus } from "@/lib/queueReception";

const ACTIVE_QUEUE_STATUSES: QueueTicketStatus[] = ["Waiting", "Called", "Collected", "Serving"];

export function labQueueCode(): string {
  return (process.env.NEXT_PUBLIC_RECEPTION_LAB_QUEUE_CODE ?? "LAB").trim().toUpperCase();
}

export function imagingQueueCode(): string {
  return (process.env.NEXT_PUBLIC_RECEPTION_IMAGING_QUEUE_CODE ?? "IMAG").trim().toUpperCase();
}

/** Active LAB + IMAG counter numeric ids (diagnostic queue tickets only). */
export async function adminLoadDiagnosticCounterIds(
  admin: SupabaseClient,
): Promise<{ ids: Set<number>; error: string | null }> {
  const { data, error } = await admin
    .from("queue_counters")
    .select("id")
    .eq("is_active", true)
    .in("code", [labQueueCode(), imagingQueueCode()]);
  if (error) return { ids: new Set(), error: error.message };
  const ids = new Set<number>();
  for (const row of data ?? []) {
    const n = Number((row as { id?: string | number }).id);
    if (Number.isFinite(n)) ids.add(n);
  }
  return { ids, error: null };
}

function ticketOnDiagnosticCounter(
  counterId: unknown,
  diagnosticCounterIds: Set<number>,
): boolean {
  const n = Number(counterId);
  return Number.isFinite(n) && diagnosticCounterIds.has(n);
}

export type DiagnosticQueueTicketRow = {
  id: string;
  encounter_id?: string | null;
  lab_request_id?: string | null;
  imaging_request_id?: string | null;
  includes_lab?: boolean | null;
  includes_imaging?: boolean | null;
};

/** Encounter has a completed lab_sale (lab and/or imaging lines). */
export async function adminEncounterIdsWithPaidSales(
  admin: SupabaseClient,
  encounterIds: string[],
): Promise<{ ids: Set<string>; error: string | null }> {
  const unique = [...new Set(encounterIds.map((x) => x.trim()).filter(Boolean))];
  const ids = new Set<string>();
  if (unique.length === 0) return { ids, error: null };

  for (let i = 0; i < unique.length; i += 80) {
    const chunk = unique.slice(i, i + 80);
    const { data: labReqs, error: lrErr } = await admin
      .from("lab_requests")
      .select("id, encounter_id")
      .in("encounter_id", chunk);
    if (lrErr) return { ids: new Set(), error: lrErr.message };

    const labReqIds = ((labReqs ?? []) as Array<{ id: string; encounter_id: string }>).map((r) => r.id);
    const encByLabReq = new Map<string, string>();
    for (const r of (labReqs ?? []) as Array<{ id: string; encounter_id: string }>) {
      encByLabReq.set(r.id, r.encounter_id);
    }

    if (labReqIds.length > 0) {
      const { data: sales, error: sErr } = await admin
        .from(LAB_SALES_TABLE)
        .select("lab_request_id")
        .in("lab_request_id", labReqIds);
      if (sErr) return { ids: new Set(), error: sErr.message };
      for (const row of (sales ?? []) as Array<{ lab_request_id?: string | null }>) {
        const rid = String(row.lab_request_id ?? "").trim();
        const enc = rid ? encByLabReq.get(rid) : undefined;
        if (enc) ids.add(enc);
      }
    }

    const { data: imgReqs, error: irErr } = await admin
      .from("imaging_requests")
      .select("id, encounter_id")
      .in("encounter_id", chunk);
    if (irErr) return { ids: new Set(), error: irErr.message };

    const imgReqIds = ((imgReqs ?? []) as Array<{ id: string; encounter_id: string }>).map((r) => r.id);
    const encByImgReq = new Map<string, string>();
    for (const r of (imgReqs ?? []) as Array<{ id: string; encounter_id: string }>) {
      encByImgReq.set(r.id, r.encounter_id);
    }

    if (imgReqIds.length > 0) {
      const { data: imgSales, error: isErr } = await admin
        .from(LAB_SALES_TABLE)
        .select("imaging_request_id")
        .in("imaging_request_id", imgReqIds);
      if (isErr) return { ids: new Set(), error: isErr.message };
      for (const row of (imgSales ?? []) as Array<{ imaging_request_id?: string | null }>) {
        const rid = String(row.imaging_request_id ?? "").trim();
        const enc = rid ? encByImgReq.get(rid) : undefined;
        if (enc) ids.add(enc);
      }
    }
  }

  return { ids, error: null };
}

export async function adminLabRequestIdsWithLabSales(
  admin: SupabaseClient,
  labRequestIds: string[],
): Promise<{ ids: Set<string>; error: string | null }> {
  const unique = [...new Set(labRequestIds.map((x) => String(x).trim()).filter(Boolean))];
  const ids = new Set<string>();
  if (unique.length === 0) return { ids, error: null };

  for (let i = 0; i < unique.length; i += 120) {
    const chunk = unique.slice(i, i + 120);
    const { data, error } = await admin.from(LAB_SALES_TABLE).select("lab_request_id").in("lab_request_id", chunk);
    if (error) return { ids: new Set(), error: error.message };
    for (const row of (data ?? []) as Array<{ lab_request_id?: string | null }>) {
      const id = String(row.lab_request_id ?? "").trim();
      if (id) ids.add(id);
    }
  }
  return { ids, error: null };
}

export async function adminImagingRequestIdsWithSales(
  admin: SupabaseClient,
  imagingRequestIds: string[],
): Promise<{ ids: Set<string>; error: string | null }> {
  const unique = [...new Set(imagingRequestIds.map((x) => String(x).trim()).filter(Boolean))];
  const ids = new Set<string>();
  if (unique.length === 0) return { ids, error: null };

  for (let i = 0; i < unique.length; i += 120) {
    const chunk = unique.slice(i, i + 120);
    const { data, error } = await admin
      .from(LAB_SALES_TABLE)
      .select("imaging_request_id")
      .in("imaging_request_id", chunk);
    if (error) return { ids: new Set(), error: error.message };
    for (const row of (data ?? []) as Array<{ imaging_request_id?: string | null }>) {
      const id = String(row.imaging_request_id ?? "").trim();
      if (id) ids.add(id);
    }
  }
  return { ids, error: null };
}

/**
 * Whether a queue ticket should appear on lab/imaging screens (after payment when visit-linked).
 */
export async function adminIsDiagnosticQueueTicketPaid(
  admin: SupabaseClient,
  ticket: DiagnosticQueueTicketRow,
): Promise<{ visible: boolean; error: string | null }> {
  const includesLab = ticket.includes_lab === true || Boolean(String(ticket.lab_request_id ?? "").trim());
  const includesImaging =
    ticket.includes_imaging === true || Boolean(String(ticket.imaging_request_id ?? "").trim());
  const enc = String(ticket.encounter_id ?? "").trim();
  const labReqId = String(ticket.lab_request_id ?? "").trim();
  const imgReqId = String(ticket.imaging_request_id ?? "").trim();

  if (!includesLab && !includesImaging) return { visible: true, error: null };

  if (includesLab && labReqId) {
    const { ids, error } = await adminLabRequestIdsWithLabSales(admin, [labReqId]);
    if (error) return { visible: false, error };
    if (ids.has(labReqId)) return { visible: true, error: null };
  }

  if (includesImaging && imgReqId) {
    const { ids, error } = await adminImagingRequestIdsWithSales(admin, [imgReqId]);
    if (error) return { visible: false, error };
    if (ids.has(imgReqId)) return { visible: true, error: null };
  }

  if (enc && includesLab && includesImaging) {
    const { ids, error } = await adminEncounterIdsWithPaidSales(admin, [enc]);
    if (error) return { visible: false, error };
    if (ids.has(enc)) return { visible: true, error: null };
  }

  if (!labReqId && !imgReqId) return { visible: true, error: null };

  return { visible: false, error: null };
}

export async function adminFilterDiagnosticQueueTicketsForDisplay<
  T extends DiagnosticQueueTicketRow,
>(admin: SupabaseClient, rows: T[]): Promise<{ rows: T[]; error: string | null }> {
  const out: T[] = [];
  for (const row of rows) {
    const { visible, error } = await adminIsDiagnosticQueueTicketPaid(admin, row);
    if (error) return { rows: [], error };
    if (visible) out.push(row);
  }
  return { rows: out, error: null };
}

/** Unpaid lab_request_id values on today's tickets for a counter (exclude from list). */
export async function adminUnpaidLabRequestIdsOnCounter(
  admin: SupabaseClient,
  counterId: string | number,
  ticketDate: string,
): Promise<{ ids: string[]; error: string | null }> {
  const { data: pendingRows, error: pendingErr } = await admin
    .from("queue_tickets")
    .select("lab_request_id, includes_lab")
    .eq("counter_id", counterId)
    .eq("ticket_date", ticketDate)
    .not("lab_request_id", "is", null);
  if (pendingErr) return { ids: [], error: pendingErr.message };

  const linkedIds = [
    ...new Set(
      ((pendingRows ?? []) as Array<{ lab_request_id?: string | null; includes_lab?: boolean | null }>)
        .filter((r) => r.includes_lab !== false)
        .map((r) => String(r.lab_request_id ?? "").trim())
        .filter(Boolean),
    ),
  ];
  if (linkedIds.length === 0) return { ids: [], error: null };

  const { ids: paidIds, error } = await adminLabRequestIdsWithLabSales(admin, linkedIds);
  if (error) return { ids: [], error };
  return { ids: linkedIds.filter((id) => !paidIds.has(id)), error: null };
}

async function primaryPaidLabRequestIdForEncounter(
  admin: SupabaseClient,
  encounterId: string,
): Promise<string | null> {
  const enc = encounterId.trim();
  if (!enc) return null;
  const { data: reqs, error } = await admin
    .from("lab_requests")
    .select("id, created_at")
    .eq("encounter_id", enc)
    .order("created_at", { ascending: false });
  if (error || !reqs?.length) return null;
  const ids = (reqs as Array<{ id: string }>).map((r) => r.id).filter(Boolean);
  const { ids: paid, error: paidErr } = await adminLabRequestIdsWithLabSales(admin, ids);
  if (paidErr) return null;
  for (const id of ids) {
    if (paid.has(id)) return id;
  }
  return null;
}

async function primaryPaidImagingRequestIdForEncounter(
  admin: SupabaseClient,
  encounterId: string,
): Promise<string | null> {
  const enc = encounterId.trim();
  if (!enc) return null;
  const { data: reqs, error } = await admin
    .from("imaging_requests")
    .select("id, created_at")
    .eq("encounter_id", enc)
    .order("created_at", { ascending: false });
  if (error || !reqs?.length) return null;
  const ids = (reqs as Array<{ id: string }>).map((r) => r.id).filter(Boolean);
  const { ids: paid, error: paidErr } = await adminImagingRequestIdsWithSales(admin, ids);
  if (paidErr) return null;
  for (const id of ids) {
    if (paid.has(id)) return id;
  }
  return null;
}

/**
 * Fix queue tickets after cashier amendment pay cleared `includes_lab` / `includes_imaging`
 * or left request ids unlinked. Run before lab/imaging queue list APIs.
 */
export async function adminRepairQueueTicketModalityFlags(
  admin: SupabaseClient,
  ticketDate: string,
): Promise<{ repaired: number; error: string | null }> {
  const date = ticketDate.trim();
  if (!date) return { repaired: 0, error: null };

  const { ids: diagnosticCounterIds, error: cntErr } = await adminLoadDiagnosticCounterIds(admin);
  if (cntErr) return { repaired: 0, error: cntErr };

  const { data: tickets, error } = await admin
    .from("queue_tickets")
    .select(
      "id, counter_id, encounter_id, lab_request_id, imaging_request_id, includes_lab, includes_imaging, status, notes",
    )
    .eq("ticket_date", date)
    .in("status", ACTIVE_QUEUE_STATUSES);
  if (error) return { repaired: 0, error: error.message };

  let repaired = 0;
  for (const raw of tickets ?? []) {
    const row = raw as {
      id: string;
      counter_id?: string | number | null;
      encounter_id?: string | null;
      lab_request_id?: string | null;
      imaging_request_id?: string | null;
      includes_lab?: boolean | null;
      includes_imaging?: boolean | null;
      status?: QueueTicketStatus;
      notes?: string | null;
    };

    const onDiagnostic = ticketOnDiagnosticCounter(row.counter_id, diagnosticCounterIds);
    if (!onDiagnostic) {
      const hadLabLink =
        row.includes_lab === true ||
        Boolean(String(row.lab_request_id ?? "").trim()) ||
        row.includes_imaging === true ||
        Boolean(String(row.imaging_request_id ?? "").trim());
      if (hadLabLink) {
        const { error: upErr } = await admin
          .from("queue_tickets")
          .update({
            includes_lab: false,
            includes_imaging: false,
            lab_request_id: null,
            imaging_request_id: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", row.id);
        if (upErr) return { repaired, error: upErr.message };
        repaired += 1;
      }
      continue;
    }

    const enc = String(row.encounter_id ?? "").trim();
    let labReqId = String(row.lab_request_id ?? "").trim();
    let imgReqId = String(row.imaging_request_id ?? "").trim();

    let includesLab = row.includes_lab === true;
    let includesImaging = row.includes_imaging === true;

    if (labReqId) {
      const { ids, error: labPaidErr } = await adminLabRequestIdsWithLabSales(admin, [labReqId]);
      if (labPaidErr) return { repaired, error: labPaidErr };
      if (ids.has(labReqId)) includesLab = true;
    }
    if (imgReqId) {
      const { ids, error: imgPaidErr } = await adminImagingRequestIdsWithSales(admin, [imgReqId]);
      if (imgPaidErr) return { repaired, error: imgPaidErr };
      if (ids.has(imgReqId)) includesImaging = true;
    }

    if (enc) {
      if (!includesLab) {
        const paidLab = await primaryPaidLabRequestIdForEncounter(admin, enc);
        if (paidLab) {
          labReqId = paidLab;
          includesLab = true;
        }
      }
      if (!includesImaging) {
        const paidImg = await primaryPaidImagingRequestIdForEncounter(admin, enc);
        if (paidImg) {
          imgReqId = paidImg;
          includesImaging = true;
        }
      }
    }

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    let needsPatch = false;
    if (includesLab && row.includes_lab !== true) {
      patch.includes_lab = true;
      needsPatch = true;
    }
    if (includesImaging && row.includes_imaging !== true) {
      patch.includes_imaging = true;
      needsPatch = true;
    }
    if (labReqId && labReqId !== String(row.lab_request_id ?? "").trim()) {
      patch.lab_request_id = labReqId;
      needsPatch = true;
    }
    if (imgReqId && imgReqId !== String(row.imaging_request_id ?? "").trim()) {
      patch.imaging_request_id = imgReqId;
      needsPatch = true;
    }

    const ticketStatus = row.status ?? "Waiting";
    if (includesLab && labReqId) {
      const labState = await computeLabRequestQueueCollectionState(admin, labReqId);
      if (!labState.error) {
        const noteText = String(row.notes ?? "");
        const partialReleased = parsePartialLabReleaseFromNotes(noteText);

        if (partialReleased && !labState.allCollected) {
          const baseNotes = String(patch.notes ?? noteText);
          const active = parseActiveDeptFromNotes(baseNotes);
          if (active === "LAB") {
            patch.notes = applyActiveDeptToNotes(baseNotes, null);
            needsPatch = true;
          }
          const atImaging = active === "IMAG" || ticketStatus === "Serving";
          const imagingWorkDone = ticketStatus === "Collected";
          if (!atImaging && !imagingWorkDone && ticketStatus !== "Waiting") {
            patch.status = "Waiting";
            needsPatch = true;
          }
        } else if (partialReleased && labState.allCollected) {
          const baseNotes = String(patch.notes ?? noteText);
          patch.notes = applyPartialLabReleaseToNotes(baseNotes, false);
          needsPatch = true;
        }

        if (labState.allCollected && !isSpecimenCollectedOnTicket(String(patch.notes ?? noteText))) {
          patch.notes = applySpecimenCollectedTagToNotes(String(patch.notes ?? noteText), true);
          needsPatch = true;
        }

        if (labState.allCollected && includesImaging && imgReqId) {
          const imgState = await computeImagingRequestQueueState(admin, imgReqId);
          if (!imgState.error && imgState.allCaptured && ticketStatus === "Collected") {
            patch.status = "Collected";
            const baseNotes = String(patch.notes ?? noteText);
            if (parseActiveDeptFromNotes(baseNotes) !== null) {
              patch.notes = applyActiveDeptToNotes(baseNotes, null);
              needsPatch = true;
            }
          }
        } else if (
          ticketStatus === "Waiting" &&
          labState.anyCollected &&
          !labState.allCollected
        ) {
          patch.status = "Called";
          const baseNotes = String(patch.notes ?? noteText);
          patch.notes = applyActiveDeptToNotes(baseNotes, "LAB");
          needsPatch = true;
        }
      }

      if (imgReqId) {
        const imgState = await computeImagingRequestQueueState(admin, imgReqId);
        if (!imgState.error && imgState.allCaptured) {
          const baseNotes = String(patch.notes ?? String(row.notes ?? ""));
          if (parseActiveDeptFromNotes(baseNotes) === "IMAG") {
            patch.notes = applyActiveDeptToNotes(baseNotes, null);
            needsPatch = true;
          }
          const labStateForImg = await computeLabRequestQueueCollectionState(admin, labReqId);
          if (!labStateForImg.error) {
            if (!labStateForImg.allCollected) {
              if (ticketStatus === "Collected") {
                patch.status = "Waiting";
                needsPatch = true;
              }
            } else if (ticketStatus === "Waiting") {
              patch.status = "Collected";
              needsPatch = true;
            }
          }
        }
      }
    }

    if (!needsPatch) continue;

    const { error: upErr } = await admin.from("queue_tickets").update(patch).eq("id", row.id);
    if (upErr) return { repaired, error: upErr.message };
    repaired += 1;
  }

  return { repaired, error: null };
}

export async function adminUnpaidImagingRequestIdsOnTickets(
  admin: SupabaseClient,
  ticketDate: string,
  imagingOnlyCounterId?: string | number | null,
): Promise<{ ids: string[]; error: string | null }> {
  let q = admin
    .from("queue_tickets")
    .select("imaging_request_id, includes_imaging, counter_id")
    .eq("ticket_date", ticketDate)
    .not("imaging_request_id", "is", null);

  if (imagingOnlyCounterId != null) {
    q = q.eq("counter_id", imagingOnlyCounterId);
  }

  const { data: pendingRows, error: pendingErr } = await q;
  if (pendingErr) return { ids: [], error: pendingErr.message };

  const linkedIds = [
    ...new Set(
      ((pendingRows ?? []) as Array<{ imaging_request_id?: string | null; includes_imaging?: boolean | null }>)
        .filter((r) => r.includes_imaging !== false)
        .map((r) => String(r.imaging_request_id ?? "").trim())
        .filter(Boolean),
    ),
  ];
  if (linkedIds.length === 0) return { ids: [], error: null };

  const { ids: paidIds, error } = await adminImagingRequestIdsWithSales(admin, linkedIds);
  if (error) return { ids: [], error };
  return { ids: linkedIds.filter((id) => !paidIds.has(id)), error: null };
}
