import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Bounded patient directory / picker queries (same ideas as {@link pharmacyProducts}):
 * capped search at call sites, fetch-by-id, no unbounded `select('*')` on hot paths.
 */

export const PATIENTS_TABLE = "patients" as const;

/** Columns for paginated directory + consultation home (no `*`). */
export const PATIENT_DIRECTORY_SELECT =
  "id, name, date_of_birth, sex, civil_status, address, contact_no, email_address, occupation, referring_physician, philhealth_no, created_at, updated_at" as const;

export type PatientDirectoryRow = {
  id: string | number;
  name: string | null;
  date_of_birth: string | null;
  sex: string | null;
  civil_status: string | null;
  address: string | null;
  contact_no: string | null;
  email_address: string | null;
  occupation: string | null;
  referring_physician: string | number | null;
  philhealth_no: number | null;
  created_at: string;
  updated_at: string | null;
};

/** Minimal row for reception / compact pickers. */
export const PATIENT_PICKER_SELECT = "id, name, contact_no, date_of_birth, sex, address" as const;

export type PatientPickerRow = {
  id: string | number;
  name: string | null;
  contact_no: string | null;
  date_of_birth: string | null;
  sex: string | null;
  address: string | null;
};

const SEARCH_MAX = 200;

/** Strip wildcards / noise and cap length before building PostgREST filters (avoids abuse and odd `ilike` behavior). */
export function sanitizePatientSearchQuery(raw: string, maxLen = 80): string {
  return raw
    .trim()
    .replace(/%/g, "")
    .replace(/_/g, "")
    .replace(/,/g, " ")
    .replace(/\s+/g, " ")
    .slice(0, maxLen);
}

/**
 * PostgREST `.or()` filter for patient text search (aligned with patient records page).
 * Pass user input through {@link sanitizePatientSearchQuery} first (this function sanitizes again defensively).
 */
export function buildPatientSearchOrFilter(raw: string): string {
  const t = sanitizePatientSearchQuery(raw).toUpperCase();
  if (!t) return "";
  const escaped = t.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
  const likePattern = `%${escaped}%`;
  const textCols = [
    "name",
    "contact_no",
    "email_address",
    "address",
    "occupation",
    "civil_status",
    "sex",
  ] as const;
  const parts = textCols.map((c) => `${c}.ilike.${likePattern}`);
  if (/^\d+$/.test(t)) {
    parts.push(`id.eq.${t}`);
    parts.push(`referring_physician.eq.${t}`);
    const n = Number.parseInt(t, 10);
    if (Number.isFinite(n) && n >= 0 && n <= 2_147_483_647) {
      parts.push(`philhealth_no.eq.${n}`);
    }
  }
  return parts.join(",");
}

/**
 * Server-side directory search — always bounded (default 80, max 200). Uses same `.or` rules as consultation/patient page.
 */
export async function searchPatientsDirectory(
  client: SupabaseClient,
  rawQuery: string,
  limit = 80,
): Promise<{ rows: PatientDirectoryRow[]; error: string | null }> {
  const safe = sanitizePatientSearchQuery(rawQuery);
  if (safe.length === 0) return { rows: [], error: null };

  const cap = Math.min(Math.max(1, limit), SEARCH_MAX);
  const orFilter = buildPatientSearchOrFilter(safe);
  if (!orFilter) return { rows: [], error: null };

  const { data, error } = await client
    .from(PATIENTS_TABLE)
    .select(PATIENT_DIRECTORY_SELECT)
    .or(orFilter)
    .order("name", { ascending: true })
    .limit(cap);

  if (error) return { rows: [], error: error.message };
  return { rows: (data ?? []) as PatientDirectoryRow[], error: null };
}

/** Reception-style compact rows (subset of columns). */
export async function searchPatientsPicker(
  client: SupabaseClient,
  rawQuery: string,
  limit = 80,
): Promise<{ rows: PatientPickerRow[]; error: string | null }> {
  const safe = sanitizePatientSearchQuery(rawQuery);
  if (safe.length === 0) return { rows: [], error: null };

  const cap = Math.min(Math.max(1, limit), SEARCH_MAX);
  const orFilter = buildPatientSearchOrFilter(safe);
  if (!orFilter) return { rows: [], error: null };

  const { data, error } = await client
    .from(PATIENTS_TABLE)
    .select(PATIENT_PICKER_SELECT)
    .or(orFilter)
    .order("name", { ascending: true })
    .limit(cap);

  if (error) return { rows: [], error: error.message };
  return { rows: (data ?? []) as PatientPickerRow[], error: null };
}

/** Resolve known ids only (e.g. saved encounter / prescription) — no full table scan. */
export async function fetchPatientsByIds(
  client: SupabaseClient,
  ids: Array<string | number | null | undefined>,
): Promise<{ rows: PatientDirectoryRow[]; error: string | null }> {
  const uniq = [...new Set(ids.map((x) => String(x ?? "").trim()).filter(Boolean))];
  if (uniq.length === 0) return { rows: [], error: null };

  const { data, error } = await client.from(PATIENTS_TABLE).select(PATIENT_DIRECTORY_SELECT).in("id", uniq);

  if (error) return { rows: [], error: error.message };
  return { rows: (data ?? []) as PatientDirectoryRow[], error: null };
}
