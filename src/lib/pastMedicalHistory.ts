import { supabase } from "@/lib/supabaseClient";

export const PAST_MEDICAL_HISTORY_TABLE = "past_medical_history" as const;

export type PastMedicalHistoryRow = {
  id: string;
  trans_id: string;
  hypertension: boolean | null;
  diabetes: boolean | null;
  asthma: boolean | null;
  heart_disease: boolean | null;
  kidney_disease: boolean | null;
  stroke_cva: boolean | null;
  thyroid_disease: boolean | null;
  tuberculosis: boolean | null;
  others: string | null;
};

export type PastMedicalHistoryForm = {
  hypertension: boolean;
  diabetes: boolean;
  asthma: boolean;
  heart_disease: boolean;
  kidney_disease: boolean;
  stroke_cva: boolean;
  thyroid_disease: boolean;
  tuberculosis: boolean;
  others: string;
};

export const emptyPastMedicalHistoryForm: PastMedicalHistoryForm = {
  hypertension: false,
  diabetes: false,
  asthma: false,
  heart_disease: false,
  kidney_disease: false,
  stroke_cva: false,
  thyroid_disease: false,
  tuberculosis: false,
  others: "",
};

function rowToForm(row: PastMedicalHistoryRow): PastMedicalHistoryForm {
  return {
    hypertension: !!row.hypertension,
    diabetes: !!row.diabetes,
    asthma: !!row.asthma,
    heart_disease: !!row.heart_disease,
    kidney_disease: !!row.kidney_disease,
    stroke_cva: !!row.stroke_cva,
    thyroid_disease: !!row.thyroid_disease,
    tuberculosis: !!row.tuberculosis,
    others: row.others ?? "",
  };
}

function formToPayload(form: PastMedicalHistoryForm) {
  const o = form.others.trim();
  return {
    hypertension: form.hypertension,
    diabetes: form.diabetes,
    asthma: form.asthma,
    heart_disease: form.heart_disease,
    kidney_disease: form.kidney_disease,
    stroke_cva: form.stroke_cva,
    thyroid_disease: form.thyroid_disease,
    tuberculosis: form.tuberculosis,
    others: o ? o.toUpperCase() : null,
  };
}

export async function fetchPastMedicalHistory(transId: string): Promise<{
  row: PastMedicalHistoryRow | null;
  error: string | null;
}> {
  const { data, error } = await supabase
    .from(PAST_MEDICAL_HISTORY_TABLE)
    .select("*")
    .eq("trans_id", transId)
    .limit(1)
    .maybeSingle();

  if (error) {
    return { row: null, error: error.message };
  }
  return { row: (data as PastMedicalHistoryRow) ?? null, error: null };
}

export async function persistPastMedicalHistory(
  transId: string,
  existingRowId: string | null,
  form: PastMedicalHistoryForm
): Promise<{ rowId: string | null; error: string | null }> {
  const payload = formToPayload(form);

  if (existingRowId) {
    const { error } = await supabase
      .from(PAST_MEDICAL_HISTORY_TABLE)
      .update(payload)
      .eq("id", existingRowId);
    return { rowId: existingRowId, error: error?.message ?? null };
  }

  const { data, error } = await supabase
    .from(PAST_MEDICAL_HISTORY_TABLE)
    .insert({ trans_id: transId, ...payload })
    .select("id")
    .single();

  if (error) {
    return { rowId: null, error: error.message };
  }
  const id = (data as { id?: string } | null)?.id ?? null;
  return { rowId: id, error: null };
}

export function formFromRowOrDefault(row: PastMedicalHistoryRow | null): PastMedicalHistoryForm {
  if (!row) return { ...emptyPastMedicalHistoryForm };
  return rowToForm(row);
}
