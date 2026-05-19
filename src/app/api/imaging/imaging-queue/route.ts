import { NextResponse } from "next/server";
import { queueTicketTodayIsoDate } from "@/lib/queueTicketDate";
import {
  adminImagingRequestIdsWithSales,
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
  imaging_display_status?: string;
  imaging_all_captured?: boolean;
  active_dept?: QueueActiveDept;
  can_imaging_call?: boolean;
  can_open_imaging?: boolean;
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

export async function GET(req: Request) {
  const admin = queueAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." }, { status: 500 });
  }

  const todayIso = queueTicketTodayIsoDate();

  let base = admin
    .from("queue_tickets")
    .select(
      "id, queue_display, patient_name, status, ticket_date, issued_at, called_at, serving_at, encounter_id, lab_request_id, imaging_request_id, includes_lab, includes_imaging, notes",
    )
    .eq("includes_imaging", true)
    .eq("ticket_date", todayIso)
    .in("status", ACTIVE_STATUSES)
    .order("issued_at", { ascending: true });

  const { ids: unpaidImg, error: unpaidErr } = await adminUnpaidImagingRequestIdsOnTickets(admin, todayIso);
  if (unpaidErr) {
    return NextResponse.json({ error: unpaidErr }, { status: 500 });
  }
  if (unpaidImg.length > 0) {
    base = base.not("imaging_request_id", "in", `(${unpaidImg.join(",")})`);
  }

  const { data, error } = await base;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let rows = (data ?? []) as ImagingQueueRow[];

  const imgIds = rows.map((r) => String(r.imaging_request_id ?? "").trim()).filter(Boolean);
  if (imgIds.length > 0) {
    const { ids: paid, error: paidErr } = await adminImagingRequestIdsWithSales(admin, imgIds);
    if (paidErr) return NextResponse.json({ error: paidErr }, { status: 500 });
    rows = rows.filter((r) => {
      const id = String(r.imaging_request_id ?? "").trim();
      if (!id) return true;
      return paid.has(id);
    });
  }

  rows = await attachImagingRequestDates(admin, rows);

  const { byLabRequestId, error: gateErr } = await loadLabCollectionGateForTickets(admin, rows);
  if (gateErr) {
    return NextResponse.json({ error: gateErr }, { status: 500 });
  }

  const captureByImgId = new Map<string, boolean>();
  const imgIdsForState = rows.map((r) => String(r.imaging_request_id ?? "").trim()).filter(Boolean);
  for (const imgId of imgIdsForState) {
    const st = await computeImagingRequestQueueState(admin, imgId);
    if (!st.error) captureByImgId.set(imgId, st.allCaptured);
  }

  rows = rows.map((r) => {
    const gate = labCollectionGateForRow(r, byLabRequestId);
    const imgId = String(r.imaging_request_id ?? "").trim();
    const progress = { allCaptured: imgId ? (captureByImgId.get(imgId) ?? false) : false };
    const activeDept = parseActiveDeptFromNotes(r.notes);
    const pres = getImagingQueuePresentation(r.status, r.imaging_request_id, gate, progress, activeDept);
    return {
      ...r,
      lab_all_collected: gate.labAllCollected,
      imaging_all_captured: progress.allCaptured,
      active_dept: activeDept,
      imaging_display_status: pres.displayStatus,
      can_imaging_call: pres.canImagingCall,
      can_open_imaging: pres.canOpenImagingRequest,
    };
  });

  return NextResponse.json({ counterCode: imagingQueueCode(), rows, count: rows.length });
}
