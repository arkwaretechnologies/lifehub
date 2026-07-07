import type { SupabaseClient } from "@supabase/supabase-js";
import { IMAGING_RESULTS_BUCKET } from "@/lib/imagingResultImageShared";

export const IMAGING_REQUEST_ITEM_IMAGES_TABLE = "imaging_request_item_images" as const;

export type ImagingRequestItemImageRow = {
  id: string;
  imaging_request_item_id: string;
  storage_path: string;
  content_type: string | null;
  original_filename: string | null;
  sort_order: number;
  uploaded_at: string;
};

export type ImagingItemImageView = {
  id: string;
  imageUrl: string;
  contentType: string | null;
  originalFilename: string | null;
  sortOrder: number;
};

/** Append ` (2)`, ` (3)`, … before extension when the base filename already exists for this item. */
export function dedupeImagingDisplayFilename(baseFilename: string, existingFilenames: string[]): string {
  const normalizedExisting = new Set(
    existingFilenames.map((name) => name.trim().toLowerCase()).filter(Boolean),
  );
  const trimmed = baseFilename.trim();
  if (!trimmed) return baseFilename;
  if (!normalizedExisting.has(trimmed.toLowerCase())) return trimmed;

  const dot = trimmed.lastIndexOf(".");
  const stem = dot > 0 ? trimmed.slice(0, dot) : trimmed;
  const ext = dot > 0 ? trimmed.slice(dot) : "";

  let n = 2;
  while (normalizedExisting.has(`${stem} (${n})${ext}`.toLowerCase())) {
    n += 1;
  }
  return `${stem} (${n})${ext}`;
}

export async function fetchImagingItemImagesForItem(
  admin: SupabaseClient,
  itemId: string,
): Promise<{ rows: ImagingRequestItemImageRow[]; error: string | null }> {
  const id = itemId.trim();
  if (!id) return { rows: [], error: null };

  const { data, error } = await admin
    .from(IMAGING_REQUEST_ITEM_IMAGES_TABLE)
    .select("id, imaging_request_item_id, storage_path, content_type, original_filename, sort_order, uploaded_at")
    .eq("imaging_request_item_id", id)
    .order("sort_order", { ascending: true })
    .order("uploaded_at", { ascending: true });

  if (error) return { rows: [], error: error.message };
  return { rows: (data ?? []) as ImagingRequestItemImageRow[], error: null };
}

export async function nextImagingItemImageSortOrder(
  admin: SupabaseClient,
  itemId: string,
): Promise<{ sortOrder: number; error: string | null }> {
  const { rows, error } = await fetchImagingItemImagesForItem(admin, itemId);
  if (error) return { sortOrder: 0, error };
  if (rows.length === 0) return { sortOrder: 0, error: null };
  const max = rows.reduce((acc, row) => Math.max(acc, row.sort_order), -1);
  return { sortOrder: max + 1, error: null };
}

export async function syncImagingItemLegacyImageFields(
  admin: SupabaseClient,
  itemId: string,
): Promise<{ error: string | null }> {
  const { rows, error } = await fetchImagingItemImagesForItem(admin, itemId);
  if (error) return { error };

  const now = new Date().toISOString();
  const first = rows[0] ?? null;

  const { error: dbErr } = await admin
    .from("imaging_request_items")
    .update({
      image_storage_path: first?.storage_path ?? null,
      image_content_type: first?.content_type ?? null,
      image_original_filename: first?.original_filename ?? null,
      image_uploaded_at: first?.uploaded_at ?? null,
      updated_at: now,
    })
    .eq("id", itemId);

  return { error: dbErr?.message ?? null };
}

export async function signImagingItemImages(
  admin: SupabaseClient,
  rows: ImagingRequestItemImageRow[],
  expiresInSeconds = 3600,
): Promise<{ images: ImagingItemImageView[]; error: string | null }> {
  const images: ImagingItemImageView[] = [];

  for (const row of rows) {
    const path = String(row.storage_path ?? "").trim();
    if (!path) continue;

    const { data: signed, error: signErr } = await admin.storage
      .from(IMAGING_RESULTS_BUCKET)
      .createSignedUrl(path, expiresInSeconds);

    if (signErr || !signed?.signedUrl) {
      return { images: [], error: signErr?.message ?? "Could not load image." };
    }

    images.push({
      id: row.id,
      imageUrl: signed.signedUrl,
      contentType: row.content_type ?? null,
      originalFilename: row.original_filename ?? null,
      sortOrder: row.sort_order,
    });
  }

  return { images, error: null };
}

export async function resolveUniqueImagingDisplayFilename(
  admin: SupabaseClient,
  itemId: string,
  baseDisplayFilename: string,
): Promise<{ displayFilename: string; error: string | null }> {
  const { rows, error } = await fetchImagingItemImagesForItem(admin, itemId);
  if (error) return { displayFilename: baseDisplayFilename, error };

  const existing = rows
    .map((row) => row.original_filename ?? "")
    .filter(Boolean);

  return {
    displayFilename: dedupeImagingDisplayFilename(baseDisplayFilename, existing),
    error: null,
  };
}
