import { NextRequest, NextResponse } from "next/server";
import {
  fetchRadiologistInterpretationDetail,
  parseRadiologyReportDateRange,
} from "@/lib/radiologyReports";
import { supabaseAdminClient } from "@/lib/supabaseAdminClient";

export async function GET(req: NextRequest) {
  const admin = supabaseAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." }, { status: 500 });
  }

  const sp = req.nextUrl.searchParams;
  const range = parseRadiologyReportDateRange(sp.get("start"), sp.get("end"));
  const radiologistUserId = Number.parseInt(sp.get("radiologistUserId") ?? "", 10);

  if (!Number.isFinite(radiologistUserId) || radiologistUserId <= 0) {
    return NextResponse.json({ error: "radiologistUserId is required." }, { status: 400 });
  }

  const payload = await fetchRadiologistInterpretationDetail(admin, range, radiologistUserId);
  if (payload.error) {
    return NextResponse.json({ error: payload.error }, { status: 500 });
  }

  return NextResponse.json(payload);
}
