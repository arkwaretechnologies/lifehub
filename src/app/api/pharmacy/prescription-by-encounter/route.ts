import { NextRequest, NextResponse } from "next/server";
import { fetchPrescriptionCartByEncounter } from "@/lib/pharmacyPosDb";

/**
 * Optional API: same data as client {@link fetchPrescriptionCartByEncounter}.
 * `trans_id` = encounter UUID (matches printed prescription QR).
 */
export async function GET(req: NextRequest) {
  const transId = req.nextUrl.searchParams.get("trans_id");
  if (!transId?.trim()) {
    return NextResponse.json({ error: "trans_id is required" }, { status: 400 });
  }
  const r = await fetchPrescriptionCartByEncounter(transId.trim());
  if (r.error) {
    return NextResponse.json({ error: r.error }, { status: 500 });
  }
  return NextResponse.json(r);
}
