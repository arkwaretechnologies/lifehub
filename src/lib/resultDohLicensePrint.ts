import type { LabResultPrintPosition, PrintLayoutFormFields } from "@/lib/labResultsPrintLayout";
import {
  buildPrintLayoutJsonFromFormFields,
  emptyPrintLayoutFormFields,
  parseResultsPrintLayout,
  printLayoutFormFieldsFromDb,
} from "@/lib/labResultsPrintLayout";
import type { PDFPage, PDFFont, RGB } from "pdf-lib";
import { rgb } from "pdf-lib";

/** Gray text for DOH license number on result prints. */
export const RESULT_PRINT_TEXT_GRAY: RGB = rgb(0.45, 0.45, 0.45);

export type ResultDohLicensePrint = {
  license_no: string;
  refX: number;
  refFromTop: number;
  fontSize?: number;
  maxWidth?: number;
  lineHeight?: number;
  pageIndex?: number;
};

export type DohLicensePrintFormFields = {
  license_no: string;
  layout: PrintLayoutFormFields;
};

export function emptyDohLicensePrintFormFields(): DohLicensePrintFormFields {
  return {
    license_no: "",
    layout: emptyPrintLayoutFormFields(),
  };
}

/** Parse `doh_license_print` jsonb from template tables. */
export function parseResultDohLicensePrint(raw: unknown): ResultDohLicensePrint | null {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const rec = raw as Record<string, unknown>;
  const licenseNo =
    rec.license_no != null && String(rec.license_no).trim() !== ""
      ? String(rec.license_no).trim()
      : "";
  if (!licenseNo) return null;

  const position = parseResultsPrintLayout(rec);
  if (!position) return null;

  return {
    license_no: licenseNo,
    refX: position.refX,
    refFromTop: position.refFromTop,
    ...(position.fontSize != null ? { fontSize: position.fontSize } : {}),
    ...(position.maxWidth != null ? { maxWidth: position.maxWidth } : {}),
    ...(position.lineHeight != null ? { lineHeight: position.lineHeight } : {}),
    ...(position.pageIndex != null ? { pageIndex: position.pageIndex } : {}),
  };
}

export function dohLicensePrintFormFieldsFromDb(raw: unknown): DohLicensePrintFormFields {
  const parsed = parseResultDohLicensePrint(raw);
  if (!parsed) return emptyDohLicensePrintFormFields();
  return {
    license_no: parsed.license_no,
    layout: printLayoutFormFieldsFromDb(parsed),
  };
}

export function buildResultDohLicensePrintFromFormFields(
  fields: DohLicensePrintFormFields,
): { ok: true; value: ResultDohLicensePrint | null } | { ok: false; error: string } {
  const licenseNo = fields.license_no.trim();
  const layoutBuilt = buildPrintLayoutJsonFromFormFields(fields.layout);
  if (!layoutBuilt.ok) return layoutBuilt;

  if (!licenseNo && !layoutBuilt.value) {
    return { ok: true, value: null };
  }
  if (!licenseNo) {
    return { ok: true, value: null };
  }
  if (!layoutBuilt.value) {
    return {
      ok: false,
      error: "DOH License No requires valid X and Y (from top) coordinates.",
    };
  }

  const pos = layoutBuilt.value;
  return {
    ok: true,
    value: {
      license_no: licenseNo,
      refX: pos.refX,
      refFromTop: pos.refFromTop,
      ...(pos.fontSize != null ? { fontSize: pos.fontSize } : {}),
      ...(pos.maxWidth != null ? { maxWidth: pos.maxWidth } : {}),
      ...(pos.lineHeight != null ? { lineHeight: pos.lineHeight } : {}),
      ...(pos.pageIndex != null ? { pageIndex: pos.pageIndex } : {}),
    },
  };
}

export function resultDohLicensePrintToJson(
  value: ResultDohLicensePrint | null,
): Record<string, unknown> | null {
  if (!value) return null;
  const out: Record<string, unknown> = {
    license_no: value.license_no,
    refX: value.refX,
    refFromTop: value.refFromTop,
  };
  if (value.fontSize != null) out.fontSize = value.fontSize;
  if (value.maxWidth != null) out.maxWidth = value.maxWidth;
  if (value.lineHeight != null) out.lineHeight = value.lineHeight;
  if (value.pageIndex != null) out.pageIndex = value.pageIndex;
  return out;
}

export function parseResultDohLicensePrintInput(
  raw: unknown,
): { ok: true; value: ResultDohLicensePrint | null } | { ok: false; error: string } {
  if (raw === undefined || raw === null) return { ok: true, value: null };
  if (typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "doh_license_print must be an object." };
  }
  const rec = raw as Record<string, unknown>;
  const licenseNo = rec.license_no != null ? String(rec.license_no).trim() : "";
  const layoutFields: DohLicensePrintFormFields = {
    license_no: licenseNo,
    layout: {
      print_ref_x: rec.refX != null ? String(rec.refX) : "",
      print_ref_from_top: rec.refFromTop != null ? String(rec.refFromTop) : "",
      print_font_size: rec.fontSize != null ? String(rec.fontSize) : "",
      print_max_width: rec.maxWidth != null ? String(rec.maxWidth) : "",
      print_line_height: rec.lineHeight != null ? String(rec.lineHeight) : "",
      print_page_index: rec.pageIndex != null ? String(rec.pageIndex) : "",
    },
  };
  return buildResultDohLicensePrintFromFormFields(layoutFields);
}

type DrawAtTopRefFn = (
  page: PDFPage,
  text: string,
  refX: number,
  refFromTop: number,
  refSize: number,
  font: PDFFont,
  opts?: { maxWidth?: number; color?: RGB; lineHeight?: number },
) => void;

/** Draw DOH license number in gray when slot has value + position. */
export function drawDohLicenseNo(
  page: PDFPage,
  slot: ResultDohLicensePrint | null | undefined,
  font: PDFFont,
  drawAtTopRef: DrawAtTopRefFn,
  pageIndex = 0,
): void {
  if (!slot) return;
  const pageIdx = slot.pageIndex ?? 0;
  if (pageIdx !== pageIndex) return;

  const text = slot.license_no.trim();
  if (!text) return;

  drawAtTopRef(page, text, slot.refX, slot.refFromTop, slot.fontSize ?? 9, font, {
    maxWidth: slot.maxWidth,
    lineHeight: slot.lineHeight,
    color: RESULT_PRINT_TEXT_GRAY,
  });
}
