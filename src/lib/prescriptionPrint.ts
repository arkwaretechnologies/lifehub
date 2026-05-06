import type { ConsultationPatient } from "@/components/consultation/consultationTypes";
import { formatDateMMDDYYYY } from "@/lib/dateDisplay";
import type { PDFFont, PDFPage } from "pdf-lib";

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
};

/** A5 portrait at 72 dpi (PDF points). */
const A5_W = 420;
const A5_H = 595;

function formatDobMMDDYYYY(raw: string): string {
  const s = (raw ?? "").trim();
  if (!s) return "";
  const m1 = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m1) return `${m1[2]}-${m1[3]}-${m1[1]}`;
  const m2 = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (m2) return `${m2[1]}-${m2[2]}-${m2[3]}`;
  const m3 = s.match(/^(\d{2})-(\d{2})-(\d{4})/);
  if (m3) return `${m3[1]}-${m3[2]}-${m3[3]}`;
  // Fallback: return as-is if unknown format.
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

/** Pluralize dispensary unit on printed RX when quantity is greater than 1. */
function pluralizeRxUnit(unit: string, quantityRaw: string): string {
  const u = unit.trim();
  if (!u) return u;

  const raw = (quantityRaw ?? "").trim().replace(/,/g, "");
  if (!raw) return u;
  const n = Number.parseFloat(raw);
  if (!Number.isFinite(n) || n <= 1) return u;

  const lower = u.toLowerCase();
  if (RX_UNIT_ALREADY_PLURAL.has(lower)) return u;

  // Volume/mass abbreviations — do not append "s".
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

/**
 * Prescription overlay layout for `templates/RX Template.pdf` (A5).
 * All `fromTop` values are distance from the **top** of the page to the text **baseline** (PDF points).
 */
function prescriptionLayout(pageWidth: number, pageHeight: number) {
  // These are tuned to the visible input boxes of the RX Template.
  // If the page isn't exactly A5, we scale coordinates proportionally.
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
    qr: { x: 40, fromTop: py(470), size: px(62) },
  } as const;
}

function isRoughlyA5(w: number, h: number): boolean {
  const dw = Math.abs(w - A5_W) / A5_W;
  const dh = Math.abs(h - A5_H) / A5_H;
  return dw <= 0.03 && dh <= 0.03;
}

/**
 * Ensures the output PDF page is true A5 so browser print preview shows the actual size.
 * If the template page isn't A5, it is uniformly scaled and centered onto an A5 page.
 */
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

/**
 * Loads `templates/RX Template.pdf` (via `/api/prescription-template`),
 * overlays patient / prescriber / medication text for the template page size (A5), then opens print.
 */
export async function openPrescriptionPrintWindow(args: {
  patient: ConsultationPatient;
  physician: PrescriptionPrintPhysician;
  medications: PrescriptionPrintMedicationLine[];
  transId: string;
}): Promise<boolean> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const black = rgb(0, 0, 0);
  const { patient, physician, medications, transId } = args;

  const pageHeight = (h: number, fromTop: number) => h - fromTop;

  function drawCentered(
    page: PDFPage,
    text: string,
    pageWidth: number,
    h: number,
    fromTop: number,
    font: PDFFont,
    size: number,
    minX: number,
  ): void {
    const t = text.trim();
    if (!t) return;
    const w = font.widthOfTextAtSize(t, size);
    const x = Math.max(minX, (pageWidth - w) / 2);
    page.drawText(t, { x, y: pageHeight(h, fromTop), size, font, color: black });
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

  const res = await fetch("/api/prescription-template", { cache: "no-store" });
  if (!res.ok) {
    return false;
  }

  const templateBytes = await res.arrayBuffer();
  const doc = await PDFDocument.load(templateBytes);
  const page = doc.getPages()[0];
  normalizePageToA5(page);
  const { width, height } = page.getSize();
  const L = prescriptionLayout(width, height);

  // Prefer SF Pro (San Francisco) if you provide the font file.
  // Put one of these files in `public/fonts/`:
  // - SF-Pro-Text-Regular.otf (recommended)
  // - SF-Pro-Display-Regular.otf
  // If not present, we fall back to Helvetica.
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
    // ignore and keep Helvetica
  }

  drawCentered(page, physician.specialty.toUpperCase(), width, height, L.specialty.fromTop, font, L.specialty.size, L.margin);

  const dateStr = formatDateMMDDYYYY(patient.date) || "";
  const dateTimeStr = [dateStr, (patient.time ?? "").trim()].filter(Boolean).join(" ");
  const dobStr = formatDobMMDDYYYY(patient.dob ?? "");
  const contactStr = (patient.contactNo ?? "").trim();

  if (patient.name.trim()) {
    page.drawText(patient.name.trim(), {
      x: L.patientName.x,
      y: pageHeight(height, L.patientName.fromTop),
      size: L.patientName.size,
      font,
      color: black,
    });
  }

  const ageBaselineY = pageHeight(height, L.ageSex.fromTop);
  const dateBaselineY = pageHeight(height, L.dateTime.fromTop);
  if (patient.address.trim()) {
    drawWrapped(
      page,
      patient.address.trim(),
      L.address.x,
      pageHeight(height, L.address.fromTop),
      L.address.maxWidth,
      font,
      L.address.size,
      L.address.lineHeight,
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
      y: pageHeight(height, L.dob.fromTop),
      size: L.dob.size,
      font,
      color: black,
    });
  }
  if (contactStr) {
    page.drawText(contactStr, {
      x: L.contactNo.x,
      y: pageHeight(height, L.contactNo.fromTop),
      size: L.contactNo.size,
      font,
      color: black,
    });
  }

  // Start meds at the dedicated Rx area (avoid overlapping the AGE/SEX row).
  let yRx = pageHeight(height, L.rxStart.fromTop);
  const maxRxW = width - L.rxStart.x - L.margin;
  const sigYMin = pageHeight(height, L.sigBandFromTop) + height * 0.04;
  let n = 1;
  for (const m of medications) {
    if (yRx < sigYMin) break;
    const q = m.quantity.trim();
    const u = m.unit.trim();
    const unitPrinted = pluralizeRxUnit(u, q);
    const qtyPart = [q && `#: ${q}`, unitPrinted].filter(Boolean).join(" ");
    const sigPart = (m.notes ?? "").trim();
    const mainLine = `${n}. ${m.drugLine}${qtyPart ? `  ${qtyPart}` : ""}`;
    yRx = drawWrapped(page, mainLine, L.rxStart.x, yRx, maxRxW, font, L.rxStart.size, L.rxStart.lineHeight);
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
      );
    }
    // Extra gap before the next medication so each entry reads as its own block.
    yRx -= Math.round(L.rxStart.lineHeight * 1.35);
    n += 1;
  }

  if (physician.specialty.trim()) {
    page.drawText(physician.specialty.trim().toUpperCase(), {
      x: L.sigSpecialty.x,
      y: pageHeight(height, L.sigSpecialty.fromTop),
      size: L.sigSpecialty.size,
      font,
      color: black,
    });
  }

  const tid = String(transId ?? "").trim();
  if (tid) {
    const QRCode = (await import("qrcode")).default;
    const dataUrl = await QRCode.toDataURL(tid, {
      errorCorrectionLevel: "M",
      margin: 0,
      scale: 6,
      color: { dark: "#000000", light: "#FFFFFF" },
    });
    const b64 = dataUrl.split(",")[1] ?? "";
    if (b64) {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const img = await doc.embedPng(bytes);
      const s = L.qr.size;
      page.drawImage(img, {
        x: L.qr.x,
        y: pageHeight(height, L.qr.fromTop) - s,
        width: s,
        height: s,
      });
    }
  }

  const out = await doc.save();
  const blob = new Blob([out as BlobPart], { type: "application/pdf" });
  printPdfBlob(blob);
  return true;
}
