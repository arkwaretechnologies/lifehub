import { readFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";

const TEMPLATE_NAME = "RX Template.pdf";

/** Serves `templates/RX Template.pdf` for client-side filling (Consultation → Medication → Print RX). */
export async function GET() {
  try {
    const filePath = path.join(process.cwd(), "templates", TEMPLATE_NAME);
    const buf = await readFile(filePath);
    return new NextResponse(buf, {
      headers: {
        "Content-Type": "application/pdf",
        // Always serve the latest template from `/templates` (avoid stale browser/service-worker caches).
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch {
    return new NextResponse("Prescription template not found.", { status: 404 });
  }
}
