import { NextRequest, NextResponse } from "next/server";
import {
  fetchLabOrderVolumeReport,
  fetchLabRevenueReport,
  fetchLabTurnaroundTimeReport,
  fetchOrRegisterReport,
  fetchOutstandingLabOrdersReport,
  fetchPhysicianWorkloadReport,
  parseConsultationLabDateRange,
} from "@/lib/consultationLabReports";
import {
  CONSULTATION_LAB_REPORT_API_KEYS,
  type ConsultationLabReportApiKey,
} from "@/lib/reportsNavLeaves";
import { supabaseAdminClient } from "@/lib/supabaseAdminClient";

function asReportKey(raw: string): ConsultationLabReportApiKey | null {
  return (CONSULTATION_LAB_REPORT_API_KEYS as readonly string[]).includes(raw)
    ? (raw as ConsultationLabReportApiKey)
    : null;
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ reportKey: string }> },
) {
  const admin = supabaseAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." }, { status: 500 });
  }

  const { reportKey: rawKey } = await context.params;
  const reportKey = asReportKey(rawKey);
  if (!reportKey) {
    return NextResponse.json({ error: "Unknown consultation/lab report key." }, { status: 404 });
  }

  const sp = req.nextUrl.searchParams;
  const range = parseConsultationLabDateRange(sp.get("start"), sp.get("end"));
  const page = sp.get("page");
  const pageSize = sp.get("pageSize");

  try {
    let payload;
    switch (reportKey) {
      case "physician-workload":
        payload = await fetchPhysicianWorkloadReport(range, admin, page, pageSize);
        break;
      case "lab-order-volume":
        payload = await fetchLabOrderVolumeReport(range, admin);
        break;
      case "lab-turnaround-time":
        payload = await fetchLabTurnaroundTimeReport(range, admin, page, pageSize);
        break;
      case "lab-revenue":
        payload = await fetchLabRevenueReport(range, admin);
        break;
      case "outstanding-lab-orders":
        payload = await fetchOutstandingLabOrdersReport(range, admin, page, pageSize);
        break;
      case "or-register":
        payload = await fetchOrRegisterReport(range, admin, page, pageSize);
        break;
      default:
        payload = { error: "Unsupported report key.", range, pagination: null };
    }
    if (payload.error) return NextResponse.json(payload, { status: 500 });
    return NextResponse.json(payload);
  } catch {
    return NextResponse.json({ error: "Failed to load consultation/lab report." }, { status: 500 });
  }
}
