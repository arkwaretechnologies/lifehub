import type { LabRequestHeaderView, LabRequestItemView } from "@/app/api/laboratory/lab-request/route";
import { authenticatedFetch } from "@/lib/authenticatedFetch";
import { formatDateMMDDYYYY, formatLabTime } from "@/lib/dateDisplay";
import {
  isAllowedLabResultsTemplateCode,
  labResultsTemplateCodeFromCatalogTestCode,
  sortResultsTemplateCodes,
  splitAllowlistedResultsTemplateCodes,
  compareLabTestSortOrder,
} from "@/lib/labTests";
import { getPrintLayoutForTemplateCode, LAB_PRINT_FALLBACK } from "@/lib/labResultsPrintLayout";
import type { PDFDocument } from "pdf-lib";
import { rgb } from "pdf-lib";

/** US Letter reference size (points) for coordinate calibration; scaled to each template page. */
const REF_W = 612;
const REF_H = 792;

function formatLabRequestDateTime(requestDate: string, requestTime: string | null): string {
  const d = formatDateMMDDYYYY(requestDate);
  const t = formatLabTime(requestTime);
  if (!d) return t === "—" ? "—" : t;
  return t === "—" ? d : `${d} · ${t}`;
}

/** Local calendar + clock from ISO (e.g. `lab_results.updated_at`) for "date released" line. */
function formatReleasedDateTime(iso: string | null | undefined): string {
  if (iso == null || String(iso).trim() === "") return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const y = d.getFullYear();
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${mm}-${day}-${y} · ${h}:${min}`;
}

function effectiveTemplateCodes(it: LabRequestItemView): string[] {
  const fromApi = splitAllowlistedResultsTemplateCodes(it.results_template_code);
  if (fromApi.length > 0) return fromApi;
  const inferred = labResultsTemplateCodeFromCatalogTestCode(it.test_code);
  const c = (inferred ?? "").trim().toUpperCase();
  if (c && isAllowedLabResultsTemplateCode(c)) return [c];
  return [];
}

function scaleRefToPage(page: { getSize(): { width: number; height: number } }): { sx: number; sy: number } {
  const { width, height } = page.getSize();
  return { sx: width / REF_W, sy: height / REF_H };
}

/** PDF text color for printed result lines from lab flag (matches results UI options). */
function printTextColorForFlag(flag: string | null | undefined) {
  const f = (flag ?? "").trim().toLowerCase();
  switch (f) {
    case "normal":
      return rgb(0.1, 0.45, 0.2);
    case "high":
      return rgb(0.82, 0.2, 0.12);
    case "low":
      return rgb(0.12, 0.35, 0.82);
    case "critical":
      return rgb(0.92, 0.05, 0.08);
    case "abnormal":
      return rgb(0.78, 0.42, 0.08);
    default:
      return rgb(0.12, 0.12, 0.12);
  }
}

/** Printed analyte line: result value (uppercase for print); hyphen and flag only when flag is set. */
function formatPrintedResultFlag(it: LabRequestItemView): string {
  const raw = (it.result_value ?? "").trim();
  const v = raw ? raw.toUpperCase() : "—";
  const fl = (it.flag ?? "").trim();
  if (!fl) return v;
  return `${v} - ${fl}`;
}

function drawAtTopRef(
  page: import("pdf-lib").PDFPage,
  text: string,
  refX: number,
  refFromTop: number,
  refSize: number,
  font: import("pdf-lib").PDFFont,
  opts?: { maxWidth?: number; colorFromFlag?: string | null; lineHeight?: number },
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
  const color =
    opts != null && "colorFromFlag" in opts ? printTextColorForFlag(opts.colorFromFlag) : rgb(0, 0, 0);
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
  return formatPrintedResultFlag(it);
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

function drawSharedHeader(
  page: import("pdf-lib").PDFPage,
  header: LabRequestHeaderView,
  font: import("pdf-lib").PDFFont,
): void {
  const name = (header.patient_name ?? "").trim() || "—";
  const dt = formatLabRequestDateTime(header.request_date, header.request_time);
  const pid = header.patient_id != null ? String(header.patient_id) : "—";

  const age = header.patient_age_years;
  const sex = (header.patient_sex ?? "").trim();
  const ageSex =
    age != null && Number.isFinite(age) ? `${Math.trunc(age)}/${sex || "—"}` : sex ? `—/${sex}` : "—";
  const dob = formatDateMMDDYYYY(header.patient_date_of_birth ?? "") || "—";
  const addr = (header.patient_address ?? "").trim() || "—";
  const contact = (header.patient_contact_no ?? "").trim() || "—";
  const phil = (header.patient_philhealth_no ?? "").trim() || "—";
  const physician = (header.requesting_physician ?? "").trim() || "—";
  const released = formatReleasedDateTime(header.results_released_at);

  drawAtTopRef(page, name, 118, 194, 9, font);
  drawAtTopRef(page, dt, 395, 194, 9, font);
  drawAtTopRef(page, pid, 376, 254, 9, font);
  drawAtTopRef(page, ageSex, 118, 213, 8, font);
  drawAtTopRef(page, dob, 225, 213, 8, font);
  drawAtTopRef(page, addr, 118, 233, 8, font, { maxWidth: 100, lineHeight: 8 });
  drawAtTopRef(page, contact, 245, 233, 8, font, { maxWidth: 260, lineHeight: 7 });
  drawAtTopRef(page, phil, 500, 233, 8, font, { maxWidth: 250, lineHeight: 7 });
  drawAtTopRef(page, physician, 172, 253, 8, font, { maxWidth: 470 });
  drawAtTopRef(page, released, 395, 212, 8, font);
}

/**
 * Overlay results: each item uses `results_print_layouts` aligned to `results_template_code` for this
 * template stem; missing/invalid layouts use stacked fallback on page 0 of the template block.
 */
function drawGroupResultsForTemplate(
  merged: PDFDocument,
  templatePageStart: number,
  pageCount: number,
  groupItems: LabRequestItemView[],
  font: import("pdf-lib").PDFFont,
  currentTemplateCode: string,
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
      const line = formatPrintedResultFlag(it);
      const fs = pos.fontSize ?? 8;
      drawAtTopRef(page, line, pos.refX, pos.refFromTop, fs, font, {
        maxWidth: pos.maxWidth,
        colorFromFlag: it.flag,
      });
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
    const line = formatPrintedResultFlag(it);
    drawAtTopRef(page0, line, LAB_PRINT_FALLBACK.refX, fromTop, LAB_PRINT_FALLBACK.fontSize, font, {
      maxWidth: LAB_PRINT_FALLBACK.maxWidth,
      colorFromFlag: it.flag,
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
    const { PDFDocument, StandardFonts } = await import("pdf-lib");

    const merged = await PDFDocument.create();
    const font = await merged.embedFont(StandardFonts.Helvetica);
    const mono = await merged.embedFont(StandardFonts.Courier);

    const byTpl = new Map<string, LabRequestItemView[]>();
    const noTemplate: LabRequestItemView[] = [];

    for (const it of items) {
      const codes = effectiveTemplateCodes(it);
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

    const ordered = sortResultsTemplateCodes(byTpl.keys());

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
      for (let i = 0; i < pageCount; i++) {
        drawSharedHeader(merged.getPage(templatePageStart + i), header, font);
      }
      drawGroupResultsForTemplate(merged, templatePageStart, pageCount, groupItems, font, code);
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
      drawSharedHeader(page, header, font);
      drawAtTopRef(page, title, 48, 232, 10, font);

      let fromTop = 256;
      const lineStep = 11;
      const maxFromTop = REF_H - 48;
      for (const it of sorted) {
        const wrapped: string[] = [];
        pushWrappedParagraph(wrapped, formatResultLine(it), 92);
        for (const line of wrapped) {
          if (fromTop > maxFromTop) {
            page = merged.addPage([REF_W, REF_H]);
            drawSharedHeader(page, header, font);
            drawAtTopRef(page, "(continued)", 48, 232, 9, font);
            fromTop = 256;
          }
          drawAtTopRef(page, line, 48, fromTop, 8.5, mono, { colorFromFlag: it.flag });
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
