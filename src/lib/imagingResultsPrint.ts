import type { ImagingRequestItemRow } from "@/lib/imagingRequests";
import { imagingItemHasPrintableResult } from "@/lib/imagingRequests";
import type { ImagingRequestHeaderView } from "@/app/api/imaging/imaging-request/route";
import { authenticatedFetch } from "@/lib/authenticatedFetch";
import { formatDateMMDDYYYY } from "@/lib/dateDisplay";
import {
  formatImagingExaminationName,
  isAllowedImagingResultTemplateCode,
  mergeImagingResultPrintLayout,
  type ImagingResultTemplateResultLayout,
  type ImagingResultTemplateSignatureLayout,
} from "@/lib/imagingResultTemplates";
import type { ImagingResultSignatoriesMap } from "@/lib/imagingResultSignatories";
import { IMAGING_SIGNATURE_LAYOUT_ROLES, IMAGING_SIGNATURE_ROLES, type ImagingSignatureRole, imagingSignatorySourceRole } from "@/lib/imagingResultSignatures";
import {
  effectivePrintLineHeight,
  type LabResultImagePosition,
  type LabResultPrintPosition,
} from "@/lib/labResultsPrintLayout";
import { fetchImagingSignatorySignatureBytes } from "@/lib/signaturePrintFetch";
import { embedSignatureBytes } from "@/lib/signaturePdfEmbed";
import {
  formatPatientAgeSex,
  formatResultsReleasedDateTime,
  formatResultsRequestDateTime,
  type ResultsPrintPatientHeader,
} from "@/lib/resultsPrintPatientFields";
import { drawImagingResultsPatientHeader } from "@/lib/imagingResultsPatientHeader";
import type { PDFDocument, PDFPage, PDFFont } from "pdf-lib";
import { rgb } from "pdf-lib";

async function embedImagingResultFonts(doc: PDFDocument): Promise<{ font: PDFFont; boldFont: PDFFont }> {
  const { StandardFonts } = await import("pdf-lib");
  let font = await doc.embedFont(StandardFonts.Helvetica);
  let boldFont = await doc.embedFont(StandardFonts.HelveticaBold);

  try {
    const fontkit = (await import("@pdf-lib/fontkit")).default;
    doc.registerFontkit(fontkit);

    const regularCandidates = ["/fonts/cambria.ttf", "/fonts/Cambria.ttf"];
    for (const url of regularCandidates) {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) continue;
      font = await doc.embedFont(await res.arrayBuffer(), { subset: true });
      break;
    }

    const boldCandidates = ["/fonts/cambriab.ttf", "/fonts/Cambria-Bold.ttf"];
    for (const url of boldCandidates) {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) continue;
      boldFont = await doc.embedFont(await res.arrayBuffer(), { subset: true });
      break;
    }
  } catch {
    // keep Helvetica fallbacks
  }

  return { font, boldFont };
}

export type ImagingResultPrintHeader = ImagingRequestHeaderView;

const REF_W = 612;
const REF_H = 792;
const PRINT_TEXT_BLACK = rgb(0, 0, 0);

type TemplateRegistry = {
  allowedCodes: Set<string>;
  layoutByCode: Map<string, ImagingResultTemplateResultLayout | null>;
  signatureByCode: Map<string, ImagingResultTemplateSignatureLayout | null>;
};

type SignatureImageCache = Record<ImagingSignatureRole, Uint8Array | null>;

async function fetchSignatoriesForPrint(): Promise<ImagingResultSignatoriesMap | null> {
  const res = await authenticatedFetch("/api/imaging/imaging-result-signatories", { cache: "no-store" });
  if (!res.ok) return null;
  const json = (await res.json().catch(() => null)) as {
    signatories?: ImagingResultSignatoriesMap;
  } | null;
  return json?.signatories ?? null;
}

async function loadImagingSignatureImageCache(): Promise<SignatureImageCache> {
  const entries = await Promise.all(
    IMAGING_SIGNATURE_ROLES.map(async (role) => {
      const res = await fetchImagingSignatorySignatureBytes(role);
      return [role, res.bytes] as const;
    }),
  );
  return Object.fromEntries(entries) as SignatureImageCache;
}

function drawSignatureSlot(
  page: PDFPage,
  text: string | null | undefined,
  pos: LabResultPrintPosition | null,
  font: PDFFont,
): void {
  if (!pos) return;
  const t = (text ?? "").trim();
  if (!t) return;
  drawAtTopRef(page, t, pos.refX, pos.refFromTop, pos.fontSize ?? 9, font, { maxWidth: pos.maxWidth });
}

function drawSignatureImageSlot(
  page: PDFPage,
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

async function drawImagingTemplateSignatures(
  doc: PDFDocument,
  page: PDFPage,
  layout: ImagingResultTemplateSignatureLayout | null | undefined,
  signatories: ImagingResultSignatoriesMap | null | undefined,
  font: PDFFont,
  imageCache: SignatureImageCache,
  embeddedImages: Map<string, import("pdf-lib").PDFImage>,
  templateCode: string | null,
): Promise<void> {
  if (!layout || !signatories) return;

  for (const layoutRole of IMAGING_SIGNATURE_LAYOUT_ROLES) {
    const slot = layout[layoutRole];
    const sourceRole = imagingSignatorySourceRole(layoutRole, templateCode);
    const bytes = imageCache[sourceRole];
    if (bytes && slot.signature) {
      let img = embeddedImages.get(sourceRole);
      if (!img) {
        img = (await embedSignatureBytes(doc, bytes, "image/png")) ?? undefined;
        if (img) embeddedImages.set(sourceRole, img);
      }
      if (img) drawSignatureImageSlot(page, img, slot.signature);
    }
    drawSignatureSlot(page, signatories[sourceRole].full_name, slot.name, font);
    drawSignatureSlot(page, signatories[sourceRole].license_no, slot.license, font);
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function itemResultsReleasedAt(item: ImagingRequestItemRow): string | null {
  const performed = item.performed_at != null ? String(item.performed_at).trim() : "";
  if (performed) return performed;
  const updated = item.updated_at != null ? String(item.updated_at).trim() : "";
  return updated || null;
}

function patientHeaderForPrint(header: ImagingRequestHeaderView, item: ImagingRequestItemRow): ResultsPrintPatientHeader {
  return {
    patient_name: header.patient_name,
    patient_id: header.patient_id,
    request_date: header.request_date,
    request_time: header.request_time,
    patient_date_of_birth: header.patient_date_of_birth,
    patient_sex: header.patient_sex,
    patient_age_years: header.patient_age_years,
    patient_address: header.patient_address,
    patient_contact_no: header.patient_contact_no,
    patient_philhealth_no: header.patient_philhealth_no,
    requesting_physician: header.requesting_physician,
    results_released_at: itemResultsReleasedAt(item),
  };
}

function patientInfoField(label: string, value: string): string {
  return `<div class="pi-field"><div class="pi-label">${escapeHtml(label)}</div><div class="pi-value">${escapeHtml(value)}</div></div>`;
}

function scaleRefToPage(page: PDFPage): { sx: number; sy: number } {
  const { width, height } = page.getSize();
  return { sx: width / REF_W, sy: height / REF_H };
}

function drawAtTopRef(
  page: PDFPage,
  text: string,
  refX: number,
  refFromTop: number,
  refSize: number,
  font: PDFFont,
  opts?: { maxWidth?: number; lineHeight?: number },
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
  page.drawText(t, {
    x,
    y,
    size,
    font,
    maxWidth: opts?.maxWidth != null ? opts.maxWidth * sx : undefined,
    lineHeight: opts?.lineHeight != null ? opts.lineHeight * scale : undefined,
    color: PRINT_TEXT_BLACK,
  });
}

/** Max ref-space Y before the signature footer on each template page. */
const IMAGING_CONTENT_BOTTOM_PAGE0 = 635;
const IMAGING_SECTION_GAP_LINES = 1;

type ImagingFlowTemplateContext = {
  merged: PDFDocument;
  src: PDFDocument;
  srcPageIndex: number;
  patientHeader: ResultsPrintPatientHeader;
  font: PDFFont;
  signatories: ImagingResultSignatoriesMap | null;
  signatureLayout: ImagingResultTemplateSignatureLayout | null;
  imageCache: SignatureImageCache;
  embeddedSignatureImages: Map<string, import("pdf-lib").PDFImage>;
  templateCode: string;
  continuationFromTop: number;
};

type ImagingTextFlow = {
  doc: PDFDocument;
  page: PDFPage;
  refFromTop: number;
  bottomLimit: number;
  refX: number;
  fontSize: number;
  lineHeight: number;
  maxWidth: number;
  pageSize: { width: number; height: number };
  templateCtx: ImagingFlowTemplateContext | null;
};

function flowConfigFromPosition(pos: LabResultPrintPosition | null | undefined): {
  refX: number;
  fontSize: number;
  maxWidth: number;
  lineHeight: number;
} {
  const fontSize = pos?.fontSize ?? 9;
  return {
    refX: pos?.refX ?? 48,
    fontSize,
    maxWidth: pos?.maxWidth ?? 520,
    lineHeight: effectivePrintLineHeight(pos, fontSize),
  };
}

function wrapTextLines(text: string, font: PDFFont, fontSize: number, maxWidth: number): string[] {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];

  const lines: string[] = [];
  for (const paragraph of normalized.split("\n")) {
    const trimmed = paragraph.trim();
    if (!trimmed) {
      lines.push("");
      continue;
    }
    const words = trimmed.split(/\s+/);
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, fontSize) <= maxWidth) {
        line = candidate;
        continue;
      }
      if (line) lines.push(line);
      if (font.widthOfTextAtSize(word, fontSize) > maxWidth) {
        let chunk = "";
        for (const ch of word) {
          const next = chunk + ch;
          if (font.widthOfTextAtSize(next, fontSize) <= maxWidth) chunk = next;
          else {
            if (chunk) lines.push(chunk);
            chunk = ch;
          }
        }
        line = chunk;
      } else {
        line = word;
      }
    }
    if (line) lines.push(line);
  }
  return lines;
}

function flowAdvance(flow: ImagingTextFlow, lineCount: number): void {
  flow.refFromTop += lineCount * flow.lineHeight;
}

async function flowAppendTemplatePage(flow: ImagingTextFlow): Promise<void> {
  const ctx = flow.templateCtx;
  if (!ctx) {
    flow.page = flow.doc.addPage([flow.pageSize.width, flow.pageSize.height]);
    flow.refFromTop = 56;
    return;
  }

  const [copied] = await ctx.merged.copyPages(ctx.src, [ctx.srcPageIndex]);
  ctx.merged.addPage(copied);
  const page = ctx.merged.getPage(ctx.merged.getPageCount() - 1);
  drawImagingResultsPatientHeader(page, ctx.patientHeader, ctx.font);
  await drawImagingTemplateSignatures(
    ctx.merged,
    page,
    ctx.signatureLayout,
    ctx.signatories,
    ctx.font,
    ctx.imageCache,
    ctx.embeddedSignatureImages,
    ctx.templateCode,
  );
  flow.page = page;
  flow.refFromTop = ctx.continuationFromTop;
  flow.bottomLimit = IMAGING_CONTENT_BOTTOM_PAGE0;
}

async function flowEnsureLines(flow: ImagingTextFlow, neededLines: number): Promise<void> {
  if (flow.refFromTop + neededLines * flow.lineHeight <= flow.bottomLimit) return;
  await flowAppendTemplatePage(flow);
}

async function flowDrawSingleLine(flow: ImagingTextFlow, text: string, font: PDFFont): Promise<void> {
  await flowEnsureLines(flow, 1);
  drawAtTopRef(flow.page, text, flow.refX, flow.refFromTop, flow.fontSize, font);
  flowAdvance(flow, 1);
}

async function flowDrawLabeledSection(
  flow: ImagingTextFlow,
  label: string,
  body: string,
  bodyFont: PDFFont,
  labelFont: PDFFont,
): Promise<void> {
  const trimmed = body.trim();
  if (!trimmed) return;

  await flowEnsureLines(flow, 2);
  drawAtTopRef(flow.page, label, flow.refX, flow.refFromTop, flow.fontSize, labelFont);
  flowAdvance(flow, 2);

  for (const line of wrapTextLines(trimmed, bodyFont, flow.fontSize, flow.maxWidth)) {
    if (!line) {
      flowAdvance(flow, 1);
      continue;
    }
    await flowDrawSingleLine(flow, line, bodyFont);
  }
  flowAdvance(flow, IMAGING_SECTION_GAP_LINES);
}

/** Stack findings then impression; paginate with extra template pages when needed. */
async function drawFindingsAndImpressionFlow(
  doc: PDFDocument,
  templatePageStart: number,
  pageCount: number,
  findings: string,
  impression: string,
  findingsPos: LabResultPrintPosition | null | undefined,
  impressionPos: LabResultPrintPosition | null | undefined,
  font: PDFFont,
  boldFont: PDFFont,
  templateCtx: ImagingFlowTemplateContext,
): Promise<void> {
  if (!findingsPos && !impressionPos) return;
  const findingsText = findings.trim();
  const impressionText = impression.trim();
  if (!findingsText && !impressionText) return;

  const anchorPos = findingsPos ?? impressionPos;
  const pi = Math.min(anchorPos?.pageIndex ?? 0, Math.max(0, pageCount - 1));
  const page = doc.getPage(templatePageStart + pi);
  const findingsCfg = flowConfigFromPosition(findingsPos ?? impressionPos);
  const impressionCfg = flowConfigFromPosition(impressionPos ?? findingsPos);
  const continuationFromTop = findingsPos?.refFromTop ?? impressionPos?.refFromTop ?? 340;

  const flow: ImagingTextFlow = {
    doc,
    page,
    refFromTop: continuationFromTop,
    bottomLimit: IMAGING_CONTENT_BOTTOM_PAGE0,
    pageSize: page.getSize(),
    templateCtx: { ...templateCtx, continuationFromTop },
    ...findingsCfg,
  };

  if (findingsText) {
    await flowDrawLabeledSection(flow, "FINDINGS", findingsText, font, boldFont);
  } else if (impressionPos?.refFromTop != null) {
    flow.refFromTop = impressionPos.refFromTop;
  }

  if (impressionText) {
    flow.refX = impressionCfg.refX;
    flow.fontSize = impressionCfg.fontSize;
    flow.maxWidth = impressionCfg.maxWidth;
    flow.lineHeight = impressionCfg.lineHeight;
    await flowDrawLabeledSection(flow, "IMPRESSION", impressionText, font, boldFont);
  }
}

function drawLayoutText(
  doc: PDFDocument,
  templatePageStart: number,
  pageCount: number,
  text: string,
  pos: LabResultPrintPosition | null | undefined,
  font: PDFFont,
): void {
  if (!pos) return;
  const pi = Math.min(pos.pageIndex ?? 0, Math.max(0, pageCount - 1));
  const page = doc.getPage(templatePageStart + pi);
  const fs = pos.fontSize ?? 9;
  drawAtTopRef(page, text, pos.refX, pos.refFromTop, fs, font, {
    maxWidth: pos.maxWidth,
    lineHeight: effectivePrintLineHeight(pos, fs),
  });
}

async function fetchTemplateRegistry(): Promise<TemplateRegistry | null> {
  const res = await authenticatedFetch("/api/imaging/imaging-result-templates?activeOnly=false", {
    cache: "no-store",
  });
  if (!res.ok) return null;
  const json = (await res.json().catch(() => null)) as {
    templates?: Array<{
      code?: string;
      result_layout?: ImagingResultTemplateResultLayout | null;
      signature_layout?: ImagingResultTemplateSignatureLayout | null;
    }>;
  } | null;
  const allowedCodes = new Set<string>();
  const layoutByCode = new Map<string, ImagingResultTemplateResultLayout | null>();
  const signatureByCode = new Map<string, ImagingResultTemplateSignatureLayout | null>();
  for (const t of json?.templates ?? []) {
    const code = String(t.code ?? "").trim().toUpperCase();
    if (!code) continue;
    allowedCodes.add(code);
    layoutByCode.set(code, t.result_layout ?? null);
    signatureByCode.set(code, t.signature_layout ?? null);
  }
  return { allowedCodes, layoutByCode, signatureByCode };
}

async function fetchImagingResultTemplateBytes(code: string): Promise<Uint8Array | null> {
  const res = await authenticatedFetch(
    `/api/imaging/imaging-result-template?code=${encodeURIComponent(code)}`,
    { cache: "no-store" },
  );
  if (!res.ok) return null;
  return new Uint8Array(await res.arrayBuffer());
}

function effectiveTemplateCode(item: ImagingRequestItemRow, allowedCodes: Set<string>): string | null {
  const code = String(item.results_template_code ?? "").trim().toUpperCase();
  if (code && isAllowedImagingResultTemplateCode(code, allowedCodes)) return code;
  return null;
}

function printPdfBlob(blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const iframe = document.createElement("iframe");
  iframe.setAttribute("title", "Imaging result print");
  iframe.style.cssText =
    "position:fixed;right:0;bottom:0;width:0;height:0;border:none;visibility:hidden;";
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

function openImagingResultPrintHtml(args: {
  header: ImagingRequestHeaderView;
  item: ImagingRequestItemRow;
}): void {
  const { header, item } = args;
  const patient = patientHeaderForPrint(header, item);
  const when = new Date().toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
  const studyLabel = formatImagingExaminationName(item) || "—";
  const findings = String(item.findings ?? "").trim() || "—";
  const impression = String(item.remarks ?? "").trim() || "—";
  const patientName = (patient.patient_name ?? "").trim() || "—";
  const patientId = patient.patient_id != null ? String(patient.patient_id) : "—";
  const dob = formatDateMMDDYYYY(patient.patient_date_of_birth ?? "") || "—";
  const addr = (patient.patient_address ?? "").trim() || "—";
  const contact = (patient.patient_contact_no ?? "").trim() || "—";
  const phil = (patient.patient_philhealth_no ?? "").trim() || "—";
  const physician = (patient.requesting_physician ?? "").trim() || "—";
  const requested = formatResultsRequestDateTime(patient.request_date, patient.request_time);
  const released = formatResultsReleasedDateTime(patient.results_released_at);
  const ageSex = formatPatientAgeSex(patient);

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>LifeHub — Imaging Result</title>
  <style>
    @page { size: letter; margin: 12mm 14mm; }
    body { font-family: Cambria, "Times New Roman", Times, serif; font-size: 10pt; line-height: 1.35; color: #111; margin: 0; }
    h1 { font-size: 14pt; text-align: center; color: #1f4e79; margin: 0 0 8px; }
    .printed-at { text-align: center; font-size: 8.5pt; color: #555; margin-bottom: 10px; }
    .pi-title { font-size: 8pt; font-weight: 800; text-transform: uppercase; letter-spacing: 0.06em; color: #fff; background: #1f4e79; padding: 4px 8px; margin-bottom: 0; }
    .pi-grid { border: 1px solid #1f4e79; border-top: none; margin-bottom: 14px; }
    .pi-row { display: grid; grid-template-columns: 1.4fr 1fr 1fr; gap: 8px 16px; padding: 6px 8px; border-top: 1px solid #c5d4e8; }
    .pi-row:first-child { border-top: none; }
    .pi-row.two-col { grid-template-columns: 1.4fr 1fr; }
    .pi-label { font-size: 7pt; font-weight: 700; text-transform: uppercase; color: #666; }
    .pi-value { font-size: 9pt; font-weight: 700; word-break: break-word; }
    .study-line { font-size: 9pt; margin-bottom: 10px; }
    .section-label { font-weight: 700; }
    .section-block { margin-top: 12px; }
    .section-body { margin-top: 1.35em; white-space: pre-wrap; word-break: break-word; }
  </style>
</head>
<body>
  <h1>LifeHub — Imaging Result</h1>
  <div class="printed-at">Printed ${escapeHtml(when)}</div>
  <div class="pi-title">Patient information</div>
  <div class="pi-grid">
    <div class="pi-row two-col">
      ${patientInfoField("Name", patientName)}
      ${patientInfoField("Date requested", requested)}
    </div>
    <div class="pi-row">
      ${patientInfoField("Age / sex", ageSex)}
      ${patientInfoField("DOB", dob)}
      ${patientInfoField("Date released", released)}
    </div>
    <div class="pi-row">
      ${patientInfoField("Address", addr)}
      ${patientInfoField("Contact no.", contact)}
      ${patientInfoField("PhilHealth no.", phil)}
    </div>
    <div class="pi-row two-col">
      ${patientInfoField("Requesting physician", physician)}
      ${patientInfoField("Patient ID", patientId)}
    </div>
  </div>
  <div class="study-line"><strong>Examination:</strong> ${escapeHtml(studyLabel)}</div>
  <div class="section-block">
    <div class="section-label">FINDINGS</div>
    <div class="section-body">${escapeHtml(findings)}</div>
  </div>
  <div class="section-block">
    <div class="section-label">IMPRESSION</div>
    <div class="section-body">${escapeHtml(impression)}</div>
  </div>
</body>
</html>`;

  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const iframe = document.createElement("iframe");
  iframe.setAttribute("title", "Imaging result print");
  iframe.style.cssText =
    "position:fixed;right:0;bottom:0;width:0;height:0;border:none;visibility:hidden;";
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

export { imagingItemHasPrintableResult } from "@/lib/imagingRequests";

export async function openImagingResultPrintWindow(args: {
  header: ImagingRequestHeaderView;
  item: ImagingRequestItemRow;
}): Promise<boolean> {
  const { header, item } = args;
  if (!imagingItemHasPrintableResult(item)) return false;

  const patientHeader = patientHeaderForPrint(header, item);

  try {
    const registry = await fetchTemplateRegistry();
    const templateCode = registry ? effectiveTemplateCode(item, registry.allowedCodes) : null;

    if (!registry || !templateCode) {
      openImagingResultPrintHtml({ header, item });
      return true;
    }

    const bytes = await fetchImagingResultTemplateBytes(templateCode);
    if (!bytes) {
      openImagingResultPrintHtml({ header, item });
      return true;
    }

    const templateLayout = registry.layoutByCode.get(templateCode) ?? null;
    const catalogLayout = item.results_print_layout ?? null;
    const layout = mergeImagingResultPrintLayout(templateLayout, catalogLayout);
    if (!layout) {
      openImagingResultPrintHtml({ header, item });
      return true;
    }

    const { PDFDocument } = await import("pdf-lib");
    const merged = await PDFDocument.create();
    const { font, boldFont } = await embedImagingResultFonts(merged);
    const signatories = await fetchSignatoriesForPrint();
    const signatureLayout = registry.signatureByCode.get(templateCode) ?? null;
    const imageCache = await loadImagingSignatureImageCache();
    const embeddedSignatureImages = new Map<string, import("pdf-lib").PDFImage>();
    const src = await PDFDocument.load(bytes);
    const templatePageStart = merged.getPageCount();
    const copied = await merged.copyPages(src, src.getPageIndices());
    for (const page of copied) merged.addPage(page);
    const pageCount = copied.length;

    for (let i = 0; i < pageCount; i++) {
      const page = merged.getPage(templatePageStart + i);
      drawImagingResultsPatientHeader(page, patientHeader, font);
      await drawImagingTemplateSignatures(
        merged,
        page,
        signatureLayout,
        signatories,
        font,
        imageCache,
        embeddedSignatureImages,
        templateCode,
      );
    }

    const examinationName = formatImagingExaminationName(item);
    const findings = String(item.findings ?? "").trim();
    const impression = String(item.remarks ?? "").trim();

    drawLayoutText(merged, templatePageStart, pageCount, examinationName, layout.examination_name, font);
    const anchorPos = layout.findings ?? layout.impression;
    const templateSrcPageIndex = Math.min(anchorPos?.pageIndex ?? 0, Math.max(0, pageCount - 1));
    await drawFindingsAndImpressionFlow(
      merged,
      templatePageStart,
      pageCount,
      findings,
      impression,
      layout.findings,
      layout.impression,
      font,
      boldFont,
      {
        merged,
        src,
        srcPageIndex: templateSrcPageIndex,
        patientHeader,
        font,
        signatories,
        signatureLayout,
        imageCache,
        embeddedSignatureImages,
        templateCode,
        continuationFromTop: layout.findings?.refFromTop ?? layout.impression?.refFromTop ?? 340,
      },
    );

    const pdfBytes = await merged.save();
    const copy = new Uint8Array(pdfBytes.length);
    copy.set(pdfBytes);
    printPdfBlob(new Blob([copy], { type: "application/pdf" }));
    return true;
  } catch {
    openImagingResultPrintHtml({ header, item });
    return true;
  }
}
