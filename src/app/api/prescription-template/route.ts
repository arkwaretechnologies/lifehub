import { NextResponse } from "next/server";
import { getBearerSessionUserId } from "@/lib/requireSession";
import {
  fetchUserRxTemplateFilename,
  readRxTemplateBytes,
  resolveRxTemplateBasenameForUser,
} from "@/lib/rxTemplates";
import { supabaseAdminClient } from "@/lib/supabaseAdminClient";

export const runtime = "nodejs";

/**
 * Serves the current user's selected RX PDF from `templates/RX/`
 * (fallback: `RX Template.pdf`, then first PDF in the folder).
 */
export async function GET(req: Request) {
  try {
    const sessionUserId = await getBearerSessionUserId(req);
    let preferred: string | null = null;

    if (sessionUserId != null) {
      const db = supabaseAdminClient();
      if (db) {
        const { filename } = await fetchUserRxTemplateFilename(db, sessionUserId);
        preferred = filename;
      }
    }

    const basename = await resolveRxTemplateBasenameForUser(preferred);
    if (!basename) {
      return new NextResponse("Prescription template not found.", { status: 404 });
    }

    const buf = await readRxTemplateBytes(basename);
    if (!buf) {
      return new NextResponse("Prescription template not found.", { status: 404 });
    }

    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/pdf",
        "Cache-Control": "no-store, max-age=0",
        "X-RX-Template": basename,
      },
    });
  } catch {
    return new NextResponse("Prescription template not found.", { status: 404 });
  }
}
