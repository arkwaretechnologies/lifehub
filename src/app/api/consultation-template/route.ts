import { readFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";

const TEMPLATE_NAME = "Consultation Template.pdf";

/** Serves `templates/Consultation Template.pdf` for client-side filling/printing. */
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
    return new NextResponse("Consultation template not found.", { status: 404 });
  }
}
