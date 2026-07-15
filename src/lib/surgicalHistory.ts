import { supabase } from "@/lib/supabaseClient";

export const SURGICAL_HISTORY_TABLE = "surgical_history" as const;

export const SURGICAL_HISTORY_PROCEDURE_KEYS = [
  "appendectomy",
  "cholecystectomy",
  "cabg",
  "c_section",
  "hernia_repair",
  "cataract",
] as const;

export type SurgicalHistoryProcedureKey = (typeof SURGICAL_HISTORY_PROCEDURE_KEYS)[number];

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
  year: number | null;
  procedure_name: string | null;
  notes: string | null;
};

export type SurgicalHistoryEntry = {
  year: string;
  notes: string;
  appendectomy: boolean;
  cholecystectomy: boolean;
  cabg: boolean;
  c_section: boolean;
  hernia_repair: boolean;
  cataract: boolean;
  /** Legacy free-text other procedure (read/display only when present). */
  procedure_name: string;
};

export type SurgicalHistorySectionState = {
  no_surgery: boolean;
  entries: SurgicalHistoryEntry[];
};

export const emptySurgicalHistoryEntry = (): SurgicalHistoryEntry => ({
  year: "",
  notes: "",
  appendectomy: false,
  cholecystectomy: false,
  cabg: false,
  c_section: false,
  hernia_repair: false,
  cataract: false,
  procedure_name: "",
});

export const emptySurgicalHistorySectionState = (): SurgicalHistorySectionState => ({
  no_surgery: false,
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

function rowToEntry(row: SurgicalHistoryRow): SurgicalHistoryEntry {
  return {
    year: row.year != null ? String(row.year) : "",
    notes: row.notes ?? "",
    appendectomy: !!row.appendectomy,
    cholecystectomy: !!row.cholecystectomy,
    cabg: !!row.cabg,
    c_section: !!row.c_section,
    hernia_repair: !!row.hernia_repair,
    cataract: !!row.cataract,
    procedure_name: row.procedure_name ?? "",
  };
}

function entryHasAnyFlag(entry: SurgicalHistoryEntry): boolean {
  return SURGICAL_HISTORY_PROCEDURE_KEYS.some((key) => entry[key]);
}

function entryHasContent(entry: SurgicalHistoryEntry): boolean {
  return (
    parseYear(entry.year) != null ||
    entry.notes.trim().length > 0 ||
    entry.procedure_name.trim().length > 0 ||
    entryHasAnyFlag(entry)
  );
}

function rowHasEntryContent(row: SurgicalHistoryRow): boolean {
  if (row.no_surgery) return false;
  return (
    row.year != null ||
    Boolean(String(row.notes ?? "").trim()) ||
    Boolean(String(row.procedure_name ?? "").trim()) ||
    SURGICAL_HISTORY_PROCEDURE_KEYS.some((key) => !!row[key])
  );
}

function entryToPayload(entry: SurgicalHistoryEntry) {
  const y = parseYear(entry.year);
  const notes = entry.notes.trim();
  const procedureName = entry.procedure_name.trim();
  return {
    no_surgery: false,
    appendectomy: entry.appendectomy,
    cholecystectomy: entry.cholecystectomy,
    cabg: entry.cabg,
    c_section: entry.c_section,
    hernia_repair: entry.hernia_repair,
    cataract: entry.cataract,
    year: y,
    procedure_name: procedureName ? procedureName.toUpperCase() : null,
    notes: notes ? notes.toUpperCase() : null,
  };
}

/** Aggregate procedure flags across entries (for print form checkboxes). */
export function surgicalHistoryFlagsFromEntries(entries: SurgicalHistoryEntry[]): Record<
  SurgicalHistoryProcedureKey,
  boolean
> {
  const flags = {
    appendectomy: false,
    cholecystectomy: false,
    cabg: false,
    c_section: false,
    hernia_repair: false,
    cataract: false,
  };
  for (const entry of entries) {
    for (const key of SURGICAL_HISTORY_PROCEDURE_KEYS) {
      if (entry[key]) flags[key] = true;
    }
  }
  return flags;
}

/** Map DB rows to UI / print section state. */
export function sectionStateFromRows(
  rows: SurgicalHistoryRow[] | null | undefined,
): SurgicalHistorySectionState {
  const list = rows ?? [];
  if (list.some((r) => r.no_surgery)) {
    return { ...emptySurgicalHistorySectionState(), no_surgery: true };
  }

  return {
    no_surgery: false,
    entries: list.filter(rowHasEntryContent).map(rowToEntry),
  };
}

export const sectionStateForPrint = sectionStateFromRows;

export async function fetchSurgicalHistoryForEncounter(transId: string): Promise<{
  rows: SurgicalHistoryRow[];
  state: SurgicalHistorySectionState;
  error: string | null;
}> {
  const id = transId.trim();
  if (!id) {
    return {
      rows: [],
      state: emptySurgicalHistorySectionState(),
      error: "Invalid encounter.",
    };
  }

  const { data, error } = await supabase
    .from(SURGICAL_HISTORY_TABLE)
    .select("*")
    .eq("trans_id", id)
    .order("id");

  if (error) {
    return {
      rows: [],
      state: emptySurgicalHistorySectionState(),
      error: error.message,
    };
  }

  const rows = (data ?? []) as SurgicalHistoryRow[];
  return { rows, state: sectionStateFromRows(rows), error: null };
}

/**
 * Replaces all `surgical_history` rows for an encounter.
 * Negative → one `{ no_surgery: true }` row.
 * Otherwise → one row per procedure entry (year / notes / checkboxes).
 */
export async function replaceSurgicalHistoryForEncounter(
  transId: string,
  state: SurgicalHistorySectionState,
): Promise<{ error: string | null }> {
  const id = transId.trim();
  if (!id) return { error: "Invalid encounter." };

  const del = await supabase.from(SURGICAL_HISTORY_TABLE).delete().eq("trans_id", id);
  if (del.error) return { error: del.error.message };

  if (state.no_surgery) {
    const ins = await supabase.from(SURGICAL_HISTORY_TABLE).insert({
      trans_id: id,
      no_surgery: true,
      appendectomy: false,
      cholecystectomy: false,
      cabg: false,
      c_section: false,
      hernia_repair: false,
      cataract: false,
      year: null,
      procedure_name: null,
      notes: null,
    });
    return { error: ins.error?.message ?? null };
  }

  const payloads = state.entries.filter(entryHasContent).map((entry) => ({
    trans_id: id,
    ...entryToPayload(entry),
  }));

  if (payloads.length === 0) return { error: null };

  const ins = await supabase.from(SURGICAL_HISTORY_TABLE).insert(payloads);
  return { error: ins.error?.message ?? null };
}
