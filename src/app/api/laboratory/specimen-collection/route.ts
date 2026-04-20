import { NextResponse } from "next/server";
import { queueAdminClient } from "@/lib/receptionQueueServer";

type Body = {
  ticketId?: unknown;
  collected?: unknown;
};

const NOTE_TAG = "[Specimen]";

function normalizeWhitespace(s: string): string {
  return s.replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n").trim();
}

function upsertSpecimenNote(existing: string | null, collected: boolean): string {
  const now = new Date().toISOString();
  const base = normalizeWhitespace(existing ?? "");
  const lines = base ? base.split("\n") : [];

  const filtered = lines.filter((l) => !l.startsWith(NOTE_TAG));
  if (collected) {
    filtered.push(`${NOTE_TAG} collected_at=${now}`);
  } else {
    filtered.push(`${NOTE_TAG} collected_at=`);
  }
  return filtered.join("\n").trim();
}

export async function PATCH(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Body;
  const ticketId = typeof body.ticketId === "string" ? body.ticketId.trim() : "";
  const collected = body.collected === true;

  if (!ticketId) {
    return NextResponse.json({ error: "ticketId is required." }, { status: 400 });
  }

  const admin = queueAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." }, { status: 500 });
  }

  const { data: row, error: selErr } = await admin
    .from("queue_tickets")
    .select("id, notes")
    .eq("id", ticketId)
    .maybeSingle();

  if (selErr) return NextResponse.json({ error: selErr.message }, { status: 500 });
  if (!row) return NextResponse.json({ error: "Queue ticket not found." }, { status: 404 });

  const notes = (row as { notes?: string | null }).notes ?? null;
  const nextNotes = upsertSpecimenNote(notes, collected);
  const now = new Date().toISOString();

  const { error: updErr } = await admin
    .from("queue_tickets")
    .update({ notes: nextNotes, updated_at: now })
    .eq("id", ticketId);

  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, collected });
}

