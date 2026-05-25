import { NextResponse } from "next/server";
import { fetchPendingDiagnosticAmendmentsForEncounter } from "@/lib/diagnosticAmendments";
import { queueAdminClient } from "@/lib/receptionQueueServer";

export async function GET(req: Request) {
  const admin = queueAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." }, { status: 500 });
  }

  const url = new URL(req.url);
  const encounterId = (url.searchParams.get("encounterId") ?? "").trim();
  if (!encounterId) {
    return NextResponse.json({ error: "encounterId is required." }, { status: 400 });
  }

  const { rows, error } = await fetchPendingDiagnosticAmendmentsForEncounter(admin, encounterId);
  if (error) return NextResponse.json({ error }, { status: 500 });

  return NextResponse.json({ amendments: rows, amendment: rows[0] ?? null });
}
