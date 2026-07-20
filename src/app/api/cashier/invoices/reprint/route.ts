import { NextRequest, NextResponse } from "next/server";
import { getBearerSessionUserId } from "@/lib/requireSession";
import { fetchCashierInvoiceForReprint } from "@/lib/cashierInvoiceHistory";
import { supabaseAdminClient } from "@/lib/supabaseAdminClient";

export async function GET(req: NextRequest) {
  const db = supabaseAdminClient();
  if (!db) {
    return NextResponse.json({ error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." }, { status: 500 });
  }

  if ((await getBearerSessionUserId(req)) == null) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const or = req.nextUrl.searchParams.get("or") ?? "";
  if (!or.trim()) {
    return NextResponse.json({ error: "or is required." }, { status: 400 });
  }

  const { data, error } = await fetchCashierInvoiceForReprint(or, db);
  if (error) {
    return NextResponse.json({ error, data: null }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Invoice not found.", data: null }, { status: 404 });
  }

  return NextResponse.json({ data });
}
