import { NextRequest, NextResponse } from "next/server";
import { getBearerSessionUserId } from "@/lib/requireSession";
import { listPharmacySalesForDate } from "@/lib/pharmacyPosDb";
import { supabaseAdminClient } from "@/lib/supabaseAdminClient";

export async function GET(req: NextRequest) {
  const db = supabaseAdminClient();
  if (!db) {
    return NextResponse.json({ error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." }, { status: 500 });
  }

  if ((await getBearerSessionUserId(req)) == null) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const date = req.nextUrl.searchParams.get("date") ?? "";
  const limitRaw = req.nextUrl.searchParams.get("limit");
  const limit = limitRaw ? Number(limitRaw) : 200;

  const { sales, error } = await listPharmacySalesForDate(date, limit, db);
  if (error) {
    return NextResponse.json({ error, sales: [] }, { status: 400 });
  }

  return NextResponse.json({ sales });
}
