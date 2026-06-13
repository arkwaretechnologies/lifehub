import { authenticatedFetch } from "@/lib/authenticatedFetch";
import {
  CLINICAL_PRINT_REF_SIZES,
  DEFAULT_PHYSICIAN_SIGNATURE_LAYOUT,
  parseClinicalPrintTemplateKey,
  resolvePhysicianSignaturePrintSlot,
  type ClinicalPrintLayoutRow,
  type ClinicalPrintTemplateKey,
} from "@/lib/clinicalPrintLayouts";
import type { LabResultImagePosition } from "@/lib/labResultsPrintLayout";

export type PhysicianSignaturePrintSlot = {
  position: LabResultImagePosition;
  refW: number;
  refH: number;
};

export async function fetchPhysicianSignaturePrintLayout(
  templateKey: ClinicalPrintTemplateKey,
): Promise<PhysicianSignaturePrintSlot> {
  const fallback = (): PhysicianSignaturePrintSlot => {
    const sizes = CLINICAL_PRINT_REF_SIZES[templateKey];
    return {
      position: DEFAULT_PHYSICIAN_SIGNATURE_LAYOUT[templateKey],
      refW: sizes.refW,
      refH: sizes.refH,
    };
  };

  try {
    const res = await authenticatedFetch(`/api/clinical-print-layouts/${templateKey}`, {
      cache: "no-store",
    });
    const json = (await res.json().catch(() => null)) as {
      layout?: ClinicalPrintLayoutRow | null;
      error?: string;
    } | null;
    if (!res.ok || json?.error) return fallback();
    return resolvePhysicianSignaturePrintSlot(templateKey, json?.layout ?? null);
  } catch {
    return fallback();
  }
}

export function parseClinicalPrintTemplateKeyFromPath(raw: string): ClinicalPrintTemplateKey | null {
  return parseClinicalPrintTemplateKey(raw);
}
