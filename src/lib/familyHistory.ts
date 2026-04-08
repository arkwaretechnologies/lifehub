import { supabase } from "@/lib/supabaseClient";

export const FAMILY_HISTORY_TABLE = "family_history" as const;

export type FamilyHistoryRow = {
  id: string;
  trans_id: string;
  hypertension: boolean | null;
  diabetes: boolean | null;
  cancer: boolean | null;
  heart_disease: boolean | null;
  stroke_cva: boolean | null;
  tuberculosis: boolean | null;
  kidney_disease: boolean | null;
  others: string | null;
};

export type FamilyHistoryForm = {
  hypertension: boolean;
  diabetes: boolean;
  cancer: boolean;
  heart_disease: boolean;
  stroke_cva: boolean;
  tuberculosis: boolean;
  kidney_disease: boolean;
  others: string;
};

export const emptyFamilyHistoryForm: FamilyHistoryForm = {
  hypertension: false,
  diabetes: false,
  cancer: false,
  heart_disease: false,
  stroke_cva: false,
  tuberculosis: false,
  kidney_disease: false,
  others: "",
};

function rowToForm(row: FamilyHistoryRow): FamilyHistoryForm {
  return {
    hypertension: !!row.hypertension,
    diabetes: !!row.diabetes,
    cancer: !!row.cancer,
    heart_disease: !!row.heart_disease,
    stroke_cva: !!row.stroke_cva,
    tuberculosis: !!row.tuberculosis,
    kidney_disease: !!row.kidney_disease,
    others: row.others ?? "",
  };
}

function formToPayload(form: FamilyHistoryForm) {
  const o = form.others.trim();
  return {
    hypertension: form.hypertension,
    diabetes: form.diabetes,
    cancer: form.cancer,
    heart_disease: form.heart_disease,
    stroke_cva: form.stroke_cva,
    tuberculosis: form.tuberculosis,
    kidney_disease: form.kidney_disease,
    others: o ? o.toUpperCase() : null,
  };
}

export async function fetchFamilyHistory(transId: string): Promise<{
  row: FamilyHistoryRow | null;
  error: string | null;
}> {
  const { data, error } = await supabase
    .from(FAMILY_HISTORY_TABLE)
    .select("*")
    .eq("trans_id", transId)
    .limit(1)
    .maybeSingle();

  if (error) {
    return { row: null, error: error.message };
  }
  return { row: (data as FamilyHistoryRow) ?? null, error: null };
}

export async function persistFamilyHistory(
  transId: string,
  existingRowId: string | null,
  form: FamilyHistoryForm
): Promise<{ rowId: string | null; error: string | null }> {
  const payload = formToPayload(form);

  if (existingRowId) {
    const { error } = await supabase
      .from(FAMILY_HISTORY_TABLE)
      .update(payload)
      .eq("id", existingRowId);
    return { rowId: existingRowId, error: error?.message ?? null };
  }

  const { data, error } = await supabase
    .from(FAMILY_HISTORY_TABLE)
    .insert({ trans_id: transId, ...payload })
    .select("id")
    .single();

  if (error) {
    return { rowId: null, error: error.message };
  }
  const id = (data as { id?: string } | null)?.id ?? null;
  return { rowId: id, error: null };
}

export function formFromFamilyRowOrDefault(row: FamilyHistoryRow | null): FamilyHistoryForm {
  if (!row) return { ...emptyFamilyHistoryForm };
  return rowToForm(row);
}
