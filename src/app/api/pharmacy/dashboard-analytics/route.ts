import { NextRequest, NextResponse } from "next/server";
import { fetchPharmacyDashboardAnalytics } from "@/lib/pharmacyPosDb";
import { supabaseAdminClient } from "@/lib/supabaseAdminClient";

export async function GET(req: NextRequest) {
  const admin = supabaseAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." },
      { status: 500 },
    );
  }

  const rawDays = req.nextUrl.searchParams.get("days");
  const days = rawDays != null ? Number.parseInt(rawDays, 10) : 14;
  const daysBack = Number.isFinite(days) ? days : 14;

  const result = await fetchPharmacyDashboardAnalytics(daysBack, admin);
  return NextResponse.json(result);
}
