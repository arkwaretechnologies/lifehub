import { NextResponse } from "next/server";
import { getBearerSessionUserId } from "@/lib/requireSession";
import { queueAdminClient } from "@/lib/receptionQueueServer";
import { fetchFollowUpCountsForMonth, fetchFollowUpsForDate } from "@/lib/receptionFollowUps";

export async function GET(req: Request) {
  const sessionUserId = await getBearerSessionUserId(req);
  if (sessionUserId == null) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const admin = queueAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." }, { status: 500 });
  }

  const url = new URL(req.url);
  const date = (url.searchParams.get("date") ?? "").trim();
  const month = (url.searchParams.get("month") ?? "").trim();

  if (date && month) {
    return NextResponse.json({ error: "Provide either date or month, not both." }, { status: 400 });
  }
  if (!date && !month) {
    return NextResponse.json({ error: "Query param date=YYYY-MM-DD or month=YYYY-MM is required." }, { status: 400 });
  }

  if (date) {
    const { rows, error } = await fetchFollowUpsForDate(date, admin);
    if (error) {
      const status = error.startsWith("Invalid date") ? 400 : 500;
      return NextResponse.json({ error }, { status });
    }
    return NextResponse.json({ date, rows });
  }

  const { days, error } = await fetchFollowUpCountsForMonth(month, admin);
  if (error) {
    const status = error.startsWith("Invalid month") ? 400 : 500;
    return NextResponse.json({ error }, { status });
  }
  return NextResponse.json({ month, days });
}
