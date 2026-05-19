import { NextResponse } from "next/server";
import type { ImagingLineSelection } from "@/lib/imagingCatalog";
import {
  adminCreateImagingRequestWithItems,
  fetchImagingRequestItemsForRequestIds,
} from "@/lib/imagingRequests";
import { syncImagingQueueTicketsForRequest } from "@/lib/imagingQueueSync";
import { queueAdminClient } from "@/lib/receptionQueueServer";

export async function POST(req: Request) {
  const admin = queueAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." }, { status: 500 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    encounterId?: string | null;
    patientId?: number | null;
    priority?: string;
    remarks?: string | null;
    selection?: Record<string, ImagingLineSelection>;
  };

  const encounterId =
    body.encounterId == null ? null : typeof body.encounterId === "string" ? body.encounterId.trim() : "";
  const patientId =
    body.patientId != null && Number.isFinite(body.patientId) && body.patientId > 0 ? body.patientId : null;
  const selection = body.selection ?? {};

  if (!encounterId && patientId == null) {
    return NextResponse.json({ error: "encounterId or patientId is required." }, { status: 400 });
  }

  const { imagingRequestId, error } = await adminCreateImagingRequestWithItems(admin, {
    encounterId: encounterId || null,
    patientId,
    priority: typeof body.priority === "string" ? body.priority : "Routine",
    remarks: typeof body.remarks === "string" ? body.remarks : null,
    selection,
  });

  if (error) {
    return NextResponse.json({ error }, { status: 500 });
  }
  if (!imagingRequestId) {
    return NextResponse.json({ error: "Could not create imaging request." }, { status: 500 });
  }

  return NextResponse.json({ imagingRequestId });
}

export async function GET(req: Request) {
  const admin = queueAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." }, { status: 500 });
  }

  const url = new URL(req.url);
  const imagingRequestId = (url.searchParams.get("imagingRequestId") ?? "").trim();
  if (!imagingRequestId) {
    return NextResponse.json({ error: "imagingRequestId is required." }, { status: 400 });
  }

  const { data: header, error: hErr } = await admin
    .from("imaging_requests")
    .select("id, encounter_id, patient_id, request_date, request_time, priority, remarks, status, created_at")
    .eq("id", imagingRequestId)
    .maybeSingle();
  if (hErr) return NextResponse.json({ error: hErr.message }, { status: 500 });
  if (!header) return NextResponse.json({ error: "Imaging request not found." }, { status: 404 });

  const { rows: items, error: iErr } = await fetchImagingRequestItemsForRequestIds(admin, [imagingRequestId]);
  if (iErr) return NextResponse.json({ error: iErr }, { status: 500 });

  let queue_display: string | null = null;
  const { data: qt } = await admin
    .from("queue_tickets")
    .select("queue_display")
    .eq("imaging_request_id", imagingRequestId)
    .order("issued_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  queue_display = (qt as { queue_display?: string } | null)?.queue_display ?? null;

  let patient_name: string | null = null;
  const pid = (header as { patient_id?: number | null }).patient_id;
  if (pid != null && Number.isFinite(pid)) {
    const { data: pat } = await admin.from("patients").select("name").eq("id", pid).maybeSingle();
    patient_name = (pat as { name?: string } | null)?.name ?? null;
  }

  return NextResponse.json({
    request: header,
    items,
    queue_display,
    patient_name,
  });
}

export async function PATCH(req: Request) {
  const admin = queueAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." }, { status: 500 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    imagingRequestItemId?: string;
    findings?: string | null;
    remarks?: string | null;
    status?: string | null;
  };

  const itemId = typeof body.imagingRequestItemId === "string" ? body.imagingRequestItemId.trim() : "";
  if (!itemId) {
    return NextResponse.json({ error: "imagingRequestItemId is required." }, { status: 400 });
  }

  const { data: existingItem, error: existErr } = await admin
    .from("imaging_request_items")
    .select("id, status, findings")
    .eq("id", itemId)
    .maybeSingle();
  if (existErr) return NextResponse.json({ error: existErr.message }, { status: 500 });
  if (!existingItem) return NextResponse.json({ error: "Imaging request item not found." }, { status: 404 });

  const existingStatus = String((existingItem as { status?: string }).status ?? "").trim();
  const hasFindingsInBody =
    body.findings != null && String(body.findings).trim() !== "";
  if (hasFindingsInBody && existingStatus !== "Received" && existingStatus !== "Completed") {
    return NextResponse.json(
      { error: "Mark the study as Captured, then Received (result ready), before entering findings." },
      { status: 409 },
    );
  }

  const findings =
    body.findings == null ? undefined : String(body.findings).trim() === "" ? null : String(body.findings).trim();
  const remarks =
    body.remarks == null ? undefined : String(body.remarks).trim() === "" ? null : String(body.remarks).trim();
  const status =
    body.status == null ? undefined : String(body.status).trim() === "" ? "Pending" : String(body.status).trim();

  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (findings !== undefined) payload.findings = findings;
  if (remarks !== undefined) payload.remarks = remarks;
  if (status !== undefined) {
    payload.status = findings ? "Completed" : status;
    if (findings) payload.performed_at = new Date().toISOString();
  }

  const { data, error } = await admin
    .from("imaging_request_items")
    .update(payload)
    .eq("id", itemId)
    .select("id, imaging_request_id, study_name, view_text, status, findings, remarks")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const imagingRequestId = (data as { imaging_request_id?: string }).imaging_request_id;
  if (imagingRequestId) {
    const sync = await syncImagingQueueTicketsForRequest(admin, imagingRequestId);
    if (sync.error) return NextResponse.json({ error: sync.error }, { status: 500 });
    if (sync.allCompleted) {
      await admin
        .from("imaging_requests")
        .update({ status: "Completed", updated_at: new Date().toISOString() })
        .eq("id", imagingRequestId);
    }
  }

  return NextResponse.json({ item: data });
}
