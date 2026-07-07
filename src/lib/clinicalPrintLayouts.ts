import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildImageLayoutJsonFromFormFields,
  emptyImageLayoutFormFields,
  imageLayoutFormFieldsFromDb,
  parseResultsImageLayout,
  type ImageLayoutFormFields,
  type LabResultImagePosition,
} from "@/lib/labResultsPrintLayout";

export const CLINICAL_PRINT_LAYOUTS_TABLE = "clinical_print_layouts" as const;

export type ClinicalPrintTemplateKey = "consultation" | "prescription" | "medical_certificate";

export type ClinicalPrintLayoutRow = {
  template_key: ClinicalPrintTemplateKey;
  ref_width: number;
  ref_height: number;
  physician_signature_layout: LabResultImagePosition | null;
  updated_at: string | null;
};

export const CLINICAL_PRINT_REF_SIZES: Record<ClinicalPrintTemplateKey, { refW: number; refH: number }> = {
  consultation: { refW: 612, refH: 792 },
  prescription: { refW: 420, refH: 595 },
  medical_certificate: { refW: 420, refH: 596 },
};

export const DEFAULT_PHYSICIAN_SIGNATURE_LAYOUT: Record<ClinicalPrintTemplateKey, LabResultImagePosition> = {
  consultation: {
    refX: 110,
    refFromTop: 588,
    refWidth: 130,
    refHeight: 34,
    pageIndex: 2,
  },
  prescription: {
    refX: 115,
    refFromTop: 478,
    refWidth: 120,
    refHeight: 36,
    pageIndex: 0,
  },
  medical_certificate: {
    refX: 72,
    refFromTop: 520,
    refWidth: 110,
    refHeight: 32,
    pageIndex: 0,
  },
};

const LAYOUT_SELECT =
  "template_key, ref_width, ref_height, physician_signature_layout, updated_at";

function parseTemplateKey(raw: string): ClinicalPrintTemplateKey | null {
  const k = raw.trim().toLowerCase();
  if (k === "consultation" || k === "prescription" || k === "medical_certificate") return k;
  return null;
}

function mapLayoutRow(row: Record<string, unknown>): ClinicalPrintLayoutRow {
  const template_key = parseTemplateKey(String(row.template_key ?? ""));
  if (!template_key) {
    throw new Error("Invalid clinical_print_layouts row.");
  }
  const refW = Number(row.ref_width);
  const refH = Number(row.ref_height);
  const sizes = CLINICAL_PRINT_REF_SIZES[template_key];
  return {
    template_key,
    ref_width: Number.isFinite(refW) && refW > 0 ? refW : sizes.refW,
    ref_height: Number.isFinite(refH) && refH > 0 ? refH : sizes.refH,
    physician_signature_layout: parseResultsImageLayout(row.physician_signature_layout),
    updated_at: row.updated_at != null ? String(row.updated_at) : null,
  };
}

export function resolvePhysicianSignaturePrintSlot(
  templateKey: ClinicalPrintTemplateKey,
  row: ClinicalPrintLayoutRow | null | undefined,
): { position: LabResultImagePosition; refW: number; refH: number } {
  const fallback = DEFAULT_PHYSICIAN_SIGNATURE_LAYOUT[templateKey];
  const sizes = CLINICAL_PRINT_REF_SIZES[templateKey];
  if (!row || row.template_key !== templateKey) {
    return { position: fallback, refW: sizes.refW, refH: sizes.refH };
  }
  return {
    position: row.physician_signature_layout ?? fallback,
    refW: row.ref_width,
    refH: row.ref_height,
  };
}

export async function fetchClinicalPrintLayouts(
  db: SupabaseClient,
): Promise<{ layouts: ClinicalPrintLayoutRow[]; error: string | null }> {
  const { data, error } = await db
    .from(CLINICAL_PRINT_LAYOUTS_TABLE)
    .select(LAYOUT_SELECT)
    .order("template_key");
  if (error) return { layouts: [], error: error.message };
  const layouts = (data ?? []).map((row) => mapLayoutRow(row as Record<string, unknown>));
  return { layouts, error: null };
}

export async function fetchClinicalPrintLayout(
  db: SupabaseClient,
  templateKey: ClinicalPrintTemplateKey,
): Promise<{ layout: ClinicalPrintLayoutRow | null; error: string | null }> {
  const { data, error } = await db
    .from(CLINICAL_PRINT_LAYOUTS_TABLE)
    .select(LAYOUT_SELECT)
    .eq("template_key", templateKey)
    .maybeSingle();
  if (error) return { layout: null, error: error.message };
  if (!data) return { layout: null, error: null };
  return { layout: mapLayoutRow(data as Record<string, unknown>), error: null };
}

export function parseClinicalPrintTemplateKey(raw: string): ClinicalPrintTemplateKey | null {
  return parseTemplateKey(raw);
}

export function physicianSignatureLayoutFormFieldsFromDb(
  rawLayout: unknown,
): ImageLayoutFormFields {
  return imageLayoutFormFieldsFromDb(rawLayout);
}

export function emptyPhysicianSignatureLayoutFormFields(): ImageLayoutFormFields {
  return emptyImageLayoutFormFields();
}

export function buildPhysicianSignatureLayoutFromFormFields(
  fields: ImageLayoutFormFields,
): { ok: true; value: LabResultImagePosition | null } | { ok: false; error: string } {
  return buildImageLayoutJsonFromFormFields(fields);
}

export function parsePhysicianSignatureLayoutFormInput(
  raw: unknown,
): { ok: true; value: LabResultImagePosition | null } | { ok: false; error: string } {
  if (raw == null) return { ok: true, value: null };
  if (typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "physician_signature_layout must be an object." };
  }
  const rec = raw as Record<string, unknown>;
  return buildPhysicianSignatureLayoutFromFormFields({
    print_ref_x: String(rec.print_ref_x ?? ""),
    print_ref_from_top: String(rec.print_ref_from_top ?? ""),
    print_ref_width: String(rec.print_ref_width ?? ""),
    print_ref_height: String(rec.print_ref_height ?? ""),
    print_page_index: String(rec.print_page_index ?? ""),
  });
}

export async function upsertClinicalPrintPhysicianSignatureLayout(
  db: SupabaseClient,
  templateKey: ClinicalPrintTemplateKey,
  physicianSignatureLayout: LabResultImagePosition | null,
): Promise<{ layout: ClinicalPrintLayoutRow | null; error: string | null }> {
  const sizes = CLINICAL_PRINT_REF_SIZES[templateKey];
  const { data, error } = await db
    .from(CLINICAL_PRINT_LAYOUTS_TABLE)
    .upsert(
      {
        template_key: templateKey,
        ref_width: sizes.refW,
        ref_height: sizes.refH,
        physician_signature_layout: physicianSignatureLayout,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "template_key" },
    )
    .select(LAYOUT_SELECT)
    .single();
  if (error) return { layout: null, error: error.message };
  return { layout: mapLayoutRow(data as Record<string, unknown>), error: null };
}
