import type { ConsultationPatient } from "@/components/consultation/consultationTypes";
import { formatDateMMDDYYYY } from "@/lib/dateDisplay";
import type { PDFFont, PDFPage } from "pdf-lib";

export type PrescriptionPrintMedicationLine = {
  drugLine: string;
  quantity: string;
  unit: string;
  frequency?: string;
  notes?: string;
};

export type PrescriptionPrintPhysician = {
  fullname: string;
  specialty: string;
  licenseNo: string;
  ptrNo: string;
  s2No: string;
};

/**
 * Distance from the **top** of the page to the text **baseline** (points, 72 per inch).
 * Template order: (1) PATIENT NAME (2) ADDRESS (3) AGE/SEX + DATE same row — not name→age→date→address.
 */
const LAYOUT = {
  specialty: { fromTop: 76, size: 10 },
  /** 2-column grid: row 1 (left) */
  patientName: { fromTop: 195, x: 172, size: 13 },
  /** 2-column grid: row 1 (right) */
  ageSex: { fromTop: 195, x: 420, size: 13 },
  /** 2-column grid: row 2 (left) — wraps within left column only */
  address: { fromTop: 226, x: 128, maxWidth: 272, size: 13, lineHeight: 13 },
  /** 2-column grid: row 2 (right) */
  date: { fromTop: 226, x: 420, size: 14 },
  /**
   * Right-side fields on the pad:
   * - AGE/SEX is on the same row as PATIENT'S NAME
   * - DATE is on the same row as ADDRESS
   */
  rxStart: { fromTop: 300, x: 56, size: 14, lineHeight: 15 },
  /** Bottom signature area: specialty only (fullname not printed). */
  sigSpecialty: { fromTop: 644, x: 368, size: 9 },
  /** Rx clipping uses same vertical band as signature block. */
  sigBandFromTop: 628,
  /** Bottom LIC / PTR / S2 row above DAW / refills. */
  licRow: { fromTop: 676, x: 72, size: 9, col2: 232, col3: 392 },
} as const;

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
 * Loads `templates/LifeHub_Prescription_Pad_Improved.pdf` (via `/api/prescription-template`),
 * overlays patient / prescriber / medication text, then opens print.
 */
export async function openPrescriptionPrintWindow(args: {
  patient: ConsultationPatient;
  physician: PrescriptionPrintPhysician;
  medications: PrescriptionPrintMedicationLine[];
}): Promise<boolean> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const black = rgb(0, 0, 0);
  const { patient, physician, medications } = args;

  const pageHeight = (h: number, fromTop: number) => h - fromTop;

  function drawCentered(
    page: PDFPage,
    text: string,
    pageWidth: number,
    h: number,
    fromTop: number,
    font: PDFFont,
    size: number,
  ): void {
    const t = text.trim();
    if (!t) return;
    const w = font.widthOfTextAtSize(t, size);
    const x = Math.max(72, (pageWidth - w) / 2);
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
            while (cut > 0 && font.widthOfTextAtSize(rest.slice(0, cut) + (cut < rest.length ? "…" : ""), size) > maxWidth) {
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

  // Always fetch latest template bytes (template file may be updated).
  const res = await fetch("/api/prescription-template", { cache: "no-store" });
  if (!res.ok) {
    return false;
  }

  const templateBytes = await res.arrayBuffer();
  const doc = await PDFDocument.load(templateBytes);
  const page = doc.getPages()[0];
  const { width, height } = page.getSize();

  // Match app typography closer (Inter/Segoe UI/Roboto style). We use Helvetica as a reliable built-in sans-serif.
  const font = await doc.embedFont(StandardFonts.Helvetica);

  drawCentered(page, physician.specialty.toUpperCase(), width, height, LAYOUT.specialty.fromTop, font, LAYOUT.specialty.size);

  const dateStr = formatDateMMDDYYYY(patient.date) || "";

  if (patient.name.trim()) {
    page.drawText(patient.name.trim(), {
      x: LAYOUT.patientName.x,
      y: pageHeight(height, LAYOUT.patientName.fromTop),
      size: LAYOUT.patientName.size,
      font,
      color: black,
    });
  }

  const ageBaselineY = pageHeight(height, LAYOUT.ageSex.fromTop);
  const dateBaselineY = pageHeight(height, LAYOUT.date.fromTop);
  if (patient.address.trim()) {
    drawWrapped(
      page,
      patient.address.trim(),
      LAYOUT.address.x,
      pageHeight(height, LAYOUT.address.fromTop),
      LAYOUT.address.maxWidth,
      font,
      LAYOUT.address.size,
      LAYOUT.address.lineHeight,
    );
  }

  if (patient.ageSex.trim()) {
    page.drawText(patient.ageSex.trim(), {
      x: LAYOUT.ageSex.x,
      y: ageBaselineY,
      size: LAYOUT.ageSex.size,
      font,
      color: black,
    });
  }
  if (dateStr) {
    page.drawText(dateStr, {
      x: LAYOUT.date.x,
      y: dateBaselineY,
      size: LAYOUT.date.size,
      font,
      color: black,
    });
  }

  const rxAnchorY = Math.min(ageBaselineY, dateBaselineY) - 24;
  let yRx = Math.min(pageHeight(height, LAYOUT.rxStart.fromTop), rxAnchorY);
  const maxRxW = width - LAYOUT.rxStart.x - 56;
  const sigYMin = pageHeight(height, LAYOUT.sigBandFromTop) + 48;
  let n = 1;
  for (const m of medications) {
    if (yRx < sigYMin) break;
    const q = m.quantity.trim();
    const u = m.unit.trim();
    const qtyPart = [q && `Qty: ${q}`, u].filter(Boolean).join(" ");
    const freqPart = (m.frequency ?? "").trim();
    const notesPart = (m.notes ?? "").trim();
    const tailParts = [qtyPart, freqPart && `Freq: ${freqPart}`, notesPart && `Notes: ${notesPart}`]
      .filter(Boolean)
      .join("   ");
    const line = `${n}. ${m.drugLine}${tailParts ? `  ${tailParts}` : ""}`;
    yRx = drawWrapped(page, line, LAYOUT.rxStart.x, yRx, maxRxW, font, LAYOUT.rxStart.size, LAYOUT.rxStart.lineHeight);
    // Add a small blank gap between medications (in addition to wrapped line spacing).
    yRx -= Math.round(LAYOUT.rxStart.lineHeight * 0.35);
    n += 1;
  }

  if (physician.specialty.trim()) {
    page.drawText(physician.specialty.trim().toUpperCase(), {
      x: LAYOUT.sigSpecialty.x,
      y: pageHeight(height, LAYOUT.sigSpecialty.fromTop),
      size: LAYOUT.sigSpecialty.size,
      font,
      color: black,
    });
  }

  const lic = physician.licenseNo.trim() || "_______________";
  const ptr = physician.ptrNo.trim() || "_______________";
  const s2 = physician.s2No.trim() || "_______________";
  const lr = LAYOUT.licRow;
  // page.drawText(`LIC NO: ${lic}`, { x: lr.x, y: pageHeight(height, lr.fromTop), size: lr.size, font, color: black });
  // page.drawText(`PTR no. ${ptr}`, { x: lr.col2, y: pageHeight(height, lr.fromTop), size: lr.size, font, color: black });
  // page.drawText(`S2 no. ${s2}`, { x: lr.col3, y: pageHeight(height, lr.fromTop), size: lr.size, font, color: black });

  const out = await doc.save();
  const blob = new Blob([out as BlobPart], { type: "application/pdf" });
  printPdfBlob(blob);
  return true;
}
