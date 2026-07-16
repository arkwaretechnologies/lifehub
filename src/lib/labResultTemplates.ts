import type { SupabaseClient } from "@supabase/supabase-js";
import path from "path";
import { LAB_RESULTS_TEMPLATES_RELATIVE_DIR, labResultsTemplatePdfFileName } from "@/lib/labTests";
import type { LabResultPrintPosition, LabResultImagePosition } from "@/lib/labResultsPrintLayout";
import {
  buildPrintLayoutJsonFromFormFields,
  buildImageLayoutJsonFromFormFields,
  emptyPrintLayoutFormFields,
  emptyImageLayoutFormFields,
  parseResultsPrintLayout,
  parseResultsImageLayout,
  printLayoutFormFieldsFromDb,
  imageLayoutFormFieldsFromDb,
  type PrintLayoutFormFields,
  type ImageLayoutFormFields,
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

export const LAB_RESULT_TEMPLATES_TABLE = "lab_result_templates" as const;

export type LabResultTemplateSignatureSlot = {
  name: LabResultPrintPosition | null;
  license: LabResultPrintPosition | null;
  signature: LabResultImagePosition | null;
};

export type LabResultTemplateSignatureLayout = {
  medtech: LabResultTemplateSignatureSlot;
  pathologist: LabResultTemplateSignatureSlot;
};

export type LabResultTemplateRow = {
  id: string;
  code: string;
  name: string;
  file_name: string;
  sort_order: number | null;
  is_active: boolean;
  signature_layout: LabResultTemplateSignatureLayout | null;
  doh_license_print: ResultDohLicensePrint | null;
  created_at: string | null;
  updated_at: string | null;
};

const TEMPLATE_SELECT =
  "id, code, name, file_name, sort_order, is_active, signature_layout, doh_license_print, created_at, updated_at";

function parseSignatureSlot(raw: unknown): LabResultTemplateSignatureSlot {
  const empty: LabResultTemplateSignatureSlot = { name: null, license: null, signature: null };
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return empty;
  const rec = raw as Record<string, unknown>;
  const name = parseResultsPrintLayout(rec.name);
  const license = parseResultsPrintLayout(rec.license);
  const signature = parseResultsImageLayout(rec.signature);
  return { name, license, signature };
}

/** Parse `lab_result_templates.signature_layout` jsonb. */
export function parseTemplateSignatureLayout(raw: unknown): LabResultTemplateSignatureLayout | null {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const rec = raw as Record<string, unknown>;
  const medtech = parseSignatureSlot(rec.medtech);
  const pathologist = parseSignatureSlot(rec.pathologist);
  const hasAny =
    medtech.name != null ||
    medtech.license != null ||
    medtech.signature != null ||
    pathologist.name != null ||
    pathologist.license != null ||
    pathologist.signature != null;
  if (!hasAny) return null;
  return { medtech, pathologist };
}

function mapTemplateRow(row: Record<string, unknown>): LabResultTemplateRow {
  return {
    id: String(row.id ?? ""),
    code: String(row.code ?? "").trim().toUpperCase(),
    name: String(row.name ?? "").trim(),
    file_name: String(row.file_name ?? "").trim(),
    sort_order: row.sort_order == null ? null : Number(row.sort_order),
    is_active: row.is_active !== false,
    signature_layout: parseTemplateSignatureLayout(row.signature_layout),
    doh_license_print: parseResultDohLicensePrint(row.doh_license_print),
    created_at: row.created_at != null ? String(row.created_at) : null,
    updated_at: row.updated_at != null ? String(row.updated_at) : null,
  };
}

export function normalizeLabResultTemplateCode(raw: string | null | undefined): string | null {
  const c = String(raw ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, "");
  return c === "" ? null : c;
}

export function defaultLabResultTemplateFileName(code: string): string {
  return labResultsTemplatePdfFileName(code);
}

/** Absolute path under project root for a template PDF. */
export function labResultTemplatePdfAbsolutePath(fileName: string): string {
  const base = path.join(process.cwd(), LAB_RESULTS_TEMPLATES_RELATIVE_DIR);
  const safe = path.basename(fileName);
  return path.join(base, safe);
}

export function isAllowedLabResultTemplateCode(
  code: string,
  allowedCodes: ReadonlySet<string> | readonly string[],
): boolean {
  const c = normalizeLabResultTemplateCode(code);
  if (!c) return false;
  const set = allowedCodes instanceof Set ? allowedCodes : new Set(allowedCodes);
  return set.has(c);
}

export function splitAllowlistedResultsTemplateCodes(
  csv: string | null | undefined,
  allowedCodes: ReadonlySet<string> | readonly string[],
): string[] {
  const out: string[] = [];
  for (const part of String(csv ?? "").split(",")) {
    const c = part.trim().toUpperCase();
    if (c && isAllowedLabResultTemplateCode(c, allowedCodes)) out.push(c);
  }
  return out;
}

export function sortLabResultTemplateCodes(
  codes: Iterable<string>,
  templates: readonly Pick<LabResultTemplateRow, "code" | "sort_order">[],
): string[] {
  const uniq = [
    ...new Set(
      [...codes]
        .map((c) => String(c ?? "").trim().toUpperCase())
        .filter((c) => c !== ""),
    ),
  ];
  const idx = new Map(
    templates.map((t, i) => [
      t.code.toUpperCase(),
      t.sort_order != null && Number.isFinite(t.sort_order) ? Number(t.sort_order) : 1000 + i,
    ]),
  );
  uniq.sort((a, b) => {
    const ia = idx.has(a) ? (idx.get(a) as number) : 10000;
    const ib = idx.has(b) ? (idx.get(b) as number) : 10000;
    if (ia !== ib) return ia - ib;
    return a.localeCompare(b, undefined, { sensitivity: "base" });
  });
  return uniq;
}

/** @deprecated Use sortLabResultTemplateCodes */
export function sortResultsTemplateCodes(
  codes: Iterable<string>,
  templates: readonly Pick<LabResultTemplateRow, "code" | "sort_order">[],
): string[] {
  return sortLabResultTemplateCodes(codes, templates);
}

export async function fetchLabResultTemplates(
  db: SupabaseClient,
  opts?: { activeOnly?: boolean },
): Promise<{ templates: LabResultTemplateRow[]; error: string | null }> {
  let q = db.from(LAB_RESULT_TEMPLATES_TABLE).select(TEMPLATE_SELECT);
  if (opts?.activeOnly) q = q.eq("is_active", true);
  const { data, error } = await q
    .order("sort_order", { ascending: true, nullsFirst: false })
    .order("code", { ascending: true });
  if (error) return { templates: [], error: error.message };
  const templates = (data ?? []).map((r) => mapTemplateRow(r as Record<string, unknown>));
  return { templates, error: null };
}

export async function fetchActiveLabResultTemplateCodes(
  db: SupabaseClient,
): Promise<{ codes: Set<string>; templates: LabResultTemplateRow[]; error: string | null }> {
  const res = await fetchLabResultTemplates(db, { activeOnly: true });
  if (res.error) return { codes: new Set(), templates: [], error: res.error };
  const codes = new Set(res.templates.map((t) => t.code));
  return { codes, templates: res.templates, error: null };
}

export async function fetchLabResultTemplateByCode(
  db: SupabaseClient,
  code: string,
): Promise<{ template: LabResultTemplateRow | null; error: string | null }> {
  const c = normalizeLabResultTemplateCode(code);
  if (!c) return { template: null, error: "Invalid template code." };
  const { data, error } = await db
    .from(LAB_RESULT_TEMPLATES_TABLE)
    .select(TEMPLATE_SELECT)
    .eq("code", c)
    .maybeSingle();
  if (error) return { template: null, error: error.message };
  if (!data) return { template: null, error: null };
  return { template: mapTemplateRow(data as Record<string, unknown>), error: null };
}

export function buildSignatureLayoutJsonFromForm(
  medtechName: LabResultPrintPosition | null,
  medtechLicense: LabResultPrintPosition | null,
  medtechSignature: LabResultImagePosition | null,
  pathologistName: LabResultPrintPosition | null,
  pathologistLicense: LabResultPrintPosition | null,
  pathologistSignature: LabResultImagePosition | null,
): LabResultTemplateSignatureLayout | null {
  const layout: LabResultTemplateSignatureLayout = {
    medtech: { name: medtechName, license: medtechLicense, signature: medtechSignature },
    pathologist: { name: pathologistName, license: pathologistLicense, signature: pathologistSignature },
  };
  const hasAny =
    medtechName != null ||
    medtechLicense != null ||
    medtechSignature != null ||
    pathologistName != null ||
    pathologistLicense != null ||
    pathologistSignature != null;
  return hasAny ? layout : null;
}

function parsePositionField(raw: unknown): LabResultPrintPosition | null {
  if (raw === undefined || raw === null) return null;
  return parseResultsPrintLayout(raw);
}

/** Parse API body `signature_layout` object. */
export function parseTemplateSignatureLayoutInput(
  raw: unknown,
): { ok: true; value: LabResultTemplateSignatureLayout | null } | { ok: false; error: string } {
  if (raw === undefined || raw === null) return { ok: true, value: null };
  if (typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "signature_layout must be an object." };
  }
  const rec = raw as Record<string, unknown>;
  const medRaw = rec.medtech;
  const pathRaw = rec.pathologist;
  const medtech =
    medRaw != null && typeof medRaw === "object" && !Array.isArray(medRaw)
      ? {
          name: parsePositionField((medRaw as Record<string, unknown>).name),
          license: parsePositionField((medRaw as Record<string, unknown>).license),
          signature: parseResultsImageLayout((medRaw as Record<string, unknown>).signature),
        }
      : { name: null, license: null, signature: null };
  const pathologist =
    pathRaw != null && typeof pathRaw === "object" && !Array.isArray(pathRaw)
      ? {
          name: parsePositionField((pathRaw as Record<string, unknown>).name),
          license: parsePositionField((pathRaw as Record<string, unknown>).license),
          signature: parseResultsImageLayout((pathRaw as Record<string, unknown>).signature),
        }
      : { name: null, license: null, signature: null };
  const value = buildSignatureLayoutJsonFromForm(
    medtech.name,
    medtech.license,
    medtech.signature,
    pathologist.name,
    pathologist.license,
    pathologist.signature,
  );
  return { ok: true, value };
}

export const LAB_RESULT_TEMPLATE_PDF_MAX_BYTES = 15 * 1024 * 1024;

export type TemplateSignatureLayoutFormFields = {
  medtech_name: PrintLayoutFormFields;
  medtech_license: PrintLayoutFormFields;
  medtech_signature: ImageLayoutFormFields;
  pathologist_name: PrintLayoutFormFields;
  pathologist_license: PrintLayoutFormFields;
  pathologist_signature: ImageLayoutFormFields;
};

export function emptyTemplateSignatureLayoutFormFields(): TemplateSignatureLayoutFormFields {
  return {
    medtech_name: emptyPrintLayoutFormFields(),
    medtech_license: emptyPrintLayoutFormFields(),
    medtech_signature: emptyImageLayoutFormFields(),
    pathologist_name: emptyPrintLayoutFormFields(),
    pathologist_license: emptyPrintLayoutFormFields(),
    pathologist_signature: emptyImageLayoutFormFields(),
  };
}

export function templateSignatureLayoutFormFieldsFromDb(
  layout: LabResultTemplateSignatureLayout | null,
): TemplateSignatureLayoutFormFields {
  const empty = emptyTemplateSignatureLayoutFormFields();
  if (!layout) return empty;
  return {
    medtech_name: printLayoutFormFieldsFromDb(layout.medtech.name),
    medtech_license: printLayoutFormFieldsFromDb(layout.medtech.license),
    medtech_signature: imageLayoutFormFieldsFromDb(layout.medtech.signature),
    pathologist_name: printLayoutFormFieldsFromDb(layout.pathologist.name),
    pathologist_license: printLayoutFormFieldsFromDb(layout.pathologist.license),
    pathologist_signature: imageLayoutFormFieldsFromDb(layout.pathologist.signature),
  };
}

function parseSlotFromFormFields(
  fields: PrintLayoutFormFields,
): { ok: true; value: LabResultPrintPosition | null } | { ok: false; error: string } {
  return buildPrintLayoutJsonFromFormFields(fields);
}

function parseImageSlotFromFormFields(
  fields: ImageLayoutFormFields,
): { ok: true; value: LabResultImagePosition | null } | { ok: false; error: string } {
  return buildImageLayoutJsonFromFormFields(fields);
}

export function buildTemplateSignatureLayoutFromFormFields(
  fields: TemplateSignatureLayoutFormFields,
): { ok: true; value: LabResultTemplateSignatureLayout | null } | { ok: false; error: string } {
  const medName = parseSlotFromFormFields(fields.medtech_name);
  if (!medName.ok) return medName;
  const medLic = parseSlotFromFormFields(fields.medtech_license);
  if (!medLic.ok) return medLic;
  const medSig = parseImageSlotFromFormFields(fields.medtech_signature);
  if (!medSig.ok) return medSig;
  const pathName = parseSlotFromFormFields(fields.pathologist_name);
  if (!pathName.ok) return pathName;
  const pathLic = parseSlotFromFormFields(fields.pathologist_license);
  if (!pathLic.ok) return pathLic;
  const pathSig = parseImageSlotFromFormFields(fields.pathologist_signature);
  if (!pathSig.ok) return pathSig;
  const value = buildSignatureLayoutJsonFromForm(
    medName.value,
    medLic.value,
    medSig.value,
    pathName.value,
    pathLic.value,
    pathSig.value,
  );
  return { ok: true, value };
}
