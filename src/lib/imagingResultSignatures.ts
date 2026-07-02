export const IMAGING_SIGNATURE_ROLES = ["radtech", "radiologist", "cardiologist"] as const;

export type ImagingSignatureRole = (typeof IMAGING_SIGNATURE_ROLES)[number];

export const IMAGING_SIGNATURE_SPECIALTY_RADTECH = "Radiologic Technologist" as const;
export const IMAGING_SIGNATURE_SPECIALTY_RADIOLOGIST = "Radiologist" as const;
export const IMAGING_SIGNATURE_SPECIALTY_CARDIOLOGIST = "Cardiologist" as const;

export const IMAGING_SIGNATURE_ROLE_LABELS: Record<ImagingSignatureRole, string> = {
  radtech: IMAGING_SIGNATURE_SPECIALTY_RADTECH,
  radiologist: IMAGING_SIGNATURE_SPECIALTY_RADIOLOGIST,
  cardiologist: IMAGING_SIGNATURE_SPECIALTY_CARDIOLOGIST,
};

export function isImagingSignatureRole(raw: string): raw is ImagingSignatureRole {
  return (IMAGING_SIGNATURE_ROLES as readonly string[]).includes(raw);
}

export function parseImagingSignatureRole(raw: string | null | undefined): ImagingSignatureRole | null {
  const r = String(raw ?? "").trim().toLowerCase();
  if (r === "radtech" || r === "radiologic_technologist" || r === "radiologic technologist") {
    return "radtech";
  }
  if (r === "radiologist") return "radiologist";
  if (r === "cardiologist") return "cardiologist";
  return null;
}
