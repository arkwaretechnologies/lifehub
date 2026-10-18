import { NextResponse } from "next/server";
import {
  adminCompleteQueueTicketsForEncounter,
  adminEnsureWaitingDiagnosticAfterConsultation,
} from "@/lib/receptionQueueServer";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { transId?: string };
  const transId = typeof body.transId === "string" ? body.transId.trim() : "";
  if (!transId) {
    return NextResponse.json({ error: "transId is required." }, { status: 400 });
  }

  const result = await adminCompleteQueueTicketsForEncounter(transId);
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  const ensured = await adminEnsureWaitingDiagnosticAfterConsultation(transId);
  if (ensured.error) {
    return NextResponse.json(
      {
        error: ensured.error,
        updatedCount: result.updatedCount ?? 0,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    updatedCount: result.updatedCount ?? 0,
    diagnosticEnsured: ensured.ensured === true,
    diagnosticQueueDisplay: ensured.queueDisplay ?? null,
  });
}
