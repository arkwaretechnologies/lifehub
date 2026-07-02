import { NextResponse } from "next/server";
import { clinicDateYmd, clinicTimeHms } from "@/lib/queueTicketDate";
import { computeImagingRequestQueueState } from "@/lib/imagingQueueSync";
import { computeLabRequestQueueCollectionState } from "@/lib/labQueueTicketSync";
import {
  applyActiveDeptToNotes,
  nextSharedQueueState,
  parseActiveDeptFromNotes,
} from "@/lib/queueActiveDept";
import { queueAdminClient } from "@/lib/receptionQueueServer";
import type { QueueTicketStatus } from "@/lib/queueReception";

type Body = {
  labRequestItemId?: unknown;
  result_value?: unknown;
  result_unit?: unknown;
  reference_range?: unknown;
  flag?: unknown;
  remarks?: unknown;
  status?: unknown;
  performed_by?: unknown;
  verified_by?: unknown;
};

function safeText(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

export async function PATCH(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Body;
  const itemId = typeof body.labRequestItemId === "string" ? body.labRequestItemId.trim() : "";
  if (!itemId) {
    return NextResponse.json({ error: "labRequestItemId is required." }, { status: 400 });
  }

  const admin = queueAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." }, { status: 500 });
  }

  const explicitPerformed = typeof body.performed_by === "number" && Number.isFinite(body.performed_by) ? body.performed_by : null;
  const explicitVerified = typeof body.verified_by === "number" && Number.isFinite(body.verified_by) ? body.verified_by : null;

  const now = new Date();
  const resultValue = safeText(body.result_value);
  const explicitStatus = safeText(body.status);
  const payload = {
    lab_request_item_id: itemId,
    result_value: resultValue,
    result_unit: safeText(body.result_unit),
    reference_range: safeText(body.reference_range),
    flag: safeText(body.flag),
    remarks: safeText(body.remarks),
    status: resultValue ? "Completed" : explicitStatus ?? "Pending",
    performed_by: explicitPerformed,
    verified_by: explicitVerified,
    result_date: clinicDateYmd(now),
    result_time: clinicTimeHms(now),
    updated_at: now.toISOString(),
  };

  const { data, error } = await admin
    .from("lab_results")
    .upsert(payload, { onConflict: "lab_request_item_id" })
    .select(
      "id, lab_request_item_id, result_value, result_unit, reference_range, flag, performed_by, verified_by, result_date, result_time, remarks, status, created_at, updated_at",
    )
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Sync LAB queue ticket status based on request item collection + results completeness.
  const { data: itemRow, error: itemErr } = await admin
    .from("lab_request_items")
    .select("id, lab_request_id, collected_item")
    .eq("id", itemId)
    .maybeSingle();
  if (itemErr) return NextResponse.json({ error: itemErr.message }, { status: 500 });
  const labRequestId = (itemRow as { lab_request_id?: string | null } | null)?.lab_request_id ?? null;

  let allCollected = false;
  let allHasResults = false;
  if (labRequestId) {
    const state = await computeLabRequestQueueCollectionState(admin, labRequestId);
    if (state.error) return NextResponse.json({ error: state.error }, { status: 500 });
    allCollected = state.allCollected;
    allHasResults = state.allHasResults;

    const { data: tickets, error: tErr } = await admin
      .from("queue_tickets")
      .select("id, notes, status, includes_lab, includes_imaging, imaging_request_id")
      .eq("lab_request_id", labRequestId);
    if (tErr) return NextResponse.json({ error: tErr.message }, { status: 500 });

    const nowIso = new Date().toISOString();
    for (const t of (tickets ?? []) as Array<{
      id: string;
      notes: string | null;
      status: QueueTicketStatus;
      includes_lab?: boolean | null;
      includes_imaging?: boolean | null;
      imaging_request_id?: string | null;
    }>) {
      const imgId = String(t.imaging_request_id ?? "").trim();
      const hasImaging = t.includes_imaging === true || Boolean(imgId);
      let imagingAllCaptured = true;
      let imagingAllCompleted = true;
      if (hasImaging && imgId) {
        const imgState = await computeImagingRequestQueueState(admin, imgId);
        if (imgState.error) return NextResponse.json({ error: imgState.error }, { status: 500 });
        imagingAllCaptured = imgState.allCaptured;
        imagingAllCompleted = imgState.allCompleted;
      }
      const next = nextSharedQueueState({
        hasLab: true,
        hasImaging,
        labAllCollected: allCollected,
        imagingAllCaptured,
        allLabResults: allHasResults,
        imagingAllCompleted,
        currentStatus: t.status,
        currentActive: parseActiveDeptFromNotes(t.notes),
        source: "lab_collect",
      });
      const nextNotes = applyActiveDeptToNotes(t.notes ?? "", next.active);
      const { error: tUpdErr } = await admin
        .from("queue_tickets")
        .update({ status: next.status, notes: nextNotes, updated_at: nowIso })
        .eq("id", t.id);
      if (tUpdErr) return NextResponse.json({ error: tUpdErr.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, row: data, allCollected, allHasResults });
}

