import { NextResponse } from "next/server";
import { adminCompleteQueueTicketsForEncounter } from "@/lib/receptionQueueServer";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { transId?: string };
  const transId = typeof body.transId === "string" ? body.transId.trim() : "";
  if (!transId) {
    return NextResponse.json({ error: "transId is required." }, { status: 400 });
  }

  const result = await adminCompleteQueueTicketsForEncounter(transId);
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({ ok: true, updatedCount: result.updatedCount ?? 0 });
}

