import { NextResponse } from "next/server";
import type { SeedNewConsultationResult } from "@/lib/consultationEncounterSeed";
import { seedNewConsultationFromPreviousVisitAdmin } from "@/lib/consultationEncounterSeedServer";
import { supabaseAdminClient } from "@/lib/supabaseAdminClient";

export async function POST(req: Request) {
  const admin = supabaseAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." }, { status: 500 });
  }

  const body = (await req.json().catch(() => ({}))) as { transId?: string };
  const transId = typeof body.transId === "string" ? body.transId.trim() : "";
  if (!transId) {
    return NextResponse.json({ error: "transId is required." }, { status: 400 });
  }

  const result: SeedNewConsultationResult = await seedNewConsultationFromPreviousVisitAdmin(admin, transId);

  if (result.error) {
    return NextResponse.json(result, { status: 500 });
  }

  return NextResponse.json(result);
}
