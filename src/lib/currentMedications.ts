import { supabase } from "@/lib/supabaseClient";

export const CURRENT_MEDICATIONS_TABLE = "current_medications" as const;

export type CurrentMedicationInsert = {
  medication_name: string;
  dosage: string | null;
  frequency: string | null;
  notes: string | null;
};

export type CurrentMedicationRow = {
  id: string;
  trans_id: string;
  medication_name: string;
  dosage: string | null;
  frequency: string | null;
  notes: string | null;
};

export async function fetchCurrentMedicationsForEncounter(transId: string): Promise<{
  medications: CurrentMedicationRow[];
  error: string | null;
}> {
  const id = transId.trim();
  if (!id) return { medications: [], error: "Invalid encounter." };

  const { data, error } = await supabase
    .from(CURRENT_MEDICATIONS_TABLE)
    .select("id, trans_id, medication_name, dosage, frequency, notes")
    .eq("trans_id", id)
    .order("id");

  if (error) return { medications: [], error: error.message };
  return { medications: (data ?? []) as CurrentMedicationRow[], error: null };
}

/**
 * Replaces all rows in `public.current_medications` for an encounter (`trans_id`).
 * Simple behavior: delete existing then insert new rows.
 */
export async function replaceCurrentMedicationsForEncounter(
  transId: string,
  medications: CurrentMedicationInsert[],
): Promise<{ error: string | null }> {
  const id = transId.trim();
  if (!id) return { error: "Invalid encounter." };

  const del = await supabase.from(CURRENT_MEDICATIONS_TABLE).delete().eq("trans_id", id);
  if (del.error) return { error: del.error.message };

  if (medications.length === 0) return { error: null };

  const payload = medications.map((m) => ({
    trans_id: id,
    medication_name: m.medication_name,
    dosage: m.dosage,
    frequency: m.frequency,
    notes: m.notes,
  }));

  const ins = await supabase.from(CURRENT_MEDICATIONS_TABLE).insert(payload);
  if (ins.error) return { error: ins.error.message };

  return { error: null };
}

