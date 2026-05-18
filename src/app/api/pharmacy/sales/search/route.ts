import { NextRequest, NextResponse } from "next/server";
import { getBearerSessionUserId } from "@/lib/requireSession";
import { searchCompletedPharmacySalesByOrNumber } from "@/lib/pharmacyPosDb";
import { supabaseAdminClient } from "@/lib/supabaseAdminClient";

export async function GET(req: NextRequest) {
  const db = supabaseAdminClient();
  if (!db) {
    return NextResponse.json({ error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." }, { status: 500 });
  }

  if ((await getBearerSessionUserId(req)) == null) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const q = req.nextUrl.searchParams.get("q") ?? req.nextUrl.searchParams.get("or") ?? "";
  const limitRaw = req.nextUrl.searchParams.get("limit");
  const limit = limitRaw ? Number(limitRaw) : 30;

  const { sales, error } = await searchCompletedPharmacySalesByOrNumber(q, limit, db);
  if (error) {
    return NextResponse.json({ error, sales: [] }, { status: 500 });
  }

  return NextResponse.json({ sales });
}
