import { NextResponse } from "next/server";
import { computeLabRequestQueueCollectionState } from "@/lib/labQueueTicketSync";
import { computeImagingRequestQueueState } from "@/lib/imagingQueueSync";
import {
  applyActiveDeptToNotes,
  parseActiveDeptFromNotes,
} from "@/lib/queueActiveDept";
import { queueAdminClient } from "@/lib/receptionQueueServer";
import type { QueueTicketStatus } from "@/lib/queueReception";

type Body = {
  ticketId?: string;
};

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Body;
  const ticketId = typeof body.ticketId === "string" ? body.ticketId.trim() : "";
  if (!ticketId) {
    return NextResponse.json({ error: "ticketId is required." }, { status: 400 });
  }

  const admin = queueAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." }, { status: 500 });
  }

  const { data: row, error: selErr } = await admin
    .from("queue_tickets")
    .select(
      "id, status, includes_lab, includes_imaging, lab_request_id, imaging_request_id, notes, called_at",
    )
    .eq("id", ticketId)
    .maybeSingle();

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
    called_at?: string | null;
  };

  if (ticket.includes_imaging !== true && !String(ticket.imaging_request_id ?? "").trim()) {
    return NextResponse.json({ error: "This ticket has no imaging order." }, { status: 400 });
  }

  const activeDept = parseActiveDeptFromNotes(ticket.notes);
  if (activeDept === "LAB") {
    return NextResponse.json(
      { error: "Patient is currently at the laboratory. Wait until specimens are collected." },
      { status: 409 },
    );
  }

  const imgId = String(ticket.imaging_request_id ?? "").trim();
  if (imgId) {
    const imgState = await computeImagingRequestQueueState(admin, imgId);
    if (imgState.error) return NextResponse.json({ error: imgState.error }, { status: 500 });
    if (imgState.allCaptured) {
      return NextResponse.json(
        { error: "Imaging is already captured for this ticket." },
        { status: 409 },
      );
    }
  }

  if (ticket.status !== "Waiting" && ticket.status !== "Called") {
    if (ticket.status === "Collected") {
      const labId = String(ticket.lab_request_id ?? "").trim();
      const includesLab = ticket.includes_lab === true || Boolean(labId);
      if (includesLab && labId) {
        const labState = await computeLabRequestQueueCollectionState(admin, labId);
        if (labState.error) return NextResponse.json({ error: labState.error }, { status: 500 });
        if (!labState.allCollected) {
          return NextResponse.json(
            { error: "Patient is not ready for imaging." },
            { status: 409 },
          );
        }
      }
    } else {
      return NextResponse.json(
        { error: "Patient is not ready for imaging." },
        { status: 409 },
      );
    }
  }

  const now = new Date().toISOString();
  const nextNotes = applyActiveDeptToNotes(ticket.notes ?? "", "IMAG");

  const { error: updErr } = await admin
    .from("queue_tickets")
    .update({
      status: "Called",
      called_at: now,
      notes: nextNotes,
      updated_at: now,
    })
    .eq("id", ticketId);

  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, status: "Called" });
}
