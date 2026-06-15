export type ImagingSignatureRole = "radtech" | "radiologist";

export const IMAGING_SIGNATURE_SPECIALTY_RADTECH = "Radiologic Technologist" as const;
export const IMAGING_SIGNATURE_SPECIALTY_RADIOLOGIST = "Radiologist" as const;

export function parseImagingSignatureRole(raw: string | null | undefined): ImagingSignatureRole | null {
  const r = String(raw ?? "").trim().toLowerCase();
  if (r === "radtech" || r === "radiologic_technologist" || r === "radiologic technologist") {
    return "radtech";
  }
  if (r === "radiologist") return "radiologist";
  return null;
}
