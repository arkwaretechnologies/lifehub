import { NextRequest, NextResponse } from "next/server";
import { getBearerSessionUserId } from "@/lib/requireSession";
import {
  listCashierInvoicesForDate,
  searchCashierInvoicesByOrOrPatient,
} from "@/lib/cashierInvoiceHistory";
import { supabaseAdminClient } from "@/lib/supabaseAdminClient";

export async function GET(req: NextRequest) {
  const db = supabaseAdminClient();
  if (!db) {
    return NextResponse.json({ error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." }, { status: 500 });
  }

  if ((await getBearerSessionUserId(req)) == null) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const q = req.nextUrl.searchParams.get("q") ?? "";
  const date = req.nextUrl.searchParams.get("date") ?? "";

  if (q.trim()) {
    const { invoices, error } = await searchCashierInvoicesByOrOrPatient(q, db);
    if (error) return NextResponse.json({ error, invoices: [] }, { status: 500 });
    return NextResponse.json({ invoices });
  }

  const { invoices, error } = await listCashierInvoicesForDate(date, db);
  if (error) return NextResponse.json({ error, invoices: [] }, { status: 400 });
  return NextResponse.json({ invoices });
}
