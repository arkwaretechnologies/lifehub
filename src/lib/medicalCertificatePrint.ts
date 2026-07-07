import type { ConsultationPatient } from "@/components/consultation/consultationTypes";
import { authenticatedFetch } from "@/lib/authenticatedFetch";
import { formatDateMMDDYYYY } from "@/lib/dateDisplay";
import type { MedicalCertificateForm } from "@/lib/medicalCertificate";
import type { PDFDocument, PDFFont, PDFPage, RGB } from "pdf-lib";

const A5_W = 420;
const A5_H = 596;

function medicalCertificateLayout(pageWidth: number, pageHeight: number) {
  const sx = pageWidth / A5_W;
  const sy = pageHeight / A5_H;
  const px = (n: number) => n * sx;
  const py = (n: number) => n * sy;

  return {
    name: { x: px(50), fromTop: py(177), size: 8 },
    ageSex: { x: px(55), fromTop: py(189), size: 8 },
    address: { x: px(55), fromTop: py(199), maxWidth: px(280), size: 8, lineHeight: 9.5 },
    contactNo: { x: px(90), fromTop: py(210), size: 8},
    chiefComplaint: { x: px(117), fromTop: py(231), maxWidth: px(320), size: 8, lineHeight: 9.5 },
    physicalExamFindings: { x: px(11), fromTop: py(265), maxWidth: px(320), size: 8, lineHeight: 9.5 },
    clinicalImpression: { x: px(11), fromTop: py(309), maxWidth: px(320), size: 8, lineHeight: 9.5 },
    recommendations: { x: px(11), fromTop: py(363), maxWidth: px(320), size: 8, lineHeight: 9.5 },
    issuedDate: { x: px(67), fromTop: py(475), size: 8 },
  } as const;
}

function pageHeightFromTop(pageHeight: number, fromTop: number): number {
  return pageHeight - fromTop;
}

function drawAtTop(
  page: PDFPage,
  text: string,
  x: number,
  fromTop: number,
  size: number,
  font: PDFFont,
  color: RGB,
): void {
  const t = text.trim().toUpperCase();
  if (!t) return;
  const { height } = page.getSize();
  page.drawText(t, { x, y: pageHeightFromTop(height, fromTop), size, font, color });
}

function drawWrapped(
  page: PDFPage,
  text: string,
  x: number,
  fromTop: number,
  maxWidth: number,
  font: PDFFont,
  size: number,
  lineHeight: number,
  color: RGB,
): void {
  const { height } = page.getSize();
  const words = text.trim().toUpperCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return;
  let line = "";
  let y = pageHeightFromTop(height, fromTop);

  const flush = () => {
    if (!line) return;
    page.drawText(line, { x, y, size, font, color });
    y -= lineHeight;
    line = "";
  };

  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(next, size) <= maxWidth) {
      line = next;
    } else {
      flush();
      line = w;
    }
  }
  flush();
}

function printPdfBlob(blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const iframe = document.createElement("iframe");
  iframe.setAttribute("title", "Medical certificate print");
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

async function embedMedicalCertificateFonts(doc: PDFDocument): Promise<{ font: PDFFont; fontBold: PDFFont }> {
  const { StandardFonts } = await import("pdf-lib");
  let font = await doc.embedFont(StandardFonts.Helvetica);
  let fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  try {
    const regularCandidates = ["/fonts/calibri.ttf", "/fonts/Calibri.ttf"];
    for (const url of regularCandidates) {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) continue;
      font = await doc.embedFont(await res.arrayBuffer(), { subset: true });
      break;
    }

    const boldCandidates = ["/fonts/calibrib.ttf", "/fonts/Calibri-Bold.ttf"];
    for (const url of boldCandidates) {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) continue;
      fontBold = await doc.embedFont(await res.arrayBuffer(), { subset: true });
      break;
    }
  } catch {
    // keep Helvetica fallbacks
  }

  return { font, fontBold };
}

export async function openMedicalCertificatePrintWindow(args: {
  patient: ConsultationPatient;
  cert: MedicalCertificateForm;
}): Promise<boolean> {
  const { patient, cert } = args;
  const { PDFDocument, rgb } = await import("pdf-lib");

  const templateRes = await authenticatedFetch("/api/medical-certificate-template", { cache: "no-store" });
  if (!templateRes.ok) return false;

  const templateBytes = await templateRes.arrayBuffer();
  const doc = await PDFDocument.load(templateBytes);
  const page = doc.getPages()[0];
  if (!page) return false;

  const { fontBold } = await embedMedicalCertificateFonts(doc);
  const black = rgb(0, 0, 0);
  const { width, height } = page.getSize();
  const L = medicalCertificateLayout(width, height);

  drawAtTop(page, patient.name, L.name.x, L.name.fromTop, L.name.size, fontBold, black);
  drawAtTop(page, patient.ageSex, L.ageSex.x, L.ageSex.fromTop, L.ageSex.size, fontBold, black);
  if (patient.address.trim()) {
    drawWrapped(
      page,
      patient.address,
      L.address.x,
      L.address.fromTop,
      L.address.maxWidth,
      fontBold,
      L.address.size,
      L.address.lineHeight,
      black,
    );
  }
  drawAtTop(page, patient.contactNo, L.contactNo.x, L.contactNo.fromTop, L.contactNo.size, fontBold, black);

  if (cert.chief_complaint.trim()) {
    drawWrapped(
      page,
      cert.chief_complaint,
      L.chiefComplaint.x,
      L.chiefComplaint.fromTop,
      L.chiefComplaint.maxWidth,
      fontBold,
      L.chiefComplaint.size,
      L.chiefComplaint.lineHeight,
      black,
    );
  }
  if (cert.physical_exam_findings.trim()) {
    drawWrapped(
      page,
      cert.physical_exam_findings,
      L.physicalExamFindings.x,
      L.physicalExamFindings.fromTop,
      L.physicalExamFindings.maxWidth,
      fontBold,
      L.physicalExamFindings.size,
      L.physicalExamFindings.lineHeight,
      black,
    );
  }
  if (cert.clinical_impression.trim()) {
    drawWrapped(
      page,
      cert.clinical_impression,
      L.clinicalImpression.x,
      L.clinicalImpression.fromTop,
      L.clinicalImpression.maxWidth,
      fontBold,
      L.clinicalImpression.size,
      L.clinicalImpression.lineHeight,
      black,
    );
  }
  if (cert.recommendations_remarks.trim()) {
    drawWrapped(
      page,
      cert.recommendations_remarks,
      L.recommendations.x,
      L.recommendations.fromTop,
      L.recommendations.maxWidth,
      fontBold,
      L.recommendations.size,
      L.recommendations.lineHeight,
      black,
    );
  }

  const issued = formatDateMMDDYYYY(cert.issued_date);
  if (issued) {
    drawAtTop(page, issued, L.issuedDate.x, L.issuedDate.fromTop, L.issuedDate.size, fontBold, black);
  }

  const out = await doc.save();
  const blob = new Blob([out as BlobPart], { type: "application/pdf" });
  printPdfBlob(blob);
  return true;
}
