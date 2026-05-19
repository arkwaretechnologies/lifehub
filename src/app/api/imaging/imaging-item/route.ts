import { NextResponse } from "next/server";
import {
  isImagingItemCaptured,
  isImagingItemResultReceived,
  syncImagingQueueTicketsForRequest,
} from "@/lib/imagingQueueSync";
import { parseActiveDeptFromNotes } from "@/lib/queueActiveDept";
import { queueAdminClient } from "@/lib/receptionQueueServer";
import type { QueueTicketStatus } from "@/lib/queueReception";

type Body = {
  imagingRequestItemId?: string;
  imagingRequestItemIds?: string[];
  /** Study performed (X-ray taken). */
  captured?: boolean;
  /** Result/film ready to upload findings. */
  received?: boolean;
};

function parseItemIds(body: Body): string[] {
  const fromArray = Array.isArray(body.imagingRequestItemIds)
    ? body.imagingRequestItemIds.map((x) => String(x).trim()).filter(Boolean)
    : [];
  if (fromArray.length > 0) return [...new Set(fromArray)];
  const single = typeof body.imagingRequestItemId === "string" ? body.imagingRequestItemId.trim() : "";
  return single ? [single] : [];
}

function hasFlag(v: unknown): v is boolean {
  return typeof v === "boolean";
}

export async function PATCH(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Body;
  const itemIds = parseItemIds(body);
  const setCaptured = hasFlag(body.captured) ? body.captured : null;
  const setReceived = hasFlag(body.received) ? body.received : null;

  if (itemIds.length === 0) {
    return NextResponse.json({ error: "imagingRequestItemId or imagingRequestItemIds is required." }, { status: 400 });
  }
  if (setCaptured === null && setReceived === null) {
    return NextResponse.json({ error: "captured or received flag is required." }, { status: 400 });
  }

  const admin = queueAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." }, { status: 500 });
  }

  const { data: itemRows, error: selErr } = await admin
    .from("imaging_request_items")
    .select("id, imaging_request_id, status, findings, image_storage_path")
    .in("id", itemIds);

  if (selErr) return NextResponse.json({ error: selErr.message }, { status: 500 });
  if (!itemRows?.length) {
    return NextResponse.json({ error: "Imaging request item(s) not found." }, { status: 404 });
  }

  const imagingRequestIds = [
    ...new Set(
      (itemRows as Array<{ imaging_request_id: string }>)
        .map((r) => String(r.imaging_request_id ?? "").trim())
        .filter(Boolean),
    ),
  ];
  if (imagingRequestIds.length !== 1) {
    return NextResponse.json({ error: "All items must belong to the same imaging request." }, { status: 400 });
  }

  const imagingRequestId = imagingRequestIds[0]!;
  const now = new Date().toISOString();

  const { data: ticketRow } = await admin
    .from("queue_tickets")
    .select("status, notes")
    .eq("imaging_request_id", imagingRequestId)
    .order("issued_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const ticketInfo = ticketRow as { status?: QueueTicketStatus; notes?: string | null } | null;
  const ticketStatus = String(ticketInfo?.status ?? "").trim();
  const ticketActive = parseActiveDeptFromNotes(ticketInfo?.notes);

  if (setCaptured === true) {
    const captureAllowed =
      ticketActive === "IMAG" ||
      ticketStatus === "Collected" ||
      ticketStatus === "Completed";
    if (!captureAllowed) {
      return NextResponse.json(
        { error: "Call the patient to imaging before marking Captured." },
        { status: 409 },
      );
    }
  }

  for (const row of itemRows as Array<{
    id: string;
    status?: string | null;
    findings?: string | null;
    image_storage_path?: string | null;
  }>) {
    const status = String(row.status ?? "").trim();
    const hasFindings = Boolean(String(row.findings ?? "").trim());
    const hasImage = Boolean(String(row.image_storage_path ?? "").trim());

    if (setCaptured === false && (isImagingItemResultReceived(status) || hasFindings || hasImage)) {
      return NextResponse.json(
        { error: "Cannot unmark Captured after the result is received, image is uploaded, or findings are saved." },
        { status: 409 },
      );
    }
    if (setReceived === true && !isImagingItemCaptured(status) && setCaptured !== true) {
      return NextResponse.json(
        { error: "Mark the study as Captured before marking the result as Received." },
        { status: 409 },
      );
    }
    if (setReceived === false && (hasFindings || hasImage)) {
      return NextResponse.json(
        { error: "Cannot unmark Received after an image is uploaded or findings are saved." },
        { status: 409 },
      );
    }
  }

  for (const row of itemRows as Array<{ id: string; status?: string | null }>) {
    let nextStatus = String(row.status ?? "Pending").trim() || "Pending";

    if (setCaptured === true) {
      nextStatus = "Captured";
    } else if (setCaptured === false) {
      nextStatus = "Pending";
    }

    if (setReceived === true) {
      nextStatus = "Received";
    } else if (setReceived === false && nextStatus === "Received") {
      nextStatus = "Captured";
    }

    const payload: Record<string, unknown> = {
      status: nextStatus,
      updated_at: now,
    };
    if (setCaptured === true || setReceived === true) {
      payload.performed_at = now;
    }
    if (setCaptured === false && setReceived !== true) {
      payload.performed_at = null;
    }

    const { error: updErr } = await admin.from("imaging_request_items").update(payload).eq("id", row.id);
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  const sync = await syncImagingQueueTicketsForRequest(admin, imagingRequestId);
  if (sync.error) return NextResponse.json({ error: sync.error }, { status: 500 });

  return NextResponse.json({
    ok: true,
    captured: setCaptured,
    received: setReceived,
    updatedCount: itemIds.length,
    allCaptured: sync.allCaptured,
    allResultReceived: sync.allResultReceived,
    allCompleted: sync.allCompleted,
  });
}
