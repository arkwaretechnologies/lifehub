import { supabase } from "@/lib/supabaseClient";

export const REVIEW_OF_SYSTEMS_TABLE = "review_of_systems" as const;

export const REVIEW_OF_SYSTEMS_BOOLEAN_KEYS = [
  "ros_fever",
  "ros_weight_loss",
  "ros_fatigue",
  "ros_vision_changes",
  "ros_eye_redness",
  "ros_eye_discharge",
  "ros_hearing_changes",
  "ros_nasal_congestion",
  "ros_sore_throat",
  "ros_chest_pain",
  "ros_palpitations",
  "ros_edema",
  "ros_sob",
  "ros_wheezing",
  "ros_cough",
  "ros_nausea",
  "ros_vomiting",
  "ros_diarrhea",
  "ros_abdominal_pain",
  "ros_urinary_frequency",
  "ros_urinary_urgency",
  "ros_incontinence",
  "ros_joint_pain",
  "ros_muscle_weakness",
  "ros_rashes",
  "ros_lesions",
  "ros_lumps",
  "ros_headaches",
  "ros_dizziness",
  "ros_numbness",
  "ros_depression",
  "ros_anxiety",
  "ros_sleep_disturbances",
  "ros_hot_flashes",
  "ros_heat_cold_intolerance",
  "ros_excessive_thirst",
  "ros_easy_bruising",
  "ros_bleeding",
  "ros_swollen_glands",
  "ros_seasonal_allergies",
  "ros_frequent_infections",
  "ros_hives_rashes",
] as const;

export type ReviewOfSystemsBooleanKey = (typeof REVIEW_OF_SYSTEMS_BOOLEAN_KEYS)[number];

export type ReviewOfSystemsForm = Record<ReviewOfSystemsBooleanKey, boolean>;

export type ReviewOfSystemsRow = {
  id: string;
  trans_id: string;
} & { [K in ReviewOfSystemsBooleanKey]: boolean | null };

export function emptyReviewOfSystemsForm(): ReviewOfSystemsForm {
  return REVIEW_OF_SYSTEMS_BOOLEAN_KEYS.reduce((acc, k) => {
    acc[k] = false;
    return acc;
  }, {} as ReviewOfSystemsForm);
}

function rowToForm(row: ReviewOfSystemsRow): ReviewOfSystemsForm {
  const out = emptyReviewOfSystemsForm();
  for (const k of REVIEW_OF_SYSTEMS_BOOLEAN_KEYS) {
    out[k] = !!row[k];
  }
  return out;
}

function formToPayload(form: ReviewOfSystemsForm): Record<ReviewOfSystemsBooleanKey, boolean> {
  const out = {} as Record<ReviewOfSystemsBooleanKey, boolean>;
  for (const k of REVIEW_OF_SYSTEMS_BOOLEAN_KEYS) {
    out[k] = form[k];
  }
  return out;
}

export async function fetchReviewOfSystems(transId: string): Promise<{
  row: ReviewOfSystemsRow | null;
  error: string | null;
}> {
  const { data, error } = await supabase
    .from(REVIEW_OF_SYSTEMS_TABLE)
    .select("*")
    .eq("trans_id", transId)
    .limit(1)
    .maybeSingle();

  if (error) {
    return { row: null, error: error.message };
  }
  return { row: (data as ReviewOfSystemsRow) ?? null, error: null };
}

export async function persistReviewOfSystems(
  transId: string,
  existingRowId: string | null,
  form: ReviewOfSystemsForm
): Promise<{ rowId: string | null; error: string | null }> {
  const payload = formToPayload(form);

  if (existingRowId) {
    const { error } = await supabase
      .from(REVIEW_OF_SYSTEMS_TABLE)
      .update(payload)
      .eq("id", existingRowId);
    return { rowId: existingRowId, error: error?.message ?? null };
  }

  const { data, error } = await supabase
    .from(REVIEW_OF_SYSTEMS_TABLE)
    .insert({ trans_id: transId, ...payload })
    .select("id")
    .single();

  if (error) {
    return { rowId: null, error: error.message };
  }
  const id = (data as { id?: string } | null)?.id ?? null;
  return { rowId: id, error: null };
}

export function formFromRowOrDefault(row: ReviewOfSystemsRow | null): ReviewOfSystemsForm {
  if (!row) return emptyReviewOfSystemsForm();
  return rowToForm(row);
}
