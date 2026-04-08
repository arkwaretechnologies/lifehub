import { supabase } from "@/lib/supabaseClient";

export const SOCIAL_HISTORY_TABLE = "social_history" as const;

export type SocialHistoryRow = {
  id: string;
  trans_id: string;
  smoker: boolean | null;
  pack_years: number | string | null;
  alcohol_use: boolean | null;
  alcohol_years: number | string | null;
  illicit_drugs: boolean | null;
  drug_notes: string | null;
};

export type YesNoUnknown = "yes" | "no" | "";

export type SocialHistoryForm = {
  smoker: YesNoUnknown;
  pack_years: string;
  alcohol_use: YesNoUnknown;
  alcohol_years: string;
  illicit_drugs: YesNoUnknown;
  drug_notes: string;
};

export const emptySocialHistoryForm: SocialHistoryForm = {
  smoker: "",
  pack_years: "",
  alcohol_use: "",
  alcohol_years: "",
  illicit_drugs: "",
  drug_notes: "",
};

function boolToTri(v: boolean | null | undefined): YesNoUnknown {
  if (v === true) return "yes";
  if (v === false) return "no";
  return "";
}

function numToInput(v: number | string | null | undefined): string {
  if (v == null || v === "") return "";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "";
  const n = Number.parseFloat(String(v));
  return Number.isFinite(n) ? String(v) : "";
}

function rowToForm(row: SocialHistoryRow): SocialHistoryForm {
  const smoker = boolToTri(row.smoker);
  const alcoholUse = boolToTri(row.alcohol_use);
  const illicit = boolToTri(row.illicit_drugs);
  return {
    smoker,
    pack_years: smoker === "yes" ? numToInput(row.pack_years) : "",
    alcohol_use: alcoholUse,
    alcohol_years: alcoholUse === "yes" ? numToInput(row.alcohol_years) : "",
    illicit_drugs: illicit,
    drug_notes: illicit === "yes" ? (row.drug_notes ?? "") : "",
  };
}

/** Matches `numeric(5,2)`: 0–999.99 */
function parseNumeric52(raw: string): number | null {
  const t = raw.trim().replace(",", ".");
  if (!t) return null;
  const n = Number.parseFloat(t);
  if (!Number.isFinite(n) || n < 0 || n > 999.99) return null;
  return Math.round(n * 100) / 100;
}

function triToBool(v: YesNoUnknown): boolean | null {
  if (v === "yes") return true;
  if (v === "no") return false;
  return null;
}

function formToPayload(form: SocialHistoryForm) {
  const smoker = triToBool(form.smoker);
  const alcoholUse = triToBool(form.alcohol_use);
  const illicit = triToBool(form.illicit_drugs);

  const packYears = smoker === true ? parseNumeric52(form.pack_years) : null;
  const alcoholYears = alcoholUse === true ? parseNumeric52(form.alcohol_years) : null;

  const notes = illicit === true ? form.drug_notes.trim() : "";
  return {
    smoker,
    pack_years: packYears,
    alcohol_use: alcoholUse,
    alcohol_years: alcoholYears,
    illicit_drugs: illicit,
    drug_notes: notes || null,
  };
}

export async function fetchSocialHistory(transId: string): Promise<{
  row: SocialHistoryRow | null;
  error: string | null;
}> {
  const { data, error } = await supabase
    .from(SOCIAL_HISTORY_TABLE)
    .select("*")
    .eq("trans_id", transId)
    .limit(1)
    .maybeSingle();

  if (error) {
    return { row: null, error: error.message };
  }
  return { row: (data as SocialHistoryRow) ?? null, error: null };
}

export async function persistSocialHistory(
  transId: string,
  existingRowId: string | null,
  form: SocialHistoryForm
): Promise<{ rowId: string | null; error: string | null }> {
  const payload = formToPayload(form);

  if (existingRowId) {
    const { error } = await supabase.from(SOCIAL_HISTORY_TABLE).update(payload).eq("id", existingRowId);
    return { rowId: existingRowId, error: error?.message ?? null };
  }

  const { data, error } = await supabase
    .from(SOCIAL_HISTORY_TABLE)
    .insert({ trans_id: transId, ...payload })
    .select("id")
    .single();

  if (error) {
    return { rowId: null, error: error.message };
  }
  const id = (data as { id?: string } | null)?.id ?? null;
  return { rowId: id, error: null };
}

export function formFromSocialHistoryRowOrDefault(row: SocialHistoryRow | null): SocialHistoryForm {
  if (!row) return { ...emptySocialHistoryForm };
  return rowToForm(row);
}
