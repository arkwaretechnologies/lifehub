import { NextResponse } from "next/server";
import { getBearerSessionUserId } from "@/lib/requireSession";
import { voidCompletedPharmacySale } from "@/lib/pharmacyPosDb";
import { supabaseAdminClient } from "@/lib/supabaseAdminClient";

type RouteContext = { params: Promise<{ saleId: string }> };

export async function POST(req: Request, context: RouteContext) {
  const db = supabaseAdminClient();
  if (!db) {
    return NextResponse.json({ error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." }, { status: 500 });
  }

  const sessionUserId = await getBearerSessionUserId(req);
  if (sessionUserId == null) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { saleId } = await context.params;
  const id = saleId?.trim();
  if (!id) {
    return NextResponse.json({ error: "saleId is required." }, { status: 400 });
  }

  const body = (await req.json().catch(() => ({}))) as { reason?: string };
  const { error } = await voidCompletedPharmacySale(
    {
      saleId: id,
      voidedByUserId: sessionUserId,
      reason: typeof body.reason === "string" ? body.reason : undefined,
    },
    db,
  );

  if (error) {
    return NextResponse.json({ error }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
