import type { LabRequestHeaderView, LabRequestItemView } from "@/app/api/laboratory/lab-request/route";
import { authenticatedFetch } from "@/lib/authenticatedFetch";
import { compareLabTestSortOrder, labResultsTemplateCodeFromCatalogTestCode } from "@/lib/labTests";
import { computeLabResultAutoFlag } from "@/lib/labResultAutoFlag";
import type { LabResultSignatoriesMap } from "@/lib/labResultSignatories";
import type { LabResultTemplateSignatureLayout } from "@/lib/labResultTemplates";
import type { LabResultImagePosition, LabResultInternationalPrintPosition, LabResultPrintPosition } from "@/lib/labResultsPrintLayout";
import { fetchLabSignatorySignatureBytes } from "@/lib/signaturePrintFetch";
import { embedSignatureBytes } from "@/lib/signaturePdfEmbed";
import { drawLabResultsPatientHeader } from "@/lib/labResultsPatientHeader";
import {
  isAllowedLabResultTemplateCode,
  sortLabResultTemplateCodes,
  splitAllowlistedResultsTemplateCodes,
} from "@/lib/labResultTemplates";
import {
  effectivePrintLineHeight,
  getPrintLayoutForTemplateCode,
  LAB_PRINT_FALLBACK,
  LAB_PRINT_SUMMARY,
} from "@/lib/labResultsPrintLayout";
import {
  formatPrintedSiResult,
  isBloodChemSiTemplateCode,
  isBloodChemSiTestCode,
} from "@/lib/labBloodChemSiConversion";
import type { PDFDocument, PDFFont } from "pdf-lib";
import { rgb } from "pdf-lib";

async function embedLabResultFonts(doc: PDFDocument): Promise<PDFFont> {
  const { StandardFonts } = await import("pdf-lib");
  let font = await doc.embedFont(StandardFonts.Helvetica);

  try {
    const fontkit = (await import("@pdf-lib/fontkit")).default;
    doc.registerFontkit(fontkit);

    const candidates = ["/fonts/cambria.ttf", "/fonts/Cambria.ttf"];
    for (const url of candidates) {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) continue;
      font = await doc.embedFont(await res.arrayBuffer(), { subset: true });
      break;
    }
  } catch {
    // keep Helvetica fallback
  }

  return font;
}

/** US Letter reference size (points) for coordinate calibration; scaled to each template page. */
const REF_W = 612;
const REF_H = 792;

type TemplateRegistry = {
  allowedCodes: Set<string>;
  signatureByCode: Map<string, LabResultTemplateSignatureLayout | null>;
  sortTemplates: Array<{ code: string; sort_order: number | null }>;
};

async function fetchTemplateRegistry(): Promise<TemplateRegistry | null> {
  const res = await authenticatedFetch("/api/laboratory/lab-result-templates?activeOnly=false", {
    cache: "no-store",
  });
  if (!res.ok) return null;
  const json = (await res.json().catch(() => null)) as {
    templates?: Array<{
      code?: string;
      sort_order?: number | null;
      signature_layout?: LabResultTemplateSignatureLayout | null;
    }>;
  } | null;
  const templates = json?.templates ?? [];
  const allowedCodes = new Set<string>();
  const signatureByCode = new Map<string, LabResultTemplateSignatureLayout | null>();
  const sortTemplates: Array<{ code: string; sort_order: number | null }> = [];
  for (const t of templates) {
    const code = String(t.code ?? "").trim().toUpperCase();
    if (!code) continue;
    allowedCodes.add(code);
    signatureByCode.set(code, t.signature_layout ?? null);
    sortTemplates.push({ code, sort_order: t.sort_order ?? null });
  }
  return { allowedCodes, signatureByCode, sortTemplates };
}

async function fetchSignatoriesForPrint(): Promise<LabResultSignatoriesMap | null> {
  const res = await authenticatedFetch("/api/laboratory/lab-result-signatories", { cache: "no-store" });
  if (!res.ok) return null;
  const json = (await res.json().catch(() => null)) as {
    signatories?: LabResultSignatoriesMap;
  } | null;
  return json?.signatories ?? null;
}

function effectiveTemplateCodes(it: LabRequestItemView, allowedCodes: Set<string>): string[] {
  const fromApi = splitAllowlistedResultsTemplateCodes(it.results_template_code, allowedCodes);
  if (fromApi.length > 0) return fromApi;
  const inferred = labResultsTemplateCodeFromCatalogTestCode(it.test_code);
  const c = (inferred ?? "").trim().toUpperCase();
  if (c && isAllowedLabResultTemplateCode(c, allowedCodes)) return [c];
  return [];
}

function drawSignatureSlot(
  page: import("pdf-lib").PDFPage,
  text: string | null | undefined,
  pos: LabResultPrintPosition | null,
  font: import("pdf-lib").PDFFont,
): void {
  if (!pos) return;
  const t = (text ?? "").trim();
  if (!t) return;
  drawAtTopRef(page, t, pos.refX, pos.refFromTop, pos.fontSize ?? 9, font, { maxWidth: pos.maxWidth });
}

type SignatureImageCache = {
  medtech: Uint8Array | null;
  pathologist: Uint8Array | null;
};

async function embedSignatureImage(
  doc: import("pdf-lib").PDFDocument,
  bytes: Uint8Array,
  contentType: string | null,
): Promise<import("pdf-lib").PDFImage | null> {
  return embedSignatureBytes(doc, bytes, contentType);
}

function drawSignatureImageSlot(
  page: import("pdf-lib").PDFPage,
  image: import("pdf-lib").PDFImage,
  pos: LabResultImagePosition | null,
): void {
  if (!pos) return;
  const { height } = page.getSize();
  const { sx, sy } = scaleRefToPage(page);
  const x = pos.refX * sx;
  const y = height - pos.refFromTop * sy - pos.refHeight * sy;
  page.drawImage(image, {
    x,
    y,
    width: pos.refWidth * sx,
    height: pos.refHeight * sy,
  });
}

async function loadLabSignatureImageCache(): Promise<SignatureImageCache> {
  const [medtechRes, pathologistRes] = await Promise.all([
    fetchLabSignatorySignatureBytes("medtech"),
    fetchLabSignatorySignatureBytes("pathologist"),
  ]);
  return {
    medtech: medtechRes.bytes,
    pathologist: pathologistRes.bytes,
  };
}

async function drawTemplateSignatures(
  doc: import("pdf-lib").PDFDocument,
  page: import("pdf-lib").PDFPage,
  layout: LabResultTemplateSignatureLayout | null | undefined,
  signatories: LabResultSignatoriesMap | null | undefined,
  font: import("pdf-lib").PDFFont,
  imageCache: SignatureImageCache,
  embeddedImages: Map<string, import("pdf-lib").PDFImage>,
): Promise<void> {
  if (!layout || !signatories) return;

  if (imageCache.medtech && layout.medtech.signature) {
    let img = embeddedImages.get("medtech");
    if (!img) {
      img = (await embedSignatureImage(doc, imageCache.medtech, "image/png")) ?? undefined;
      if (img) embeddedImages.set("medtech", img);
    }
    if (img) drawSignatureImageSlot(page, img, layout.medtech.signature);
  }
  if (imageCache.pathologist && layout.pathologist.signature) {
    let img = embeddedImages.get("pathologist");
    if (!img) {
      img = (await embedSignatureImage(doc, imageCache.pathologist, "image/png")) ?? undefined;
      if (img) embeddedImages.set("pathologist", img);
    }
    if (img) drawSignatureImageSlot(page, img, layout.pathologist.signature);
  }

  drawSignatureSlot(page, signatories.medtech.full_name, layout.medtech.name, font);
  drawSignatureSlot(page, signatories.medtech.license_no, layout.medtech.license, font);
  drawSignatureSlot(page, signatories.pathologist.full_name, layout.pathologist.name, font);
  drawSignatureSlot(page, signatories.pathologist.license_no, layout.pathologist.license, font);
}

function scaleRefToPage(page: { getSize(): { width: number; height: number } }): { sx: number; sy: number } {
  const { width, height } = page.getSize();
  return { sx: width / REF_W, sy: height / REF_H };
}

const PRINT_RESULT_BLACK = rgb(0, 0, 0);
const PRINT_RESULT_ABOVE_RANGE_RED = rgb(0.82, 0.2, 0.12);

/** Printed analyte line: result value only (uppercase). */
function formatPrintedResultValue(it: LabRequestItemView): string {
  const raw = (it.result_value ?? "").trim();
  return raw ? raw.toUpperCase() : "—";
}

/** Red when numeric result is above the sex-adjusted reference range; otherwise black. */
function printTextColorForResult(
  it: LabRequestItemView,
  patientSex: string | null | undefined,
): ReturnType<typeof rgb> {
  const auto = computeLabResultAutoFlag(it.result_value, it.reference_range, patientSex);
  if (auto === "High") return PRINT_RESULT_ABOVE_RANGE_RED;
  return PRINT_RESULT_BLACK;
}

function drawAtTopRef(
  page: import("pdf-lib").PDFPage,
  text: string,
  refX: number,
  refFromTop: number,
  refSize: number,
  font: import("pdf-lib").PDFFont,
  opts?: { maxWidth?: number; color?: ReturnType<typeof rgb>; lineHeight?: number },
): void {
  const t = text.trim();
  if (!t) return;
  const { height } = page.getSize();
  const { sx, sy } = scaleRefToPage(page);
  const scale = Math.min(sx, sy);
  const x = refX * sx;
  const fromTop = refFromTop * sy;
  const size = refSize * scale;
  const y = height - fromTop;
  const color = opts?.color ?? PRINT_RESULT_BLACK;
  page.drawText(t, {
    x,
    y,
    size,
    font,
    maxWidth: opts?.maxWidth != null ? opts.maxWidth * sx : undefined,
    lineHeight: opts?.lineHeight != null ? opts.lineHeight * scale : undefined,
    color,
  });
}

function printPdfBlob(blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const iframe = document.createElement("iframe");
  iframe.setAttribute("title", "Lab results print");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "none";
  iframe.style.visibility = "hidden";
  iframe.src = url;
  document.body.appendChild(iframe);
  iframe.onload = () => {
    const win = iframe.contentWindow;
    if (win != null) {
      win.focus();
      win.print();
    }
    window.setTimeout(() => {
      URL.revokeObjectURL(url);
      iframe.remove();
    }, 120_000);
  };
}

function formatResultLine(it: LabRequestItemView): string {
  return formatPrintedResultValue(it);
}

function pushWrappedParagraph(lines: string[], paragraph: string, maxChars: number): void {
  const words = paragraph.split(/\s+/).filter(Boolean);
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length <= maxChars) {
      cur = next;
    } else {
      if (cur) lines.push(cur);
      if (w.length > maxChars) {
        for (let i = 0; i < w.length; i += maxChars) {
          lines.push(w.slice(i, i + maxChars));
        }
        cur = "";
      } else {
        cur = w;
      }
    }
  }
  if (cur) lines.push(cur);
}

/**
 * Overlay results: each item uses `results_print_layouts` aligned to `results_template_code` for this
 * template stem; missing/invalid layouts use stacked fallback on page 0 of the template block.
 */
/** Default SI column offset from conventional result column on dual-system blood chem rows. */
const BLOODCHEM_SI_REF_X_OFFSET = 125;

function bloodChemInternationalPrintPosition(pos: LabResultPrintPosition): LabResultInternationalPrintPosition {
  if (pos.international) return pos.international;
  return {
    refX: pos.refX + BLOODCHEM_SI_REF_X_OFFSET,
    refFromTop: pos.refFromTop,
    fontSize: pos.fontSize,
    maxWidth: pos.maxWidth,
    pageIndex: pos.pageIndex,
  };
}

function drawGroupResultsForTemplate(
  merged: PDFDocument,
  templatePageStart: number,
  pageCount: number,
  groupItems: LabRequestItemView[],
  font: import("pdf-lib").PDFFont,
  currentTemplateCode: string,
  patientSex: string | null | undefined,
): void {
  const sorted = [...groupItems].sort((a, b) =>
    compareLabTestSortOrder(
      { sort_order: a.test_sort_order, name: a.test_name, tieId: a.lab_test_id },
      { sort_order: b.test_sort_order, name: b.test_name, tieId: b.lab_test_id },
    ),
  );
  const fallback: LabRequestItemView[] = [];

  for (const it of sorted) {
    const pos = getPrintLayoutForTemplateCode(
      it.results_template_code,
      it.results_print_layouts,
      currentTemplateCode,
    );
    if (pos) {
      const pi = Math.min(pos.pageIndex ?? 0, Math.max(0, pageCount - 1));
      const page = merged.getPage(templatePageStart + pi);
      const line = formatPrintedResultValue(it);
      const fs = pos.fontSize ?? 8;
      drawAtTopRef(page, line, pos.refX, pos.refFromTop, fs, font, {
        maxWidth: pos.maxWidth,
        lineHeight: effectivePrintLineHeight(pos, fs),
        color: printTextColorForResult(it, patientSex),
      });

      const intlPos =
        isBloodChemSiTemplateCode(currentTemplateCode) && isBloodChemSiTestCode(it.test_code)
          ? bloodChemInternationalPrintPosition(pos)
          : null;
      if (intlPos) {
        const siLine = formatPrintedSiResult(it.test_code, it.result_value);
        const intlPi = Math.min(intlPos.pageIndex ?? pi, Math.max(0, pageCount - 1));
        const intlPage = merged.getPage(templatePageStart + intlPi);
        const intlFs = intlPos.fontSize ?? fs;
        drawAtTopRef(intlPage, siLine, intlPos.refX, intlPos.refFromTop, intlFs, font, {
          maxWidth: intlPos.maxWidth ?? pos.maxWidth,
          lineHeight: effectivePrintLineHeight(intlPos, intlFs),
          color: printTextColorForResult(it, patientSex),
        });
      }
    } else {
      fallback.push(it);
    }
  }

  if (fallback.length === 0) return;
  const page0 = merged.getPage(templatePageStart);
  let fromTop = LAB_PRINT_FALLBACK.firstFromTop;
  let n = 0;
  for (const it of fallback) {
    if (n >= LAB_PRINT_FALLBACK.maxLines) break;
    const line = formatPrintedResultValue(it);
    drawAtTopRef(page0, line, LAB_PRINT_FALLBACK.refX, fromTop, LAB_PRINT_FALLBACK.fontSize, font, {
      maxWidth: LAB_PRINT_FALLBACK.maxWidth,
      lineHeight: LAB_PRINT_FALLBACK.lineHeight,
      color: printTextColorForResult(it, patientSex),
    });
    fromTop += LAB_PRINT_FALLBACK.rowStep;
    n += 1;
  }
}

async function fetchLabResultTemplateBytes(code: string): Promise<Uint8Array | null> {
  const res = await authenticatedFetch(`/api/laboratory/lab-result-template?code=${encodeURIComponent(code)}`, {
    cache: "no-store",
  });
  if (!res.ok) return null;
  const buf = await res.arrayBuffer();
  return new Uint8Array(buf);
}

export async function openLabResultsPrintWindow(args: {
  header: LabRequestHeaderView;
  items: LabRequestItemView[];
}): Promise<boolean> {
  const { header, items } = args;
  if (!items.length) return false;

  try {
    const [registry, signatories, imageCache] = await Promise.all([
      fetchTemplateRegistry(),
      fetchSignatoriesForPrint(),
      loadLabSignatureImageCache(),
    ]);
    if (!registry || !signatories) return false;

    const { PDFDocument } = await import("pdf-lib");

    const merged = await PDFDocument.create();
    const font = await embedLabResultFonts(merged);
    const mono = font;
    const embeddedSignatureImages = new Map<string, import("pdf-lib").PDFImage>();

    const byTpl = new Map<string, LabRequestItemView[]>();
    const noTemplate: LabRequestItemView[] = [];

    for (const it of items) {
      const codes = effectiveTemplateCodes(it, registry.allowedCodes);
      if (codes.length === 0) {
        noTemplate.push(it);
        continue;
      }
      for (const k of codes) {
        const list = byTpl.get(k) ?? [];
        list.push(it);
        byTpl.set(k, list);
      }
    }

    const ordered = sortLabResultTemplateCodes(byTpl.keys(), registry.sortTemplates);

    for (const code of ordered) {
      const groupItems = byTpl.get(code);
      if (!groupItems?.length) continue;

      const bytes = await fetchLabResultTemplateBytes(code);
      if (!bytes) return false;

      const src = await PDFDocument.load(bytes);
      const templatePageStart = merged.getPageCount();
      const copied = await merged.copyPages(src, src.getPageIndices());
      for (const page of copied) {
        merged.addPage(page);
      }
      const pageCount = copied.length;
      const signatureLayout = registry.signatureByCode.get(code) ?? null;
      for (let i = 0; i < pageCount; i++) {
        const page = merged.getPage(templatePageStart + i);
        drawLabResultsPatientHeader(page, header, font);
        await drawTemplateSignatures(
          merged,
          page,
          signatureLayout,
          signatories,
          font,
          imageCache,
          embeddedSignatureImages,
        );
      }
      drawGroupResultsForTemplate(
        merged,
        templatePageStart,
        pageCount,
        groupItems,
        font,
        code,
        header.patient_sex,
      );
    }

    if (noTemplate.length > 0) {
      const title = "Tests without a dedicated results form (summary)";
      const sorted = [...noTemplate].sort((a, b) =>
        compareLabTestSortOrder(
          { sort_order: a.test_sort_order, name: a.test_name, tieId: a.lab_test_id },
          { sort_order: b.test_sort_order, name: b.test_name, tieId: b.lab_test_id },
        ),
      );

      let page = merged.addPage([REF_W, REF_H]);
      drawLabResultsPatientHeader(page, header, font);
      drawAtTopRef(page, title, 48, 232, 10, font);

      let fromTop = 256;
      const lineStep = LAB_PRINT_SUMMARY.lineStep;
      const maxFromTop = REF_H - 48;
      for (const it of sorted) {
        const wrapped: string[] = [];
        pushWrappedParagraph(wrapped, formatResultLine(it), 92);
        for (const line of wrapped) {
          if (fromTop > maxFromTop) {
            page = merged.addPage([REF_W, REF_H]);
            drawLabResultsPatientHeader(page, header, font);
            drawAtTopRef(page, "(continued)", 48, 232, 9, font);
            fromTop = 256;
          }
          drawAtTopRef(page, line, 48, fromTop, LAB_PRINT_SUMMARY.fontSize, mono, {
            lineHeight: LAB_PRINT_SUMMARY.lineHeight,
            color: printTextColorForResult(it, header.patient_sex),
          });
          fromTop += lineStep;
        }
      }
    }

    const pdfBytes = await merged.save();
    const copy = new Uint8Array(pdfBytes.length);
    copy.set(pdfBytes);
    const blob = new Blob([copy], { type: "application/pdf" });
    printPdfBlob(blob);
    return true;
  } catch {
    return false;
  }
}
