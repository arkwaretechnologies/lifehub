import { NextResponse } from "next/server";
import { fetchDashboardSummary } from "@/lib/dashboardSummary";
import { queueAdminClient } from "@/lib/receptionQueueServer";

export async function GET() {
  const admin = queueAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." }, { status: 500 });
  }
  const { data, error } = await fetchDashboardSummary(admin);
  if (error) {
    return NextResponse.json({ error }, { status: 500 });
  }
  return NextResponse.json(data);
}
