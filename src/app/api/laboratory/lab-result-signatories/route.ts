import { NextResponse } from "next/server";
import { fetchLabResultSignatories } from "@/lib/labResultSignatories";
import { supabaseAdminClient } from "@/lib/supabaseAdminClient";

export async function GET() {
  const admin = supabaseAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." }, { status: 500 });
  }

  const { signatories, error } = await fetchLabResultSignatories(admin);
  if (error) return NextResponse.json({ error }, { status: 500 });
  return NextResponse.json({ signatories });
}
