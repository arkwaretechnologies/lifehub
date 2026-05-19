import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import sharp from "sharp";
import {
  buildImagingResultDisplayFilename,
  extensionFromFilename,
  isDicomUpload,
} from "@/lib/imagingResultImageShared";

const EXT_TO_MIME: Record<string, string> = {
  ".dcm": "application/dicom",
  ".dicom": "application/dicom",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".tif": "image/tiff",
  ".tiff": "image/tiff",
  ".bmp": "image/bmp",
  ".webp": "image/webp",
};

const MAX_EDGE_PX = 4096;
const JPEG_QUALITY = 90;

export type OptimizedImagingImage = {
  buffer: Buffer;
  contentType: string;
  ext: string;
  optimized: boolean;
};

/** Resize large rasters and re-encode with high quality; DICOM stored unchanged. */
export async function optimizeImagingUploadBuffer(
  input: Buffer,
  originalName: string,
  mimeHint: string,
): Promise<OptimizedImagingImage> {
  const ext = extensionFromFilename(originalName) || ".jpg";
  const mime = (mimeHint || EXT_TO_MIME[ext] || "application/octet-stream").toLowerCase();

  if (isDicomUpload(ext, mime)) {
    return {
      buffer: input,
      contentType: "application/dicom",
      ext: ext === ".dicom" ? ".dicom" : ".dcm",
      optimized: false,
    };
  }

  let pipeline = sharp(input, { failOn: "none" }).rotate();
  const meta = await pipeline.metadata();
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;

  if (w > MAX_EDGE_PX || h > MAX_EDGE_PX) {
    pipeline = pipeline.resize(MAX_EDGE_PX, MAX_EDGE_PX, {
      fit: "inside",
      withoutEnlargement: true,
    });
  }

  if (meta.hasAlpha || ext === ".png") {
    const buffer = await pipeline.png({ compressionLevel: 8 }).toBuffer();
    return { buffer, contentType: "image/png", ext: ".png", optimized: true };
  }

  const buffer = await pipeline
    .jpeg({
      quality: JPEG_QUALITY,
      mozjpeg: true,
      chromaSubsampling: "4:4:4",
    })
    .toBuffer();

  return { buffer, contentType: "image/jpeg", ext: ".jpg", optimized: true };
}

export async function resolveImagingResultDisplayFilename(
  admin: SupabaseClient,
  itemId: string,
  ext: string,
): Promise<{ displayFilename: string; dateYmd: string } | { error: string }> {
  const { data: item, error: itemErr } = await admin
    .from("imaging_request_items")
    .select("imaging_request_id, study_name")
    .eq("id", itemId)
    .maybeSingle();

  if (itemErr) return { error: itemErr.message };
  if (!item) return { error: "Imaging request item not found." };

  const row = item as { imaging_request_id?: string; study_name?: string | null };
  const imagingRequestId = String(row.imaging_request_id ?? "").trim();
  if (!imagingRequestId) return { error: "Imaging request id missing on item." };

  const { data: req, error: reqErr } = await admin
    .from("imaging_requests")
    .select("patient_id, encounter_id, request_date")
    .eq("id", imagingRequestId)
    .maybeSingle();

  if (reqErr) return { error: reqErr.message };
  if (!req) return { error: "Imaging request not found." };

  const reqRow = req as {
    patient_id?: number | null;
    encounter_id?: string | null;
    request_date?: string | null;
  };

  const dateYmd =
    String(reqRow.request_date ?? "").trim().slice(0, 10) ||
    new Date().toISOString().slice(0, 10);

  let patientName = "Patient";
  let patientId = reqRow.patient_id;

  if ((patientId == null || !Number.isFinite(patientId)) && reqRow.encounter_id) {
    const encId = String(reqRow.encounter_id).trim();
    if (encId) {
      const { data: enc } = await admin
        .from("encounters")
        .select("patient_id")
        .eq("trans_id", encId)
        .maybeSingle();
      const ep = (enc as { patient_id?: number | null } | null)?.patient_id;
      if (ep != null && Number.isFinite(ep)) patientId = ep;
    }
  }

  if (patientId != null && Number.isFinite(patientId)) {
    const { data: pat } = await admin.from("patients").select("name").eq("id", patientId).maybeSingle();
    const name = (pat as { name?: string | null } | null)?.name?.trim();
    if (name) patientName = name;
  }

  const studyName = String(row.study_name ?? "").trim() || "Study";
  const displayFilename = buildImagingResultDisplayFilename({
    patientName,
    studyName,
    dateYmd,
    ext,
  });

  return { displayFilename, dateYmd };
}
