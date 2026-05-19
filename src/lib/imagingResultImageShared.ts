/** Client-safe imaging upload constants and helpers (no Node-only deps). */

import { formatDateMMDDYYYY } from "@/lib/dateDisplay";

export const IMAGING_RESULTS_BUCKET = "imaging-results" as const;

/** Common extensions from CR/DR, PACS export, and DICOM workstations. */
export const IMAGING_UPLOAD_EXTENSIONS = [
  ".dcm",
  ".dicom",
  ".jpg",
  ".jpeg",
  ".png",
  ".tif",
  ".tiff",
  ".bmp",
  ".webp",
] as const;

export const IMAGING_UPLOAD_ACCEPT = [
  ...IMAGING_UPLOAD_EXTENSIONS,
  ...IMAGING_UPLOAD_EXTENSIONS.map((e) => e.toUpperCase()),
].join(",");

export const MAX_IMAGING_UPLOAD_BYTES = 50 * 1024 * 1024;

export function extensionFromFilename(name: string): string {
  const base = name.trim().toLowerCase();
  const dot = base.lastIndexOf(".");
  if (dot < 0) return "";
  return base.slice(dot);
}

export function isAllowedImagingUploadFilename(name: string): boolean {
  const ext = extensionFromFilename(name);
  return IMAGING_UPLOAD_EXTENSIONS.includes(ext as (typeof IMAGING_UPLOAD_EXTENSIONS)[number]);
}

export function isDicomUpload(ext: string, mime: string): boolean {
  const e = ext.toLowerCase();
  const m = mime.toLowerCase();
  return e === ".dcm" || e === ".dicom" || m.includes("dicom");
}

export function validateImagingUploadFile(file: { name: string; size: number; type?: string }): string | null {
  if (!file.name.trim()) return "File name is required.";
  if (!isAllowedImagingUploadFilename(file.name)) {
    return `Allowed types: ${IMAGING_UPLOAD_EXTENSIONS.join(", ")}`;
  }
  if (file.size <= 0) return "File is empty.";
  if (file.size > MAX_IMAGING_UPLOAD_BYTES) {
    return `File must be under ${MAX_IMAGING_UPLOAD_BYTES / (1024 * 1024)} MB.`;
  }
  return null;
}

/** Strip characters unsafe in filenames and storage object keys. */
export function sanitizeImagingFilenamePart(value: string): string {
  return String(value)
    .trim()
    .replace(/[/\\:*?"<>|]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Display + storage name: `Patient Name - (Study Name) - mm-dd-yyyy.ext` */
export function buildImagingResultDisplayFilename(args: {
  patientName: string;
  studyName: string;
  dateYmd: string;
  ext: string;
}): string {
  const patient = sanitizeImagingFilenamePart(args.patientName) || "Patient";
  const study = sanitizeImagingFilenamePart(args.studyName) || "Study";
  const date =
    formatDateMMDDYYYY(args.dateYmd) ||
    formatDateMMDDYYYY(new Date().toISOString().slice(0, 10)) ||
    "";
  const ext = args.ext.startsWith(".") ? args.ext.toLowerCase() : `.${args.ext.toLowerCase()}`;
  return `${patient} - (${study}) - ${date}${ext}`;
}

export function buildImagingResultStoragePath(
  imagingRequestId: string,
  itemId: string,
  displayFilename: string,
): string {
  const rid = imagingRequestId.trim();
  const iid = itemId.trim();
  const file =
    sanitizeImagingFilenamePart(displayFilename.replace(/[/\\]/g, "-")) ||
    `result-${Date.now()}`;
  return `${rid}/${iid}/${file}`;
}
