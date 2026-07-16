import { access } from "fs/promises";
import { NextResponse } from "next/server";
import { labResultTemplatePdfAbsolutePath } from "@/lib/labResultTemplates";
import {
  defaultLabResultTemplateFileName,
  fetchLabResultTemplates,
  LAB_RESULT_TEMPLATES_TABLE,
  normalizeLabResultTemplateCode,
  parseTemplateSignatureLayoutInput,
  parseResultDohLicensePrintInput,
  type LabResultTemplateRow,
} from "@/lib/labResultTemplates";
import { supabaseAdminClient } from "@/lib/supabaseAdminClient";

export const runtime = "nodejs";

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

  const { templates, error } = await fetchLabResultTemplates(db);
  if (error) return NextResponse.json({ error }, { status: 400 });

  const withFile = await Promise.all(
    templates.map(async (t) => {
      let has_file = false;
      try {
        await access(labResultTemplatePdfAbsolutePath(t.file_name));
        has_file = true;
      } catch {
        has_file = false;
      }
      return { ...t, has_file };
    }),
  );
  return NextResponse.json({ templates: withFile });
}

export async function POST(req: Request) {
  const { db, res } = adminOr500();
  if (!db || res) return res!;

  const body = (await req.json().catch(() => null)) as {
    code?: string;
    name?: string;
    file_name?: string | null;
    sort_order?: number | null;
    is_active?: boolean;
    signature_layout?: unknown;
    doh_license_print?: unknown;
  } | null;

  const code = normalizeLabResultTemplateCode(body?.code);
  const name = String(body?.name ?? "").trim();
  if (!code || !name) {
    return NextResponse.json({ error: "code and name are required." }, { status: 400 });
  }

  const layoutParsed = parseTemplateSignatureLayoutInput(body?.signature_layout ?? null);
  if (!layoutParsed.ok) {
    return NextResponse.json({ error: layoutParsed.error }, { status: 400 });
  }

  const dohParsed = parseResultDohLicensePrintInput(body?.doh_license_print ?? null);
  if (!dohParsed.ok) {
    return NextResponse.json({ error: dohParsed.error }, { status: 400 });
  }

  const file_name =
    String(body?.file_name ?? "").trim() || defaultLabResultTemplateFileName(code);
  const sort_order =
    body?.sort_order == null || body?.sort_order === ("" as unknown)
      ? null
      : Number(body?.sort_order);
  const is_active = body?.is_active !== false;

  const { data, error } = await db
    .from(LAB_RESULT_TEMPLATES_TABLE)
    .insert({
      code,
      name,
      file_name,
      sort_order: sort_order != null && Number.isFinite(sort_order) ? Math.trunc(sort_order) : null,
      is_active,
      signature_layout: layoutParsed.value,
      doh_license_print: dohParsed.value,
      updated_at: new Date().toISOString(),
    })
    .select("id, code, name, file_name, sort_order, is_active, signature_layout, doh_license_print, created_at, updated_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ template: data as LabResultTemplateRow });
}
