import { NextResponse } from "next/server";
import { isImagingItemResultReceived } from "@/lib/imagingQueueSync";
import {
  buildImagingResultStoragePath,
  IMAGING_RESULTS_BUCKET,
  validateImagingUploadFile,
} from "@/lib/imagingResultImageShared";
import {
  DicomConversionError,
  optimizeImagingUploadBuffer,
  resolveImagingResultDisplayFilename,
} from "@/lib/imagingResultImageServer";
import { queueAdminClient } from "@/lib/receptionQueueServer";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const admin = queueAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." }, { status: 500 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid upload form data." }, { status: 400 });
  }

  const itemId = String(form.get("imagingRequestItemId") ?? "").trim();
  const file = form.get("file");
  if (!itemId) {
    return NextResponse.json({ error: "imagingRequestItemId is required." }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required." }, { status: 400 });
  }

  const validationError = validateImagingUploadFile({
    name: file.name,
    size: file.size,
    type: file.type,
  });
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const { data: item, error: itemErr } = await admin
    .from("imaging_request_items")
    .select("id, imaging_request_id, status, image_storage_path")
    .eq("id", itemId)
    .maybeSingle();

  if (itemErr) return NextResponse.json({ error: itemErr.message }, { status: 500 });
  if (!item) return NextResponse.json({ error: "Imaging request item not found." }, { status: 404 });

  const row = item as {
    id: string;
    imaging_request_id: string;
    status?: string | null;
    image_storage_path?: string | null;
  };

  if (!isImagingItemResultReceived(row.status)) {
    return NextResponse.json(
      { error: "Mark the study as Received before uploading the result image." },
      { status: 409 },
    );
  }

  const imagingRequestId = String(row.imaging_request_id ?? "").trim();
  if (!imagingRequestId) {
    return NextResponse.json({ error: "Imaging request id missing on item." }, { status: 500 });
  }

  const arrayBuffer = await file.arrayBuffer();
  const inputBuffer = Buffer.from(arrayBuffer);

  let optimized;
  try {
    optimized = await optimizeImagingUploadBuffer(inputBuffer, file.name, file.type);
  } catch (err) {
    if (err instanceof DicomConversionError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return NextResponse.json(
      { error: "Could not process image. Check the file format or try exporting as JPEG/PNG from your device." },
      { status: 400 },
    );
  }

  const filenameResolved = await resolveImagingResultDisplayFilename(admin, itemId, optimized.ext);
  if ("error" in filenameResolved) {
    return NextResponse.json({ error: filenameResolved.error }, { status: 500 });
  }
  const displayFilename = filenameResolved.displayFilename;
  const storagePath = buildImagingResultStoragePath(imagingRequestId, itemId, displayFilename);
  const previousPath = (row.image_storage_path ?? "").trim();

  const { error: upErr } = await admin.storage
    .from(IMAGING_RESULTS_BUCKET)
    .upload(storagePath, optimized.buffer, {
      contentType: optimized.contentType,
      upsert: true,
    });

  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  const now = new Date().toISOString();
  const { error: dbErr } = await admin
    .from("imaging_request_items")
    .update({
      image_storage_path: storagePath,
      image_content_type: optimized.contentType,
      image_original_filename: displayFilename,
      image_uploaded_at: now,
      updated_at: now,
    })
    .eq("id", itemId);

  if (dbErr) {
    await admin.storage.from(IMAGING_RESULTS_BUCKET).remove([storagePath]);
    return NextResponse.json({ error: dbErr.message }, { status: 500 });
  }

  if (previousPath && previousPath !== storagePath) {
    await admin.storage.from(IMAGING_RESULTS_BUCKET).remove([previousPath]);
  }

  const { data: signed, error: signErr } = await admin.storage
    .from(IMAGING_RESULTS_BUCKET)
    .createSignedUrl(storagePath, 3600);

  if (signErr) {
    return NextResponse.json({
      ok: true,
      imageStoragePath: storagePath,
      contentType: optimized.contentType,
      originalFilename: displayFilename,
      optimized: optimized.optimized,
    });
  }

  return NextResponse.json({
    ok: true,
    imageStoragePath: storagePath,
    imageUrl: signed.signedUrl,
    contentType: optimized.contentType,
    originalFilename: file.name.trim(),
    optimized: optimized.optimized,
  });
}
