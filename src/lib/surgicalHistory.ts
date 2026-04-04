import { supabase } from "@/lib/supabaseClient";

export const SURGICAL_HISTORY_TABLE = "surgical_history" as const;

export type SurgicalHistoryRow = {
  id: string;
  trans_id: string;
  no_surgery: boolean | null;
  appendectomy: boolean | null;
  cholecystectomy: boolean | null;
  cabg: boolean | null;
  c_section: boolean | null;
  hernia_repair: boolean | null;
  cataract: boolean | null;
  other_procedures: string | null;
};

export type SurgicalHistoryForm = {
  no_surgery: boolean;
  appendectomy: boolean;
  cholecystectomy: boolean;
  cabg: boolean;
  c_section: boolean;
  hernia_repair: boolean;
  cataract: boolean;
  other_procedures: string;
};

export const emptySurgicalHistoryForm: SurgicalHistoryForm = {
  no_surgery: false,
  appendectomy: false,
  cholecystectomy: false,
  cabg: false,
  c_section: false,
  hernia_repair: false,
  cataract: false,
  other_procedures: "",
};

function rowToForm(row: SurgicalHistoryRow): SurgicalHistoryForm {
  return {
    no_surgery: !!row.no_surgery,
    appendectomy: !!row.appendectomy,
    cholecystectomy: !!row.cholecystectomy,
    cabg: !!row.cabg,
    c_section: !!row.c_section,
    hernia_repair: !!row.hernia_repair,
    cataract: !!row.cataract,
    other_procedures: row.other_procedures ?? "",
  };
}

function formToPayload(form: SurgicalHistoryForm) {
  if (form.no_surgery) {
    return {
      no_surgery: true,
      appendectomy: false,
      cholecystectomy: false,
      cabg: false,
      c_section: false,
      hernia_repair: false,
      cataract: false,
      other_procedures: null,
    };
  }
  const o = form.other_procedures.trim();
  return {
    no_surgery: false,
    appendectomy: form.appendectomy,
    cholecystectomy: form.cholecystectomy,
    cabg: form.cabg,
    c_section: form.c_section,
    hernia_repair: form.hernia_repair,
    cataract: form.cataract,
    other_procedures: o ? o.toUpperCase() : null,
  };
}

export async function fetchSurgicalHistory(transId: string): Promise<{
  row: SurgicalHistoryRow | null;
  error: string | null;
}> {
  const { data, error } = await supabase
    .from(SURGICAL_HISTORY_TABLE)
    .select("*")
    .eq("trans_id", transId)
    .limit(1)
    .maybeSingle();

  if (error) {
    return { row: null, error: error.message };
  }
  return { row: (data as SurgicalHistoryRow) ?? null, error: null };
}

export async function persistSurgicalHistory(
  transId: string,
  existingRowId: string | null,
  form: SurgicalHistoryForm
): Promise<{ rowId: string | null; error: string | null }> {
  const payload = formToPayload(form);

  if (existingRowId) {
    const { error } = await supabase
      .from(SURGICAL_HISTORY_TABLE)
      .update(payload)
      .eq("id", existingRowId);
    return { rowId: existingRowId, error: error?.message ?? null };
  }

  const { data, error } = await supabase
    .from(SURGICAL_HISTORY_TABLE)
    .insert({ trans_id: transId, ...payload })
    .select("id")
    .single();

  if (error) {
    return { rowId: null, error: error.message };
  }
  const id = (data as { id?: string } | null)?.id ?? null;
  return { rowId: id, error: null };
}

export function formFromSurgicalRowOrDefault(row: SurgicalHistoryRow | null): SurgicalHistoryForm {
  if (!row) return { ...emptySurgicalHistoryForm };
  return rowToForm(row);
}
