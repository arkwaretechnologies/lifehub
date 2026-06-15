import { NextResponse } from "next/server";
import { IMAGING_CATALOG_TABLE } from "@/lib/imagingCatalog";
import {
  IMAGING_RESULT_TEMPLATES_TABLE,
  normalizeImagingResultTemplateCode,
  parseTemplateResultLayoutInput,
  parseTemplateSignatureLayoutInput,
  type ImagingResultTemplateRow,
} from "@/lib/imagingResultTemplates";
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

function parseUuid(raw: string): string | null {
  const s = String(raw ?? "").trim();
  return /^[0-9a-f-]{36}$/i.test(s) ? s : null;
}

export async function PATCH(
  req: Request,
  context: { params: Promise<{ templateId: string }> },
) {
  const { db, res } = adminOr500();
  if (!db || res) return res!;

  const { templateId: param } = await context.params;
  const templateId = parseUuid(param);
  if (!templateId) {
    return NextResponse.json({ error: "Invalid template id." }, { status: 400 });
  }

  const body = (await req.json().catch(() => null)) as {
    code?: string;
    name?: string;
    file_name?: string | null;
    sort_order?: number | null;
    is_active?: boolean;
    result_layout?: unknown;
    signature_layout?: unknown;
  } | null;

  if (!body || Object.keys(body).length === 0) {
    return NextResponse.json({ error: "Provide at least one field to update." }, { status: 400 });
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (body.code !== undefined) {
    const c = normalizeImagingResultTemplateCode(body.code);
    if (!c) return NextResponse.json({ error: "code cannot be empty." }, { status: 400 });
    patch.code = c;
  }
  if (body.name !== undefined) {
    const n = String(body.name).trim();
    if (!n) return NextResponse.json({ error: "name cannot be empty." }, { status: 400 });
    patch.name = n;
  }
  if (body.file_name !== undefined) {
    const fn = String(body.file_name ?? "").trim();
    if (!fn) return NextResponse.json({ error: "file_name cannot be empty." }, { status: 400 });
    patch.file_name = fn;
  }
  if (body.sort_order !== undefined) {
    const s = body.sort_order == null ? null : Number(body.sort_order);
    patch.sort_order = s == null || !Number.isFinite(s) ? null : Math.trunc(s);
  }
  if (body.is_active !== undefined) patch.is_active = body.is_active !== false;
  if (body.result_layout !== undefined) {
    const layoutParsed = parseTemplateResultLayoutInput(body.result_layout);
    if (!layoutParsed.ok) {
      return NextResponse.json({ error: layoutParsed.error }, { status: 400 });
    }
    patch.result_layout = layoutParsed.value;
  }
  if (body.signature_layout !== undefined) {
    const signatureParsed = parseTemplateSignatureLayoutInput(body.signature_layout);
    if (!signatureParsed.ok) {
      return NextResponse.json({ error: signatureParsed.error }, { status: 400 });
    }
    patch.signature_layout = signatureParsed.value;
  }

  const { data, error } = await db
    .from(IMAGING_RESULT_TEMPLATES_TABLE)
    .update(patch)
    .eq("id", templateId)
    .select("id, code, name, file_name, sort_order, is_active, result_layout, signature_layout, created_at, updated_at")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!data) return NextResponse.json({ error: "Template not found." }, { status: 404 });

  return NextResponse.json({ template: data as ImagingResultTemplateRow });
}

export async function DELETE(
  _req: Request,
  context: { params: Promise<{ templateId: string }> },
) {
  const { db, res } = adminOr500();
  if (!db || res) return res!;

  const { templateId: param } = await context.params;
  const templateId = parseUuid(param);
  if (!templateId) {
    return NextResponse.json({ error: "Invalid template id." }, { status: 400 });
  }

  const { data: row, error: loadErr } = await db
    .from(IMAGING_RESULT_TEMPLATES_TABLE)
    .select("code")
    .eq("id", templateId)
    .maybeSingle();
  if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 400 });
  if (!row) return NextResponse.json({ error: "Template not found." }, { status: 404 });

  const code = String((row as { code?: string }).code ?? "").trim().toUpperCase();
  const { data: catalogRows, error: cErr } = await db
    .from(IMAGING_CATALOG_TABLE)
    .select("id, results_template_code")
    .not("results_template_code", "is", null);
  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 400 });

  const inUse = (catalogRows ?? []).some(
    (r) => String((r as { results_template_code?: string }).results_template_code ?? "").trim().toUpperCase() === code,
  );
  if (inUse) {
    return NextResponse.json(
      {
        error:
          "Cannot delete a template assigned to imaging catalog studies. Clear or change those studies first.",
      },
      { status: 409 },
    );
  }

  const { error } = await db.from(IMAGING_RESULT_TEMPLATES_TABLE).delete().eq("id", templateId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
