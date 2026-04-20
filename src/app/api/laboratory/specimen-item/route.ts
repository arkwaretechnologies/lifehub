import { NextResponse } from "next/server";
import { queueAdminClient } from "@/lib/receptionQueueServer";

type Body = {
  labRequestItemId?: unknown;
  collected?: unknown;
};

const ITEM_TAG = "[SpecimenItem]";
const TICKET_TAG = "[Specimen]";

function normalizeWhitespace(s: string): string {
  return s.replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n").trim();
}

function setCollectedNote(existing: string | null, collected: boolean): string {
  const now = new Date().toISOString();
  const base = normalizeWhitespace(existing ?? "");
  const lines = base ? base.split("\n") : [];
  const filtered = lines.filter((l) => !l.startsWith(ITEM_TAG));
  filtered.push(collected ? `${ITEM_TAG} collected_at=${now}` : `${ITEM_TAG} collected_at=`);
  return filtered.join("\n").trim();
}

function isItemCollected(notes: string | null | undefined): boolean {
  return /^\[SpecimenItem\]\s+collected_at=.+/m.test(notes ?? "");
}

function setTicketSummary(existing: string | null, allCollected: boolean): string {
  const now = new Date().toISOString();
  const base = normalizeWhitespace(existing ?? "");
  const lines = base ? base.split("\n") : [];
  const filtered = lines.filter((l) => !l.startsWith(TICKET_TAG));
  filtered.push(allCollected ? `${TICKET_TAG} collected_at=${now}` : `${TICKET_TAG} collected_at=`);
  return filtered.join("\n").trim();
}

export async function PATCH(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Body;
  const itemId =
    typeof body.labRequestItemId === "string" ? body.labRequestItemId.trim() : "";
  const collected = body.collected === true;

  if (!itemId) {
    return NextResponse.json({ error: "labRequestItemId is required." }, { status: 400 });
  }

  const admin = queueAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." }, { status: 500 });
  }

  const { data: itemRow, error: selErr } = await admin
    .from("lab_request_items")
    .select("id, lab_request_id, notes")
    .eq("id", itemId)
    .maybeSingle();

  if (selErr) return NextResponse.json({ error: selErr.message }, { status: 500 });
  if (!itemRow) return NextResponse.json({ error: "Lab request item not found." }, { status: 404 });

  const row = itemRow as { id: string; lab_request_id: string; notes: string | null };
  const nextNotes = setCollectedNote(row.notes, collected);

  const { error: updErr } = await admin
    .from("lab_request_items")
    .update({ notes: nextNotes })
    .eq("id", itemId);
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  // Sync queue ticket "Specimen" summary: Collected only when *all* items are collected.
  const { data: allItems, error: itemsErr } = await admin
    .from("lab_request_items")
    .select("notes")
    .eq("lab_request_id", row.lab_request_id);
  if (itemsErr) return NextResponse.json({ error: itemsErr.message }, { status: 500 });

  const allCollected =
    (allItems ?? []).length > 0 &&
    (allItems ?? []).every((r) => isItemCollected((r as { notes?: string | null }).notes));

  const { data: tickets, error: tErr } = await admin
    .from("queue_tickets")
    .select("id, notes")
    .eq("lab_request_id", row.lab_request_id);
  if (tErr) return NextResponse.json({ error: tErr.message }, { status: 500 });

  const now = new Date().toISOString();
  for (const t of (tickets ?? []) as Array<{ id: string; notes: string | null }>) {
    const nextTicketNotes = setTicketSummary(t.notes, allCollected);
    const { error: tUpdErr } = await admin
      .from("queue_tickets")
      .update({ notes: nextTicketNotes, updated_at: now })
      .eq("id", t.id);
    if (tUpdErr) return NextResponse.json({ error: tUpdErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, collected, allCollected });
}

