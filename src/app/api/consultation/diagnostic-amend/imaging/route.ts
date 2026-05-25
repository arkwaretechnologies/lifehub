import { NextResponse } from "next/server";
import type { ImagingLineSelection } from "@/lib/imagingCatalog";
import { applyImagingAmendment } from "@/lib/diagnosticAmendments";
import { fetchActiveImagingCatalog } from "@/lib/imagingCatalog";
import { adminReactivateDiagnosticQueueAfterAmendment, queueAdminClient } from "@/lib/receptionQueueServer";

export async function POST(req: Request) {
  const admin = queueAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." }, { status: 500 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    encounterId?: string;
    imagingRequestId?: string;
    selection?: Record<string, ImagingLineSelection>;
    acknowledgedWarnings?: boolean;
    patient?: { id?: number; name?: string; contact_no?: string | null };
  };

  const encounterId = typeof body.encounterId === "string" ? body.encounterId.trim() : "";
  const imagingRequestId = typeof body.imagingRequestId === "string" ? body.imagingRequestId.trim() : "";
  const selection = body.selection ?? {};

  if (!encounterId || !imagingRequestId) {
    return NextResponse.json({ error: "encounterId and imagingRequestId are required." }, { status: 400 });
  }

  const { rows: catalog, error: catErr } = await fetchActiveImagingCatalog();
  if (catErr) return NextResponse.json({ error: catErr }, { status: 500 });

  const result = await applyImagingAmendment(admin, {
    encounterId,
    imagingRequestId,
    catalog,
    selection,
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
      imagingRequestId,
      includesLab: false,
      includesImaging: true,
      patient: {
        id: body.patient.id,
        name: body.patient.name,
        contact_no: typeof body.patient.contact_no === "string" ? body.patient.contact_no : null,
      },
    });
    if (q.error) return NextResponse.json({ error: q.error }, { status: 500 });
    queueDisplay = q.queueDisplay;
  }

  return NextResponse.json({
    ok: true,
    amendmentId: result.amendmentId,
    amountDelta: result.amountDelta,
    warnings: result.warnings,
    queueDisplay,
    needsCashier: result.amountDelta !== 0,
  });
}
