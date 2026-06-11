import { NextRequest, NextResponse } from "next/server";
import { fetchPrescriptionCartByEncounterWithClient } from "@/lib/pharmacyPosDb";
import { getBearerSessionUserId } from "@/lib/requireSession";
import { supabaseAdminClient } from "@/lib/supabaseAdminClient";

/**
 * Prescription cart for POS / consultation with dispensed flags.
 * `trans_id` = encounter UUID (matches printed prescription QR).
 */
export async function GET(req: NextRequest) {
  if ((await getBearerSessionUserId(req)) == null) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const db = supabaseAdminClient();
  if (!db) {
    return NextResponse.json(
      { error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." },
      { status: 500 },
    );
  }

  const transId = req.nextUrl.searchParams.get("trans_id");
  if (!transId?.trim()) {
    return NextResponse.json({ error: "trans_id is required" }, { status: 400 });
  }

  const r = await fetchPrescriptionCartByEncounterWithClient(db, transId.trim());
  if (r.error) {
    return NextResponse.json({ error: r.error }, { status: 500 });
  }
  return NextResponse.json(r);
}
