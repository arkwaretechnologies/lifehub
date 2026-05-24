import { NextResponse } from "next/server";
import {
  applyPartialLabReleaseToNotes,
  parsePartialLabReleaseFromNotes,
} from "@/lib/labPartialCollection";
import { computeLabRequestQueueCollectionState } from "@/lib/labQueueTicketSync";
import { applyActiveDeptToNotes, parseActiveDeptFromNotes } from "@/lib/queueActiveDept";
import { queueAdminClient } from "@/lib/receptionQueueServer";
import type { QueueTicketStatus } from "@/lib/queueReception";

type Body = {
  ticketId?: unknown;
  labRequestId?: unknown;
};

function isYes(v: unknown): boolean {
  return String(v ?? "").trim().toUpperCase() === "Y";
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Body;
  const ticketId = typeof body.ticketId === "string" ? body.ticketId.trim() : "";
  const labRequestId = typeof body.labRequestId === "string" ? body.labRequestId.trim() : "";

  const admin = queueAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." }, { status: 500 });
  }

  let ticketQuery = admin
    .from("queue_tickets")
    .select(
      "id, status, includes_lab, includes_imaging, lab_request_id, imaging_request_id, notes",
    );

  if (ticketId) {
    ticketQuery = ticketQuery.eq("id", ticketId);
  } else if (labRequestId) {
    ticketQuery = ticketQuery.eq("lab_request_id", labRequestId).order("issued_at", { ascending: false }).limit(1);
  } else {
    return NextResponse.json({ error: "ticketId or labRequestId is required." }, { status: 400 });
  }

  const { data: row, error: selErr } = await ticketQuery.maybeSingle();
  if (selErr) return NextResponse.json({ error: selErr.message }, { status: 500 });
  if (!row) return NextResponse.json({ error: "Queue ticket not found." }, { status: 404 });

  const ticket = row as {
    id: string;
    status: QueueTicketStatus;
    includes_lab?: boolean | null;
    includes_imaging?: boolean | null;
    lab_request_id?: string | null;
    imaging_request_id?: string | null;
    notes?: string | null;
  };

  const imgId = String(ticket.imaging_request_id ?? "").trim();
  const hasImaging = ticket.includes_imaging === true || Boolean(imgId);
  if (!hasImaging) {
    return NextResponse.json(
      { error: "This ticket has no imaging order — partial release is only for lab + imaging visits." },
      { status: 400 },
    );
  }

  const labId = String(ticket.lab_request_id ?? "").trim();
  if (!labId) {
    return NextResponse.json({ error: "This ticket has no lab request linked." }, { status: 400 });
  }

  const labState = await computeLabRequestQueueCollectionState(admin, labId);
  if (labState.error) return NextResponse.json({ error: labState.error }, { status: 500 });

  const { data: items } = await admin
    .from("lab_request_items")
    .select("collected_item")
    .eq("lab_request_id", labId);
  const rows = (items ?? []) as Array<{ collected_item?: string | null }>;
  const anyCollected = rows.some((r) => isYes(r.collected_item));

  if (!anyCollected) {
    return NextResponse.json(
      { error: "Mark at least one test or category as collected before partial release." },
      { status: 409 },
    );
  }

  if (labState.allCollected) {
    return NextResponse.json(
      { error: "All specimens are already collected — use normal queue flow." },
      { status: 409 },
    );
  }

  const activeDept = parseActiveDeptFromNotes(ticket.notes);
  if (ticket.status !== "Called" || activeDept !== "LAB") {
    return NextResponse.json(
      { error: "Patient must be called to the laboratory (Called at lab) before partial release." },
      { status: 409 },
    );
  }

  if (parsePartialLabReleaseFromNotes(ticket.notes)) {
    return NextResponse.json(
      { error: "Patient is already released for imaging after partial collection." },
      { status: 409 },
    );
  }

  const now = new Date().toISOString();
  const notesWithPartial = applyPartialLabReleaseToNotes(ticket.notes, true);
  const nextNotes = applyActiveDeptToNotes(notesWithPartial, null);

  const { error: updErr } = await admin
    .from("queue_tickets")
    .update({
      status: "Waiting",
      notes: nextNotes,
      updated_at: now,
    })
    .eq("id", ticket.id);

  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    status: "Waiting",
    lab_partial_released: true,
    lab_all_collected: false,
  });
}
