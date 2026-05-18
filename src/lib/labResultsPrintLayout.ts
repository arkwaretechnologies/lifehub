/**
 * Lab result PDF overlay layout: coordinates live on `lab_tests.results_print_layout` (jsonb),
 * loaded with each request item. See `parseResultsPrintLayout` / `parseResultsPrintLayouts`.
 * Multi-template: comma-separated `results_template_code` with a JSON **array** of position objects
 * in the same order (index-aligned). Legacy single object still supported.
 * Regenerate seed SQL after changing defaults: `node scripts/gen-lab-results-print-layout-seed.mjs`
 * and replace `supabase/migrations/20260512120000_lab_tests_results_print_layout.sql` body if needed.
 */

export type LabResultPrintPosition = {
  refX: number;
  refFromTop: number;
  fontSize?: number;
  maxWidth?: number;
  /** 0-based page within that template PDF (default 0). */
  pageIndex?: number;
};

/** Parse JSON string or pass through parsed jsonb value. */
function unwrapLayoutJson(raw: unknown): unknown {
  if (typeof raw === "string") {
    const s = raw.trim();
    if (!s) return null;
    try {
      return JSON.parse(s) as unknown;
    } catch {
      return null;
    }
  }
  return raw;
}

/** One overlay slot; `o` must be a plain object (not array). */
function parseOnePosition(o: unknown): LabResultPrintPosition | null {
  if (o == null || typeof o !== "object" || Array.isArray(o)) return null;
  const rec = o as Record<string, unknown>;
  const refX = Number(rec.refX);
  const refFromTop = Number(rec.refFromTop);
  if (!Number.isFinite(refX) || !Number.isFinite(refFromTop)) return null;

  let fontSize: number | undefined;
  if (rec.fontSize != null) {
    const fs = Number(rec.fontSize);
    if (Number.isFinite(fs) && fs > 0) fontSize = fs;
  }
  let maxWidth: number | undefined;
  if (rec.maxWidth != null) {
    const mw = Number(rec.maxWidth);
    if (Number.isFinite(mw) && mw > 0) maxWidth = mw;
  }
  let pageIndex: number | undefined;
  if (rec.pageIndex != null) {
    const pi = Number(rec.pageIndex);
    if (Number.isFinite(pi) && pi >= 0 && Number.isInteger(pi)) pageIndex = pi;
  }

  return { refX, refFromTop, fontSize, maxWidth, pageIndex };
}

/** Parse `lab_tests.results_print_layout` as a single object (legacy). */
export function parseResultsPrintLayout(raw: unknown): LabResultPrintPosition | null {
  const v = unwrapLayoutJson(raw);
  if (v == null || typeof v !== "object" || Array.isArray(v)) return null;
  return parseOnePosition(v);
}

/**
 * Parse `lab_tests.results_print_layout` as one object or an array of objects (multi-template).
 * Returns `(LabResultPrintPosition | null)[]` — same length as the source array when `raw` is a JSON array;
 * a single object becomes a one-element array (element may be null if invalid).
 */
export function parseResultsPrintLayouts(raw: unknown): (LabResultPrintPosition | null)[] {
  const v = unwrapLayoutJson(raw);
  if (v == null) return [];
  if (Array.isArray(v)) {
    return v.map((el) => parseOnePosition(el));
  }
  if (typeof v === "object") {
    const one = parseOnePosition(v);
    return [one];
  }
  return [];
}

/** Layout slot for `currentTemplateCode` when item carries comma-separated codes + parallel `results_print_layouts`. */
export function getPrintLayoutForTemplateCode(
  results_template_code: string | null | undefined,
  results_print_layouts: readonly (LabResultPrintPosition | null)[] | null | undefined,
  currentTemplateCode: string,
): LabResultPrintPosition | null {
  const tpl = currentTemplateCode.trim().toUpperCase();
  const codes = (results_template_code ?? "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter((c) => c !== "");
  const j = codes.indexOf(tpl);
  if (j < 0) return null;
  const layouts = results_print_layouts ?? [];
  const pos = layouts[j] ?? null;
  return pos != null && Number.isFinite(pos.refX) && Number.isFinite(pos.refFromTop) ? pos : null;
}

export type PrintLayoutFormFields = {
  print_ref_x: string;
  print_ref_from_top: string;
  print_font_size: string;
  print_max_width: string;
  print_page_index: string;
};

export function emptyPrintLayoutFormFields(): PrintLayoutFormFields {
  return {
    print_ref_x: "",
    print_ref_from_top: "",
    print_font_size: "",
    print_max_width: "",
    print_page_index: "",
  };
}

/** Map DB `results_print_layout` (single object) to Settings form fields. */
export function printLayoutFormFieldsFromDb(rawLayout: unknown): PrintLayoutFormFields {
  const pos = parseResultsPrintLayout(rawLayout);
  if (!pos) return emptyPrintLayoutFormFields();
  return {
    print_ref_x: String(pos.refX),
    print_ref_from_top: String(pos.refFromTop),
    print_font_size: pos.fontSize != null ? String(pos.fontSize) : "",
    print_max_width: pos.maxWidth != null ? String(pos.maxWidth) : "",
    print_page_index: pos.pageIndex != null ? String(pos.pageIndex) : "",
  };
}

function parseOptionalPositiveNumber(raw: string): number | undefined {
  const t = raw.trim();
  if (t === "") return undefined;
  const n = Number(t);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function parseOptionalNonNegativeInt(raw: string): number | undefined {
  const t = raw.trim();
  if (t === "") return undefined;
  const n = Number.parseInt(t, 10);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

/** Build jsonb value for `lab_tests.results_print_layout` from Settings form fields. */
export function buildPrintLayoutJsonFromFormFields(
  fields: PrintLayoutFormFields,
): { ok: true; value: LabResultPrintPosition | null } | { ok: false; error: string } {
  const hasAny = [
    fields.print_ref_x,
    fields.print_ref_from_top,
    fields.print_font_size,
    fields.print_max_width,
    fields.print_page_index,
  ].some((s) => s.trim() !== "");

  if (!hasAny) return { ok: true, value: null };

  const refX = Number(fields.print_ref_x.trim());
  const refFromTop = Number(fields.print_ref_from_top.trim());
  if (!Number.isFinite(refX) || !Number.isFinite(refFromTop)) {
    return {
      ok: false,
      error: "Print position requires valid X and Y (from top) coordinates.",
    };
  }

  const fontSize = parseOptionalPositiveNumber(fields.print_font_size);
  if (fields.print_font_size.trim() !== "" && fontSize === undefined) {
    return { ok: false, error: "Font size must be a positive number or empty." };
  }
  const maxWidth = parseOptionalPositiveNumber(fields.print_max_width);
  if (fields.print_max_width.trim() !== "" && maxWidth === undefined) {
    return { ok: false, error: "Max width must be a positive number or empty." };
  }
  const pageIndex = parseOptionalNonNegativeInt(fields.print_page_index);
  if (fields.print_page_index.trim() !== "" && pageIndex === undefined) {
    return { ok: false, error: "Page index must be a whole number ≥ 0 or empty." };
  }

  const value: LabResultPrintPosition = { refX, refFromTop };
  if (fontSize != null) value.fontSize = fontSize;
  if (maxWidth != null) value.maxWidth = maxWidth;
  if (pageIndex != null) value.pageIndex = pageIndex;
  return { ok: true, value };
}

/** Parse API body `results_print_layout` (object or null). */
export function parseResultsPrintLayoutInput(
  raw: unknown,
): { ok: true; value: LabResultPrintPosition | null } | { ok: false; error: string } {
  if (raw === undefined || raw === null) return { ok: true, value: null };
  const pos = parseResultsPrintLayout(raw);
  if (!pos) {
    return {
      ok: false,
      error: "results_print_layout must be an object with numeric refX and refFromTop.",
    };
  }
  return { ok: true, value: pos };
}

/** Stacked overflow when a test has no valid `results_print_layout` (first page of template only). */
export const LAB_PRINT_FALLBACK = {
  refX: 72,
  firstFromTop: 268,
  rowStep: 13.5,
  fontSize: 8,
  maxWidth: 500,
  maxLines: 34,
} as const;
