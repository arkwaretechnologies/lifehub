import { readFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import {
  isAllowedLabResultsTemplateCode,
  LAB_RESULTS_TEMPLATES_RELATIVE_DIR,
  labResultsTemplatePdfFileName,
} from "@/lib/labTests";

/** Serves blank lab result PDFs from `templates/Lab Results/` for client-side filling (allowlisted `code` only). */
export async function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get("code")?.trim() ?? "";
  const code = raw.toUpperCase();
  if (!code || !isAllowedLabResultsTemplateCode(code)) {
    return NextResponse.json({ error: "Invalid or unsupported template code." }, { status: 400 });
  }

  const fileName = labResultsTemplatePdfFileName(code);
  if (!fileName) {
    return NextResponse.json({ error: "Invalid template code." }, { status: 400 });
  }

  const filePath = path.join(process.cwd(), LAB_RESULTS_TEMPLATES_RELATIVE_DIR, fileName);
  try {
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
