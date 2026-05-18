import { NextResponse } from "next/server";
import {
  computeLabRequestQueueCollectionState,
  nextLabQueueTicketStatus,
} from "@/lib/labQueueTicketSync";
import { queueAdminClient } from "@/lib/receptionQueueServer";

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
    result_date: now.toISOString().slice(0, 10),
    result_time: now.toTimeString().slice(0, 8),
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

    const nextStatus = nextLabQueueTicketStatus(allCollected, allHasResults);
    const nowIso = new Date().toISOString();
    const { error: tErr } = await admin
      .from("queue_tickets")
      .update({ status: nextStatus, updated_at: nowIso })
      .eq("lab_request_id", labRequestId);
    if (tErr) return NextResponse.json({ error: tErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, row: data, allCollected, allHasResults });
}

