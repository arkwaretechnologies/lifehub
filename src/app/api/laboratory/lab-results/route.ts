import { NextResponse } from "next/server";
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

function isYes(v: unknown): boolean {
  return String(v ?? "").trim().toUpperCase() === "Y";
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
  const payload = {
    lab_request_item_id: itemId,
    result_value: safeText(body.result_value),
    result_unit: safeText(body.result_unit),
    reference_range: safeText(body.reference_range),
    flag: safeText(body.flag),
    remarks: safeText(body.remarks),
    status: safeText(body.status) ?? "Pending",
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
    const { data: items, error: itemsErr } = await admin
      .from("lab_request_items")
      .select("id, collected_item")
      .eq("lab_request_id", labRequestId);
    if (itemsErr) return NextResponse.json({ error: itemsErr.message }, { status: 500 });

    const itemIds = (items ?? [])
      .map((r) => (r as { id?: string | null }).id)
      .filter((v): v is string => typeof v === "string" && v.trim() !== "");

    allCollected = itemIds.length > 0 && (items ?? []).every((r) => isYes((r as { collected_item?: string | null }).collected_item));

    if (itemIds.length > 0) {
      const { data: resRows, error: resErr } = await admin
        .from("lab_results")
        .select("lab_request_item_id, result_value")
        .in("lab_request_item_id", itemIds);
      if (resErr) return NextResponse.json({ error: resErr.message }, { status: 500 });
      const byId = new Map<string, string>();
      for (const rr of (resRows ?? []) as Array<{ lab_request_item_id: string; result_value: string | null }>) {
        byId.set(rr.lab_request_item_id, String(rr.result_value ?? "").trim());
      }
      allHasResults = itemIds.every((id) => (byId.get(id) ?? "") !== "");
    }

    const nextStatus: QueueTicketStatus = !allCollected ? "Called" : allHasResults ? "Completed" : "Serving";
    const nowIso = new Date().toISOString();
    const { error: tErr } = await admin
      .from("queue_tickets")
      .update({ status: nextStatus, updated_at: nowIso })
      .eq("lab_request_id", labRequestId);
    if (tErr) return NextResponse.json({ error: tErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, row: data, allCollected, allHasResults });
}

