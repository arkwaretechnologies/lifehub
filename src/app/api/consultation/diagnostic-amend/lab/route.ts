import { NextResponse } from "next/server";
import { applyLabAmendment } from "@/lib/diagnosticAmendments";
import { afterEncounterReportDataMutation } from "@/lib/cacheInvalidation";
import { adminReactivateDiagnosticQueueAfterAmendment, queueAdminClient } from "@/lib/receptionQueueServer";
import { attachPanelLinksToCatalogItems } from "@/lib/labTestPanelLinks";
import { fetchLabTestCatalogRows, mapLabTestCatalogItem } from "@/lib/labTests";

export async function POST(req: Request) {
  const admin = queueAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." }, { status: 500 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    encounterId?: string;
    labRequestId?: string;
    labTestIds?: string[];
    packageIds?: number[];
    itemPriority?: string | null;
    acknowledgedWarnings?: boolean;
    patient?: { id?: number; name?: string; contact_no?: string | null };
  };

  const encounterId = typeof body.encounterId === "string" ? body.encounterId.trim() : "";
  const labRequestId = typeof body.labRequestId === "string" ? body.labRequestId.trim() : "";
  const labTestIds = Array.isArray(body.labTestIds)
    ? body.labTestIds.map((x) => String(x).trim()).filter(Boolean)
    : [];

  if (!encounterId || !labRequestId) {
    return NextResponse.json({ error: "encounterId and labRequestId are required." }, { status: 400 });
  }
  if (labTestIds.length === 0) {
    return NextResponse.json({ error: "Select at least one lab test." }, { status: 400 });
  }

  const catFetch = await fetchLabTestCatalogRows(admin, { ordered: true });
  if (catFetch.error) return NextResponse.json({ error: catFetch.error }, { status: 500 });
  let catalog = catFetch.rows.map((raw) => mapLabTestCatalogItem(raw));
  const attached = await attachPanelLinksToCatalogItems(admin, catalog);
  if (attached.error) return NextResponse.json({ error: attached.error }, { status: 500 });
  catalog = attached.tests;

  const result = await applyLabAmendment(admin, {
    encounterId,
    labRequestId,
    desiredTestIds: labTestIds,
    packageIds: Array.isArray(body.packageIds) ? body.packageIds : [],
    catalog,
    itemPriority: typeof body.itemPriority === "string" ? body.itemPriority : null,
    acknowledgedWarnings: body.acknowledgedWarnings === true,
  });

  if (result.error === "CONFIRM_WARNINGS") {
    return NextResponse.json(
      { error: "CONFIRM_WARNINGS", warnings: result.warnings, amountDelta: result.amountDelta },
      { status: 409 },
    );
  }
  if (result.error) return NextResponse.json({ error: result.error }, { status: 500 });

  let queueDisplay: string | undefined;
  if (result.amountDelta === 0 && body.patient?.id != null && typeof body.patient.name === "string") {
    const q = await adminReactivateDiagnosticQueueAfterAmendment({
      encounterTransId: encounterId,
      labRequestId,
      includesLab: true,
      includesImaging: false,
      patient: {
        id: body.patient.id,
        name: body.patient.name,
        contact_no: typeof body.patient.contact_no === "string" ? body.patient.contact_no : null,
      },
    });
    if (q.error) return NextResponse.json({ error: q.error }, { status: 500 });
    queueDisplay = q.queueDisplay;
  }

  await afterEncounterReportDataMutation();

  return NextResponse.json({
    ok: true,
    amendmentId: result.amendmentId,
    amountDelta: result.amountDelta,
    warnings: result.warnings,
    queueDisplay,
    needsCashier: result.amountDelta !== 0,
  });
}
