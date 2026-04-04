import { supabase } from "@/lib/supabaseClient";

export const ALLERGIES_TABLE = "allergies" as const;

export type AllergiesRow = {
  id: string;
  trans_id: string;
  no_known_allergy: boolean | null;
  food_allergy: string | null;
  drug_allergy: string | null;
  reaction_type: string | null;
};

export type AllergiesForm = {
  no_known_allergy: boolean;
  food_allergy: string;
  drug_allergy: string;
  reaction_type: string;
};

export const emptyAllergiesForm: AllergiesForm = {
  no_known_allergy: false,
  food_allergy: "",
  drug_allergy: "",
  reaction_type: "",
};

function rowToForm(row: AllergiesRow): AllergiesForm {
  return {
    no_known_allergy: !!row.no_known_allergy,
    food_allergy: row.food_allergy ?? "",
    drug_allergy: row.drug_allergy ?? "",
    reaction_type: row.reaction_type ?? "",
  };
}

function formToPayload(form: AllergiesForm) {
  if (form.no_known_allergy) {
    return {
      no_known_allergy: true,
      food_allergy: null as string | null,
      drug_allergy: null as string | null,
      reaction_type: null as string | null,
    };
  }
  const f = form.food_allergy.trim();
  const d = form.drug_allergy.trim();
  const r = form.reaction_type.trim();
  return {
    no_known_allergy: false,
    food_allergy: f || null,
    drug_allergy: d || null,
    reaction_type: r || null,
  };
}

export async function fetchAllergies(transId: string): Promise<{
  row: AllergiesRow | null;
  error: string | null;
}> {
  const { data, error } = await supabase
    .from(ALLERGIES_TABLE)
    .select("*")
    .eq("trans_id", transId)
    .limit(1)
    .maybeSingle();

  if (error) {
    return { row: null, error: error.message };
  }
  return { row: (data as AllergiesRow) ?? null, error: null };
}

export async function persistAllergies(
  transId: string,
  existingRowId: string | null,
  form: AllergiesForm
): Promise<{ rowId: string | null; error: string | null }> {
  const payload = formToPayload(form);

  if (existingRowId) {
    const { error } = await supabase.from(ALLERGIES_TABLE).update(payload).eq("id", existingRowId);
    return { rowId: existingRowId, error: error?.message ?? null };
  }

  const { data, error } = await supabase
    .from(ALLERGIES_TABLE)
    .insert({ trans_id: transId, ...payload })
    .select("id")
    .single();

  if (error) {
    return { rowId: null, error: error.message };
  }
  const id = (data as { id?: string } | null)?.id ?? null;
  return { rowId: id, error: null };
}

export function formFromAllergiesRowOrDefault(row: AllergiesRow | null): AllergiesForm {
  if (!row) return { ...emptyAllergiesForm };
  return rowToForm(row);
}
