import { NextResponse } from "next/server";
import { getBearerSessionUserId } from "@/lib/requireSession";
import { completePharmacySale, generateOrNumber, type CompletePharmacySaleInput } from "@/lib/pharmacyPosDb";
import { supabaseAdminClient } from "@/lib/supabaseAdminClient";

export async function POST(req: Request) {
  const db = supabaseAdminClient();
  if (!db) {
    return NextResponse.json(
      { error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." },
      { status: 500 },
    );
  }

  const sessionUserId = await getBearerSessionUserId(req);
  if (sessionUserId == null) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as CompletePharmacySaleInput | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!body.shiftId) {
    return NextResponse.json({ error: "shiftId is required." }, { status: 400 });
  }
  if (!Array.isArray(body.lines) || body.lines.length === 0) {
    return NextResponse.json({ error: "At least one sale line is required." }, { status: 400 });
  }
  const servedBy =
    body.servedBy != null && Number.isFinite(Number(body.servedBy)) ? Number(body.servedBy) : sessionUserId;

  let orNumber: string;
  try {
    orNumber = await generateOrNumber(db);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not generate sale reference.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const { saleId, error } = await completePharmacySale({ ...body, servedBy, orNumber }, db);
  if (error) {
    return NextResponse.json({ error }, { status: 500 });
  }
  if (!saleId) {
    return NextResponse.json({ error: "Checkout failed." }, { status: 500 });
  }

  return NextResponse.json({ saleId, orNumber });
}
