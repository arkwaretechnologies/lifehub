import { NextResponse } from "next/server";
import { IMAGING_RESULTS_BUCKET } from "@/lib/imagingResultImageShared";
import { queueAdminClient } from "@/lib/receptionQueueServer";

export async function GET(req: Request) {
  const admin = queueAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." }, { status: 500 });
  }

  const itemId = new URL(req.url).searchParams.get("imagingRequestItemId")?.trim() ?? "";
  if (!itemId) {
    return NextResponse.json({ error: "imagingRequestItemId is required." }, { status: 400 });
  }

  const { data: item, error: itemErr } = await admin
    .from("imaging_request_items")
    .select("image_storage_path, image_content_type, image_original_filename")
    .eq("id", itemId)
    .maybeSingle();

  if (itemErr) return NextResponse.json({ error: itemErr.message }, { status: 500 });
  if (!item) return NextResponse.json({ error: "Imaging request item not found." }, { status: 404 });

  const path = String((item as { image_storage_path?: string | null }).image_storage_path ?? "").trim();
  if (!path) {
    return NextResponse.json({ error: "No image uploaded for this study." }, { status: 404 });
  }

  const { data: signed, error: signErr } = await admin.storage
    .from(IMAGING_RESULTS_BUCKET)
    .createSignedUrl(path, 3600);

  if (signErr || !signed?.signedUrl) {
    return NextResponse.json({ error: signErr?.message ?? "Could not load image." }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    imageUrl: signed.signedUrl,
    contentType: (item as { image_content_type?: string | null }).image_content_type ?? null,
    originalFilename: (item as { image_original_filename?: string | null }).image_original_filename ?? null,
  });
}
