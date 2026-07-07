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

function drawLayoutLabeledSection(
  doc: PDFDocument,
  templatePageStart: number,
  pageCount: number,
  label: string,
  value: string,
  pos: LabResultPrintPosition | null | undefined,
  font: PDFFont,
  boldFont: PDFFont,
): void {
  if (!pos) return;
  const v = value.trim();
  if (!v) return;
  const pi = Math.min(pos.pageIndex ?? 0, Math.max(0, pageCount - 1));
  const page = doc.getPage(templatePageStart + pi);
  const fs = pos.fontSize ?? 9;
  const lineHeight = effectivePrintLineHeight(pos, fs);

  drawAtTopRef(page, label, pos.refX, pos.refFromTop, fs, boldFont);
  const valueFromTop = pos.refFromTop + lineHeight + lineHeight;
  drawAtTopRef(page, v, pos.refX, valueFromTop, fs, font, {
    maxWidth: pos.maxWidth,
    lineHeight,
  });
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
    body { font-family: "Segoe UI", Helvetica, Arial, sans-serif; font-size: 10pt; line-height: 1.35; color: #111; margin: 0; }
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

    const { PDFDocument, StandardFonts } = await import("pdf-lib");
    const merged = await PDFDocument.create();
    const font = await merged.embedFont(StandardFonts.Helvetica);
    const boldFont = await merged.embedFont(StandardFonts.HelveticaBold);
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
    drawLayoutLabeledSection(
      merged,
      templatePageStart,
      pageCount,
      "FINDINGS",
      findings,
      layout.findings,
      font,
      boldFont,
    );
    drawLayoutLabeledSection(
      merged,
      templatePageStart,
      pageCount,
      "IMPRESSION",
      impression,
      layout.impression,
      font,
      boldFont,
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
