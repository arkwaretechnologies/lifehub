import { NextResponse } from "next/server";
import { applyPartialLabReleaseToNotes } from "@/lib/labPartialCollection";
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
  labRequestItemIds?: unknown;
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

function parseItemIds(body: Body): string[] {
  const fromArray = Array.isArray(body.labRequestItemIds)
    ? body.labRequestItemIds.map((x) => String(x).trim()).filter(Boolean)
    : [];
  if (fromArray.length > 0) return [...new Set(fromArray)];
  const single = typeof body.labRequestItemId === "string" ? body.labRequestItemId.trim() : "";
  return single ? [single] : [];
}

async function syncQueueAfterSpecimenChange(
  admin: NonNullable<ReturnType<typeof queueAdminClient>>,
  labRequestId: string,
): Promise<{ error: string | null; allCollected: boolean; allHasResults: boolean }> {
  const state = await computeLabRequestQueueCollectionState(admin, labRequestId);
  if (state.error) {
    return { error: state.error, allCollected: state.allCollected, allHasResults: state.allHasResults };
  }

  const { allCollected, allHasResults } = state;

  const { data: tickets, error: tErr } = await admin
    .from("queue_tickets")
    .select("id, notes, status, includes_lab, includes_imaging, imaging_request_id")
    .eq("lab_request_id", labRequestId);
  if (tErr) return { error: tErr.message, allCollected, allHasResults };

  const now = new Date().toISOString();
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
      if (imgState.error) return { error: imgState.error, allCollected, allHasResults };
      imagingAllCaptured = imgState.allCaptured;
      imagingAllCompleted = imgState.allCompleted;
    }

    const next = nextSharedQueueState({
      hasLab: t.includes_lab === true || true,
      hasImaging,
      labAllCollected: allCollected,
      imagingAllCaptured,
      allLabResults: allHasResults,
      imagingAllCompleted,
      currentStatus: t.status,
      currentActive: parseActiveDeptFromNotes(t.notes),
      source: "lab_collect",
    });

    let notesWithSpecimen = setTicketSummary(t.notes, allCollected);
    if (allCollected) {
      notesWithSpecimen = applyPartialLabReleaseToNotes(notesWithSpecimen, false);
    }
    const nextNotes = applyActiveDeptToNotes(notesWithSpecimen, next.active);

    const { error: tUpdErr } = await admin
      .from("queue_tickets")
      .update({ notes: nextNotes, status: next.status, updated_at: now })
      .eq("id", t.id);
    if (tUpdErr) return { error: tUpdErr.message, allCollected, allHasResults };
  }

  return { error: null, allCollected, allHasResults };
}

export async function PATCH(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Body;
  const itemIds = parseItemIds(body);
  const collected = body.collected === true;

  if (itemIds.length === 0) {
    return NextResponse.json({ error: "labRequestItemId or labRequestItemIds is required." }, { status: 400 });
  }

  const admin = queueAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." }, { status: 500 });
  }

  const { data: itemRows, error: selErr } = await admin
    .from("lab_request_items")
    .select("id, lab_request_id, notes, collected_item")
    .in("id", itemIds);

  if (selErr) return NextResponse.json({ error: selErr.message }, { status: 500 });
  if (!itemRows?.length) {
    return NextResponse.json({ error: "Lab request item(s) not found." }, { status: 404 });
  }

  const foundIds = new Set((itemRows as Array<{ id: string }>).map((r) => r.id));
  const missing = itemIds.filter((id) => !foundIds.has(id));
  if (missing.length > 0) {
    return NextResponse.json({ error: "One or more lab request items were not found." }, { status: 404 });
  }

  const labRequestIds = [
    ...new Set(
      (itemRows as Array<{ lab_request_id: string }>)
        .map((r) => String(r.lab_request_id ?? "").trim())
        .filter(Boolean),
    ),
  ];
  if (labRequestIds.length !== 1) {
    return NextResponse.json({ error: "All items must belong to the same lab request." }, { status: 400 });
  }

  const labRequestId = labRequestIds[0]!;
  const nextCollected = collectedValue(collected);

  const { error: updErr } = await admin
    .from("lab_request_items")
    .update({ collected_item: nextCollected })
    .in("id", itemIds);
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  const sync = await syncQueueAfterSpecimenChange(admin, labRequestId);
  if (sync.error) return NextResponse.json({ error: sync.error }, { status: 500 });

  return NextResponse.json({
    ok: true,
    collected,
    updatedCount: itemIds.length,
    allCollected: sync.allCollected,
    allHasResults: sync.allHasResults,
  });
}
