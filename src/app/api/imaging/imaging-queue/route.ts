import { NextResponse } from "next/server";
import { clinicAddDays, queueTicketTodayIsoDate } from "@/lib/queueTicketDate";
import {
  adminImagingRequestIdsWithSales,
  adminRepairQueueTicketModalityFlags,
  adminUnpaidImagingRequestIdsOnTickets,
  imagingQueueCode,
} from "@/lib/diagnosticQueueServer";
import { getImagingQueuePresentation } from "@/lib/imagingQueueUi";
import {
  computeImagingRequestQueueState,
  labCollectionGateForRow,
  loadLabCollectionGateForTickets,
} from "@/lib/imagingQueueSync";
import { parseActiveDeptFromNotes, type QueueActiveDept } from "@/lib/queueActiveDept";
import { queueAdminClient } from "@/lib/receptionQueueServer";
import type { QueueTicketStatus } from "@/lib/queueReception";

const ACTIVE_STATUSES: QueueTicketStatus[] = ["Waiting", "Called", "Collected", "Serving"];

function isoDateDaysAgo(days: number): string {
  return clinicAddDays(-Math.max(0, Math.floor(days)));
}

function parsePositiveInt(raw: string | null, fallback: number): number {
  const n = Number.parseInt(String(raw ?? ""), 10);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return n;
}

function isUuidLike(v: string): boolean {
  const s = v.trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

export type ImagingQueueRow = {
  id: string;
  queue_display: string;
  patient_name: string | null;
  status: QueueTicketStatus;
  ticket_date: string | null;
  issued_at: string;
  called_at: string | null;
  serving_at: string | null;
  encounter_id: string | null;
  lab_request_id: string | null;
  imaging_request_id: string | null;
  includes_lab: boolean | null;
  includes_imaging: boolean | null;
  notes: string | null;
  request_date?: string | null;
  request_time?: string | null;
  lab_all_collected?: boolean;
  lab_partial_released?: boolean;
  imaging_display_status?: string;
  imaging_all_captured?: boolean;
  active_dept?: QueueActiveDept;
  can_imaging_call?: boolean;
  can_open_imaging?: boolean;
  imaging_call_tooltip?: string;
  open_imaging_tooltip?: string;
};

async function attachImagingRequestDates(
  admin: NonNullable<ReturnType<typeof queueAdminClient>>,
  rows: ImagingQueueRow[],
): Promise<ImagingQueueRow[]> {
  const ids = [...new Set(rows.map((r) => String(r.imaging_request_id ?? "").trim()).filter(Boolean))];
  if (ids.length === 0) return rows;

  const { data, error } = await admin
    .from("imaging_requests")
    .select("id, request_date, request_time")
    .in("id", ids);
  if (error) return rows;

  const byId = new Map<string, { request_date: string; request_time: string | null }>();
  for (const row of (data ?? []) as Array<{ id: string; request_date: string; request_time: string | null }>) {
    byId.set(row.id, { request_date: row.request_date, request_time: row.request_time });
  }

  return rows.map((r) => {
    const ir = String(r.imaging_request_id ?? "").trim();
    const meta = ir ? byId.get(ir) : undefined;
    if (!meta) return r;
    return { ...r, request_date: meta.request_date, request_time: meta.request_time };
  });
}

/** Imaging orders for matching patients not already listed on a queue ticket row. */
async function fetchImagingRequestQueueRowsForPatientSearch(
  admin: NonNullable<ReturnType<typeof queueAdminClient>>,
  q: string,
  existingImagingRequestIds: Set<string>,
  limit: number,
): Promise<ImagingQueueRow[]> {
  const term = q.trim();
  if (term.length < 2) return [];

  const { data: pats, error: pErr } = await admin
    .from("patients")
    .select("id, name")
    .ilike("name", `%${term}%`)
    .limit(30);
  if (pErr || !pats?.length) return [];

  const patientIds = (pats as Array<{ id: number }>).map((p) => p.id).filter((id) => Number.isFinite(id));
  if (patientIds.length === 0) return [];

  const { data: reqs, error: rErr } = await admin
    .from("imaging_requests")
    .select("id, patient_id, encounter_id, request_date, request_time, created_at")
    .in("patient_id", patientIds)
    .order("request_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(Math.min(limit, 40));
  if (rErr || !reqs?.length) return [];

  const nameById = new Map<number, string>();
  for (const p of pats as Array<{ id: number; name?: string | null }>) {
    const n = String(p.name ?? "").trim();
    if (n) nameById.set(p.id, n);
  }

  const reqList = (reqs as Array<{
    id: string;
    patient_id: number;
    encounter_id: string | null;
    request_date: string;
    request_time: string | null;
    created_at: string;
  }>).filter((r) => !existingImagingRequestIds.has(r.id));

  if (reqList.length === 0) return [];

  const reqIds = reqList.map((r) => r.id);
  const displayByReq = new Map<string, string>();
  const { data: qtRows } = await admin
    .from("queue_tickets")
    .select("imaging_request_id, queue_display")
    .in("imaging_request_id", reqIds);
  for (const qt of (qtRows ?? []) as Array<{ imaging_request_id?: string | null; queue_display?: string | null }>) {
    const rid = String(qt.imaging_request_id ?? "").trim();
    const qd = String(qt.queue_display ?? "").trim();
    if (rid && qd && !displayByReq.has(rid)) displayByReq.set(rid, qd);
  }

  return reqList.map((r) => {
    const issued =
      String(r.created_at ?? "").trim() ||
      `${String(r.request_date).slice(0, 10)}T00:00:00.000Z`;
    return {
      id: `imaging-request:${r.id}`,
      queue_display: displayByReq.get(r.id) ?? "—",
      patient_name: nameById.get(r.patient_id) ?? null,
      status: "Completed" as QueueTicketStatus,
      ticket_date: String(r.request_date).slice(0, 10),
      issued_at: issued,
      called_at: null,
      serving_at: null,
      encounter_id: r.encounter_id,
      lab_request_id: null,
      imaging_request_id: r.id,
      includes_lab: false,
      includes_imaging: true,
      notes: null,
      request_date: r.request_date,
      request_time: r.request_time,
    };
  });
}

async function filterPaidImagingTicketRows(
  admin: NonNullable<ReturnType<typeof queueAdminClient>>,
  rows: ImagingQueueRow[],
): Promise<{ rows: ImagingQueueRow[]; error: string | null }> {
  const imgIds = rows.map((r) => String(r.imaging_request_id ?? "").trim()).filter(Boolean);
  if (imgIds.length === 0) return { rows, error: null };

  const { ids: paid, error: paidErr } = await adminImagingRequestIdsWithSales(admin, imgIds);
  if (paidErr) return { rows: [], error: paidErr };

  return {
    rows: rows.filter((r) => {
      const id = String(r.imaging_request_id ?? "").trim();
      if (!id) return true;
      return paid.has(id);
    }),
    error: null,
  };
}

async function enrichImagingQueueRows(
  admin: NonNullable<ReturnType<typeof queueAdminClient>>,
  rows: ImagingQueueRow[],
): Promise<{ rows: ImagingQueueRow[]; error: string | null }> {
  let dated = await attachImagingRequestDates(admin, rows);

  const { byLabRequestId, error: gateErr } = await loadLabCollectionGateForTickets(admin, dated);
  if (gateErr) return { rows: [], error: gateErr };

  const captureByImgId = new Map<string, boolean>();
  const imgIdsForState = dated.map((r) => String(r.imaging_request_id ?? "").trim()).filter(Boolean);
  for (const imgId of imgIdsForState) {
    const st = await computeImagingRequestQueueState(admin, imgId);
    if (!st.error) captureByImgId.set(imgId, st.allCaptured);
  }

  dated = dated.map((r) => {
    const gate = labCollectionGateForRow(r, byLabRequestId);
    const imgId = String(r.imaging_request_id ?? "").trim();
    const progress = { allCaptured: imgId ? (captureByImgId.get(imgId) ?? false) : false };
    const activeDept = parseActiveDeptFromNotes(r.notes);
    const pres = getImagingQueuePresentation(r.status, r.imaging_request_id, gate, progress, activeDept);
    return {
      ...r,
      lab_all_collected: gate.labAllCollected,
      lab_partial_released: gate.labPartialReleased,
      imaging_all_captured: progress.allCaptured,
      active_dept: activeDept,
      imaging_display_status: pres.displayStatus,
      can_imaging_call: pres.canImagingCall,
      can_open_imaging: pres.canOpenImagingRequest,
      imaging_call_tooltip: pres.imagingCallTooltip,
      open_imaging_tooltip: pres.openImagingTooltip,
    };
  });

  return { rows: dated, error: null };
}

export async function GET(req: Request) {
  const admin = queueAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." }, { status: 500 });
  }

  const url = new URL(req.url);
  const qRaw = (url.searchParams.get("q") ?? "").trim();
  const page = parsePositiveInt(url.searchParams.get("page"), 0);
  const pageSize = Math.min(Math.max(parsePositiveInt(url.searchParams.get("pageSize"), 10) || 10, 5), 50);
  const scope = String(url.searchParams.get("scope") ?? "active_today").trim().toLowerCase();
  const days = Math.min(Math.max(parsePositiveInt(url.searchParams.get("days"), 30) || 30, 1), 365);

  const todayIso = queueTicketTodayIsoDate();

  if (scope === "active_today" || scope === "today_all") {
    const repair = await adminRepairQueueTicketModalityFlags(admin, todayIso);
    if (repair.error) {
      return NextResponse.json({ error: repair.error }, { status: 500 });
    }
  }

  let base = admin
    .from("queue_tickets")
    .select(
      "id, queue_display, patient_name, status, ticket_date, issued_at, called_at, serving_at, encounter_id, lab_request_id, imaging_request_id, includes_lab, includes_imaging, notes",
      { count: "exact" },
    )
    .or("includes_imaging.eq.true,imaging_request_id.not.is.null")
    .order("issued_at", { ascending: true });

  if (scope === "all") {
    base = base.gte("ticket_date", isoDateDaysAgo(days));
  } else if (scope === "today_all") {
    base = base.eq("ticket_date", todayIso);
  } else {
    base = base.eq("ticket_date", todayIso).in("status", ACTIVE_STATUSES);
  }

  const ticketDateForPaidFilter = scope === "all" ? null : todayIso;
  if (ticketDateForPaidFilter) {
    const { ids: unpaidImg, error: unpaidErr } = await adminUnpaidImagingRequestIdsOnTickets(
      admin,
      ticketDateForPaidFilter,
    );
    if (unpaidErr) {
      return NextResponse.json({ error: unpaidErr }, { status: 500 });
    }
    if (unpaidImg.length > 0) {
      base = base.not("imaging_request_id", "in", `(${unpaidImg.join(",")})`);
    }
  }

  const q = qRaw.replace(/\s+/g, " ").trim();
  const qIsUuid = isUuidLike(q);
  const orParts: string[] = [];
  if (q.length >= 2) {
    orParts.push(`patient_name.ilike.%${q}%`);
    orParts.push(`queue_display.ilike.%${q}%`);
  }
  if (qIsUuid) {
    orParts.push(`encounter_id.eq.${q}`);
    orParts.push(`imaging_request_id.eq.${q}`);
  }

  const query = orParts.length > 0 ? base.or(orParts.join(",")) : base;

  const from = page * pageSize;
  const to = from + pageSize - 1;
  const { data, error, count } = await query.range(from, to);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let rows = (data ?? []) as ImagingQueueRow[];

  if (ticketDateForPaidFilter) {
    const paid = await filterPaidImagingTicketRows(admin, rows);
    if (paid.error) return NextResponse.json({ error: paid.error }, { status: 500 });
    rows = paid.rows;
  }

  const enriched = await enrichImagingQueueRows(admin, rows);
  if (enriched.error) {
    return NextResponse.json({ error: enriched.error }, { status: 500 });
  }
  rows = enriched.rows;

  let totalCount = count ?? rows.length;
  if (scope === "all" && q.length >= 2 && page === 0) {
    const existingReqIds = new Set(
      rows.map((r) => String(r.imaging_request_id ?? "").trim()).filter(Boolean),
    );
    const extra = await fetchImagingRequestQueueRowsForPatientSearch(admin, q, existingReqIds, 30);
    if (extra.length > 0) {
      const extraEnriched = await enrichImagingQueueRows(admin, extra);
      if (extraEnriched.error) {
        return NextResponse.json({ error: extraEnriched.error }, { status: 500 });
      }
      rows = [...rows, ...extraEnriched.rows].sort((a, b) => {
        const d = b.issued_at.localeCompare(a.issued_at);
        if (d !== 0) return d;
        return (a.queue_display ?? "").localeCompare(b.queue_display ?? "");
      });
      totalCount += extra.length;
    }
  }

  return NextResponse.json({
    counterCode: imagingQueueCode(),
    rows,
    count: totalCount,
  });
}
