import { NextResponse } from "next/server";
import { loadReceptionQueueState } from "@/lib/receptionQueueServer";

export async function GET() {
  const result = await loadReceptionQueueState();
  if (!result.ok) {
    return NextResponse.json({ error: result.error, warnings: result.warnings }, { status: 500 });
  }
  const { ok: _ok, ...body } = result;
  return NextResponse.json(body);
}
