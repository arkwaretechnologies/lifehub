import { NextResponse } from "next/server";
import { fetchImagingResultSignatories } from "@/lib/imagingResultSignatories";
import { supabaseAdminClient } from "@/lib/supabaseAdminClient";

export async function GET() {
  const admin = supabaseAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." }, { status: 500 });
  }

  const { signatories, error } = await fetchImagingResultSignatories(admin);
  if (error) return NextResponse.json({ error }, { status: 500 });
  return NextResponse.json({ signatories });
}
