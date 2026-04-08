import { supabase } from "@/lib/supabaseClient";

export const PREVIOUS_HOSPITALIZATIONS_TABLE = "previous_hospitalizations" as const;

export type PreviousHospitalizationRow = {
  id: string;
  trans_id: string;
  never: boolean | null;
  year: number | null;
  hospital: string | null;
  diagnosis: string | null;
};

export type PreviousHospitalizationForm = {
  never: boolean;
  other: boolean;
  year: string;
  hospital: string;
  diagnosis: string;
};

export const emptyPreviousHospitalizationForm: PreviousHospitalizationForm = {
  never: false,
  other: false,
  year: "",
  hospital: "",
  diagnosis: "",
};

function parseYear(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const n = Number.parseInt(t, 10);
  if (!Number.isFinite(n)) return null;
  if (n < 1800 || n > 2200) return null;
  return n;
}

function rowToForm(row: PreviousHospitalizationRow): PreviousHospitalizationForm {
  const never = !!row.never;
  const hasDetail =
    row.year != null ||
    !!(row.hospital && row.hospital.trim()) ||
    !!(row.diagnosis && row.diagnosis.trim());
  return {
    never,
    other: !never && hasDetail,
    year: row.year != null ? String(row.year) : "",
    hospital: row.hospital ?? "",
    diagnosis: row.diagnosis ?? "",
  };
}

function formToPayload(form: PreviousHospitalizationForm) {
  if (form.never) {
    return {
      never: true,
      year: null as number | null,
      hospital: null as string | null,
      diagnosis: null as string | null,
    };
  }
  const y = parseYear(form.year);
  const h = form.hospital.trim();
  const d = form.diagnosis.trim();
  return {
    never: false,
    year: y,
    hospital: h || null,
    diagnosis: d || null,
  };
}

export async function fetchPreviousHospitalization(transId: string): Promise<{
  row: PreviousHospitalizationRow | null;
  error: string | null;
}> {
  const { data, error } = await supabase
    .from(PREVIOUS_HOSPITALIZATIONS_TABLE)
    .select("*")
    .eq("trans_id", transId)
    .limit(1)
    .maybeSingle();

  if (error) {
    return { row: null, error: error.message };
  }
  return { row: (data as PreviousHospitalizationRow) ?? null, error: null };
}

export async function persistPreviousHospitalization(
  transId: string,
  existingRowId: string | null,
  form: PreviousHospitalizationForm
): Promise<{ rowId: string | null; error: string | null }> {
  const payload = formToPayload(form);

  if (existingRowId) {
    const { error } = await supabase
      .from(PREVIOUS_HOSPITALIZATIONS_TABLE)
      .update(payload)
      .eq("id", existingRowId);
    return { rowId: existingRowId, error: error?.message ?? null };
  }

  const { data, error } = await supabase
    .from(PREVIOUS_HOSPITALIZATIONS_TABLE)
    .insert({ trans_id: transId, ...payload })
    .select("id")
    .single();

  if (error) {
    return { rowId: null, error: error.message };
  }
  const id = (data as { id?: string } | null)?.id ?? null;
  return { rowId: id, error: null };
}

export function formFromPreviousHospitalizationRowOrDefault(
  row: PreviousHospitalizationRow | null
): PreviousHospitalizationForm {
  if (!row) return { ...emptyPreviousHospitalizationForm };
  return rowToForm(row);
}
