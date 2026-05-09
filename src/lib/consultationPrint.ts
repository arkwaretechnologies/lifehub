import type { ConsultationPatient } from "@/components/consultation/consultationTypes";
import type { AllergiesForm } from "@/lib/allergies";
import type { FamilyHistoryForm } from "@/lib/familyHistory";
import type { ObstetricHistoryForm } from "@/lib/obstetricHistory";
import type { PastMedicalHistoryForm } from "@/lib/pastMedicalHistory";
import type { PhysicalExaminationForm } from "@/lib/physicalExamination";
import type { PreviousHospitalizationForm } from "@/lib/previousHospitalizations";
import type { ReviewOfSystemsForm } from "@/lib/reviewOfSystems";
import type { SocialHistoryForm } from "@/lib/socialHistory";
import type { SurgicalHistoryForm } from "@/lib/surgicalHistory";
import type { PDFFont, PDFPage } from "pdf-lib";

type ConsultationPrintPhysician = {
  fullname: string;
  licenseNo: string;
};

type ConsultationPrintDetails = {
  chiefComplaint: string;
  historyOfPresentIllness: string;
  physicalExaminationForm: PhysicalExaminationForm;
  focusedExamNotes: string;
  clinicalDiagnosis: string;
  planLabs: boolean;
  planImaging: boolean;
  planMedications: boolean;
  planReferral: boolean;
  planNotes: string;
  disposition: string;
  vitalBp: string;
  vitalHr: string;
  vitalRr: string;
  vitalTemp: string;
  vitalO2: string;
  vitalPain: string;
  anthropometricWeight: string;
  anthropometricHeight: string;
  anthropometricBmi: string;
  pastMedicalHistory: PastMedicalHistoryForm;
  familyHistory: FamilyHistoryForm;
  socialHistory: SocialHistoryForm;
  surgicalHistory: SurgicalHistoryForm;
  previousHospitalization: PreviousHospitalizationForm;
  obstetricHistory: ObstetricHistoryForm;
  reviewOfSystems: ReviewOfSystemsForm;
  allergies: AllergiesForm;
  currentMedications: string[];
};

type RosCheckboxPlacement = { x: number; fromTop: number; on: (form: ReviewOfSystemsForm) => boolean };
type PeCheckboxPlacement = { x: number; fromTop: number; on: (form: PhysicalExaminationForm) => boolean };

// Review of Systems block shown in the first ROS panel image.
const ROS_CHECKBOXES_P1: RosCheckboxPlacement[] = [
  { x: 155,fromTop: 597, on: (f) => f.ros_fever },
  { x: 190, fromTop: 597, on: (f) => f.ros_weight_loss },
  { x: 245, fromTop: 597, on: (f) => f.ros_fatigue },
  { x: 115, fromTop: 609, on: (f) => f.ros_vision_changes },
  { x: 185, fromTop: 609, on: (f) => f.ros_eye_redness },
  { x: 231, fromTop: 609, on: (f) => f.ros_eye_discharge },
  { x: 171, fromTop: 621, on: (f) => f.ros_hearing_changes },
  { x: 249, fromTop: 621, on: (f) => f.ros_nasal_congestion },
  { x: 327, fromTop: 621, on: (f) => f.ros_sore_throat },
  { x: 159, fromTop: 633, on: (f) => f.ros_chest_pain },
  { x: 213, fromTop: 633, on: (f) => f.ros_palpitations },
  { x: 273, fromTop: 633, on: (f) => f.ros_edema },
  { x: 145, fromTop: 645, on: (f) => f.ros_sob },
  { x: 235, fromTop: 645, on: (f) => f.ros_wheezing },
  { x: 283, fromTop: 645, on: (f) => f.ros_cough },
  { x: 163, fromTop: 657, on: (f) => f.ros_nausea },
  { x: 202, fromTop: 657, on: (f) => f.ros_vomiting },
  { x: 251, fromTop: 657, on: (f) => f.ros_diarrhea },
  { x: 298, fromTop: 657, on: (f) => f.ros_abdominal_pain },
  { x: 155, fromTop: 669, on: (f) => f.ros_urinary_frequency },
  { x: 248, fromTop: 669, on: (f) => f.ros_urinary_urgency },
  { x: 295, fromTop: 669, on: (f) => f.ros_incontinence },
  { x: 163, fromTop: 681, on: (f) => f.ros_joint_pain },
  { x: 214, fromTop: 681, on: (f) => f.ros_muscle_weakness },
  { x: 146, fromTop: 693, on: (f) => f.ros_rashes },
  { x: 187, fromTop: 693, on: (f) => f.ros_lesions },
  { x: 228, fromTop: 693, on: (f) => f.ros_lumps },
  { x: 149, fromTop: 705, on: (f) => f.ros_headaches },
  { x: 204, fromTop: 705, on: (f) => f.ros_dizziness },
  { x: 254, fromTop: 705, on: (f) => f.ros_numbness },
];

// Review of Systems continuation shown in the second ROS panel image.
const ROS_CHECKBOXES_P2: RosCheckboxPlacement[] = [
  { x: 143, fromTop: 82, on: (f) => f.ros_depression },
  { x: 200, fromTop: 82, on: (f) => f.ros_anxiety },
  { x: 242, fromTop: 82, on: (f) => f.ros_sleep_disturbances },
  { x: 139, fromTop: 93, on: (f) => f.ros_hot_flashes },
  { x: 193, fromTop: 93, on: (f) => f.ros_heat_cold_intolerance },
  { x: 297, fromTop: 93, on: (f) => f.ros_excessive_thirst },
  { x: 196, fromTop: 105, on: (f) => f.ros_easy_bruising },
  { x: 260, fromTop: 105, on: (f) => f.ros_bleeding },
  { x: 304, fromTop: 105, on: (f) => f.ros_swollen_glands },
  { x: 148, fromTop: 117, on: (f) => f.ros_seasonal_allergies },
  { x: 231, fromTop: 117, on: (f) => f.ros_frequent_infections },
  { x: 320, fromTop: 117, on: (f) => f.ros_hives_rashes },
];

/** Page 2 overlay — CHIEF COMPLAINT (adjust independently of HPI). */
const CHIEF_COMPLAINT_P2 = {
  x: 92,
  fromTop: 180,
  maxWidthSubtract: 180,
  fontSize: 8.7,
  lineHeight: 11,
} as const;

/** Page 2 overlay — HISTORY OF PRESENT ILLNESS. */
const HISTORY_OF_PRESENT_ILLNESS_P2 = {
  x: 92,
  fromTop: 220,
  // Narrow wrapping width so lines stay inside the History of Present Illness box.
  // Keep x/fromTop unchanged (box position is already correct).
  maxWidthSubtract: 180,
  fontSize: 8.7,
  lineHeight: 11,
} as const;

/** Page 2 — PHYSICAL EXAMINATION (left column on template). */
const PHYSICAL_EXAMINATION_P2 = {
  x: 102,
  fromTop: 280,
  maxWidthSubtract: 330,
  fontSize: 8.7,
  lineHeight: 11,
} as const;

type WrappedFieldPlacement<T> = {
  x: number;
  fromTop: number;
  maxWidth: number;
  fontSize: number;
  lineHeight: number;
  value: (form: T) => string;
};

// Page 2 — "OTHERS" line per physical exam section.
const PHYSICAL_EXAM_OTHERS_P2: WrappedFieldPlacement<PhysicalExaminationForm>[] = [
  { x: 310, fromTop: 429, maxWidth: 210, fontSize: 7.6, lineHeight: 9, value: (f) => f.pe_general_notes },
  { x: 94, fromTop: 479, maxWidth: 270, fontSize: 7.6, lineHeight: 9, value: (f) => f.pe_heent_notes },
  { x: 94, fromTop: 531, maxWidth: 270, fontSize: 7.6, lineHeight: 9, value: (f) => f.pe_chest_notes },
  { x: 94, fromTop: 568, maxWidth: 270, fontSize: 7.6, lineHeight: 9, value: (f) => f.pe_cvs_notes },
  { x: 94, fromTop: 618, maxWidth: 270, fontSize: 7.6, lineHeight: 9, value: (f) => f.pe_abdomen_notes },
  { x: 94, fromTop: 668, maxWidth: 270, fontSize: 7.6, lineHeight: 9, value: (f) => f.pe_gu_notes },
  { x: 300, fromTop: 701, maxWidth: 70, fontSize: 7.6, lineHeight: 9, value: (f) => f.pe_ext_notes },
];

/** Page 2 — NEUROLOGIC EXAMINATION (right column; tune x/fromTop to match boxes). */
const NEUROLOGIC_EXAMINATION_P2 = {
  x: 350,
  fromTop: 305,
  maxWidthSubtract: 380,
  fontSize: 8.7,
  lineHeight: 11,
} as const;

// Page 2 — Neurologic text fields (aligned to printed labels/lines).
const NEURO_CEREBRAL_P2 = { x: 466, fromTop: 523, size: 8 } as const;
const NEURO_CNS_I_P2 = { x: 440, fromTop: 554, size: 8 } as const;
const NEURO_CNS_II_III_P2 = { x: 452, fromTop: 566, size: 8 } as const;
const NEURO_CNS_IV_VI_P2 = { x: 465, fromTop: 575, size: 8 } as const;
const NEURO_CNS_V_VII_P2 = { x: 455, fromTop: 586, size: 8 } as const;
const NEURO_CNS_VIII_P2 = { x: 450, fromTop: 597, size: 8 } as const;
const NEURO_CNS_IX_X_P2 = { x: 452, fromTop: 607, size: 8 } as const;
const NEURO_CNS_XI_XII_P2 = { x: 455, fromTop: 617, size: 8 } as const;
const NEURO_CEREBELLAR_P2 = { x: 487, fromTop: 638, size: 8 } as const;
const NEURO_MOTOR_STRENGTH_P2 = { x: 429, fromTop: 672, size: 8 } as const;
const NEURO_SENSORY_REFLEX_P2 = { x: 429, fromTop: 700, size: 8 } as const;

// Page 2 — Physical Exam checkboxes (template calibration values).
const PHYSICAL_EXAM_CHECKBOXES_P2: PeCheckboxPlacement[] = [
  { x: 137, fromTop: 429, on: (f) => f.pe_general_alert },
  { x: 176, fromTop: 429, on: (f) => f.pe_general_distress },
  { x: 226, fromTop: 429, on: (f) => f.pe_general_drowsy },
  { x: 272, fromTop: 429, on: (f) => f.pe_general_coma },
  { x: 150, fromTop: 443, on: (f) => f.pe_heent_lids_conj_nil },
  { x: 225, fromTop: 443, on: (f) => f.pe_heent_perrla },
  { x: 268, fromTop: 443, on: (f) => f.pe_heent_tym_canal },
  { x: 327, fromTop: 443, on: (f) => f.pe_heent_nasal_nl },
  { x: 93, fromTop: 456, on: (f) => f.pe_heent_lips_teeth_gums },
  { x: 92, fromTop: 507, on: (f) => f.pe_chest_nl_resp_effort },
  { x: 170, fromTop: 507, on: (f) => f.pe_chest_cbs },
  { x: 195, fromTop: 507, on: (f) => f.pe_chest_nl_palpation },
  { x: 267, fromTop: 507, on: (f) => f.pe_chest_nl_symmetry },
  { x: 114, fromTop: 545, on: (f) => f.pe_cvs_rrr },
  { x: 143, fromTop: 545, on: (f) => f.pe_cvs_no_murmur_gallop },
  { x: 244, fromTop: 545, on: (f) => f.pe_cvs_nl_s1s2 },
  { x: 288, fromTop: 545, on: (f) => f.pe_cvs_pulses },
  { x: 94, fromTop: 595, on: (f) => f.pe_abdomen_no_tenderness },
  { x: 199, fromTop: 595, on: (f) => f.pe_abdomen_liver_spleen },
  { x: 268, fromTop: 595, on: (f) => f.pe_abdomen_no_hernia },
  { x: 325, fromTop: 595, on: (f) => f.pe_abdomen_bs_present },
  { x: 352, fromTop: 595, on: (f) => f.pe_abdomen_no_guarding },
  { x: 110, fromTop: 634, on: (f) => f.pe_gu_male },
  { x: 145, fromTop: 634, on: (f) => f.pe_gu_female },
  { x: 189, fromTop: 634, on: (f) => f.pe_gu_no_cva_tenderness },
  { x: 287, fromTop: 634, on: (f) => f.pe_gu_scrotal_wnl },
  { x: 397, fromTop: 634, on: (f) => f.pe_gu_pelvic_nl },
  { x: 92, fromTop: 684, on: (f) => f.pe_ext_nl_gait },
  { x: 136, fromTop: 684, on: (f) => f.pe_ext_nl_strength },
  { x: 205, fromTop: 684, on: (f) => f.pe_ext_nl_digits_nails },
  { x: 284, fromTop: 684, on: (f) => f.pe_ext_nl_clubbing_tone },
  { x: 180, fromTop: 702, on: (f) => f.pe_ext_edema },
  { x: 221, fromTop: 702, on: (f) => f.pe_ext_ulcers },
];

// Page 2 — Neurologic checkbox row (MMS), separate coordinates per checkbox.
const NEURO_MMS_ALERT_CHECKBOX_P2 = { x: 454, fromTop: 455 } as const;
const NEURO_MMS_ORIENTED_CHECKBOX_P2 = { x: 492, fromTop: 455 } as const;
const NEURO_MMS_JUDGMENT_INSIGHT_CHECKBOX_P2 = { x: 474, fromTop: 466 } as const;
const NEURO_MMS_MEMORY_CHECKBOX_P2 = { x: 514, fromTop: 478 } as const;
const NEURO_MMS_MOOD_CHECKBOX_P2 = { x: 469, fromTop: 491 } as const;
const NEURO_MMS_NO_DELUSIONS_CHECKBOX_P2 = { x: 505, fromTop: 491 } as const;

// Page 3 — Plans/Treatment checklist (separate coordinates per item).
const PLAN_LABS_CHECKBOX_P3 = { x: 93, fromTop: 297 } as const;
const PLAN_IMAGING_CHECKBOX_P3 = { x: 96, fromTop: 297 } as const;
const PLAN_MEDICATIONS_CHECKBOX_P3 = { x: 191, fromTop: 297 } as const;
const PLAN_REFERRAL_CHECKBOX_P3 = { x: 96, fromTop: 311 } as const;
const PLAN_NOTES_MAIN_P3 = {
  x: 94,
  fromTop: 326,
  maxWidthSubtract: 200,
  lineHeight: 11,
} as const;
const PLAN_NOTES_LABS_P3 = {
  x: 94,
  fromTop: 327,
  maxWidthSubtract: 200,
  lineHeight: 11,
} as const;
const PLAN_NOTES_IMAGING_P3 = {
  x: 94,
  fromTop: PLAN_NOTES_LABS_P3.fromTop + 10,
  maxWidthSubtract: 200,
  lineHeight: 11,
} as const;
const PLAN_NOTES_MEDICATIONS_P3 = {
  x: 94,
  fromTop: PLAN_NOTES_LABS_P3.fromTop + 20,
  maxWidthSubtract: 200,
  lineHeight: 11,
} as const;
const PLAN_NOTES_REFERRAL_P3 = {
  x: 94,
  fromTop: PLAN_NOTES_LABS_P3.fromTop + 30,
  maxWidthSubtract: 200,
  lineHeight: 11,
} as const;

const DISPOSITION_CHECKBOXES_P3: { x: number; fromTop: number; on: (d: ConsultationPrintDetails) => boolean }[] = [
  { x: 129, fromTop: 558, on: (d) => d.disposition.trim().toLowerCase() === "home" },
  { x: 176, fromTop: 558, on: (d) => d.disposition.trim().toLowerCase() === "medico legal" },
  { x: 267, fromTop: 558, on: (d) => d.disposition.trim().toLowerCase() === "advise admission" },
  { x: 380, fromTop: 558, on: (d) => d.disposition.trim().toLowerCase() === "absconded" },
  { x: 459, fromTop: 558, on: (d) => d.disposition.trim().toLowerCase() === "dama" },
];

function drawReviewOfSystemsCheckboxes(
  page: PDFPage,
  form: ReviewOfSystemsForm,
  font: PDFFont,
  placements: RosCheckboxPlacement[],
): void {
  for (const item of placements) {
    drawCheckboxMark(page, item.x, item.fromTop, item.on(form), font);
  }
}

function drawPhysicalExamCheckboxes(
  page: PDFPage,
  form: PhysicalExaminationForm,
  font: PDFFont,
  placements: PeCheckboxPlacement[],
): void {
  for (const item of placements) {
    drawCheckboxMark(page, item.x, item.fromTop, item.on(form), font);
  }
}

function drawWrappedFields<T>(
  page: PDFPage,
  form: T,
  font: PDFFont,
  placements: WrappedFieldPlacement<T>[],
): void {
  for (const item of placements) {
    const value = item.value(form).trim();
    if (!value) continue;
    const { height } = page.getSize();
    drawWrapped(
      page,
      value,
      item.x,
      height - item.fromTop,
      item.maxWidth,
      font,
      item.fontSize,
      item.lineHeight,
    );
  }
}

function extractTitledSection(text: string, title: string): { section: string; rest: string } {
  const lines = text.split(/\r?\n/);
  const titleLc = `${title.trim().toLowerCase()}:`;
  const kept: string[] = [];
  const section: string[] = [];
  let inSection = false;
  for (const raw of lines) {
    const line = raw.trimEnd();
    const lineLc = line.trim().toLowerCase();
    const isHeading = /^[a-z0-9/\s]+:$/i.test(line.trim());
    if (lineLc === titleLc) {
      inSection = true;
      continue;
    }
    if (inSection && isHeading) inSection = false;
    if (inSection) section.push(line);
    else kept.push(line);
  }
  return { section: section.join("\n").trim(), rest: kept.join("\n").trim() };
}

function extractImagingBlock(text: string): { section: string; rest: string } {
  const startTag = "[IMAGING_REQUEST]";
  const endTag = "[/IMAGING_REQUEST]";
  const start = text.indexOf(startTag);
  const end = text.indexOf(endTag);
  if (start === -1 || end === -1 || end < start) return { section: "", rest: text.trim() };
  const block = text.slice(start + startTag.length, end);
  const cleaned = block
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter((x) => x.length > 0 && x !== "IMAGING REQUEST:")
    .join("\n");
  const rest = `${text.slice(0, start)} ${text.slice(end + endTag.length)}`.trim();
  return { section: cleaned, rest };
}

function splitPlanNotesForPrint(text: string): {
  main: string;
  labs: string;
  imaging: string;
  medications: string;
  referral: string;
} {
  const normalized = (text ?? "").trim();
  const { section: imagingFromTag, rest: afterImagingTag } = extractImagingBlock(normalized);
  const { section: imagingFromTitle, rest: afterImaging } = extractTitledSection(
    afterImagingTag,
    "IMAGING",
  );
  const imaging = imagingFromTag || imagingFromTitle;
  const { section: labs, rest: afterLabs } = extractTitledSection(afterImaging, "LABS/RESULTS");
  const { section: medications, rest: afterMeds } = extractTitledSection(afterLabs, "MEDICATIONS");
  const { section: referral, rest: main } = extractTitledSection(afterMeds, "REFERRAL");
  return {
    main: main.trim(),
    labs: labs.trim(),
    imaging: imaging.trim(),
    medications: medications.trim(),
    referral: referral.trim(),
  };
}

function printPdfBlob(blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const iframe = document.createElement("iframe");
  iframe.setAttribute("title", "Consultation print");
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
    if (!line) return;
    page.drawText(line, { x, y, size, font });
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
  return y;
}

function drawWrappedPreserveNewlines(
  page: PDFPage,
  text: string,
  x: number,
  yStart: number,
  maxWidth: number,
  font: PDFFont,
  size: number,
  lineHeight: number,
): number {
  const blocks = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  let y = yStart;
  for (const line of blocks) {
    y = drawWrapped(page, line, x, y, maxWidth, font, size, lineHeight);
  }
  return y;
}

function drawAtTop(page: PDFPage, text: string, x: number, fromTop: number, size: number, font: PDFFont): void {
  const t = text.trim();
  if (!t) return;
  const { height } = page.getSize();
  page.drawText(t, { x, y: height - fromTop, size, font });
}

/** Marks a template checkbox when checked (overlay on ☐). */
function drawCheckboxMark(
  page: PDFPage,
  x: number,
  fromTop: number,
  checked: boolean,
  font: PDFFont,
): void {
  if (!checked) return;
  const { height } = page.getSize();
  page.drawText("X", { x, y: height - fromTop, size: 7, font });
}

export async function openConsultationPrintWindow(args: {
  patient: ConsultationPatient;
  physician: ConsultationPrintPhysician;
  details: ConsultationPrintDetails;
}): Promise<boolean> {
  const { patient, physician, details } = args;
  const { PDFDocument, StandardFonts } = await import("pdf-lib");
  const res = await fetch("/api/consultation-template", { cache: "no-store" });
  if (!res.ok) return false;

  const templateBytes = await res.arrayBuffer();
  const doc = await PDFDocument.load(templateBytes);
  const font = await doc.embedFont(StandardFonts.Helvetica);

  const [p1, p2, p3] = doc.getPages();

  if (p1) {
    const size = 8;
    const size2 = 7;
    drawAtTop(p1, patient.name, 120, 166, size, font);
    drawAtTop(p1, patient.date, 340, 166, size, font);
    drawAtTop(p1, patient.time, 400, 166, size, font);

    drawAtTop(p1, patient.ageSex, 128, 183, size, font);
    drawAtTop(p1, patient.dob, 235, 183, size, font);
    drawAtTop(p1, patient.civilStatus, 363, 183, size, font);

    drawAtTop(p1, patient.address, 128, 201, size, font);
    drawAtTop(p1, patient.contactNo, 252, 201, size, font);
    drawAtTop(p1, patient.occupation, 365, 201, size, font);

    drawAtTop(p1, patient.referringPhysician, 170, 220, size, font);
    drawAtTop(p1, patient.patientId, 364, 219, size, font);
    drawAtTop(p1, patient.philhealthNo, 492, 220, size, font);

    // VITAL SIGNS row
    drawAtTop(p1, details.vitalBp, 103, 289, size2, font);
    drawAtTop(p1, details.vitalHr, 140, 289, size, font);
    drawAtTop(p1, details.vitalRr, 175, 289, size, font);
    drawAtTop(p1, details.vitalTemp, 222, 289, size, font);
    drawAtTop(p1, details.vitalO2, 118, 301, size, font);
    drawAtTop(p1, details.vitalPain, 218, 301, size, font);

    // ANTHROPOMETRIC row
    drawAtTop(p1, details.anthropometricWeight, 348, 289, size, font);
    drawAtTop(p1, details.anthropometricHeight, 395, 289, size, font);
    drawAtTop(p1, details.anthropometricBmi, 435, 289, size, font);

    // PAST MEDICAL HISTORY (checkboxes match LH-HPE-001 template order)
    const pmh = details.pastMedicalHistory;
    const chk = (x: number, fromTop: number, on: boolean) => drawCheckboxMark(p1, x, fromTop, on, font);
    // Row 1: Hypertension, Diabetes, Asthma
    chk(92, 336, pmh.hypertension);
    chk(160, 336, pmh.diabetes);
    chk(209, 336, pmh.asthma);
    // Row 2: Heart disease, Kidney disease/stones
    chk(92, 348, pmh.heart_disease);
    chk(160, 348, pmh.kidney_disease);
    // Row 3: Stroke/CVA, Thyroid, TB
    chk(92, 359, pmh.stroke_cva);
    chk(157, 359, pmh.thyroid_disease);
    chk(235, 359, pmh.tuberculosis);
    const others = pmh.others.trim();
    if (others) {
      const { height, width } = p1.getSize();
      drawWrapped(p1, others, 125, height - 370, width - 140, font, size, 10);
    }

    // ALLERGIES: None | Food | Drugs + reaction line (LH-HPE-001)
    const ag = details.allergies;
    const chkA = (x: number, fromTop: number, on: boolean) => drawCheckboxMark(p1, x, fromTop, on, font);
    const allergyRowTop = 325;
    chkA(316, allergyRowTop, ag.no_known_allergy);
    const foodOn = !ag.no_known_allergy && ag.food_allergy.trim().length > 0;
    const drugOn = !ag.no_known_allergy && ag.drug_allergy.trim().length > 0;
    chkA(353, allergyRowTop, foodOn);
    chkA(426, allergyRowTop, drugOn);
    if (foodOn) drawAtTop(p1, ag.food_allergy.trim().slice(0, 42), 387, allergyRowTop, size2, font);
    if (drugOn) drawAtTop(p1, ag.drug_allergy.trim().slice(0, 42), 465, allergyRowTop, size2, font);
    const reaction = ag.reaction_type.trim();
    if (reaction && !ag.no_known_allergy) {
      const { height: h1, width: w1 } = p1.getSize();
      drawWrapped(p1, reaction, 320, h1 - 346, w1 - 72, font, size, 10);
    }

    const med1 = (details.currentMedications[0] ?? "").trim();
    const med2 = (details.currentMedications[1] ?? "").trim();
    if (med1) drawAtTop(p1, med1, 320, 366, size2, font);
    if (med2) drawAtTop(p1, med2, 320, 377, size2, font);

    // FAMILY HISTORY: checkboxes + Others
    const fh = details.familyHistory;
    const chkF = (x: number, fromTop: number, on: boolean) => drawCheckboxMark(p1, x, fromTop, on, font);
    chkF(91, 401, fh.hypertension);
    chkF(160, 401, fh.diabetes);
    chkF(210, 401, fh.cancer);
    chkF(92, 413, fh.heart_disease);
    chkF(91, 424, fh.stroke_cva);
    chkF(157, 424, fh.tuberculosis);
    chkF(184, 424, fh.kidney_disease);
    const fhOthers = fh.others.trim();
    if (fhOthers) {
      const { height: hF, width: wF } = p1.getSize();
      drawWrapped(p1, fhOthers, 92, hF - 435, wF - 72, font, size2, 10);
    }

    // SOCIAL HISTORY: smoking/alcohol/drugs yes-no + details
    const sh = details.socialHistory;
    const isYes = (v: string) => v.trim().toLowerCase() === "yes";
    const isNo = (v: string) => v.trim().toLowerCase() === "no";

    // Smoking
    chkF(354, 401, isYes(sh.smoker));
    chkF(379, 401, isNo(sh.smoker));
    const packYears = sh.pack_years.trim();
    if (packYears) drawAtTop(p1, packYears, 448, 401, size2, font);

    // Alcohol
    chkF(350, 413, isYes(sh.alcohol_use));
    chkF(376, 413, isNo(sh.alcohol_use));
    const alcoholYears = sh.alcohol_years.trim();
    if (alcoholYears) drawAtTop(p1, alcoholYears, 430, 413, size2, font);

    // Drugs
    chkF(344, 424, isYes(sh.illicit_drugs));
    chkF(369, 424, isNo(sh.illicit_drugs));
    const drugNotes = sh.drug_notes.trim();
    if (drugNotes) {
      const { height: hS, width: wS } = p1.getSize();
      drawWrapped(p1, drugNotes, 344, hS - 434, wS - 72, font, size2, 10);
    }

    // SURGICAL HISTORY: checkboxes + Other procedures
    const sg = details.surgicalHistory;
    chkF(92, 458, sg.no_surgery);
    chkF(137, 458, sg.appendectomy);
    chkF(165, 458, sg.cholecystectomy);
    chkF(187, 458, sg.cabg);
    chkF(221, 458, sg.c_section);
    chkF(268, 458, sg.hernia_repair);
    chkF(92, 471, sg.cataract);
    const sgOthers = sg.other_procedures.trim();
    if (sgOthers) {
      const { height: hG, width: wG } = p1.getSize();
      drawWrapped(p1, sgOthers, 92, hG - 482, wG - 72, font, size2, 10);
    }

    // PREVIOUS HOSPITALIZATION: Never/Other + table row values
    const ph = details.previousHospitalization;
    chkF(92, 503, ph.never);
    chkF(92, 516, ph.other);
    const phYear = ph.year.trim();
    const phHospital = ph.hospital.trim();
    const phDiagnosis = ph.diagnosis.trim();
    if (phYear) drawAtTop(p1, phYear, 92, 542, size2, font);
    if (phHospital) drawAtTop(p1, phHospital, 142, 542, size2, font);
    if (phDiagnosis) drawAtTop(p1, phDiagnosis, 215, 542, size2, font);

    // OBSTETRIC: N/A + dates + options + GPAL + values
    const ob = details.obstetricHistory;
    const obYes = (v: string) => v.trim().toLowerCase() === "yes" || v.trim().toLowerCase() === "y";
    const obNo = (v: string) => v.trim().toLowerCase() === "no" || v.trim().toLowerCase() === "n";
    chkF(366, 448, ob.not_applicable);
    if (ob.lmp.trim()) drawAtTop(p1, ob.lmp.trim(), 341, 459, size2, font);
    chkF(369, 471, obYes(ob.pregnant));
    chkF(398, 471, obNo(ob.pregnant));
    if (ob.edc.trim()) drawAtTop(p1, ob.edc.trim(), 360, 486, size2, font);
    if (ob.aog.trim()) drawAtTop(p1, ob.aog.trim(), 425, 486, size2, font);
    if (ob.wks.trim()) drawAtTop(p1, ob.wks.trim(), 488, 486, size2, font);
    chkF(335, 492, ob.edc_by_utz);
    chkF(372, 492, ob.edc_by_lmp);
    if (ob.gravida.trim()) drawAtTop(p1, ob.gravida.trim(), 325, 526, size2, font);
    if (ob.para.trim()) drawAtTop(p1, ob.para.trim(), 370, 526, size2, font);
    if (ob.full_term.trim()) drawAtTop(p1, ob.full_term.trim(), 402, 526, size2, font);
    if (ob.premature.trim()) drawAtTop(p1, ob.premature.trim(), 435, 526, size2, font);
    if (ob.abortion.trim()) drawAtTop(p1, ob.abortion.trim(), 470, 526, size2, font);
    if (ob.living.trim()) drawAtTop(p1, ob.living.trim(), 505, 526, size2, font);
    if (ob.fh_cm.trim()) drawAtTop(p1, ob.fh_cm.trim(), 360, 538, size2, font);
    if (ob.efw_g.trim()) drawAtTop(p1, ob.efw_g.trim(), 360, 548, size2, font);
    chkF(340, 560, obYes(ob.prenatal));
    chkF(369, 560, obNo(ob.prenatal));

    // REVIEW OF SYSTEMS (first block) lives on page 1.
    drawReviewOfSystemsCheckboxes(p1, details.reviewOfSystems, font, ROS_CHECKBOXES_P1);
  }

  if (p2) {
    const { width, height } = p2.getSize();
    const yTop = (n: number) => height - n;

    drawReviewOfSystemsCheckboxes(p2, details.reviewOfSystems, font, ROS_CHECKBOXES_P2);

    drawWrapped(
      p2,
      details.chiefComplaint,
      CHIEF_COMPLAINT_P2.x,
      yTop(CHIEF_COMPLAINT_P2.fromTop),
      width - CHIEF_COMPLAINT_P2.maxWidthSubtract,
      font,
      CHIEF_COMPLAINT_P2.fontSize,
      CHIEF_COMPLAINT_P2.lineHeight,
    );
    drawWrapped(
      p2,
      details.historyOfPresentIllness,
      HISTORY_OF_PRESENT_ILLNESS_P2.x,
      yTop(HISTORY_OF_PRESENT_ILLNESS_P2.fromTop),
      width - HISTORY_OF_PRESENT_ILLNESS_P2.maxWidthSubtract,
      font,
      HISTORY_OF_PRESENT_ILLNESS_P2.fontSize,
      HISTORY_OF_PRESENT_ILLNESS_P2.lineHeight,
    );
    drawPhysicalExamCheckboxes(
      p2,
      details.physicalExaminationForm,
      font,
      PHYSICAL_EXAM_CHECKBOXES_P2,
    );
    drawCheckboxMark(
      p2,
      NEURO_MMS_ALERT_CHECKBOX_P2.x,
      NEURO_MMS_ALERT_CHECKBOX_P2.fromTop,
      details.physicalExaminationForm.pe_neuro_alert,
      font,
    );
    drawCheckboxMark(
      p2,
      NEURO_MMS_ORIENTED_CHECKBOX_P2.x,
      NEURO_MMS_ORIENTED_CHECKBOX_P2.fromTop,
      details.physicalExaminationForm.pe_neuro_oriented,
      font,
    );
    drawCheckboxMark(
      p2,
      NEURO_MMS_JUDGMENT_INSIGHT_CHECKBOX_P2.x,
      NEURO_MMS_JUDGMENT_INSIGHT_CHECKBOX_P2.fromTop,
      details.physicalExaminationForm.pe_neuro_judgment_insight,
      font,
    );
    drawCheckboxMark(
      p2,
      NEURO_MMS_MEMORY_CHECKBOX_P2.x,
      NEURO_MMS_MEMORY_CHECKBOX_P2.fromTop,
      details.physicalExaminationForm.pe_neuro_memory,
      font,
    );
    drawCheckboxMark(
      p2,
      NEURO_MMS_MOOD_CHECKBOX_P2.x,
      NEURO_MMS_MOOD_CHECKBOX_P2.fromTop,
      details.physicalExaminationForm.pe_neuro_mood,
      font,
    );
    drawCheckboxMark(
      p2,
      NEURO_MMS_NO_DELUSIONS_CHECKBOX_P2.x,
      NEURO_MMS_NO_DELUSIONS_CHECKBOX_P2.fromTop,
      details.physicalExaminationForm.pe_neuro_no_delusions,
      font,
    );
    drawWrappedFields(p2, details.physicalExaminationForm, font, PHYSICAL_EXAM_OTHERS_P2);
    const nf = details.physicalExaminationForm;
    drawAtTop(p2, nf.pe_neuro_cerebral, NEURO_CEREBRAL_P2.x, NEURO_CEREBRAL_P2.fromTop, NEURO_CEREBRAL_P2.size, font);
    drawAtTop(p2, nf.pe_neuro_cn_i, NEURO_CNS_I_P2.x, NEURO_CNS_I_P2.fromTop, NEURO_CNS_I_P2.size, font);
    drawAtTop(
      p2,
      nf.pe_neuro_cn_ii_iii,
      NEURO_CNS_II_III_P2.x,
      NEURO_CNS_II_III_P2.fromTop,
      NEURO_CNS_II_III_P2.size,
      font,
    );
    drawAtTop(p2, nf.pe_neuro_cn_iv_vi, NEURO_CNS_IV_VI_P2.x, NEURO_CNS_IV_VI_P2.fromTop, NEURO_CNS_IV_VI_P2.size, font);
    drawAtTop(
      p2,
      nf.pe_neuro_cn_v_vii,
      NEURO_CNS_V_VII_P2.x,
      NEURO_CNS_V_VII_P2.fromTop,
      NEURO_CNS_V_VII_P2.size,
      font,
    );
    drawAtTop(p2, nf.pe_neuro_cn_viii, NEURO_CNS_VIII_P2.x, NEURO_CNS_VIII_P2.fromTop, NEURO_CNS_VIII_P2.size, font);
    drawAtTop(p2, nf.pe_neuro_cn_ix_x, NEURO_CNS_IX_X_P2.x, NEURO_CNS_IX_X_P2.fromTop, NEURO_CNS_IX_X_P2.size, font);
    drawAtTop(
      p2,
      nf.pe_neuro_cn_xi_xii,
      NEURO_CNS_XI_XII_P2.x,
      NEURO_CNS_XI_XII_P2.fromTop,
      NEURO_CNS_XI_XII_P2.size,
      font,
    );
    drawAtTop(
      p2,
      nf.pe_neuro_cerebellar,
      NEURO_CEREBELLAR_P2.x,
      NEURO_CEREBELLAR_P2.fromTop,
      NEURO_CEREBELLAR_P2.size,
      font,
    );
    drawAtTop(
      p2,
      nf.pe_neuro_motor_strength,
      NEURO_MOTOR_STRENGTH_P2.x,
      NEURO_MOTOR_STRENGTH_P2.fromTop,
      NEURO_MOTOR_STRENGTH_P2.size,
      font,
    );
    drawAtTop(
      p2,
      nf.pe_neuro_sensory_reflex,
      NEURO_SENSORY_REFLEX_P2.x,
      NEURO_SENSORY_REFLEX_P2.fromTop,
      NEURO_SENSORY_REFLEX_P2.size,
      font,
    );
  }

  if (p3) {
    const { width, height } = p3.getSize();
    const yTop = (n: number) => height - n;
    const size = 8.8;

    drawWrapped(
      p3,
      details.focusedExamNotes,
      94,
      yTop(93),
      width - 200,
      font,
      size,
      11,
    );
    drawWrapped(
      p3,
      details.clinicalDiagnosis,
      94,
      yTop(194),
      width - 200,
      font,
      size,
      11,
    );
    const planSplit = splitPlanNotesForPrint(details.planNotes);
    drawWrapped(
      p3,
      planSplit.main,
      PLAN_NOTES_MAIN_P3.x,
      yTop(PLAN_NOTES_MAIN_P3.fromTop),
      width - PLAN_NOTES_MAIN_P3.maxWidthSubtract,
      font,
      size,
      PLAN_NOTES_MAIN_P3.lineHeight,
    );
    drawWrappedPreserveNewlines(
      p3,
      planSplit.labs,
      PLAN_NOTES_LABS_P3.x,
      yTop(PLAN_NOTES_LABS_P3.fromTop),
      width - PLAN_NOTES_LABS_P3.maxWidthSubtract,
      font,
      size,
      PLAN_NOTES_LABS_P3.lineHeight,
    );
    drawWrappedPreserveNewlines(
      p3,
      planSplit.imaging,
      PLAN_NOTES_IMAGING_P3.x,
      yTop(PLAN_NOTES_IMAGING_P3.fromTop),
      width - PLAN_NOTES_IMAGING_P3.maxWidthSubtract,
      font,
      size,
      PLAN_NOTES_IMAGING_P3.lineHeight,
    );
    drawWrappedPreserveNewlines(
      p3,
      planSplit.medications,
      PLAN_NOTES_MEDICATIONS_P3.x,
      yTop(PLAN_NOTES_MEDICATIONS_P3.fromTop),
      width - PLAN_NOTES_MEDICATIONS_P3.maxWidthSubtract,
      font,
      size,
      PLAN_NOTES_MEDICATIONS_P3.lineHeight,
    );
    drawWrappedPreserveNewlines(
      p3,
      planSplit.referral,
      PLAN_NOTES_REFERRAL_P3.x,
      yTop(PLAN_NOTES_REFERRAL_P3.fromTop),
      width - PLAN_NOTES_REFERRAL_P3.maxWidthSubtract,
      font,
      size,
      PLAN_NOTES_REFERRAL_P3.lineHeight,
    );

    drawCheckboxMark(p3, PLAN_LABS_CHECKBOX_P3.x, PLAN_LABS_CHECKBOX_P3.fromTop, details.planLabs, font);
    drawCheckboxMark(
      p3,
      PLAN_IMAGING_CHECKBOX_P3.x,
      PLAN_IMAGING_CHECKBOX_P3.fromTop,
      details.planImaging,
      font,
    );
    drawCheckboxMark(
      p3,
      PLAN_MEDICATIONS_CHECKBOX_P3.x,
      PLAN_MEDICATIONS_CHECKBOX_P3.fromTop,
      details.planMedications,
      font,
    );
    drawCheckboxMark(
      p3,
      PLAN_REFERRAL_CHECKBOX_P3.x,
      PLAN_REFERRAL_CHECKBOX_P3.fromTop,
      details.planReferral,
      font,
    );
    for (const item of DISPOSITION_CHECKBOXES_P3) {
      drawCheckboxMark(p3, item.x, item.fromTop, item.on(details), font);
    }
    drawAtTop(p3, physician.fullname, 123, 623, 9, font);
    drawAtTop(p3, physician.licenseNo, 112, 366, 9, font);
  }

  const out = await doc.save();
  const blob = new Blob([out as BlobPart], { type: "application/pdf" });
  printPdfBlob(blob);
  return true;
}
