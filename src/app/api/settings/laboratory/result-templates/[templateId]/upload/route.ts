import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import {
  LAB_RESULT_TEMPLATE_PDF_MAX_BYTES,
  LAB_RESULT_TEMPLATES_TABLE,
  labResultTemplatePdfAbsolutePath,
} from "@/lib/labResultTemplates";
import { LAB_RESULTS_TEMPLATES_RELATIVE_DIR } from "@/lib/labTests";
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

export async function POST(
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

  const { data: row, error: loadErr } = await db
    .from(LAB_RESULT_TEMPLATES_TABLE)
    .select("id, file_name")
    .eq("id", templateId)
    .maybeSingle();
  if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 400 });
  if (!row) return NextResponse.json({ error: "Template not found." }, { status: 404 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid upload form data." }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required." }, { status: 400 });
  }

  const mime = (file.type ?? "").toLowerCase();
  if (mime !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    return NextResponse.json({ error: "Only PDF files are allowed." }, { status: 400 });
  }
  if (file.size <= 0 || file.size > LAB_RESULT_TEMPLATE_PDF_MAX_BYTES) {
    return NextResponse.json(
      { error: `PDF must be between 1 byte and ${LAB_RESULT_TEMPLATE_PDF_MAX_BYTES} bytes.` },
      { status: 400 },
    );
  }

  const fileName = String((row as { file_name?: string }).file_name ?? "").trim();
  if (!fileName) {
    return NextResponse.json({ error: "Template has no file_name configured." }, { status: 400 });
  }

  const dir = path.join(process.cwd(), LAB_RESULTS_TEMPLATES_RELATIVE_DIR);
  await mkdir(dir, { recursive: true });
  const target = labResultTemplatePdfAbsolutePath(fileName);
  const buf = Buffer.from(await file.arrayBuffer());
  await writeFile(target, buf);

  await db
    .from(LAB_RESULT_TEMPLATES_TABLE)
    .update({ updated_at: new Date().toISOString() })
    .eq("id", templateId);

  return NextResponse.json({ ok: true, file_name: path.basename(fileName) });
}
