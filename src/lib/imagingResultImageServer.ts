import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
// eslint-disable-next-line @typescript-eslint/no-require-imports
import daikon from "daikon";
import sharp from "sharp";
import {
  buildImagingResultDisplayFilename,
  extensionFromFilename,
  isDicomUpload,
} from "@/lib/imagingResultImageShared";
import { clinicDateYmd } from "@/lib/queueTicketDate";

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

export const DICOM_CONVERSION_ERROR =
  "Could not convert DICOM to JPEG. The file may use an unsupported compression. Try exporting as JPEG from your imaging device.";

export class DicomConversionError extends Error {
  constructor(message: string = DICOM_CONVERSION_ERROR) {
    super(message);
    this.name = "DicomConversionError";
  }
}

export type OptimizedImagingImage = {
  buffer: Buffer;
  contentType: string;
  ext: string;
  optimized: boolean;
};

type InterpretedDicomFrame = {
  data: Float32Array;
  min: number;
  max: number;
  numCols: number;
  numRows: number;
};

function decodeDicomToRgba(input: Buffer): { data: Buffer; width: number; height: number } {
  const arrayBuffer = input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength);
  const dataView = new DataView(arrayBuffer);

  const image = daikon.Series.parseImage(dataView);
  if (!image) {
    throw new DicomConversionError();
  }

  const width = image.getCols();
  const height = image.getRows();
  if (!width || !height || width <= 0 || height <= 0) {
    throw new DicomConversionError();
  }

  const samples = image.getNumberOfSamplesPerPixel();
  const pixelCount = width * height;

  if (samples >= 3 || image.getDataType() === daikon.Image.BYTE_TYPE_RGB) {
    const raw = new Uint8Array(image.getRawData());
    const rgba = Buffer.alloc(pixelCount * 4);
    for (let i = 0; i < pixelCount; i += 1) {
      const base = i * 3;
      rgba[i * 4] = raw[base] ?? 0;
      rgba[i * 4 + 1] = raw[base + 1] ?? 0;
      rgba[i * 4 + 2] = raw[base + 2] ?? 0;
      rgba[i * 4 + 3] = 255;
    }
    return { data: rgba, width, height };
  }

  const interpreted = image.getInterpretedData(false, true, 0) as InterpretedDicomFrame;
  if (!interpreted?.data || interpreted.data.length < pixelCount) {
    throw new DicomConversionError();
  }

  const windowCenter = image.getWindowCenter() ?? (interpreted.min + interpreted.max) / 2;
  const windowWidth = image.getWindowWidth() ?? Math.max(interpreted.max - interpreted.min, 1);
  const lower = windowCenter - windowWidth / 2;
  const upper = windowCenter + windowWidth / 2;
  const range = upper - lower || 1;

  const rgba = Buffer.alloc(pixelCount * 4);
  for (let i = 0; i < pixelCount; i += 1) {
    const value = interpreted.data[i] ?? 0;
    let gray: number;
    if (value <= lower) gray = 0;
    else if (value >= upper) gray = 255;
    else gray = Math.round(((value - lower) / range) * 255);

    rgba[i * 4] = gray;
    rgba[i * 4 + 1] = gray;
    rgba[i * 4 + 2] = gray;
    rgba[i * 4 + 3] = 255;
  }

  return { data: rgba, width, height };
}

async function encodeRgbaToJpeg(
  rgba: Buffer,
  width: number,
  height: number,
): Promise<Buffer> {
  let pipeline = sharp(rgba, { raw: { width, height, channels: 4 } });
  if (width > MAX_EDGE_PX || height > MAX_EDGE_PX) {
    pipeline = pipeline.resize(MAX_EDGE_PX, MAX_EDGE_PX, {
      fit: "inside",
      withoutEnlargement: true,
    });
  }
  return pipeline
    .jpeg({
      quality: JPEG_QUALITY,
      mozjpeg: true,
      chromaSubsampling: "4:4:4",
    })
    .toBuffer();
}

/** Resize large rasters and re-encode with high quality; DICOM converted to JPEG. */
export async function optimizeImagingUploadBuffer(
  input: Buffer,
  originalName: string,
  mimeHint: string,
): Promise<OptimizedImagingImage> {
  const ext = extensionFromFilename(originalName) || ".jpg";
  const mime = (mimeHint || EXT_TO_MIME[ext] || "application/octet-stream").toLowerCase();

  if (isDicomUpload(ext, mime)) {
    try {
      const { data, width, height } = decodeDicomToRgba(input);
      const buffer = await encodeRgbaToJpeg(data, width, height);
      return { buffer, contentType: "image/jpeg", ext: ".jpg", optimized: true };
    } catch (err) {
      if (err instanceof DicomConversionError) throw err;
      throw new DicomConversionError();
    }
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
    clinicDateYmd();

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
