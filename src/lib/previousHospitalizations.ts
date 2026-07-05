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

export type PreviousHospitalizationEntry = {
  year: string;
  hospital: string;
  diagnosis: string;
};

export type PreviousHospitalizationSectionState = {
  never: boolean;
  entries: PreviousHospitalizationEntry[];
};

export const emptyPreviousHospitalizationEntry = (): PreviousHospitalizationEntry => ({
  year: "",
  hospital: "",
  diagnosis: "",
});

export const emptyPreviousHospitalizationSectionState = (): PreviousHospitalizationSectionState => ({
  never: false,
  entries: [],
});

function parseYear(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const n = Number.parseInt(t, 10);
  if (!Number.isFinite(n)) return null;
  if (n < 1800 || n > 2200) return null;
  return n;
}

function rowToEntry(row: PreviousHospitalizationRow): PreviousHospitalizationEntry {
  return {
    year: row.year != null ? String(row.year) : "",
    hospital: row.hospital ?? "",
    diagnosis: row.diagnosis ?? "",
  };
}

function entryHasContent(entry: PreviousHospitalizationEntry): boolean {
  return (
    parseYear(entry.year) != null ||
    entry.hospital.trim().length > 0 ||
    entry.diagnosis.trim().length > 0
  );
}

function entryToPayload(entry: PreviousHospitalizationEntry) {
  const y = parseYear(entry.year);
  const h = entry.hospital.trim();
  const d = entry.diagnosis.trim();
  return {
    never: false,
    year: y,
    hospital: h || null,
    diagnosis: d || null,
  };
}

/** Map DB rows to UI / print section state. */
export function sectionStateFromRows(
  rows: PreviousHospitalizationRow[] | null | undefined,
): PreviousHospitalizationSectionState {
  const list = rows ?? [];
  if (list.some((r) => r.never)) {
    return { never: true, entries: [] };
  }
  const entries = list.filter((r) => !r.never).map(rowToEntry);
  return { never: false, entries };
}

export const sectionStateForPrint = sectionStateFromRows;

export async function fetchPreviousHospitalizationsForEncounter(transId: string): Promise<{
  rows: PreviousHospitalizationRow[];
  state: PreviousHospitalizationSectionState;
  error: string | null;
}> {
  const id = transId.trim();
  if (!id) {
    return {
      rows: [],
      state: emptyPreviousHospitalizationSectionState(),
      error: "Invalid encounter.",
    };
  }

  const { data, error } = await supabase
    .from(PREVIOUS_HOSPITALIZATIONS_TABLE)
    .select("*")
    .eq("trans_id", id)
    .order("id");

  if (error) {
    return {
      rows: [],
      state: emptyPreviousHospitalizationSectionState(),
      error: error.message,
    };
  }

  const rows = (data ?? []) as PreviousHospitalizationRow[];
  return { rows, state: sectionStateFromRows(rows), error: null };
}

/**
 * Replaces all `previous_hospitalizations` rows for an encounter.
 * Never → one `{ never: true }` row; otherwise one row per non-empty entry.
 */
export async function replacePreviousHospitalizationsForEncounter(
  transId: string,
  state: PreviousHospitalizationSectionState,
): Promise<{ error: string | null }> {
  const id = transId.trim();
  if (!id) return { error: "Invalid encounter." };

  const del = await supabase.from(PREVIOUS_HOSPITALIZATIONS_TABLE).delete().eq("trans_id", id);
  if (del.error) return { error: del.error.message };

  if (state.never) {
    const ins = await supabase.from(PREVIOUS_HOSPITALIZATIONS_TABLE).insert({
      trans_id: id,
      never: true,
      year: null,
      hospital: null,
      diagnosis: null,
    });
    return { error: ins.error?.message ?? null };
  }

  const payloads = state.entries.filter(entryHasContent).map((entry) => ({
    trans_id: id,
    ...entryToPayload(entry),
  }));

  if (payloads.length === 0) return { error: null };

  const ins = await supabase.from(PREVIOUS_HOSPITALIZATIONS_TABLE).insert(payloads);
  return { error: ins.error?.message ?? null };
}

/** Whether the section has the Other checkbox checked in UI. */
export function previousHospitalizationOtherChecked(state: PreviousHospitalizationSectionState): boolean {
  return !state.never && state.entries.length > 0;
}
