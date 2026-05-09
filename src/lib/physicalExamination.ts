import { supabase } from "@/lib/supabaseClient";

export const PHYSICAL_EXAMINATION_TABLE = "physical_examination" as const;

/** Matches `public.physical_examination` (subset used by Physician's Record UI). */
export type PhysicalExaminationRow = {
  id: string;
  trans_id: string;
  pe_general_alert: boolean | null;
  pe_general_distress: boolean | null;
  pe_general_drowsy: boolean | null;
  pe_general_coma: boolean | null;
  pe_general_notes: string | null;
  pe_heent_lids_conj_nil: boolean | null;
  pe_heent_perrla: boolean | null;
  pe_heent_tym_canal: boolean | null;
  pe_heent_nasal_nl: boolean | null;
  pe_heent_lips_teeth_gums: boolean | null;
  pe_heent_notes: string | null;
  pe_chest_nl_resp_effort: boolean | null;
  pe_chest_cbs: boolean | null;
  pe_chest_nl_palpation: boolean | null;
  pe_chest_nl_symmetry: boolean | null;
  pe_chest_notes: string | null;
  pe_cvs_rrr: boolean | null;
  pe_cvs_no_murmur_gallop: boolean | null;
  pe_cvs_nl_s1s2: boolean | null;
  pe_cvs_pulses: boolean | null;
  pe_cvs_notes: string | null;
  pe_abdomen_no_tenderness: boolean | null;
  pe_abdomen_liver_spleen: boolean | null;
  pe_abdomen_no_hernia: boolean | null;
  pe_abdomen_bs_present: boolean | null;
  pe_abdomen_no_guarding: boolean | null;
  pe_abdomen_notes: string | null;
  pe_gu_male: boolean | null;
  pe_gu_female: boolean | null;
  pe_gu_no_cva_tenderness: boolean | null;
  pe_gu_scrotal_wnl: boolean | null;
  pe_gu_pelvic_nl: boolean | null;
  pe_gu_notes: string | null;
  pe_ext_nl_gait: boolean | null;
  pe_ext_nl_strength: boolean | null;
  pe_ext_nl_digits_nails: boolean | null;
  pe_ext_nl_clubbing_tone: boolean | null;
  pe_ext_edema: boolean | null;
  pe_ext_ulcers: boolean | null;
  pe_ext_notes: string | null;
  pe_neuro_alert: boolean | null;
  pe_neuro_oriented: boolean | null;
  pe_neuro_judgement: boolean | null;
  pe_neuro_insight: boolean | null;
  pe_neuro_memory: boolean | null;
  pe_neuro_mood: boolean | null;
  pe_neuro_no_delusions: boolean | null;
  pe_neuro_cerebral: string | null;
  pe_neuro_cns: string | null;
  pe_neuro_cn_i: string | null;
  pe_neuro_cn_ii_iii: string | null;
  pe_neuro_cn_iv_vi: string | null;
  pe_neuro_cn_v_vii: string | null;
  pe_neuro_cn_viii: string | null;
  pe_neuro_cn_ix_x: string | null;
  pe_neuro_cn_xi_xii: string | null;
  pe_neuro_cerebellar: string | null;
  pe_neuro_motor_strength: string | null;
  pe_neuro_sensory_reflex: string | null;
  pe_neuro_mms: string | null;
  pe_mms_alert: boolean | null;
  pe_mms_oriented: boolean | null;
  pe_mms_judgement: boolean | null;
  focused_exam_notes: string | null;
};

export type PhysicalExaminationForm = {
  pe_general_alert: boolean;
  pe_general_distress: boolean;
  pe_general_drowsy: boolean;
  pe_general_coma: boolean;
  pe_general_notes: string;
  pe_heent_lids_conj_nil: boolean;
  pe_heent_perrla: boolean;
  pe_heent_tym_canal: boolean;
  pe_heent_nasal_nl: boolean;
  pe_heent_lips_teeth_gums: boolean;
  pe_heent_notes: string;
  pe_chest_nl_resp_effort: boolean;
  pe_chest_cbs: boolean;
  pe_chest_nl_palpation: boolean;
  pe_chest_nl_symmetry: boolean;
  pe_chest_notes: string;
  pe_cvs_rrr: boolean;
  pe_cvs_no_murmur_gallop: boolean;
  pe_cvs_nl_s1s2: boolean;
  pe_cvs_pulses: boolean;
  pe_cvs_notes: string;
  pe_abdomen_no_tenderness: boolean;
  pe_abdomen_liver_spleen: boolean;
  pe_abdomen_no_hernia: boolean;
  pe_abdomen_bs_present: boolean;
  pe_abdomen_no_guarding: boolean;
  pe_abdomen_notes: string;
  pe_gu_male: boolean;
  pe_gu_female: boolean;
  pe_gu_no_cva_tenderness: boolean;
  pe_gu_scrotal_wnl: boolean;
  pe_gu_pelvic_nl: boolean;
  pe_gu_notes: string;
  pe_ext_nl_gait: boolean;
  pe_ext_nl_strength: boolean;
  pe_ext_nl_digits_nails: boolean;
  pe_ext_nl_clubbing_tone: boolean;
  pe_ext_edema: boolean;
  pe_ext_ulcers: boolean;
  pe_ext_notes: string;
  pe_neuro_alert: boolean;
  pe_neuro_oriented: boolean;
  pe_neuro_judgment_insight: boolean;
  pe_neuro_memory: boolean;
  pe_neuro_mood: boolean;
  pe_neuro_no_delusions: boolean;
  pe_neuro_cerebral: string;
  pe_neuro_cn_i: string;
  pe_neuro_cn_ii_iii: string;
  pe_neuro_cn_iv_vi: string;
  pe_neuro_cn_v_vii: string;
  pe_neuro_cn_viii: string;
  pe_neuro_cn_ix_x: string;
  pe_neuro_cn_xi_xii: string;
  pe_neuro_cerebellar: string;
  pe_neuro_motor_strength: string;
  pe_neuro_sensory_reflex: string;
};

function b(v: boolean | null | undefined): boolean {
  return !!v;
}

function s(v: string | null | undefined): string {
  return v ?? "";
}

export const emptyPhysicalExaminationForm: PhysicalExaminationForm = {
  pe_general_alert: false,
  pe_general_distress: false,
  pe_general_drowsy: false,
  pe_general_coma: false,
  pe_general_notes: "",
  pe_heent_lids_conj_nil: false,
  pe_heent_perrla: false,
  pe_heent_tym_canal: false,
  pe_heent_nasal_nl: false,
  pe_heent_lips_teeth_gums: false,
  pe_heent_notes: "",
  pe_chest_nl_resp_effort: false,
  pe_chest_cbs: false,
  pe_chest_nl_palpation: false,
  pe_chest_nl_symmetry: false,
  pe_chest_notes: "",
  pe_cvs_rrr: false,
  pe_cvs_no_murmur_gallop: false,
  pe_cvs_nl_s1s2: false,
  pe_cvs_pulses: false,
  pe_cvs_notes: "",
  pe_abdomen_no_tenderness: false,
  pe_abdomen_liver_spleen: false,
  pe_abdomen_no_hernia: false,
  pe_abdomen_bs_present: false,
  pe_abdomen_no_guarding: false,
  pe_abdomen_notes: "",
  pe_gu_male: false,
  pe_gu_female: false,
  pe_gu_no_cva_tenderness: false,
  pe_gu_scrotal_wnl: false,
  pe_gu_pelvic_nl: false,
  pe_gu_notes: "",
  pe_ext_nl_gait: false,
  pe_ext_nl_strength: false,
  pe_ext_nl_digits_nails: false,
  pe_ext_nl_clubbing_tone: false,
  pe_ext_edema: false,
  pe_ext_ulcers: false,
  pe_ext_notes: "",
  pe_neuro_alert: false,
  pe_neuro_oriented: false,
  pe_neuro_judgment_insight: false,
  pe_neuro_memory: false,
  pe_neuro_mood: false,
  pe_neuro_no_delusions: false,
  pe_neuro_cerebral: "",
  pe_neuro_cn_i: "",
  pe_neuro_cn_ii_iii: "",
  pe_neuro_cn_iv_vi: "",
  pe_neuro_cn_v_vii: "",
  pe_neuro_cn_viii: "",
  pe_neuro_cn_ix_x: "",
  pe_neuro_cn_xi_xii: "",
  pe_neuro_cerebellar: "",
  pe_neuro_motor_strength: "",
  pe_neuro_sensory_reflex: "",
};

function rowToForm(row: PhysicalExaminationRow): PhysicalExaminationForm {
  const ji = b(row.pe_neuro_judgement) || b(row.pe_neuro_insight);
  return {
    pe_general_alert: b(row.pe_general_alert),
    pe_general_distress: b(row.pe_general_distress),
    pe_general_drowsy: b(row.pe_general_drowsy),
    pe_general_coma: b(row.pe_general_coma),
    pe_general_notes: s(row.pe_general_notes),
    pe_heent_lids_conj_nil: b(row.pe_heent_lids_conj_nil),
    pe_heent_perrla: b(row.pe_heent_perrla),
    pe_heent_tym_canal: b(row.pe_heent_tym_canal),
    pe_heent_nasal_nl: b(row.pe_heent_nasal_nl),
    pe_heent_lips_teeth_gums: b(row.pe_heent_lips_teeth_gums),
    pe_heent_notes: s(row.pe_heent_notes),
    pe_chest_nl_resp_effort: b(row.pe_chest_nl_resp_effort),
    pe_chest_cbs: b(row.pe_chest_cbs),
    pe_chest_nl_palpation: b(row.pe_chest_nl_palpation),
    pe_chest_nl_symmetry: b(row.pe_chest_nl_symmetry),
    pe_chest_notes: s(row.pe_chest_notes),
    pe_cvs_rrr: b(row.pe_cvs_rrr),
    pe_cvs_no_murmur_gallop: b(row.pe_cvs_no_murmur_gallop),
    pe_cvs_nl_s1s2: b(row.pe_cvs_nl_s1s2),
    pe_cvs_pulses: b(row.pe_cvs_pulses),
    pe_cvs_notes: s(row.pe_cvs_notes),
    pe_abdomen_no_tenderness: b(row.pe_abdomen_no_tenderness),
    pe_abdomen_liver_spleen: b(row.pe_abdomen_liver_spleen),
    pe_abdomen_no_hernia: b(row.pe_abdomen_no_hernia),
    pe_abdomen_bs_present: b(row.pe_abdomen_bs_present),
    pe_abdomen_no_guarding: b(row.pe_abdomen_no_guarding),
    pe_abdomen_notes: s(row.pe_abdomen_notes),
    pe_gu_male: b(row.pe_gu_male),
    pe_gu_female: b(row.pe_gu_female),
    pe_gu_no_cva_tenderness: b(row.pe_gu_no_cva_tenderness),
    pe_gu_scrotal_wnl: b(row.pe_gu_scrotal_wnl),
    pe_gu_pelvic_nl: b(row.pe_gu_pelvic_nl),
    pe_gu_notes: s(row.pe_gu_notes),
    pe_ext_nl_gait: b(row.pe_ext_nl_gait),
    pe_ext_nl_strength: b(row.pe_ext_nl_strength),
    pe_ext_nl_digits_nails: b(row.pe_ext_nl_digits_nails),
    pe_ext_nl_clubbing_tone: b(row.pe_ext_nl_clubbing_tone),
    pe_ext_edema: b(row.pe_ext_edema),
    pe_ext_ulcers: b(row.pe_ext_ulcers),
    pe_ext_notes: s(row.pe_ext_notes),
    pe_neuro_alert: b(row.pe_neuro_alert),
    pe_neuro_oriented: b(row.pe_neuro_oriented),
    pe_neuro_judgment_insight: ji,
    pe_neuro_memory: b(row.pe_neuro_memory),
    pe_neuro_mood: b(row.pe_neuro_mood),
    pe_neuro_no_delusions: b(row.pe_neuro_no_delusions),
    pe_neuro_cerebral: s(row.pe_neuro_cerebral),
    pe_neuro_cn_i: s(row.pe_neuro_cn_i),
    pe_neuro_cn_ii_iii: s(row.pe_neuro_cn_ii_iii),
    pe_neuro_cn_iv_vi: s(row.pe_neuro_cn_iv_vi),
    pe_neuro_cn_v_vii: s(row.pe_neuro_cn_v_vii),
    pe_neuro_cn_viii: s(row.pe_neuro_cn_viii),
    pe_neuro_cn_ix_x: s(row.pe_neuro_cn_ix_x),
    pe_neuro_cn_xi_xii: s(row.pe_neuro_cn_xi_xii),
    pe_neuro_cerebellar: s(row.pe_neuro_cerebellar),
    pe_neuro_motor_strength: s(row.pe_neuro_motor_strength),
    pe_neuro_sensory_reflex: s(row.pe_neuro_sensory_reflex),
  };
}

function trimOrNull(t: string): string | null {
  const x = t.trim();
  return x ? x : null;
}

function physicalExamFormToBasePayload(form: PhysicalExaminationForm) {
  const ji = form.pe_neuro_judgment_insight;
  return {
    pe_general_alert: form.pe_general_alert,
    pe_general_distress: form.pe_general_distress,
    pe_general_drowsy: form.pe_general_drowsy,
    pe_general_coma: form.pe_general_coma,
    pe_general_notes: trimOrNull(form.pe_general_notes),
    pe_heent_lids_conj_nil: form.pe_heent_lids_conj_nil,
    pe_heent_perrla: form.pe_heent_perrla,
    pe_heent_tym_canal: form.pe_heent_tym_canal,
    pe_heent_nasal_nl: form.pe_heent_nasal_nl,
    pe_heent_lips_teeth_gums: form.pe_heent_lips_teeth_gums,
    pe_heent_notes: trimOrNull(form.pe_heent_notes),
    pe_chest_nl_resp_effort: form.pe_chest_nl_resp_effort,
    pe_chest_cbs: form.pe_chest_cbs,
    pe_chest_nl_palpation: form.pe_chest_nl_palpation,
    pe_chest_nl_symmetry: form.pe_chest_nl_symmetry,
    pe_chest_notes: trimOrNull(form.pe_chest_notes),
    pe_cvs_rrr: form.pe_cvs_rrr,
    pe_cvs_no_murmur_gallop: form.pe_cvs_no_murmur_gallop,
    pe_cvs_nl_s1s2: form.pe_cvs_nl_s1s2,
    pe_cvs_pulses: form.pe_cvs_pulses,
    pe_cvs_notes: trimOrNull(form.pe_cvs_notes),
    pe_abdomen_no_tenderness: form.pe_abdomen_no_tenderness,
    pe_abdomen_liver_spleen: form.pe_abdomen_liver_spleen,
    pe_abdomen_no_hernia: form.pe_abdomen_no_hernia,
    pe_abdomen_bs_present: form.pe_abdomen_bs_present,
    pe_abdomen_no_guarding: form.pe_abdomen_no_guarding,
    pe_abdomen_notes: trimOrNull(form.pe_abdomen_notes),
    pe_gu_male: form.pe_gu_male,
    pe_gu_female: form.pe_gu_female,
    pe_gu_no_cva_tenderness: form.pe_gu_no_cva_tenderness,
    pe_gu_scrotal_wnl: form.pe_gu_scrotal_wnl,
    pe_gu_pelvic_nl: form.pe_gu_pelvic_nl,
    pe_gu_notes: trimOrNull(form.pe_gu_notes),
    pe_ext_nl_gait: form.pe_ext_nl_gait,
    pe_ext_nl_strength: form.pe_ext_nl_strength,
    pe_ext_nl_digits_nails: form.pe_ext_nl_digits_nails,
    pe_ext_nl_clubbing_tone: form.pe_ext_nl_clubbing_tone,
    pe_ext_edema: form.pe_ext_edema,
    pe_ext_ulcers: form.pe_ext_ulcers,
    pe_ext_notes: trimOrNull(form.pe_ext_notes),
    pe_neuro_alert: form.pe_neuro_alert,
    pe_neuro_oriented: form.pe_neuro_oriented,
    pe_neuro_judgement: ji,
    pe_neuro_insight: ji,
    pe_neuro_memory: form.pe_neuro_memory,
    pe_neuro_mood: form.pe_neuro_mood,
    pe_neuro_no_delusions: form.pe_neuro_no_delusions,
    pe_neuro_cerebral: trimOrNull(form.pe_neuro_cerebral),
    pe_neuro_cn_i: trimOrNull(form.pe_neuro_cn_i),
    pe_neuro_cn_ii_iii: trimOrNull(form.pe_neuro_cn_ii_iii),
    pe_neuro_cn_iv_vi: trimOrNull(form.pe_neuro_cn_iv_vi),
    pe_neuro_cn_v_vii: trimOrNull(form.pe_neuro_cn_v_vii),
    pe_neuro_cn_viii: trimOrNull(form.pe_neuro_cn_viii),
    pe_neuro_cn_ix_x: trimOrNull(form.pe_neuro_cn_ix_x),
    pe_neuro_cn_xi_xii: trimOrNull(form.pe_neuro_cn_xi_xii),
    pe_neuro_cerebellar: trimOrNull(form.pe_neuro_cerebellar),
    pe_neuro_motor_strength: trimOrNull(form.pe_neuro_motor_strength),
    pe_neuro_sensory_reflex: trimOrNull(form.pe_neuro_sensory_reflex),
    pe_mms_alert: form.pe_neuro_alert,
    pe_mms_oriented: form.pe_neuro_oriented,
    pe_mms_judgement: ji,
  };
}

/** Full row for insert (nulls for columns not edited on this screen). */
export function physicalExamFormToInsertPayload(form: PhysicalExaminationForm) {
  return {
    ...physicalExamFormToBasePayload(form),
    pe_neuro_cns: null as string | null,
    pe_neuro_mms: null as string | null,
  };
}

/** Update payload — does not touch `focused_exam_notes`, `pe_neuro_cns`, or `pe_neuro_mms`. */
export function physicalExamFormToUpdatePayload(form: PhysicalExaminationForm) {
  return physicalExamFormToBasePayload(form);
}

export async function fetchPhysicalExamination(transId: string): Promise<{
  row: PhysicalExaminationRow | null;
  error: string | null;
}> {
  const { data, error } = await supabase
    .from(PHYSICAL_EXAMINATION_TABLE)
    .select("*")
    .eq("trans_id", transId)
    .limit(1)
    .maybeSingle();

  if (error) {
    return { row: null, error: error.message };
  }
  return { row: (data as PhysicalExaminationRow) ?? null, error: null };
}

/** Focused Exam tab — load `focused_exam_notes` and row id for upsert. */
export async function fetchFocusedExamNotes(transId: string): Promise<{
  rowId: string | null;
  notes: string;
  error: string | null;
}> {
  const { row, error } = await fetchPhysicalExamination(transId);
  if (error) return { rowId: null, notes: "", error };
  return {
    rowId: row?.id ?? null,
    notes: s(row?.focused_exam_notes),
    error: null,
  };
}

/**
 * Persists only `focused_exam_notes`. Re-fetches by `trans_id` before insert so a row
 * created from Physician's Record does not produce a duplicate.
 */
export async function persistFocusedExamNotes(
  transId: string,
  cachedRowId: string | null,
  notes: string
): Promise<{ rowId: string | null; error: string | null }> {
  const focused_exam_notes = trimOrNull(notes);

  let rowId = cachedRowId;
  if (!rowId) {
    const { row, error: fetchErr } = await fetchPhysicalExamination(transId);
    if (fetchErr) return { rowId: null, error: fetchErr };
    rowId = row?.id ?? null;
  }

  if (rowId) {
    const { error } = await supabase
      .from(PHYSICAL_EXAMINATION_TABLE)
      .update({ focused_exam_notes })
      .eq("id", rowId);
    return { rowId, error: error?.message ?? null };
  }

  const { data, error } = await supabase
    .from(PHYSICAL_EXAMINATION_TABLE)
    .insert({ trans_id: transId, focused_exam_notes })
    .select("id")
    .single();

  if (error) {
    return { rowId: null, error: error.message };
  }
  const id = (data as { id?: string } | null)?.id ?? null;
  return { rowId: id, error: null };
}

export async function persistPhysicalExamination(
  transId: string,
  existingRowId: string | null,
  form: PhysicalExaminationForm
): Promise<{ rowId: string | null; error: string | null }> {
  if (existingRowId) {
    const payload = physicalExamFormToUpdatePayload(form);
    const { error } = await supabase
      .from(PHYSICAL_EXAMINATION_TABLE)
      .update(payload)
      .eq("id", existingRowId);
    return { rowId: existingRowId, error: error?.message ?? null };
  }

  const payload = physicalExamFormToInsertPayload(form);
  const { data, error } = await supabase
    .from(PHYSICAL_EXAMINATION_TABLE)
    .insert({ trans_id: transId, ...payload, focused_exam_notes: null })
    .select("id")
    .single();

  if (error) {
    return { rowId: null, error: error.message };
  }
  const id = (data as { id?: string } | null)?.id ?? null;
  return { rowId: id, error: null };
}

export function formFromPhysicalExaminationRowOrDefault(row: PhysicalExaminationRow | null): PhysicalExaminationForm {
  if (!row) return { ...emptyPhysicalExaminationForm };
  return rowToForm(row);
}

function joinChecked(parts: (string | false | null | undefined)[], notes: string): string | null {
  const checked = parts.filter((x): x is string => typeof x === "string" && x.length > 0);
  const n = notes.trim();
  if (checked.length === 0 && !n) return null;
  const head = checked.length > 0 ? checked.join(", ") : "";
  if (head && n) return `${head}. ${n}`;
  return head || n;
}

/** Plain text for consultation PDF — Physical Examination column (Physician's Record). */
export function formatPhysicalExaminationForPrint(form: PhysicalExaminationForm): string {
  const blocks: string[] = [];

  const g = joinChecked(
    [
      form.pe_general_alert && "ALERT",
      form.pe_general_distress && "DISTRESS",
      form.pe_general_drowsy && "DROWSY",
      form.pe_general_coma && "COMA",
    ],
    form.pe_general_notes,
  );
  if (g) blocks.push(`GENERAL — ${g}`);

  const heent = joinChecked(
    [
      form.pe_heent_lids_conj_nil && "LIDS/ CONJ NIL",
      form.pe_heent_perrla && "PERRLA",
      form.pe_heent_tym_canal && "TYM CANAL",
      form.pe_heent_nasal_nl && "NASAL NL",
      form.pe_heent_lips_teeth_gums && "LIPS, TEETH, GUMS",
    ],
    form.pe_heent_notes,
  );
  if (heent) blocks.push(`HEENT — ${heent}`);

  const chest = joinChecked(
    [
      form.pe_chest_nl_resp_effort && "NL RESP EFFORT",
      form.pe_chest_cbs && "CBS",
      form.pe_chest_nl_palpation && "NL PALPATION",
      form.pe_chest_nl_symmetry && "NL SYMMETRY & EXPANSION",
    ],
    form.pe_chest_notes,
  );
  if (chest) blocks.push(`CHEST/LUNGS — ${chest}`);

  const cvs = joinChecked(
    [
      form.pe_cvs_rrr && "RRR",
      form.pe_cvs_no_murmur_gallop && "NO MURMUR/ GALLOP",
      form.pe_cvs_nl_s1s2 && "NL S1S2",
      form.pe_cvs_pulses && "PULSES",
    ],
    form.pe_cvs_notes,
  );
  if (cvs) blocks.push(`CVS — ${cvs}`);

  const abd = joinChecked(
    [
      form.pe_abdomen_no_tenderness && "NO TENDERNESS/MASS",
      form.pe_abdomen_liver_spleen && "LIVER SPLEEN",
      form.pe_abdomen_no_hernia && "NO HERNIA",
      form.pe_abdomen_bs_present && "+BS",
      form.pe_abdomen_no_guarding && "NO GUARDING",
    ],
    form.pe_abdomen_notes,
  );
  if (abd) blocks.push(`ABDOMEN/ GI — ${abd}`);

  const gu = joinChecked(
    [
      form.pe_gu_male && "MALE",
      form.pe_gu_female && "FEMALE",
      form.pe_gu_no_cva_tenderness && "NO CVA TENDERNESS",
      form.pe_gu_scrotal_wnl && "SCROTAL CONTENT WNL",
      form.pe_gu_pelvic_nl && "PELVIC EXAM NL",
    ],
    form.pe_gu_notes,
  );
  if (gu) blocks.push(`GU — ${gu}`);

  const extChk = joinChecked(
    [
      form.pe_ext_nl_gait && "NL GAIT",
      form.pe_ext_nl_strength && "NL STRENGTH",
      form.pe_ext_nl_digits_nails && "NL DIGITS/NAILS",
      form.pe_ext_nl_clubbing_tone && "NL CLUBBING NL TONE",
      form.pe_ext_edema && "EDEMA",
      form.pe_ext_ulcers && "ULCERS",
    ],
    form.pe_ext_notes,
  );
  if (extChk) blocks.push(`EXTREMITIES / MSK — ${extChk}`);

  return blocks.join("\n");
}

/** Plain text for consultation PDF — Neurologic Examination column. */
export function formatNeurologicExaminationForPrint(form: PhysicalExaminationForm): string {
  const blocks: string[] = [];

  const mms = joinChecked(
    [
      form.pe_neuro_alert && "ALERT",
      form.pe_neuro_oriented && "ORIENTED",
      form.pe_neuro_judgment_insight && "JUDGMENT/INSIGHT",
      form.pe_neuro_memory && "MEMORY",
      form.pe_neuro_mood && "MOOD",
      form.pe_neuro_no_delusions && "NO DELUSIONS",
    ],
    "",
  );
  if (mms) blocks.push(`MMS — ${mms}`);

  if (form.pe_neuro_cerebral.trim()) {
    blocks.push(`CEREBRAL — ${form.pe_neuro_cerebral.trim()}`);
  }

  const cnsParts: string[] = [];
  const cnsLine = (label: string, v: string) => {
    const t = v.trim();
    if (t) cnsParts.push(`${label} ${t}`);
  };
  cnsLine("I:", form.pe_neuro_cn_i);
  cnsLine("II, III:", form.pe_neuro_cn_ii_iii);
  cnsLine("IV, VI:", form.pe_neuro_cn_iv_vi);
  cnsLine("V, VII:", form.pe_neuro_cn_v_vii);
  cnsLine("VIII:", form.pe_neuro_cn_viii);
  cnsLine("IX, X:", form.pe_neuro_cn_ix_x);
  cnsLine("XI, XII:", form.pe_neuro_cn_xi_xii);
  if (cnsParts.length > 0) blocks.push(`CNS — ${cnsParts.join("; ")}`);

  if (form.pe_neuro_cerebellar.trim()) {
    blocks.push(`CEREBELLAR — ${form.pe_neuro_cerebellar.trim()}`);
  }
  if (form.pe_neuro_motor_strength.trim()) {
    blocks.push(`MOTOR STRENGTH — ${form.pe_neuro_motor_strength.trim()}`);
  }
  if (form.pe_neuro_sensory_reflex.trim()) {
    blocks.push(`SENSORY/REFLEXES — ${form.pe_neuro_sensory_reflex.trim()}`);
  }

  return blocks.join("\n");
}
