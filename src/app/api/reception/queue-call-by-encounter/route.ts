import { NextResponse } from "next/server";
import { adminCallQueueTicketForPhysicianEncounter } from "@/lib/receptionQueueServer";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    transId?: string;
    physicianUserId?: number;
  };

  const transId = typeof body.transId === "string" ? body.transId.trim() : "";
  const physicianUserId = body.physicianUserId;

  if (!transId || typeof physicianUserId !== "number" || !Number.isFinite(physicianUserId)) {
    return NextResponse.json({ error: "transId and physicianUserId are required." }, { status: 400 });
  }

  const result = await adminCallQueueTicketForPhysicianEncounter(transId, physicianUserId);
  if (result.error) {
    const msg = result.error;
    const lower = msg.toLowerCase();
    let status = 500;
    if (lower.includes("this encounter is not assigned")) {
      status = 403;
    } else if (lower.includes("encounter not found")) {
      status = 404;
    } else if (lower.includes("no waiting queue ticket")) {
      status = 404;
    } else if (lower.includes("missing") || lower.includes("invalid")) {
      status = 400;
    }
    return NextResponse.json({ error: msg }, { status });
  }

  return NextResponse.json({
    ok: true,
    queueDisplay: result.queueDisplay,
    patientName: result.patientName,
    counterName: result.counterName,
  });
}
