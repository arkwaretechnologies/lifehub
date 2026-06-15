import type { SupabaseClient } from "@supabase/supabase-js";
import path from "path";
import type { LabResultImagePosition, LabResultPrintPosition } from "@/lib/labResultsPrintLayout";
import {
  buildImageLayoutJsonFromFormFields,
  buildPrintLayoutJsonFromFormFields,
  emptyImageLayoutFormFields,
  emptyPrintLayoutFormFields,
  imageLayoutFormFieldsFromDb,
  parseResultsImageLayout,
  parseResultsPrintLayout,
  printLayoutFormFieldsFromDb,
  type ImageLayoutFormFields,
  type PrintLayoutFormFields,
} from "@/lib/labResultsPrintLayout";

export const IMAGING_RESULT_TEMPLATES_TABLE = "imaging_result_templates" as const;
export const IMAGING_RESULTS_TEMPLATES_RELATIVE_DIR = "templates/Imaging Results" as const;
export const IMAGING_RESULT_TEMPLATE_PDF_MAX_BYTES = 15 * 1024 * 1024;

export type ImagingResultTemplateSignatureSlot = {
  name: LabResultPrintPosition | null;
  license: LabResultPrintPosition | null;
  signature: LabResultImagePosition | null;
};

export type ImagingResultTemplateSignatureLayout = {
  radtech: ImagingResultTemplateSignatureSlot;
  radiologist: ImagingResultTemplateSignatureSlot;
};

export type ImagingResultTemplateResultLayout = {
  examination_name: LabResultPrintPosition | null;
  findings: LabResultPrintPosition | null;
  impression: LabResultPrintPosition | null;
};

export type ImagingResultTemplateRow = {
  id: string;
  code: string;
  name: string;
  file_name: string;
  sort_order: number | null;
  is_active: boolean;
  result_layout: ImagingResultTemplateResultLayout | null;
  signature_layout: ImagingResultTemplateSignatureLayout | null;
  created_at: string | null;
  updated_at: string | null;
};

const TEMPLATE_SELECT =
  "id, code, name, file_name, sort_order, is_active, result_layout, signature_layout, created_at, updated_at";

function parseLayoutSlot(raw: unknown): LabResultPrintPosition | null {
  if (raw == null) return null;
  return parseResultsPrintLayout(raw);
}

/** Parse `imaging_result_templates.result_layout` jsonb. */
export function parseTemplateResultLayout(raw: unknown): ImagingResultTemplateResultLayout | null {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const rec = raw as Record<string, unknown>;
  const examination_name = parseLayoutSlot(rec.examination_name);
  const findings = parseLayoutSlot(rec.findings);
  const impression = parseLayoutSlot(rec.impression);
  if (!examination_name && !findings && !impression) return null;
  return { examination_name, findings, impression };
}

function parseSignatureSlot(raw: unknown): ImagingResultTemplateSignatureSlot {
  const empty: ImagingResultTemplateSignatureSlot = { name: null, license: null, signature: null };
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return empty;
  const rec = raw as Record<string, unknown>;
  return {
    name: parseLayoutSlot(rec.name),
    license: parseLayoutSlot(rec.license),
    signature: parseResultsImageLayout(rec.signature),
  };
}

/** Parse `imaging_result_templates.signature_layout` jsonb. */
export function parseTemplateSignatureLayout(raw: unknown): ImagingResultTemplateSignatureLayout | null {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const rec = raw as Record<string, unknown>;
  const radtech = parseSignatureSlot(rec.radtech);
  const radiologist = parseSignatureSlot(rec.radiologist);
  const hasAny =
    radtech.name != null ||
    radtech.license != null ||
    radtech.signature != null ||
    radiologist.name != null ||
    radiologist.license != null ||
    radiologist.signature != null;
  if (!hasAny) return null;
  return { radtech, radiologist };
}

function mapTemplateRow(row: Record<string, unknown>): ImagingResultTemplateRow {
  return {
    id: String(row.id ?? ""),
    code: String(row.code ?? "").trim().toUpperCase(),
    name: String(row.name ?? "").trim(),
    file_name: String(row.file_name ?? "").trim(),
    sort_order: row.sort_order == null ? null : Number(row.sort_order),
    is_active: row.is_active !== false,
    result_layout: parseTemplateResultLayout(row.result_layout),
    signature_layout: parseTemplateSignatureLayout(row.signature_layout),
    created_at: row.created_at != null ? String(row.created_at) : null,
    updated_at: row.updated_at != null ? String(row.updated_at) : null,
  };
}

export function normalizeImagingResultTemplateCode(raw: string | null | undefined): string | null {
  const c = String(raw ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, "");
  return c === "" ? null : c;
}

export function defaultImagingResultTemplateFileName(code: string): string {
  return `LIFEHUB-MEDICAL-Results-${code}.pdf`;
}

export function imagingResultTemplatePdfAbsolutePath(fileName: string): string {
  const base = path.join(process.cwd(), IMAGING_RESULTS_TEMPLATES_RELATIVE_DIR);
  return path.join(base, path.basename(fileName));
}

export function isAllowedImagingResultTemplateCode(
  code: string,
  allowedCodes: ReadonlySet<string> | readonly string[],
): boolean {
  const c = normalizeImagingResultTemplateCode(code);
  if (!c) return false;
  const set = allowedCodes instanceof Set ? allowedCodes : new Set(allowedCodes);
  return set.has(c);
}

/** Merge catalog-level layout overrides onto the template default. */
export function mergeImagingResultPrintLayout(
  templateLayout: ImagingResultTemplateResultLayout | null | undefined,
  catalogOverride: ImagingResultTemplateResultLayout | null | undefined,
): ImagingResultTemplateResultLayout | null {
  const base = templateLayout ?? {
    examination_name: null,
    findings: null,
    impression: null,
  };
  const over = catalogOverride;
  if (!over) return parseTemplateResultLayout(base) ?? null;
  return {
    examination_name: over.examination_name ?? base.examination_name,
    findings: over.findings ?? base.findings,
    impression: over.impression ?? base.impression,
  };
}

export async function fetchImagingResultTemplates(
  db: SupabaseClient,
  opts?: { activeOnly?: boolean },
): Promise<{ templates: ImagingResultTemplateRow[]; error: string | null }> {
  let q = db.from(IMAGING_RESULT_TEMPLATES_TABLE).select(TEMPLATE_SELECT);
  if (opts?.activeOnly) q = q.eq("is_active", true);
  const { data, error } = await q
    .order("sort_order", { ascending: true, nullsFirst: false })
    .order("code", { ascending: true });
  if (error) return { templates: [], error: error.message };
  return { templates: (data ?? []).map((r) => mapTemplateRow(r as Record<string, unknown>)), error: null };
}

export async function fetchImagingResultTemplateByCode(
  db: SupabaseClient,
  code: string,
): Promise<{ template: ImagingResultTemplateRow | null; error: string | null }> {
  const c = normalizeImagingResultTemplateCode(code);
  if (!c) return { template: null, error: "Invalid template code." };
  const { data, error } = await db
    .from(IMAGING_RESULT_TEMPLATES_TABLE)
    .select(TEMPLATE_SELECT)
    .eq("code", c)
    .maybeSingle();
  if (error) return { template: null, error: error.message };
  if (!data) return { template: null, error: null };
  return { template: mapTemplateRow(data as Record<string, unknown>), error: null };
}

export function buildResultLayoutJsonFromForm(
  examinationName: LabResultPrintPosition | null,
  findings: LabResultPrintPosition | null,
  impression: LabResultPrintPosition | null,
): ImagingResultTemplateResultLayout | null {
  const layout: ImagingResultTemplateResultLayout = {
    examination_name: examinationName,
    findings,
    impression,
  };
  if (!examinationName && !findings && !impression) return null;
  return layout;
}

export function parseTemplateResultLayoutInput(
  raw: unknown,
): { ok: true; value: ImagingResultTemplateResultLayout | null } | { ok: false; error: string } {
  if (raw === undefined || raw === null) return { ok: true, value: null };
  if (typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "result_layout must be an object." };
  }
  const rec = raw as Record<string, unknown>;
  const value = buildResultLayoutJsonFromForm(
    parseLayoutSlot(rec.examination_name),
    parseLayoutSlot(rec.findings),
    parseLayoutSlot(rec.impression),
  );
  return { ok: true, value };
}

export function buildSignatureLayoutJsonFromForm(
  radtechName: LabResultPrintPosition | null,
  radtechLicense: LabResultPrintPosition | null,
  radtechSignature: LabResultImagePosition | null,
  radiologistName: LabResultPrintPosition | null,
  radiologistLicense: LabResultPrintPosition | null,
  radiologistSignature: LabResultImagePosition | null,
): ImagingResultTemplateSignatureLayout | null {
  const layout: ImagingResultTemplateSignatureLayout = {
    radtech: { name: radtechName, license: radtechLicense, signature: radtechSignature },
    radiologist: {
      name: radiologistName,
      license: radiologistLicense,
      signature: radiologistSignature,
    },
  };
  const hasAny =
    radtechName != null ||
    radtechLicense != null ||
    radtechSignature != null ||
    radiologistName != null ||
    radiologistLicense != null ||
    radiologistSignature != null;
  return hasAny ? layout : null;
}

function parsePositionField(raw: unknown): LabResultPrintPosition | null {
  if (raw === undefined || raw === null) return null;
  return parseResultsPrintLayout(raw);
}

/** Parse API body `signature_layout` object. */
export function parseTemplateSignatureLayoutInput(
  raw: unknown,
): { ok: true; value: ImagingResultTemplateSignatureLayout | null } | { ok: false; error: string } {
  if (raw === undefined || raw === null) return { ok: true, value: null };
  if (typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "signature_layout must be an object." };
  }
  const rec = raw as Record<string, unknown>;
  const radRaw = rec.radtech;
  const radDocRaw = rec.radiologist;
  const radtech =
    radRaw != null && typeof radRaw === "object" && !Array.isArray(radRaw)
      ? {
          name: parsePositionField((radRaw as Record<string, unknown>).name),
          license: parsePositionField((radRaw as Record<string, unknown>).license),
          signature: parseResultsImageLayout((radRaw as Record<string, unknown>).signature),
        }
      : { name: null, license: null, signature: null };
  const radiologist =
    radDocRaw != null && typeof radDocRaw === "object" && !Array.isArray(radDocRaw)
      ? {
          name: parsePositionField((radDocRaw as Record<string, unknown>).name),
          license: parsePositionField((radDocRaw as Record<string, unknown>).license),
          signature: parseResultsImageLayout((radDocRaw as Record<string, unknown>).signature),
        }
      : { name: null, license: null, signature: null };
  const value = buildSignatureLayoutJsonFromForm(
    radtech.name,
    radtech.license,
    radtech.signature,
    radiologist.name,
    radiologist.license,
    radiologist.signature,
  );
  return { ok: true, value };
}

export type TemplateSignatureLayoutFormFields = {
  radtech_name: PrintLayoutFormFields;
  radtech_license: PrintLayoutFormFields;
  radtech_signature: ImageLayoutFormFields;
  radiologist_name: PrintLayoutFormFields;
  radiologist_license: PrintLayoutFormFields;
  radiologist_signature: ImageLayoutFormFields;
};

export function emptyTemplateSignatureLayoutFormFields(): TemplateSignatureLayoutFormFields {
  return {
    radtech_name: emptyPrintLayoutFormFields(),
    radtech_license: emptyPrintLayoutFormFields(),
    radtech_signature: emptyImageLayoutFormFields(),
    radiologist_name: emptyPrintLayoutFormFields(),
    radiologist_license: emptyPrintLayoutFormFields(),
    radiologist_signature: emptyImageLayoutFormFields(),
  };
}

export function templateSignatureLayoutFormFieldsFromDb(
  layout: ImagingResultTemplateSignatureLayout | null,
): TemplateSignatureLayoutFormFields {
  const empty = emptyTemplateSignatureLayoutFormFields();
  if (!layout) return empty;
  return {
    radtech_name: printLayoutFormFieldsFromDb(layout.radtech.name),
    radtech_license: printLayoutFormFieldsFromDb(layout.radtech.license),
    radtech_signature: imageLayoutFormFieldsFromDb(layout.radtech.signature),
    radiologist_name: printLayoutFormFieldsFromDb(layout.radiologist.name),
    radiologist_license: printLayoutFormFieldsFromDb(layout.radiologist.license),
    radiologist_signature: imageLayoutFormFieldsFromDb(layout.radiologist.signature),
  };
}

function parseImageSlotFromFormFields(
  fields: ImageLayoutFormFields,
): { ok: true; value: LabResultImagePosition | null } | { ok: false; error: string } {
  return buildImageLayoutJsonFromFormFields(fields);
}

export function buildTemplateSignatureLayoutFromFormFields(
  fields: TemplateSignatureLayoutFormFields,
): { ok: true; value: ImagingResultTemplateSignatureLayout | null } | { ok: false; error: string } {
  const radName = parseSlotFromFormFields(fields.radtech_name);
  if (!radName.ok) return radName;
  const radLic = parseSlotFromFormFields(fields.radtech_license);
  if (!radLic.ok) return radLic;
  const radSig = parseImageSlotFromFormFields(fields.radtech_signature);
  if (!radSig.ok) return radSig;
  const docName = parseSlotFromFormFields(fields.radiologist_name);
  if (!docName.ok) return docName;
  const docLic = parseSlotFromFormFields(fields.radiologist_license);
  if (!docLic.ok) return docLic;
  const docSig = parseImageSlotFromFormFields(fields.radiologist_signature);
  if (!docSig.ok) return docSig;
  const value = buildSignatureLayoutJsonFromForm(
    radName.value,
    radLic.value,
    radSig.value,
    docName.value,
    docLic.value,
    docSig.value,
  );
  return { ok: true, value };
}

export type TemplateResultLayoutFormFields = {
  examination_name: PrintLayoutFormFields;
  findings: PrintLayoutFormFields;
  impression: PrintLayoutFormFields;
};

export function emptyTemplateResultLayoutFormFields(): TemplateResultLayoutFormFields {
  return {
    examination_name: emptyPrintLayoutFormFields(),
    findings: emptyPrintLayoutFormFields(),
    impression: emptyPrintLayoutFormFields(),
  };
}

export function templateResultLayoutFormFieldsFromDb(
  layout: ImagingResultTemplateResultLayout | null,
): TemplateResultLayoutFormFields {
  const empty = emptyTemplateResultLayoutFormFields();
  if (!layout) return empty;
  return {
    examination_name: printLayoutFormFieldsFromDb(layout.examination_name),
    findings: printLayoutFormFieldsFromDb(layout.findings),
    impression: printLayoutFormFieldsFromDb(layout.impression),
  };
}

function parseSlotFromFormFields(
  fields: PrintLayoutFormFields,
): { ok: true; value: LabResultPrintPosition | null } | { ok: false; error: string } {
  return buildPrintLayoutJsonFromFormFields(fields);
}

export function buildTemplateResultLayoutFromFormFields(
  fields: TemplateResultLayoutFormFields,
): { ok: true; value: ImagingResultTemplateResultLayout | null } | { ok: false; error: string } {
  const exam = parseSlotFromFormFields(fields.examination_name);
  if (!exam.ok) return exam;
  const findings = parseSlotFromFormFields(fields.findings);
  if (!findings.ok) return findings;
  const impression = parseSlotFromFormFields(fields.impression);
  if (!impression.ok) return impression;
  return {
    ok: true,
    value: buildResultLayoutJsonFromForm(exam.value, findings.value, impression.value),
  };
}

export function formatImagingExaminationName(item: {
  study_name: string;
  view_text?: string | null;
}): string {
  const name = String(item.study_name ?? "").trim();
  const view = String(item.view_text ?? "").trim();
  if (!name) return view || "";
  return view ? `${name} — ${view}` : name;
}
