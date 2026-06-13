import { NextResponse } from "next/server";
import {
  fetchClinicalPrintLayouts,
  parseClinicalPrintTemplateKey,
  parsePhysicianSignatureLayoutFormInput,
  upsertClinicalPrintPhysicianSignatureLayout,
} from "@/lib/clinicalPrintLayouts";
import { supabaseAdminClient } from "@/lib/supabaseAdminClient";

function adminOr500() {
  const db = supabaseAdminClient();
  if (!db) {
    return {
      db: null as null,
      res: NextResponse.json(
        { error: "Server missing SUPABASE_SERVICE_ROLE_KEY or Supabase URL." },
        { status: 500 },
      ),
    };
  }
  return { db, res: null as null };
}

export async function GET() {
  const { db, res } = adminOr500();
  if (!db || res) return res!;

  const { layouts, error } = await fetchClinicalPrintLayouts(db);
  if (error) return NextResponse.json({ error }, { status: 400 });
  return NextResponse.json({ layouts });
}

export async function PATCH(req: Request) {
  const { db, res } = adminOr500();
  if (!db || res) return res!;

  const body = (await req.json().catch(() => null)) as {
    template_key?: string;
    physician_signature_layout?: unknown;
  } | null;

  const templateKey = parseClinicalPrintTemplateKey(String(body?.template_key ?? ""));
  if (!templateKey) {
    return NextResponse.json({ error: "template_key must be consultation or prescription." }, { status: 400 });
  }

  const layoutParsed = parsePhysicianSignatureLayoutFormInput(body?.physician_signature_layout ?? null);
  if (!layoutParsed.ok) {
    return NextResponse.json({ error: layoutParsed.error }, { status: 400 });
  }

  const { layout, error } = await upsertClinicalPrintPhysicianSignatureLayout(
    db,
    templateKey,
    layoutParsed.value,
  );
  if (error) return NextResponse.json({ error }, { status: 400 });
  return NextResponse.json({ layout });
}
