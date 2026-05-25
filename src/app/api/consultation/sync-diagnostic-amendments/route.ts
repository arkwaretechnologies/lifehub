import { NextResponse } from "next/server";
import {
  fetchPendingDiagnosticAmendmentsForEncounter,
  syncPendingDiagnosticAmendmentsForEncounter,
} from "@/lib/diagnosticAmendments";
import { fetchActiveImagingCatalog } from "@/lib/imagingCatalog";
import { attachPanelLinksToCatalogItems } from "@/lib/labTestPanelLinks";
import { fetchLabTestCatalogRows, mapLabTestCatalogItem } from "@/lib/labTests";
import { queueAdminClient } from "@/lib/receptionQueueServer";

export async function POST(req: Request) {
  const admin = queueAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." }, { status: 500 });
  }

  const body = (await req.json().catch(() => ({}))) as { encounterId?: string };
  const encounterId = typeof body.encounterId === "string" ? body.encounterId.trim() : "";
  if (!encounterId) {
    return NextResponse.json({ error: "encounterId is required." }, { status: 400 });
  }

  const [labCatFetch, imgCatFetch] = await Promise.all([
    fetchLabTestCatalogRows(admin, { ordered: true }),
    fetchActiveImagingCatalog(),
  ]);
  if (labCatFetch.error) return NextResponse.json({ error: labCatFetch.error }, { status: 500 });
  if (imgCatFetch.error) return NextResponse.json({ error: imgCatFetch.error }, { status: 500 });

  let labCatalog = labCatFetch.rows.map((raw) => mapLabTestCatalogItem(raw));
  const attached = await attachPanelLinksToCatalogItems(admin, labCatalog);
  if (attached.error) return NextResponse.json({ error: attached.error }, { status: 500 });
  labCatalog = attached.tests;

  const { synced, error } = await syncPendingDiagnosticAmendmentsForEncounter(admin, encounterId, {
    labCatalog,
    imagingCatalog: imgCatFetch.rows,
  });
  if (error) return NextResponse.json({ error }, { status: 500 });

  const { rows: amendments, error: listErr } = await fetchPendingDiagnosticAmendmentsForEncounter(admin, encounterId);
  if (listErr) return NextResponse.json({ error: listErr }, { status: 500 });

  return NextResponse.json({ ok: true, synced, amendments });
}
