import { supabase } from "@/lib/supabaseClient";
import {
  fetchEncounterClinicalDiagnosis,
  fetchEncounterPhysicianRecord,
} from "@/lib/consultationData";
import { isoDateFromUnknown } from "@/lib/dateDisplay";
import { fetchFocusedExamNotes } from "@/lib/physicalExamination";
import { clinicDateYmd } from "@/lib/queueTicketDate";

export const MEDICAL_CERTIFICATES_TABLE = "medical_certificates" as const;

export type MedicalCertificateRow = {
  id: string;
  trans_id: string;
  chief_complaint: string | null;
  physical_exam_findings: string | null;
  clinical_impression: string | null;
  recommendations_remarks: string | null;
  issued_date: string | null;
};

export type MedicalCertificateForm = {
  chief_complaint: string;
  physical_exam_findings: string;
  clinical_impression: string;
  recommendations_remarks: string;
  issued_date: string;
};

export const emptyMedicalCertificateForm = (): MedicalCertificateForm => ({
  chief_complaint: "",
  physical_exam_findings: "",
  clinical_impression: "",
  recommendations_remarks: "",
  issued_date: clinicDateYmd(),
});

function rowToForm(row: MedicalCertificateRow): MedicalCertificateForm {
  return {
    chief_complaint: row.chief_complaint ?? "",
    physical_exam_findings: row.physical_exam_findings ?? "",
    clinical_impression: row.clinical_impression ?? "",
    recommendations_remarks: row.recommendations_remarks ?? "",
    issued_date: isoDateFromUnknown(row.issued_date) || clinicDateYmd(),
  };
}

function formToPayload(form: MedicalCertificateForm) {
  const issued = isoDateFromUnknown(form.issued_date);
  return {
    chief_complaint: form.chief_complaint.trim() || null,
    physical_exam_findings: form.physical_exam_findings.trim() || null,
    clinical_impression: form.clinical_impression.trim() || null,
    recommendations_remarks: form.recommendations_remarks.trim() || null,
    issued_date: issued || null,
    updated_at: new Date().toISOString(),
  };
}

export async function fetchMedicalCertificateForEncounter(transId: string): Promise<{
  row: MedicalCertificateRow | null;
  error: string | null;
}> {
  const id = transId.trim();
  if (!id) return { row: null, error: "Invalid encounter." };

  const { data, error } = await supabase
    .from(MEDICAL_CERTIFICATES_TABLE)
    .select("*")
    .eq("trans_id", id)
    .maybeSingle();

  if (error) return { row: null, error: error.message };
  return { row: (data as MedicalCertificateRow) ?? null, error: null };
}

export async function buildMedicalCertificateFormWithPrefill(transId: string): Promise<{
  form: MedicalCertificateForm;
  rowId: string | null;
  error: string | null;
}> {
  const { row, error } = await fetchMedicalCertificateForEncounter(transId);
  if (error) return { form: emptyMedicalCertificateForm(), rowId: null, error };
  if (row) return { form: rowToForm(row), rowId: row.id, error: null };

  const [physician, diagnosis, focused] = await Promise.all([
    fetchEncounterPhysicianRecord(transId),
    fetchEncounterClinicalDiagnosis(transId),
    fetchFocusedExamNotes(transId),
  ]);

  const form = emptyMedicalCertificateForm();
  if (!physician.error) form.chief_complaint = physician.form.chief_complaint;
  if (!diagnosis.error) form.clinical_impression = diagnosis.form.clinical_diagnosis;
  if (!focused.error) form.physical_exam_findings = focused.notes;

  return { form, rowId: null, error: null };
}

export async function persistMedicalCertificate(
  transId: string,
  existingRowId: string | null,
  form: MedicalCertificateForm,
): Promise<{ rowId: string | null; error: string | null }> {
  const id = transId.trim();
  if (!id) return { rowId: null, error: "Invalid encounter." };

  const payload = formToPayload(form);

  if (existingRowId) {
    const { error } = await supabase
      .from(MEDICAL_CERTIFICATES_TABLE)
      .update(payload)
      .eq("id", existingRowId);
    return { rowId: existingRowId, error: error?.message ?? null };
  }

  const { data, error } = await supabase
    .from(MEDICAL_CERTIFICATES_TABLE)
    .insert({ trans_id: id, ...payload })
    .select("id")
    .single();

  if (error) return { rowId: null, error: error.message };
  const rowId = (data as { id?: string } | null)?.id ?? null;
  return { rowId, error: null };
}
