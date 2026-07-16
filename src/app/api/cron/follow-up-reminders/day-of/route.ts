import { NextResponse } from "next/server";
import { authorizeCronRequest, runFollowUpReminderJob } from "@/lib/followUpReminderSms";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  if (!authorizeCronRequest(req)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const result = await runFollowUpReminderJob("day-of");
  if (!result.ok) {
    return NextResponse.json(
      {
        error: result.error ?? "Follow-up reminder job failed.",
        date: result.targetDate,
        sent: result.sent,
        skippedNoPhone: result.skippedNoPhone,
        failed: result.failed,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    date: result.targetDate,
    sent: result.sent,
    skippedNoPhone: result.skippedNoPhone,
    failed: result.failed,
  });
}
