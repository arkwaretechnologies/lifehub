import { NextResponse } from "next/server";
import { queueAdminClient } from "@/lib/receptionQueueServer";
import type { QueueTicketStatus } from "@/lib/queueReception";

type Body = {
  labRequestItemId?: unknown;
  collected?: unknown;
};

const TICKET_TAG = "[Specimen]";

function normalizeWhitespace(s: string): string {
  return s.replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n").trim();
}

function collectedValue(collected: boolean): string | null {
  return collected ? "Y" : null;
}

function setTicketSummary(existing: string | null, allCollected: boolean): string {
  const now = new Date().toISOString();
  const base = normalizeWhitespace(existing ?? "");
  const lines = base ? base.split("\n") : [];
  const filtered = lines.filter((l) => !l.startsWith(TICKET_TAG));
  filtered.push(allCollected ? `${TICKET_TAG} collected_at=${now}` : `${TICKET_TAG} collected_at=`);
  return filtered.join("\n").trim();
}

function isYes(v: unknown): boolean {
  return String(v ?? "").trim().toUpperCase() === "Y";
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
    .select("id, lab_request_id, notes, collected_item")
    .eq("id", itemId)
    .maybeSingle();

  if (selErr) return NextResponse.json({ error: selErr.message }, { status: 500 });
  if (!itemRow) return NextResponse.json({ error: "Lab request item not found." }, { status: 404 });

  const row = itemRow as { id: string; lab_request_id: string; notes: string | null; collected_item: string | null };
  const nextCollected = collectedValue(collected);

  const { error: updErr } = await admin
    .from("lab_request_items")
    .update({ collected_item: nextCollected })
    .eq("id", itemId);
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  // Sync queue ticket "Specimen" summary: Collected only when *all* items are collected.
  const { data: allItems, error: itemsErr } = await admin
    .from("lab_request_items")
    .select("id, collected_item")
    .eq("lab_request_id", row.lab_request_id);
  if (itemsErr) return NextResponse.json({ error: itemsErr.message }, { status: 500 });

  const allCollected =
    (allItems ?? []).length > 0 &&
    (allItems ?? []).every((r) => isYes((r as { collected_item?: string | null }).collected_item));

  // Queue status automation:
  // - If any item is uncollected => Called
  // - Else if all items collected => Serving ("In Progress")
  // - Else unchanged (should not happen since any uncollected handled above)
  // Additionally, if all items have results => Completed (handled by lab-results route too, but safe here).
  const itemIds = (allItems ?? [])
    .map((r) => (r as { id?: string | null }).id)
    .filter((v): v is string => typeof v === "string" && v.trim() !== "");

  let allHasResults = false;
  if (itemIds.length > 0) {
    const { data: resultRows, error: rErr } = await admin
      .from("lab_results")
      .select("lab_request_item_id, result_value")
      .in("lab_request_item_id", itemIds);
    if (rErr) return NextResponse.json({ error: rErr.message }, { status: 500 });
    const byId = new Map<string, string>();
    for (const rr of (resultRows ?? []) as Array<{ lab_request_item_id: string; result_value: string | null }>) {
      byId.set(rr.lab_request_item_id, String(rr.result_value ?? "").trim());
    }
    allHasResults = itemIds.length > 0 && itemIds.every((id) => (byId.get(id) ?? "") !== "");
  }

  const { data: tickets, error: tErr } = await admin
    .from("queue_tickets")
    .select("id, notes, status")
    .eq("lab_request_id", row.lab_request_id);
  if (tErr) return NextResponse.json({ error: tErr.message }, { status: 500 });

  const now = new Date().toISOString();
  for (const t of (tickets ?? []) as Array<{ id: string; notes: string | null; status: QueueTicketStatus }>) {
    const nextTicketNotes = setTicketSummary(t.notes, allCollected);
    // User rule: if any item becomes uncollected, always drop back to Called.
    const nextStatus: QueueTicketStatus = !allCollected ? "Called" : allHasResults ? "Completed" : "Serving";
    const { error: tUpdErr } = await admin
      .from("queue_tickets")
      .update({ notes: nextTicketNotes, status: nextStatus, updated_at: now })
      .eq("id", t.id);
    if (tUpdErr) return NextResponse.json({ error: tUpdErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, collected, allCollected, allHasResults });
}

