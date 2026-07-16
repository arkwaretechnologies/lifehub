import type { SupabaseClient } from "@supabase/supabase-js";
import path from "path";
import {
  IMAGING_SIGNATURE_LAYOUT_ROLES,
  type ImagingSignatureLayoutRole,
} from "@/lib/imagingResultSignatures";
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
import {
  dohLicensePrintFormFieldsFromDb,
  emptyDohLicensePrintFormFields,
  parseResultDohLicensePrint,
  type DohLicensePrintFormFields,
  type ResultDohLicensePrint,
} from "@/lib/resultDohLicensePrint";

export type { DohLicensePrintFormFields, ResultDohLicensePrint };
export {
  buildResultDohLicensePrintFromFormFields,
  dohLicensePrintFormFieldsFromDb,
  emptyDohLicensePrintFormFields,
  parseResultDohLicensePrint,
  parseResultDohLicensePrintInput,
} from "@/lib/resultDohLicensePrint";

export const IMAGING_RESULT_TEMPLATES_TABLE = "imaging_result_templates" as const;
export const IMAGING_RESULTS_TEMPLATES_RELATIVE_DIR = "templates/Imaging Results" as const;
export const IMAGING_RESULT_TEMPLATE_PDF_MAX_BYTES = 15 * 1024 * 1024;

export type ImagingResultTemplateSignatureSlot = {
  name: LabResultPrintPosition | null;
  license: LabResultPrintPosition | null;
  signature: LabResultImagePosition | null;
};

export type ImagingResultTemplateSignatureLayout = Record<
  ImagingSignatureLayoutRole,
  ImagingResultTemplateSignatureSlot
>;

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
  doh_license_print: ResultDohLicensePrint | null;
  created_at: string | null;
  updated_at: string | null;
};

const TEMPLATE_SELECT =
  "id, code, name, file_name, sort_order, is_active, result_layout, signature_layout, doh_license_print, created_at, updated_at";

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
  const layout = {} as ImagingResultTemplateSignatureLayout;
  let hasAny = false;
  for (const role of IMAGING_SIGNATURE_LAYOUT_ROLES) {
    const slot = parseSignatureSlot(rec[role]);
    layout[role] = slot;
    if (slot.name != null || slot.license != null || slot.signature != null) hasAny = true;
  }
  if (!hasAny) return null;
  return layout;
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
    doh_license_print: parseResultDohLicensePrint(row.doh_license_print),
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
  slots: ImagingResultTemplateSignatureLayout,
): ImagingResultTemplateSignatureLayout | null {
  let hasAny = false;
  for (const role of IMAGING_SIGNATURE_LAYOUT_ROLES) {
    const slot = slots[role];
    if (slot.name != null || slot.license != null || slot.signature != null) hasAny = true;
  }
  return hasAny ? slots : null;
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
  const layout = {} as ImagingResultTemplateSignatureLayout;
  for (const role of IMAGING_SIGNATURE_LAYOUT_ROLES) {
    const roleRaw = rec[role];
    layout[role] =
      roleRaw != null && typeof roleRaw === "object" && !Array.isArray(roleRaw)
        ? {
            name: parsePositionField((roleRaw as Record<string, unknown>).name),
            license: parsePositionField((roleRaw as Record<string, unknown>).license),
            signature: parseResultsImageLayout((roleRaw as Record<string, unknown>).signature),
          }
        : { name: null, license: null, signature: null };
  }
  const value = buildSignatureLayoutJsonFromForm(layout);
  return { ok: true, value };
}

export type TemplateSignatureLayoutFormFields = {
  radtech_name: PrintLayoutFormFields;
  radtech_license: PrintLayoutFormFields;
  radtech_signature: ImageLayoutFormFields;
  radiologist_name: PrintLayoutFormFields;
  radiologist_license: PrintLayoutFormFields;
  radiologist_signature: ImageLayoutFormFields;
  cardiologist_name: PrintLayoutFormFields;
  cardiologist_license: PrintLayoutFormFields;
  cardiologist_signature: ImageLayoutFormFields;
};

export function emptyTemplateSignatureLayoutFormFields(): TemplateSignatureLayoutFormFields {
  return {
    radtech_name: emptyPrintLayoutFormFields(),
    radtech_license: emptyPrintLayoutFormFields(),
    radtech_signature: emptyImageLayoutFormFields(),
    radiologist_name: emptyPrintLayoutFormFields(),
    radiologist_license: emptyPrintLayoutFormFields(),
    radiologist_signature: emptyImageLayoutFormFields(),
    cardiologist_name: emptyPrintLayoutFormFields(),
    cardiologist_license: emptyPrintLayoutFormFields(),
    cardiologist_signature: emptyImageLayoutFormFields(),
  };
}

export function templateSignatureLayoutFormFieldsFromDb(
  layout: ImagingResultTemplateSignatureLayout | null,
): TemplateSignatureLayoutFormFields {
  const empty = emptyTemplateSignatureLayoutFormFields();
  if (!layout) return empty;
  const out = { ...empty };
  for (const role of IMAGING_SIGNATURE_LAYOUT_ROLES) {
    out[`${role}_name`] = printLayoutFormFieldsFromDb(layout[role].name);
    out[`${role}_license`] = printLayoutFormFieldsFromDb(layout[role].license);
    out[`${role}_signature`] = imageLayoutFormFieldsFromDb(layout[role].signature);
  }
  return out;
}

function parseImageSlotFromFormFields(
  fields: ImageLayoutFormFields,
): { ok: true; value: LabResultImagePosition | null } | { ok: false; error: string } {
  return buildImageLayoutJsonFromFormFields(fields);
}

export function buildTemplateSignatureLayoutFromFormFields(
  fields: TemplateSignatureLayoutFormFields,
): { ok: true; value: ImagingResultTemplateSignatureLayout | null } | { ok: false; error: string } {
  const layout = {} as ImagingResultTemplateSignatureLayout;
  for (const role of IMAGING_SIGNATURE_LAYOUT_ROLES) {
    const name = parseSlotFromFormFields(fields[`${role}_name`]);
    if (!name.ok) return name;
    const license = parseSlotFromFormFields(fields[`${role}_license`]);
    if (!license.ok) return license;
    const signature = parseImageSlotFromFormFields(fields[`${role}_signature`]);
    if (!signature.ok) return signature;
    layout[role] = {
      name: name.value,
      license: license.value,
      signature: signature.value,
    };
  }
  const value = buildSignatureLayoutJsonFromForm(layout);
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
