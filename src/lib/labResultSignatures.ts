/** User specialty values that map to lab result PDF signature slots. */
export const LAB_SIGNATURE_SPECIALTY_MEDTECH = "Medical Technologist" as const;
export const LAB_SIGNATURE_SPECIALTY_PATHOLOGIST = "Pathologist" as const;

export type LabSignatureRole = "medtech" | "pathologist";

/** Roles that may have specialty + license for lab result signatures. */
export function isLabSignatureRole(roleName: string): boolean {
  const r = roleName.trim().toUpperCase();
  return r === "PHYSICIAN" || r === "LAB ADMIN";
}

/** Map free-text user specialty to signature slot; null when not a signatory role. */
export function matchLabSignatureRole(specialty: string | null | undefined): LabSignatureRole | null {
  const s = (specialty ?? "").trim().toLowerCase();
  if (s === LAB_SIGNATURE_SPECIALTY_MEDTECH.toLowerCase()) return "medtech";
  if (s === LAB_SIGNATURE_SPECIALTY_PATHOLOGIST.toLowerCase()) return "pathologist";
  return null;
}
