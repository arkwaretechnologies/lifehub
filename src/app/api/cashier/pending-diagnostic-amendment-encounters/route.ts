import { NextResponse } from "next/server";
import { fetchPendingDiagnosticAmendmentDueByEncounter } from "@/lib/diagnosticAmendments";
import { queueAdminClient } from "@/lib/receptionQueueServer";

/** Encounter `trans_id`s that have pending post-payment lab/imaging amendments (service role). */
export async function GET() {
  const admin = queueAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." }, { status: 500 });
  }

  const { ids, amountDueByEncounterId, error } = await fetchPendingDiagnosticAmendmentDueByEncounter(admin);
  if (error) return NextResponse.json({ error }, { status: 500 });

  const amountDue: Record<string, number> = {};
  for (const [k, v] of amountDueByEncounterId) {
    amountDue[k] = v;
  }

  return NextResponse.json({ encounterIds: [...ids], amountDueByEncounterId: amountDue });
}
