/** Client-safe signature upload constants (no Node-only deps). */

import type { LabSignatureRole } from "@/lib/labResultSignatures";
import type { ImagingSignatureRole } from "@/lib/imagingResultSignatures";

export const SIGNATURES_BUCKET = "signatures" as const;

export const SIGNATURE_UPLOAD_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp"] as const;

export const SIGNATURE_UPLOAD_ACCEPT = [
  "image/png",
  "image/jpeg",
  "image/webp",
  ...SIGNATURE_UPLOAD_EXTENSIONS,
  ...SIGNATURE_UPLOAD_EXTENSIONS.map((e) => e.toUpperCase()),
].join(",");

export const MAX_SIGNATURE_UPLOAD_BYTES = 10000 * 1024;

export function extensionFromSignatureFilename(name: string): string {
  const base = name.trim().toLowerCase();
  const dot = base.lastIndexOf(".");
  if (dot < 0) return ".png";
  return base.slice(dot);
}

export function isAllowedSignatureUploadFilename(name: string): boolean {
  const ext = extensionFromSignatureFilename(name);
  return SIGNATURE_UPLOAD_EXTENSIONS.includes(ext as (typeof SIGNATURE_UPLOAD_EXTENSIONS)[number]);
}

export function validateSignatureUploadFile(file: { name: string; size: number; type?: string }): string | null {
  if (!file.name.trim()) return "File name is required.";
  if (!isAllowedSignatureUploadFilename(file.name)) {
    return `Allowed types: ${SIGNATURE_UPLOAD_EXTENSIONS.join(", ")}`;
  }
  if (file.size <= 0) return "File is empty.";
  if (file.size > MAX_SIGNATURE_UPLOAD_BYTES) {
    return `Signature must be under ${MAX_SIGNATURE_UPLOAD_BYTES / 1024} KB.`;
  }
  return null;
}

export function contentTypeForSignatureExt(ext: string): string {
  const e = ext.toLowerCase();
  if (e === ".jpg" || e === ".jpeg") return "image/jpeg";
  if (e === ".webp") return "image/webp";
  return "image/png";
}

export function buildLabSignatoryStoragePath(role: LabSignatureRole, ext: string): string {
  const safeExt = ext.startsWith(".") ? ext.toLowerCase() : `.${ext.toLowerCase()}`;
  return `lab/${role}${safeExt}`;
}

export function buildImagingSignatoryStoragePath(role: ImagingSignatureRole, ext: string): string {
  const safeExt = ext.startsWith(".") ? ext.toLowerCase() : `.${ext.toLowerCase()}`;
  return `imaging/${role}${safeExt}`;
}

export function buildPhysicianSignatureStoragePath(userId: number, ext: string): string {
  const safeExt = ext.startsWith(".") ? ext.toLowerCase() : `.${ext.toLowerCase()}`;
  return `physicians/${userId}${safeExt}`;
}

export function parseLabSignatoryRole(raw: string): LabSignatureRole | null {
  const r = raw.trim().toLowerCase();
  if (r === "medtech" || r === "pathologist") return r;
  return null;
}

export function parseImagingSignatoryRole(raw: string): ImagingSignatureRole | null {
  const r = raw.trim().toLowerCase();
  if (r === "radtech" || r === "radiologic_technologist") return "radtech";
  if (r === "radiologist") return "radiologist";
  if (r === "cardiologist") return "cardiologist";
  return null;
}

/** Roles that may store a user signature for consultation / RX print. */
export function userRoleCanHaveSignature(roleName: string): boolean {
  const r = roleName.trim().toUpperCase();
  return r === "PHYSICIAN" || r === "ADMIN";
}
