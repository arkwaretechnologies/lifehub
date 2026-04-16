import { NextResponse } from "next/server";
import { adminSearchPatients } from "@/lib/receptionQueueServer";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const { rows, error } = await adminSearchPatients(q);
  if (error) {
    return NextResponse.json({ error }, { status: 500 });
  }
  return NextResponse.json({ rows });
}

