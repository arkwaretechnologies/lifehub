import { readFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";

const TEMPLATE_NAME = "LIFEHUB-MEDICAL-Certificate.pdf";

/** Serves `templates/LIFEHUB-MEDICAL-Certificate.pdf` for client-side filling. */
export async function GET() {
  try {
    const filePath = path.join(process.cwd(), "templates", TEMPLATE_NAME);
    const buf = await readFile(filePath);
    return new NextResponse(buf, {
      headers: {
        "Content-Type": "application/pdf",
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch {
    return new NextResponse("Medical certificate template not found.", { status: 404 });
  }
}
