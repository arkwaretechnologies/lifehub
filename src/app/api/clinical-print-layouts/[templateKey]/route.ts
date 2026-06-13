import { NextResponse } from "next/server";
import {
  fetchClinicalPrintLayout,
  parseClinicalPrintTemplateKey,
} from "@/lib/clinicalPrintLayouts";
import { supabaseAdminClient } from "@/lib/supabaseAdminClient";

export async function GET(
  _req: Request,
  context: { params: Promise<{ templateKey: string }> },
) {
  const { templateKey: rawKey } = await context.params;
  const templateKey = parseClinicalPrintTemplateKey(rawKey);
  if (!templateKey) {
    return NextResponse.json({ error: "Invalid template key." }, { status: 400 });
  }

  const db = supabaseAdminClient();
  if (!db) {
    return NextResponse.json(
      { error: "Server missing SUPABASE_SERVICE_ROLE_KEY or Supabase URL." },
      { status: 500 },
    );
  }

  const { layout, error } = await fetchClinicalPrintLayout(db, templateKey);
  if (error) return NextResponse.json({ error }, { status: 400 });
  return NextResponse.json({ layout });
}
