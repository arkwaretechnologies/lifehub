import { NextResponse } from "next/server";
import { isImagingItemResultReceived } from "@/lib/imagingQueueSync";
import {
  fetchImagingItemImagesForItem,
  IMAGING_REQUEST_ITEM_IMAGES_TABLE,
  nextImagingItemImageSortOrder,
  resolveUniqueImagingDisplayFilename,
  syncImagingItemLegacyImageFields,
} from "@/lib/imagingItemImages";
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

async function uploadOneFile(
  admin: NonNullable<ReturnType<typeof queueAdminClient>>,
  itemId: string,
  imagingRequestId: string,
  file: File,
): Promise<
  | {
      ok: true;
      imageId: string;
      imageStoragePath: string;
      imageUrl?: string;
      contentType: string;
      originalFilename: string;
      optimized: boolean;
    }
  | { ok: false; error: string; status: number }
> {
  const validationError = validateImagingUploadFile({
    name: file.name,
    size: file.size,
    type: file.type,
  });
  if (validationError) {
    return { ok: false, error: validationError, status: 400 };
  }

  const arrayBuffer = await file.arrayBuffer();
  const inputBuffer = Buffer.from(arrayBuffer);

  let optimized;
  try {
    optimized = await optimizeImagingUploadBuffer(inputBuffer, file.name, file.type);
  } catch (err) {
    if (err instanceof DicomConversionError) {
      return { ok: false, error: err.message, status: 400 };
    }
    return {
      ok: false,
      error: "Could not process image. Check the file format or try exporting as JPEG/PNG from your device.",
      status: 400,
    };
  }

  const filenameResolved = await resolveImagingResultDisplayFilename(admin, itemId, optimized.ext);
  if ("error" in filenameResolved) {
    return { ok: false, error: filenameResolved.error, status: 500 };
  }

  const uniqueResolved = await resolveUniqueImagingDisplayFilename(
    admin,
    itemId,
    filenameResolved.displayFilename,
  );
  if (uniqueResolved.error) {
    return { ok: false, error: uniqueResolved.error, status: 500 };
  }

  const displayFilename = uniqueResolved.displayFilename;
  const storagePath = buildImagingResultStoragePath(imagingRequestId, itemId, displayFilename);

  const { error: upErr } = await admin.storage
    .from(IMAGING_RESULTS_BUCKET)
    .upload(storagePath, optimized.buffer, {
      contentType: optimized.contentType,
      upsert: false,
    });

  if (upErr) {
    return { ok: false, error: upErr.message, status: 500 };
  }

  const now = new Date().toISOString();
  const { sortOrder, error: sortErr } = await nextImagingItemImageSortOrder(admin, itemId);
  if (sortErr) {
    await admin.storage.from(IMAGING_RESULTS_BUCKET).remove([storagePath]);
    return { ok: false, error: sortErr, status: 500 };
  }

  const { data: inserted, error: insertErr } = await admin
    .from(IMAGING_REQUEST_ITEM_IMAGES_TABLE)
    .insert({
      imaging_request_item_id: itemId,
      storage_path: storagePath,
      content_type: optimized.contentType,
      original_filename: displayFilename,
      sort_order: sortOrder,
      uploaded_at: now,
    })
    .select("id")
    .single();

  if (insertErr || !inserted) {
    await admin.storage.from(IMAGING_RESULTS_BUCKET).remove([storagePath]);
    return { ok: false, error: insertErr?.message ?? "Could not save image record.", status: 500 };
  }

  const { error: syncErr } = await syncImagingItemLegacyImageFields(admin, itemId);
  if (syncErr) {
    return { ok: false, error: syncErr, status: 500 };
  }

  const imageId = String((inserted as { id?: string }).id ?? "").trim();
  const { data: signed, error: signErr } = await admin.storage
    .from(IMAGING_RESULTS_BUCKET)
    .createSignedUrl(storagePath, 3600);

  return {
    ok: true,
    imageId,
    imageStoragePath: storagePath,
    imageUrl: signErr ? undefined : signed?.signedUrl,
    contentType: optimized.contentType,
    originalFilename: file.name.trim() || displayFilename,
    optimized: optimized.optimized,
  };
}

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
  const files = form
    .getAll("file")
    .filter((entry): entry is File => entry instanceof File);

  if (!itemId) {
    return NextResponse.json({ error: "imagingRequestItemId is required." }, { status: 400 });
  }
  if (files.length === 0) {
    return NextResponse.json({ error: "file is required." }, { status: 400 });
  }

  const { data: item, error: itemErr } = await admin
    .from("imaging_request_items")
    .select("id, imaging_request_id, status")
    .eq("id", itemId)
    .maybeSingle();

  if (itemErr) return NextResponse.json({ error: itemErr.message }, { status: 500 });
  if (!item) return NextResponse.json({ error: "Imaging request item not found." }, { status: 404 });

  const row = item as {
    id: string;
    imaging_request_id: string;
    status?: string | null;
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

  let lastResult:
    | {
        imageId: string;
        imageStoragePath: string;
        imageUrl?: string;
        contentType: string;
        originalFilename: string;
        optimized: boolean;
      }
    | null = null;

  for (const file of files) {
    const result = await uploadOneFile(admin, itemId, imagingRequestId, file);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    lastResult = result;
  }

  const { rows: imageRows, error: countErr } = await fetchImagingItemImagesForItem(admin, itemId);
  if (countErr || !lastResult) {
    return NextResponse.json({ error: countErr ?? "Upload failed." }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    imageId: lastResult.imageId,
    imageStoragePath: lastResult.imageStoragePath,
    imageUrl: lastResult.imageUrl,
    contentType: lastResult.contentType,
    originalFilename: lastResult.originalFilename,
    optimized: lastResult.optimized,
    imageCount: imageRows.length,
  });
}
