import { NextResponse } from "next/server";
import { getBearerSessionUserId } from "@/lib/requireSession";
import { fetchPharmacySaleWithItemsForVoid } from "@/lib/pharmacyPosDb";
import { supabaseAdminClient } from "@/lib/supabaseAdminClient";

type RouteContext = { params: Promise<{ saleId: string }> };

export async function GET(req: Request, context: RouteContext) {
  const db = supabaseAdminClient();
  if (!db) {
    return NextResponse.json({ error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." }, { status: 500 });
  }

  if ((await getBearerSessionUserId(req)) == null) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { saleId } = await context.params;
  const id = saleId?.trim();
  if (!id) {
    return NextResponse.json({ error: "saleId is required." }, { status: 400 });
  }

  const { detail, error } = await fetchPharmacySaleWithItemsForVoid(id, db);
  if (error) {
    return NextResponse.json({ error, detail: null }, { status: 500 });
  }
  if (!detail) {
    return NextResponse.json({ error: "Sale not found." }, { status: 404 });
  }

  return NextResponse.json({ detail });
}
