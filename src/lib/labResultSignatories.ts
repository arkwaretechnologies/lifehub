import type { SupabaseClient } from "@supabase/supabase-js";
import type { LabSignatureRole } from "@/lib/labResultSignatures";

export const LAB_RESULT_SIGNATORIES_TABLE = "lab_result_signatories" as const;

export type { LabSignatureRole };

export type LabResultSignatoryRow = {
  role: LabSignatureRole;
  full_name: string | null;
  license_no: string | null;
  updated_at: string | null;
};

export type LabResultSignatoriesMap = {
  medtech: LabResultSignatoryRow;
  pathologist: LabResultSignatoryRow;
};

const SIGNATORY_SELECT = "role, full_name, license_no, updated_at";

function emptySignatory(role: LabSignatureRole): LabResultSignatoryRow {
  return { role, full_name: null, license_no: null, updated_at: null };
}

function mapRow(raw: Record<string, unknown>): LabResultSignatoryRow | null {
  const role = String(raw.role ?? "").trim().toLowerCase();
  if (role !== "medtech" && role !== "pathologist") return null;
  return {
    role,
    full_name:
      raw.full_name != null && String(raw.full_name).trim() !== ""
        ? String(raw.full_name).trim()
        : null,
    license_no:
      raw.license_no != null && String(raw.license_no).trim() !== ""
        ? String(raw.license_no).trim()
        : null,
    updated_at: raw.updated_at != null ? String(raw.updated_at) : null,
  };
}

function toMap(rows: LabResultSignatoryRow[]): LabResultSignatoriesMap {
  const medtech = rows.find((r) => r.role === "medtech") ?? emptySignatory("medtech");
  const pathologist = rows.find((r) => r.role === "pathologist") ?? emptySignatory("pathologist");
  return { medtech, pathologist };
}

export async function fetchLabResultSignatories(
  db: SupabaseClient,
): Promise<{ signatories: LabResultSignatoriesMap; error: string | null }> {
  const { data, error } = await db
    .from(LAB_RESULT_SIGNATORIES_TABLE)
    .select(SIGNATORY_SELECT)
    .in("role", ["medtech", "pathologist"]);
  if (error) return { signatories: toMap([]), error: error.message };
  const rows = (data ?? [])
    .map((r) => mapRow(r as Record<string, unknown>))
    .filter((r): r is LabResultSignatoryRow => r != null);
  return { signatories: toMap(rows), error: null };
}

function safeText(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

export type LabResultSignatoriesPayload = {
  medtech?: { full_name?: unknown; license_no?: unknown };
  pathologist?: { full_name?: unknown; license_no?: unknown };
};

export async function upsertLabResultSignatories(
  db: SupabaseClient,
  payload: LabResultSignatoriesPayload,
): Promise<{ signatories: LabResultSignatoriesMap; error: string | null }> {
  const now = new Date().toISOString();
  const rows: Array<{
    role: LabSignatureRole;
    full_name: string | null;
    license_no: string | null;
    updated_at: string;
  }> = [];

  if (payload.medtech !== undefined) {
    rows.push({
      role: "medtech",
      full_name: safeText(payload.medtech.full_name),
      license_no: safeText(payload.medtech.license_no),
      updated_at: now,
    });
  }
  if (payload.pathologist !== undefined) {
    rows.push({
      role: "pathologist",
      full_name: safeText(payload.pathologist.full_name),
      license_no: safeText(payload.pathologist.license_no),
      updated_at: now,
    });
  }

  if (rows.length === 0) {
    return fetchLabResultSignatories(db);
  }

  const { error } = await db.from(LAB_RESULT_SIGNATORIES_TABLE).upsert(rows, { onConflict: "role" });
  if (error) return { signatories: toMap([]), error: error.message };
  return fetchLabResultSignatories(db);
}
