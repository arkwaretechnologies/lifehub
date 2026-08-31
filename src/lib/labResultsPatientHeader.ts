import { formatDateMMDDYYYY } from "@/lib/dateDisplay";
import {
  formatResultsReleasedDateTime,
  formatResultsRequestDateTime,
  type ResultsPrintPatientHeader,
} from "@/lib/resultsPrintPatientFields";
import type { PDFPage, PDFFont } from "pdf-lib";
import { rgb } from "pdf-lib";

const REF_W = 612;
const REF_H = 792;
const PRINT_TEXT_BLACK = rgb(0, 0, 0);

/** Lab result template patient-information slots (612×792 ref). */
const LAB_PATIENT_HEADER_SLOTS = {
  name: { refX: 118, refFromTop: 194, fontSize: 9 },
  dateRequested: { refX: 395, refFromTop: 194, fontSize: 9 },
  ageSex: { refX: 118, refFromTop: 216, fontSize: 9 },
  dob: { refX: 254, refFromTop: 216, fontSize: 9 },
  dateReleased: { refX: 395, refFromTop: 216, fontSize: 9 },
  address: { refX: 118, refFromTop: 235, fontSize: 8, maxWidth: 200, lineHeight: 8 },
  /** Contact on address row, directly above Patient ID. */
  contact: { refX: 376, refFromTop: 235, fontSize: 9, maxWidth: 120, lineHeight: 7 },
  philhealth: { refX: 500, refFromTop: 235, fontSize: 8, maxWidth: 250, lineHeight: 7 },
  /** Keep physician text left of Patient ID. */
  physician: { refX: 172, refFromTop: 255, fontSize: 8, maxWidth: 190 },
  patientId: { refX: 376, refFromTop: 255, fontSize: 9 },
} as const;

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

/** Overlay patient information on laboratory result PDF templates. */
export function drawLabResultsPatientHeader(
  page: PDFPage,
  header: ResultsPrintPatientHeader,
  font: PDFFont,
): void {
  const name = (header.patient_name ?? "").trim() || "—";
  const dt = formatResultsRequestDateTime(header.request_date, header.request_time);
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
  const released = formatResultsReleasedDateTime(header.results_released_at);

  const s = LAB_PATIENT_HEADER_SLOTS;
  drawAtTopRef(page, name, s.name.refX, s.name.refFromTop, s.name.fontSize, font);
  drawAtTopRef(page, dt, s.dateRequested.refX, s.dateRequested.refFromTop, s.dateRequested.fontSize, font);
  drawAtTopRef(page, ageSex, s.ageSex.refX, s.ageSex.refFromTop, s.ageSex.fontSize, font);
  drawAtTopRef(page, dob, s.dob.refX, s.dob.refFromTop, s.dob.fontSize, font);
  drawAtTopRef(page, addr, s.address.refX, s.address.refFromTop, s.address.fontSize, font, {
    maxWidth: s.address.maxWidth,
    lineHeight: s.address.lineHeight,
  });
  drawAtTopRef(page, contact, s.contact.refX, s.contact.refFromTop, s.contact.fontSize, font, {
    maxWidth: s.contact.maxWidth,
    lineHeight: s.contact.lineHeight,
  });
  drawAtTopRef(page, phil, s.philhealth.refX, s.philhealth.refFromTop, s.philhealth.fontSize, font, {
    maxWidth: s.philhealth.maxWidth,
    lineHeight: s.philhealth.lineHeight,
  });
  drawAtTopRef(page, physician, s.physician.refX, s.physician.refFromTop, s.physician.fontSize, font, {
    maxWidth: s.physician.maxWidth,
  });
  drawAtTopRef(page, pid, s.patientId.refX, s.patientId.refFromTop, s.patientId.fontSize, font);
  drawAtTopRef(page, released, s.dateReleased.refX, s.dateReleased.refFromTop, s.dateReleased.fontSize, font);
}
