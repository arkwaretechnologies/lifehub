/** PDF signature slot roles on imaging result templates. */
export const IMAGING_SIGNATURE_LAYOUT_ROLES = ["radtech", "radiologist", "cardiologist"] as const;

export type ImagingSignatureLayoutRole = (typeof IMAGING_SIGNATURE_LAYOUT_ROLES)[number];

/** All imaging signatory records stored in settings (includes template-specific overrides). */
export const IMAGING_SIGNATURE_ROLES = [
  "radtech",
  "radtech_ultrasound",
  "radiologist",
  "cardiologist",
] as const;

export type ImagingSignatureRole = (typeof IMAGING_SIGNATURE_ROLES)[number];

export const IMAGING_SIGNATURE_SPECIALTY_RADTECH = "Radiologic Technologist" as const;
export const IMAGING_SIGNATURE_SPECIALTY_RADTECH_ULTRASOUND = "Radiologic Technologist (Ultrasound)" as const;
export const IMAGING_SIGNATURE_SPECIALTY_RADIOLOGIST = "Radiologist" as const;
export const IMAGING_SIGNATURE_SPECIALTY_CARDIOLOGIST = "Cardiologist" as const;

export const IMAGING_SIGNATURE_ROLE_LABELS: Record<ImagingSignatureRole, string> = {
  radtech: IMAGING_SIGNATURE_SPECIALTY_RADTECH,
  radtech_ultrasound: IMAGING_SIGNATURE_SPECIALTY_RADTECH_ULTRASOUND,
  radiologist: IMAGING_SIGNATURE_SPECIALTY_RADIOLOGIST,
  cardiologist: IMAGING_SIGNATURE_SPECIALTY_CARDIOLOGIST,
};

export function isImagingSignatureRole(raw: string): raw is ImagingSignatureRole {
  return (IMAGING_SIGNATURE_ROLES as readonly string[]).includes(raw);
}

export function isImagingSignatureLayoutRole(raw: string): raw is ImagingSignatureLayoutRole {
  return (IMAGING_SIGNATURE_LAYOUT_ROLES as readonly string[]).includes(raw);
}

export function isUltrasoundImagingTemplateCode(code: string | null | undefined): boolean {
  return String(code ?? "").trim().toUpperCase() === "ULTRASOUND";
}

/** Which stored signatory supplies data for a template PDF slot. */
export function imagingSignatorySourceRole(
  layoutRole: ImagingSignatureLayoutRole,
  templateCode: string | null | undefined,
): ImagingSignatureRole {
  if (layoutRole === "radtech" && isUltrasoundImagingTemplateCode(templateCode)) {
    return "radtech_ultrasound";
  }
  return layoutRole;
}

export function parseImagingSignatureRole(raw: string | null | undefined): ImagingSignatureRole | null {
  const r = String(raw ?? "").trim().toLowerCase();
  if (r === "radtech" || r === "radiologic_technologist" || r === "radiologic technologist") {
    return "radtech";
  }
  if (
    r === "radtech_ultrasound" ||
    r === "radiologic_technologist_ultrasound" ||
    r === "radiologic technologist (ultrasound)"
  ) {
    return "radtech_ultrasound";
  }
  if (r === "radiologist") return "radiologist";
  if (r === "cardiologist") return "cardiologist";
  return null;
}
