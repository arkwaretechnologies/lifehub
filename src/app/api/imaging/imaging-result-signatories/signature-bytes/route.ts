import { NextRequest, NextResponse } from "next/server";
import type { ImagingSignatureRole } from "@/lib/imagingResultSignatures";
import { fetchImagingSignatorySignaturePath } from "@/lib/imagingResultSignatories";
import { getBearerSessionUserId } from "@/lib/requireSession";
import { parseImagingSignatoryRole } from "@/lib/signatureImageShared";
import { downloadSignatureBytes } from "@/lib/signatureImageServer";
import { supabaseAdminClient } from "@/lib/supabaseAdminClient";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  if ((await getBearerSessionUserId(req)) == null) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const db = supabaseAdminClient();
  if (!db) {
    return NextResponse.json({ error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." }, { status: 500 });
  }

  const roleRaw = req.nextUrl.searchParams.get("role") ?? "";
  const role = parseImagingSignatoryRole(roleRaw);
  if (!role) {
    return NextResponse.json({ error: "role must be radtech, radtech_ultrasound, radiologist, or cardiologist." }, { status: 400 });
  }

  const { path, error: pathErr } = await fetchImagingSignatorySignaturePath(db, role as ImagingSignatureRole);
  if (pathErr) return NextResponse.json({ error: pathErr }, { status: 500 });
  if (!path) return new NextResponse(null, { status: 404 });

  const { bytes, contentType, error } = await downloadSignatureBytes(db, path);
  if (error) return NextResponse.json({ error }, { status: 500 });
  if (!bytes?.length) return new NextResponse(null, { status: 404 });

  return new NextResponse(Buffer.from(bytes), {
    status: 200,
    headers: {
      "Content-Type": contentType ?? "image/png",
      "Cache-Control": "private, no-store",
    },
  });
}
