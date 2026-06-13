import type { SupabaseClient } from "@supabase/supabase-js";
import sharp from "sharp";
import {
  SIGNATURES_BUCKET,
  contentTypeForSignatureExt,
  extensionFromSignatureFilename,
} from "@/lib/signatureImageShared";

const SIGNED_URL_TTL_SEC = 3600;

export async function deleteSignatureObject(
  db: SupabaseClient,
  storagePath: string | null | undefined,
): Promise<void> {
  const path = String(storagePath ?? "").trim();
  if (!path) return;
  await db.storage.from(SIGNATURES_BUCKET).remove([path]);
}

export async function uploadSignatureBuffer(
  db: SupabaseClient,
  storagePath: string,
  buffer: Buffer,
  contentType: string,
): Promise<{ error: string | null }> {
  const { error } = await db.storage.from(SIGNATURES_BUCKET).upload(storagePath, buffer, {
    upsert: true,
    contentType,
    cacheControl: "3600",
  });
  if (error) return { error: error.message };
  return { error: null };
}

/** Normalize signature to PNG (preserves alpha when present). */
export async function optimizeSignatureBuffer(
  input: Buffer,
  originalFilename: string,
): Promise<{ buffer: Buffer; contentType: string; ext: string }> {
  const ext = extensionFromSignatureFilename(originalFilename);
  try {
    const png = await sharp(input).png({ compressionLevel: 9 }).toBuffer();
    return { buffer: png, contentType: "image/png", ext: ".png" };
  } catch {
    return {
      buffer: input,
      contentType: contentTypeForSignatureExt(ext),
      ext,
    };
  }
}

export async function createSignatureSignedUrl(
  db: SupabaseClient,
  storagePath: string | null | undefined,
): Promise<{ url: string | null; error: string | null }> {
  const path = String(storagePath ?? "").trim();
  if (!path) return { url: null, error: null };
  const { data, error } = await db.storage.from(SIGNATURES_BUCKET).createSignedUrl(path, SIGNED_URL_TTL_SEC);
  if (error) return { url: null, error: error.message };
  return { url: data?.signedUrl ?? null, error: null };
}

export async function downloadSignatureBytes(
  db: SupabaseClient,
  storagePath: string | null | undefined,
): Promise<{ bytes: Uint8Array | null; contentType: string | null; error: string | null }> {
  const path = String(storagePath ?? "").trim();
  if (!path) return { bytes: null, contentType: null, error: null };
  const { data, error } = await db.storage.from(SIGNATURES_BUCKET).download(path);
  if (error) return { bytes: null, contentType: null, error: error.message };
  if (!data) return { bytes: null, contentType: null, error: "Empty signature file." };
  const buf = new Uint8Array(await data.arrayBuffer());
  return { bytes: buf, contentType: data.type || null, error: null };
}
