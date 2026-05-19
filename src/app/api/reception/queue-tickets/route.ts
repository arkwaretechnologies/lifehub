import { NextResponse } from "next/server";
import { loadReceptionQueueTickets } from "@/lib/receptionQueueServer";

/** Lightweight poll target: today's active tickets only (no counters / priorities). */
export async function GET() {
  const result = await loadReceptionQueueTickets();
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }
  return NextResponse.json({ tickets: result.tickets });
}
