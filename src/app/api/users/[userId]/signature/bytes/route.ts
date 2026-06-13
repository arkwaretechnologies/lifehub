import { NextResponse } from "next/server";
import { getBearerSessionUserId } from "@/lib/requireSession";
import { downloadSignatureBytes } from "@/lib/signatureImageServer";
import { supabaseAdminClient } from "@/lib/supabaseAdminClient";

export const runtime = "nodejs";

export async function GET(
  req: Request,
  context: { params: Promise<{ userId: string }> },
) {
  if ((await getBearerSessionUserId(req)) == null) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const db = supabaseAdminClient();
  if (!db) {
    return NextResponse.json({ error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." }, { status: 500 });
  }

  const { userId: userIdRaw } = await context.params;
  const userId = Number.parseInt(userIdRaw, 10);
  if (!Number.isFinite(userId)) {
    return NextResponse.json({ error: "Invalid user id." }, { status: 400 });
  }

  const { data, error } = await db
    .from("users")
    .select("signature_storage_path")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const path = String((data as { signature_storage_path?: string | null } | null)?.signature_storage_path ?? "").trim();
  if (!path) return new NextResponse(null, { status: 404 });

  const { bytes, contentType, error: dlErr } = await downloadSignatureBytes(db, path);
  if (dlErr) return NextResponse.json({ error: dlErr }, { status: 500 });
  if (!bytes?.length) return new NextResponse(null, { status: 404 });

  return new NextResponse(Buffer.from(bytes), {
    status: 200,
    headers: {
      "Content-Type": contentType ?? "image/png",
      "Cache-Control": "private, no-store",
    },
  });
}
