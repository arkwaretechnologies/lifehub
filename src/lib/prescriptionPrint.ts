import type { ConsultationPatient } from "@/components/consultation/consultationTypes";
import { authenticatedFetch } from "@/lib/authenticatedFetch";
import { formatDateMMDDYYYY } from "@/lib/dateDisplay";
import type { PDFDocument, PDFFont, PDFPage, RGB } from "pdf-lib";
import { drawSignatureImageAtRef, embedSignatureBytes } from "@/lib/signaturePdfEmbed";
import { fetchPhysicianSignaturePrintLayout, type PhysicianSignaturePrintSlot } from "@/lib/clinicalPrintLayoutFetch";

export type PrescriptionPrintMedicationLine = {
  drugLine: string;
  quantity: string;
  unit: string;
  notes?: string;
};

export type PrescriptionPrintPhysician = {
  fullname: string;
  specialty: string;
  licenseNo: string;
  ptrNo: string;
  s2No: string;
  signatureBytes?: Uint8Array | null;
  signatureContentType?: string | null;
};

/** A5 portrait at 72 dpi (PDF points). */
const A5_W = 420;
const A5_H = 595;

/** Max medication entries per RX template page (Print RX). */
const RX_MEDS_PER_PAGE = 5;

type PrescriptionLayout = ReturnType<typeof prescriptionLayout>;

type RxTemplateContext = {
  doc: PDFDocument;
  page: PDFPage;
  font: PDFFont;
  width: number;
  height: number;
  L: PrescriptionLayout;
  black: RGB;
  signatureSlot: PhysicianSignaturePrintSlot;
};

function chunkArray<T>(items: T[], size: number): T[][] {
  if (items.length === 0) return [[]];
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

function formatDobMMDDYYYY(raw: string): string {
  const s = (raw ?? "").trim();
  if (!s) return "";
  const m1 = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m1) return `${m1[2]}-${m1[3]}-${m1[1]}`;
  const m2 = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (m2) return `${m2[1]}-${m2[2]}-${m2[3]}`;
  const m3 = s.match(/^(\d{2})-(\d{2})-(\d{4})/);
  if (m3) return `${m3[1]}-${m3[2]}-${m3[3]}`;
  return s;
}

const RX_UNIT_ALREADY_PLURAL = new Set([
  "tablets",
  "pieces",
  "capsules",
  "drops",
  "tabs",
  "vials",
  "ampules",
  "sachets",
  "suppositories",
  "patches",
  "sprays",
  "units",
  "boxes",
  "strips",
  "bottles",
  "kits",
  "puffs",
]);

function pluralizeRxUnit(unit: string, quantityRaw: string): string {
  const u = unit.trim();
  if (!u) return u;

  const raw = (quantityRaw ?? "").trim().replace(/,/g, "");
  if (!raw) return u;
  const n = Number.parseFloat(raw);
  if (!Number.isFinite(n) || n <= 1) return u;

  const lower = u.toLowerCase();
  if (RX_UNIT_ALREADY_PLURAL.has(lower)) return u;
  if (/^(ml|l|mg|g|mcg|iu)$/i.test(lower)) return u;

  const irregular: Record<string, string> = {
    piece: "pieces",
    tablet: "tablets",
    tab: "tabs",
    capsule: "capsules",
    cap: "caps",
    drop: "drops",
    ampule: "ampules",
    vial: "vials",
    sachet: "sachets",
    suppository: "suppositories",
    puff: "puffs",
    spray: "sprays",
    patch: "patches",
    bottle: "bottles",
    box: "boxes",
    strip: "strips",
    unit: "units",
    kit: "kits",
  };

  let plural = irregular[lower];
  if (!plural) {
    if (lower.endsWith("s") || lower.endsWith("x")) return u;
    plural = `${lower}s`;
  }

  if (u === u.toUpperCase()) return plural.toUpperCase();
  if (u.length > 0 && u[0] === u[0].toUpperCase() && u.slice(1) === u.slice(1).toLowerCase()) {
    return plural.charAt(0).toUpperCase() + plural.slice(1);
  }
  return plural;
}

function prescriptionLayout(pageWidth: number, pageHeight: number) {
  const w = pageWidth;
  const h = pageHeight;
  const sx = w / A5_W;
  const sy = h / A5_H;
  const px = (n: number) => n * sx;
  const py = (n: number) => n * sy;

  const leftX = px(95);
  const rightX = px(300);

  return {
    margin: px(24),
    specialty: { fromTop: py(92), size: 9 },
    patientName: { fromTop: py(127), x: leftX, size: 8.8 },
    dob: { fromTop: py(150), x: leftX, size: 8.6 },
    dateTime: { fromTop: py(150), x: rightX, size: 8.6 },
    ageSex: { fromTop: py(175), x: leftX, size: 8.6 },
    address: { fromTop: py(200), x: leftX, maxWidth: px(200), size: 8.6, lineHeight: 9.5 },
    contactNo: { fromTop: py(175), x: rightX, size: 8.6 },
    rxStart: { fromTop: py(275), x: 80, size: 9.2, lineHeight: 11.2 },
    sigSpecialty: { fromTop: py(508), x: px(250), size: 7.5 },
    sigBandFromTop: py(470),
    licRow: { fromTop: py(545), x: leftX, size: 7, col2: px(210), col3: px(340) },
    physicianSignature: { x: px(115), fromTop: py(478), width: px(120), height: py(36) },
    qr: { x: 40, fromTop: py(470), size: px(62) },
  } as const;
}

function isRoughlyA5(w: number, h: number): boolean {
  const dw = Math.abs(w - A5_W) / A5_W;
  const dh = Math.abs(h - A5_H) / A5_H;
  return dw <= 0.03 && dh <= 0.03;
}

function normalizePageToA5(page: PDFPage): void {
  const size = page.getSize();
  const w0 = size.width;
  const h0 = size.height;
  if (isRoughlyA5(w0, h0)) return;
  const s = Math.min(A5_W / w0, A5_H / h0);
  page.scaleContent(s, s);
  const dx = (A5_W - w0 * s) / 2;
  const dy = (A5_H - h0 * s) / 2;
  if (dx !== 0 || dy !== 0) {
    page.translateContent(dx, dy);
  }
  page.setSize(A5_W, A5_H);
}

function pageHeightFromTop(pageHeight: number, fromTop: number): number {
  return pageHeight - fromTop;
}

function drawCentered(
  page: PDFPage,
  text: string,
  pageWidth: number,
  pageHeight: number,
  fromTop: number,
  font: PDFFont,
  size: number,
  minX: number,
  black: RGB,
): void {
  const t = text.trim();
  if (!t) return;
  const w = font.widthOfTextAtSize(t, size);
  const x = Math.max(minX, (pageWidth - w) / 2);
  page.drawText(t, { x, y: pageHeightFromTop(pageHeight, fromTop), size, font, color: black });
}

function drawWrapped(
  page: PDFPage,
  text: string,
  x: number,
  yStart: number,
  maxWidth: number,
  font: PDFFont,
  size: number,
  lineHeight: number,
  black: RGB,
): number {
  const words = text.trim().split(/\s+/).filter(Boolean);
  let line = "";
  let y = yStart;

  const flush = () => {
    if (line) {
      page.drawText(line, { x, y, size, font, color: black });
      y -= lineHeight;
      line = "";
    }
  };

  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(next, size) <= maxWidth) {
      line = next;
    } else {
      flush();
      if (font.widthOfTextAtSize(w, size) <= maxWidth) {
        line = w;
      } else {
        let rest = w;
        while (rest.length > 0) {
          let cut = rest.length;
          while (
            cut > 0 &&
            font.widthOfTextAtSize(rest.slice(0, cut) + (cut < rest.length ? "…" : ""), size) > maxWidth
          ) {
            cut -= 1;
          }
          if (cut === 0) cut = 1;
          const piece = cut < rest.length ? `${rest.slice(0, cut)}…` : rest.slice(0, cut);
          page.drawText(piece, { x, y, size, font, color: black });
          y -= lineHeight;
          rest = rest.slice(cut);
        }
      }
    }
  }
  flush();
  return y;
}

function printPdfBlob(blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const iframe = document.createElement("iframe");
  iframe.setAttribute("title", "Prescription print");
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

async function embedRxFont(doc: PDFDocument): Promise<PDFFont> {
  const { StandardFonts } = await import("pdf-lib");
  let font = await doc.embedFont(StandardFonts.Helvetica);
  try {
    const candidates = [
      "/fonts/SF-Pro-Text-Regular.otf",
      "/fonts/SF-Pro-Display-Regular.otf",
      "/fonts/SFProText-Regular.otf",
      "/fonts/SFProDisplay-Regular.otf",
      "/fonts/SF-Pro-Text-Regular.ttf",
      "/fonts/SF-Pro-Display-Regular.ttf",
    ];
    for (const url of candidates) {
      const fr = await fetch(url, { cache: "no-store" });
      if (!fr.ok) continue;
      const bytes = await fr.arrayBuffer();
      font = await doc.embedFont(bytes, { subset: true });
      break;
    }
  } catch {
    // keep Helvetica
  }
  return font;
}

async function loadRxTemplateBytes(): Promise<ArrayBuffer | null> {
  const res = await authenticatedFetch("/api/prescription-template", { cache: "no-store" });
  if (!res.ok) return null;
  return res.arrayBuffer();
}

async function addRxTemplatePage(doc: PDFDocument, templateBytes: ArrayBuffer): Promise<PDFPage> {
  const { PDFDocument } = await import("pdf-lib");
  const templateDoc = await PDFDocument.load(templateBytes);
  const [copied] = await doc.copyPages(templateDoc, [0]);
  const page = doc.addPage(copied);
  normalizePageToA5(page);
  return page;
}

function buildRxTemplateContext(
  doc: PDFDocument,
  page: PDFPage,
  font: PDFFont,
  black: RGB,
  signatureSlot: PhysicianSignaturePrintSlot,
): RxTemplateContext {
  const { width, height } = page.getSize();
  return {
    doc,
    page,
    font,
    width,
    height,
    L: prescriptionLayout(width, height),
    black,
    signatureSlot,
  };
}

async function loadRxTemplateContext(): Promise<RxTemplateContext | null> {
  const { PDFDocument, rgb } = await import("pdf-lib");
  const [templateBytes, signatureSlot] = await Promise.all([
    loadRxTemplateBytes(),
    fetchPhysicianSignaturePrintLayout("prescription"),
  ]);
  if (!templateBytes) return null;

  const doc = await PDFDocument.load(templateBytes);
  const page = doc.getPages()[0];
  normalizePageToA5(page);
  const font = await embedRxFont(doc);
  return buildRxTemplateContext(doc, page, font, rgb(0, 0, 0), signatureSlot);
}

function drawRxPatientHeader(
  ctx: RxTemplateContext,
  patient: ConsultationPatient,
  physician: PrescriptionPrintPhysician,
): void {
  const { page, font, width, height, L, black } = ctx;

  drawCentered(page, physician.specialty.toUpperCase(), width, height, L.specialty.fromTop, font, L.specialty.size, L.margin, black);

  const dateStr = formatDateMMDDYYYY(patient.date) || "";
  const dateTimeStr = [dateStr, (patient.time ?? "").trim()].filter(Boolean).join(" ");
  const dobStr = formatDobMMDDYYYY(patient.dob ?? "");
  const contactStr = (patient.contactNo ?? "").trim();

  if (patient.name.trim()) {
    page.drawText(patient.name.trim(), {
      x: L.patientName.x,
      y: pageHeightFromTop(height, L.patientName.fromTop),
      size: L.patientName.size,
      font,
      color: black,
    });
  }

  const ageBaselineY = pageHeightFromTop(height, L.ageSex.fromTop);
  const dateBaselineY = pageHeightFromTop(height, L.dateTime.fromTop);
  if (patient.address.trim()) {
    drawWrapped(
      page,
      patient.address.trim(),
      L.address.x,
      pageHeightFromTop(height, L.address.fromTop),
      L.address.maxWidth,
      font,
      L.address.size,
      L.address.lineHeight,
      black,
    );
  }

  if (patient.ageSex.trim()) {
    page.drawText(patient.ageSex.trim(), {
      x: L.ageSex.x,
      y: ageBaselineY,
      size: L.ageSex.size,
      font,
      color: black,
    });
  }
  if (dateTimeStr) {
    page.drawText(dateTimeStr, {
      x: L.dateTime.x,
      y: dateBaselineY,
      size: L.dateTime.size,
      font,
      color: black,
    });
  }

  if (dobStr) {
    page.drawText(dobStr, {
      x: L.dob.x,
      y: pageHeightFromTop(height, L.dob.fromTop),
      size: L.dob.size,
      font,
      color: black,
    });
  }
  if (contactStr) {
    page.drawText(contactStr, {
      x: L.contactNo.x,
      y: pageHeightFromTop(height, L.contactNo.fromTop),
      size: L.contactNo.size,
      font,
      color: black,
    });
  }
}

function rxSigYMin(ctx: RxTemplateContext): number {
  return pageHeightFromTop(ctx.height, ctx.L.sigBandFromTop) + ctx.height * 0.04;
}

function rxBodyStartY(ctx: RxTemplateContext): number {
  return pageHeightFromTop(ctx.height, ctx.L.rxStart.fromTop);
}

function rxBodyMaxWidth(ctx: RxTemplateContext): number {
  return ctx.width - ctx.L.rxStart.x - ctx.L.margin;
}

function drawRxMedications(
  ctx: RxTemplateContext,
  medications: PrescriptionPrintMedicationLine[],
  options?: { startNumber?: number },
): void {
  const { page, font, L, black } = ctx;
  let yRx = rxBodyStartY(ctx);
  const maxRxW = rxBodyMaxWidth(ctx);
  const sigYMin = rxSigYMin(ctx);
  let n = options?.startNumber ?? 1;

  for (const m of medications) {
    if (yRx < sigYMin) break;
    const q = m.quantity.trim();
    const u = m.unit.trim();
    const unitPrinted = pluralizeRxUnit(u, q);
    const qtyPart = [q && `#: ${q}`, unitPrinted].filter(Boolean).join(" ");
    const sigPart = (m.notes ?? "").trim();
    const mainLine = `${n}. ${m.drugLine}${qtyPart ? `  ${qtyPart}` : ""}`;
    yRx = drawWrapped(page, mainLine, L.rxStart.x, yRx, maxRxW, font, L.rxStart.size, L.rxStart.lineHeight, black);
    if (sigPart) {
      const sigIndent = Math.round(L.rxStart.size * 1.25);
      const sigLine = `Sig: ${sigPart}`;
      yRx = drawWrapped(
        page,
        sigLine,
        L.rxStart.x + sigIndent,
        yRx,
        maxRxW - sigIndent,
        font,
        L.rxStart.size,
        L.rxStart.lineHeight,
        black,
      );
    }
    yRx -= Math.round(L.rxStart.lineHeight * 1.35);
    n += 1;
  }
}

function drawRxBodyText(ctx: RxTemplateContext, bodyText: string): void {
  const { page, font, L, black } = ctx;
  let yRx = rxBodyStartY(ctx);
  const maxRxW = rxBodyMaxWidth(ctx);
  const sigYMin = rxSigYMin(ctx);
  const paragraphs = bodyText.replace(/\r\n/g, "\n").split("\n");

  for (let i = 0; i < paragraphs.length; i++) {
    if (yRx < sigYMin) break;
    const para = paragraphs[i] ?? "";
    if (!para.trim()) {
      yRx -= Math.round(L.rxStart.lineHeight * 0.65);
      continue;
    }
    yRx = drawWrapped(page, para, L.rxStart.x, yRx, maxRxW, font, L.rxStart.size, L.rxStart.lineHeight, black);
    if (i < paragraphs.length - 1) {
      yRx -= Math.round(L.rxStart.lineHeight * 0.35);
    }
  }
}

async function drawRxSigFooter(ctx: RxTemplateContext, physician: PrescriptionPrintPhysician, transId: string): Promise<void> {
  const { doc, page, font, height, L, black, signatureSlot } = ctx;

  if (physician.signatureBytes?.length) {
    const sigImg = await embedSignatureBytes(doc, physician.signatureBytes, physician.signatureContentType);
    if (sigImg) {
      drawSignatureImageAtRef(
        page,
        sigImg,
        signatureSlot.position,
        signatureSlot.refW,
        signatureSlot.refH,
      );
    }
  }

  if (physician.specialty.trim()) {
    page.drawText(physician.specialty.trim().toUpperCase(), {
      x: L.sigSpecialty.x,
      y: pageHeightFromTop(height, L.sigSpecialty.fromTop),
      size: L.sigSpecialty.size,
      font,
      color: black,
    });
  }

  const tid = String(transId ?? "").trim();
  if (!tid) return;

  const QRCode = (await import("qrcode")).default;
  const dataUrl = await QRCode.toDataURL(tid, {
    errorCorrectionLevel: "M",
    margin: 0,
    scale: 6,
    color: { dark: "#000000", light: "#FFFFFF" },
  });
  const b64 = dataUrl.split(",")[1] ?? "";
  if (!b64) return;

  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const img = await doc.embedPng(bytes);
  const s = L.qr.size;
  page.drawImage(img, {
    x: L.qr.x,
    y: pageHeightFromTop(height, L.qr.fromTop) - s,
    width: s,
    height: s,
  });
}

async function finishRxPrint(doc: PDFDocument): Promise<boolean> {
  const out = await doc.save();
  const blob = new Blob([out as BlobPart], { type: "application/pdf" });
  printPdfBlob(blob);
  return true;
}

export async function openPrescriptionPrintWindow(args: {
  patient: ConsultationPatient;
  physician: PrescriptionPrintPhysician;
  medications: PrescriptionPrintMedicationLine[];
  transId: string;
}): Promise<boolean> {
  const { PDFDocument, rgb } = await import("pdf-lib");
  const [templateBytes, signatureSlot] = await Promise.all([
    loadRxTemplateBytes(),
    fetchPhysicianSignaturePrintLayout("prescription"),
  ]);
  if (!templateBytes) return false;

  const chunks = chunkArray(args.medications, RX_MEDS_PER_PAGE);
  const doc = await PDFDocument.create();
  const font = await embedRxFont(doc);
  const black = rgb(0, 0, 0);

  for (let i = 0; i < chunks.length; i++) {
    const page = await addRxTemplatePage(doc, templateBytes);
    const ctx = buildRxTemplateContext(doc, page, font, black, signatureSlot);
    drawRxPatientHeader(ctx, args.patient, args.physician);
    drawRxMedications(ctx, chunks[i], { startNumber: i * RX_MEDS_PER_PAGE + 1 });
    await drawRxSigFooter(ctx, args.physician, args.transId);
  }

  return finishRxPrint(doc);
}

/** Plans/treatment narrative on RX template (no medication lines, no status change). */
export async function openPlansTreatmentPrintWindow(args: {
  patient: ConsultationPatient;
  physician: PrescriptionPrintPhysician;
  planNotes: string;
  transId: string;
}): Promise<boolean> {
  const notes = args.planNotes.trim();
  if (!notes) return false;

  const ctx = await loadRxTemplateContext();
  if (!ctx) return false;

  drawRxPatientHeader(ctx, args.patient, args.physician);
  drawRxBodyText(ctx, notes);
  await drawRxSigFooter(ctx, args.physician, args.transId);
  return finishRxPrint(ctx.doc);
}
