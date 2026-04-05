import { supabase } from "@/lib/supabaseClient";

export const VITAL_SIGNS_TABLE = "vital_signs" as const;

export type VitalSignsRow = {
  id: string;
  trans_id: string;
  bp_systolic: number | null;
  bp_diastolic: number | null;
  heart_rate: number | null;
  respiratory_rate: number | null;
  temperature: number | null;
  o2_saturation: number | null;
  pain_scale: number | null;
  weight_kg: number | null;
  height_cm: number | null;
  bmi: number | null;
  recorded_at: string;
};

/** Raw input strings (uppercase in UI) for the Medical History vital signs row. */
export type VitalSignsInputState = {
  bp: string;
  hr: string;
  rr: string;
  temp: string;
  o2: string;
  pain: string;
};

export function emptyVitalSignsInput(): VitalSignsInputState {
  return { bp: "", hr: "", rr: "", temp: "", o2: "", pain: "" };
}

export function parseBp(raw: string): { systolic: number | null; diastolic: number | null } {
  const t = raw.trim().toUpperCase();
  if (!t) return { systolic: null, diastolic: null };
  const m = t.match(/^(\d{1,3})\s*\/\s*(\d{1,3})$/);
  if (!m) return { systolic: null, diastolic: null };
  const sys = Number.parseInt(m[1]!, 10);
  const dia = Number.parseInt(m[2]!, 10);
  if (!Number.isFinite(sys) || !Number.isFinite(dia)) return { systolic: null, diastolic: null };
  return { systolic: sys, diastolic: dia };
}

function parseNonNegativeInt(raw: string): number | null {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  const n = Number.parseInt(digits, 10);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

function parseDecimal(raw: string): number | null {
  const t = raw.trim().replace(",", ".");
  if (!t) return null;
  const n = Number.parseFloat(t);
  if (!Number.isFinite(n)) return null;
  return n;
}

function parsePainScale(raw: string): number | null {
  const n = parseNonNegativeInt(raw);
  if (n === null) return null;
  return Math.min(10, n);
}

export function rowToInputState(row: VitalSignsRow | null): VitalSignsInputState {
  if (!row) return emptyVitalSignsInput();
  const bp =
    row.bp_systolic != null && row.bp_diastolic != null
      ? `${row.bp_systolic}/${row.bp_diastolic}`
      : "";
  return {
    bp: bp.toUpperCase(),
    hr: row.heart_rate != null ? String(row.heart_rate) : "",
    rr: row.respiratory_rate != null ? String(row.respiratory_rate) : "",
    temp: row.temperature != null ? String(row.temperature) : "",
    o2: row.o2_saturation != null ? String(row.o2_saturation) : "",
    pain: row.pain_scale != null ? String(row.pain_scale) : "",
  };
}

/** Columns saved from the vital signs UI (excludes anthropometric — preserved on update). */
export type VitalSignsVitalPayload = {
  bp_systolic: number | null;
  bp_diastolic: number | null;
  heart_rate: number | null;
  respiratory_rate: number | null;
  temperature: number | null;
  o2_saturation: number | null;
  pain_scale: number | null;
  recorded_at: string;
};

export function inputStateToVitalPayload(input: VitalSignsInputState): VitalSignsVitalPayload {
  const { systolic, diastolic } = parseBp(input.bp);
  return {
    bp_systolic: systolic,
    bp_diastolic: diastolic,
    heart_rate: parseNonNegativeInt(input.hr),
    respiratory_rate: parseNonNegativeInt(input.rr),
    temperature: parseDecimal(input.temp),
    o2_saturation: parseDecimal(input.o2),
    pain_scale: parsePainScale(input.pain),
    recorded_at: new Date().toISOString(),
  };
}

export async function fetchVitalSigns(transId: string): Promise<{
  row: VitalSignsRow | null;
  error: string | null;
}> {
  const { data, error } = await supabase
    .from(VITAL_SIGNS_TABLE)
    .select("*")
    .eq("trans_id", transId)
    .limit(1)
    .maybeSingle();

  if (error) {
    return { row: null, error: error.message };
  }
  return { row: (data as VitalSignsRow) ?? null, error: null };
}

/** Vitals + anthropometrics share one row; resolve id if the other panel created it first. */
async function resolveVitalSignsRowId(transId: string, hintId: string | null): Promise<string | null> {
  if (hintId) return hintId;
  const { data, error } = await supabase
    .from(VITAL_SIGNS_TABLE)
    .select("id")
    .eq("trans_id", transId)
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return (data as { id: string }).id;
}

export async function persistVitalSigns(
  transId: string,
  existingRowId: string | null,
  input: VitalSignsInputState
): Promise<{ rowId: string | null; error: string | null }> {
  const vital = inputStateToVitalPayload(input);
  const id = await resolveVitalSignsRowId(transId, existingRowId);

  if (id) {
    const { error } = await supabase.from(VITAL_SIGNS_TABLE).update(vital).eq("id", id);
    return { rowId: id, error: error?.message ?? null };
  }

  const { data, error } = await supabase
    .from(VITAL_SIGNS_TABLE)
    .insert({
      trans_id: transId,
      ...vital,
      weight_kg: null,
      height_cm: null,
      bmi: null,
    })
    .select("id")
    .single();

  if (error) {
    return { rowId: null, error: error.message };
  }
  const newId = (data as { id?: string } | null)?.id ?? null;
  return { rowId: newId, error: null };
}

export function inputStateFromRowOrDefault(row: VitalSignsRow | null): VitalSignsInputState {
  return rowToInputState(row);
}

/** Anthropometric row in Medical History (same `vital_signs` row as vitals). */
export type AnthropometricInputState = {
  weight_kg: string;
  height_cm: string;
  bmi: string;
};

export function emptyAnthropometricInput(): AnthropometricInputState {
  return { weight_kg: "", height_cm: "", bmi: "" };
}

export function anthropometricFromRowOrDefault(row: VitalSignsRow | null): AnthropometricInputState {
  if (!row) return emptyAnthropometricInput();
  return {
    weight_kg: row.weight_kg != null ? String(row.weight_kg) : "",
    height_cm: row.height_cm != null ? String(row.height_cm) : "",
    bmi: row.bmi != null ? String(row.bmi) : "",
  };
}

type AnthropometricPayload = {
  weight_kg: number | null;
  height_cm: number | null;
  bmi: number | null;
  recorded_at: string;
};

function anthropometricToPayload(state: AnthropometricInputState): AnthropometricPayload {
  return {
    weight_kg: parseDecimal(state.weight_kg),
    height_cm: parseDecimal(state.height_cm),
    bmi: parseDecimal(state.bmi),
    recorded_at: new Date().toISOString(),
  };
}

export async function persistAnthropometrics(
  transId: string,
  existingRowId: string | null,
  state: AnthropometricInputState
): Promise<{ rowId: string | null; error: string | null }> {
  const payload = anthropometricToPayload(state);
  const id = await resolveVitalSignsRowId(transId, existingRowId);

  if (id) {
    const { error } = await supabase.from(VITAL_SIGNS_TABLE).update(payload).eq("id", id);
    return { rowId: id, error: error?.message ?? null };
  }

  const { data, error } = await supabase
    .from(VITAL_SIGNS_TABLE)
    .insert({
      trans_id: transId,
      bp_systolic: null,
      bp_diastolic: null,
      heart_rate: null,
      respiratory_rate: null,
      temperature: null,
      o2_saturation: null,
      pain_scale: null,
      ...payload,
    })
    .select("id")
    .single();

  if (error) {
    return { rowId: null, error: error.message };
  }
  const newId = (data as { id?: string } | null)?.id ?? null;
  return { rowId: newId, error: null };
}
