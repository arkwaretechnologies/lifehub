import { access, readFile } from "fs/promises";
import { NextResponse } from "next/server";
import { fetchLabResultTemplateByCode, labResultTemplatePdfAbsolutePath } from "@/lib/labResultTemplates";
import { supabaseAdminClient } from "@/lib/supabaseAdminClient";

export const runtime = "nodejs";

/** Serves blank lab result PDFs from `templates/Lab Results/` for client-side filling (DB-registered code only). */
export async function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get("code")?.trim() ?? "";
  const code = raw.toUpperCase();
  if (!code) {
    return NextResponse.json({ error: "code is required." }, { status: 400 });
  }

  const admin = supabaseAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." }, { status: 500 });
  }

  const { template, error } = await fetchLabResultTemplateByCode(admin, code);
  if (error) return NextResponse.json({ error }, { status: 500 });
  if (!template) {
    return NextResponse.json({ error: "Invalid or unsupported template code." }, { status: 400 });
  }

  const filePath = labResultTemplatePdfAbsolutePath(template.file_name);
  try {
    await access(filePath);
    const buf = await readFile(filePath);
    return new NextResponse(buf, {
      headers: {
        "Content-Type": "application/pdf",
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch {
    return new NextResponse("Lab result template not found.", { status: 404 });
  }
}
