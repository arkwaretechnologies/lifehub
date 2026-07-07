import { NextResponse } from "next/server";
import {
  fetchImagingItemImagesForItem,
  IMAGING_REQUEST_ITEM_IMAGES_TABLE,
  signImagingItemImages,
  syncImagingItemLegacyImageFields,
} from "@/lib/imagingItemImages";
import { IMAGING_RESULTS_BUCKET } from "@/lib/imagingResultImageShared";
import { queueAdminClient } from "@/lib/receptionQueueServer";

export async function GET(req: Request) {
  const admin = queueAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." }, { status: 500 });
  }

  const url = new URL(req.url);
  const itemId = url.searchParams.get("imagingRequestItemId")?.trim() ?? "";
  const imageId = url.searchParams.get("imageId")?.trim() ?? "";

  if (!itemId) {
    return NextResponse.json({ error: "imagingRequestItemId is required." }, { status: 400 });
  }

  const { rows, error } = await fetchImagingItemImagesForItem(admin, itemId);
  if (error) return NextResponse.json({ error }, { status: 500 });

  if (rows.length > 0) {
    const targetRows = imageId ? rows.filter((row) => row.id === imageId) : [rows[0]];

    if (targetRows.length === 0) {
      return NextResponse.json({ error: "Image not found for this study." }, { status: 404 });
    }

    const signed = await signImagingItemImages(admin, targetRows);
    if (signed.error || signed.images.length === 0) {
      return NextResponse.json({ error: signed.error ?? "Could not load image." }, { status: 500 });
    }

    const image = signed.images[0];
    return NextResponse.json({
      ok: true,
      imageUrl: image.imageUrl,
      contentType: image.contentType,
      originalFilename: image.originalFilename,
      imageId: image.id,
    });
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
    imageId: "legacy",
  });
}

export async function DELETE(req: Request) {
  const admin = queueAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." }, { status: 500 });
  }

  const url = new URL(req.url);
  const itemId = url.searchParams.get("imagingRequestItemId")?.trim() ?? "";
  const imageId = url.searchParams.get("imageId")?.trim() ?? "";

  if (!itemId) {
    return NextResponse.json({ error: "imagingRequestItemId is required." }, { status: 400 });
  }
  if (!imageId) {
    return NextResponse.json({ error: "imageId is required." }, { status: 400 });
  }

  const { data: item, error: itemErr } = await admin
    .from("imaging_request_items")
    .select("id, image_storage_path")
    .eq("id", itemId)
    .maybeSingle();

  if (itemErr) return NextResponse.json({ error: itemErr.message }, { status: 500 });
  if (!item) return NextResponse.json({ error: "Imaging request item not found." }, { status: 404 });

  let storagePath = "";

  if (imageId === "legacy") {
    storagePath = String((item as { image_storage_path?: string | null }).image_storage_path ?? "").trim();
    if (!storagePath) {
      return NextResponse.json({ error: "Image not found for this study." }, { status: 404 });
    }
    const { rows } = await fetchImagingItemImagesForItem(admin, itemId);
    const match = rows.find((row) => row.storage_path === storagePath);
    if (match) {
      const { error: delErr } = await admin.from(IMAGING_REQUEST_ITEM_IMAGES_TABLE).delete().eq("id", match.id);
      if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });
    }
  } else {
    const { data: imageRow, error: imageErr } = await admin
      .from(IMAGING_REQUEST_ITEM_IMAGES_TABLE)
      .select("id, storage_path")
      .eq("id", imageId)
      .eq("imaging_request_item_id", itemId)
      .maybeSingle();

    if (imageErr) return NextResponse.json({ error: imageErr.message }, { status: 500 });
    if (!imageRow) {
      return NextResponse.json({ error: "Image not found for this study." }, { status: 404 });
    }

    storagePath = String((imageRow as { storage_path?: string }).storage_path ?? "").trim();
    const { error: delErr } = await admin.from(IMAGING_REQUEST_ITEM_IMAGES_TABLE).delete().eq("id", imageId);
    if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });
  }

  if (storagePath) {
    await admin.storage.from(IMAGING_RESULTS_BUCKET).remove([storagePath]);
  }

  const { error: syncErr } = await syncImagingItemLegacyImageFields(admin, itemId);
  if (syncErr) return NextResponse.json({ error: syncErr }, { status: 500 });

  const { rows: remaining } = await fetchImagingItemImagesForItem(admin, itemId);

  return NextResponse.json({
    ok: true,
    imageCount: remaining.length,
    hasImage: remaining.length > 0,
  });
}
