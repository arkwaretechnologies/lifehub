import type { SupabaseClient } from "@supabase/supabase-js";
import {
  IMAGING_SIGNATURE_ROLES,
  type ImagingSignatureRole,
  isImagingSignatureRole,
} from "@/lib/imagingResultSignatures";

export const IMAGING_RESULT_SIGNATORIES_TABLE = "imaging_result_signatories" as const;

export type { ImagingSignatureRole };

export type ImagingResultSignatoryRow = {
  role: ImagingSignatureRole;
  full_name: string | null;
  license_no: string | null;
  signature_storage_path: string | null;
  updated_at: string | null;
};

export type ImagingResultSignatoriesMap = Record<ImagingSignatureRole, ImagingResultSignatoryRow>;

const SIGNATORY_SELECT = "role, full_name, license_no, signature_storage_path, updated_at";

function emptySignatory(role: ImagingSignatureRole): ImagingResultSignatoryRow {
  return { role, full_name: null, license_no: null, signature_storage_path: null, updated_at: null };
}

function mapRow(raw: Record<string, unknown>): ImagingResultSignatoryRow | null {
  const role = String(raw.role ?? "").trim().toLowerCase();
  if (!isImagingSignatureRole(role)) return null;
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
    signature_storage_path:
      raw.signature_storage_path != null && String(raw.signature_storage_path).trim() !== ""
        ? String(raw.signature_storage_path).trim()
        : null,
    updated_at: raw.updated_at != null ? String(raw.updated_at) : null,
  };
}

function toMap(rows: ImagingResultSignatoryRow[]): ImagingResultSignatoriesMap {
  const out = {} as ImagingResultSignatoriesMap;
  for (const role of IMAGING_SIGNATURE_ROLES) {
    out[role] = rows.find((r) => r.role === role) ?? emptySignatory(role);
  }
  return out;
}

export async function fetchImagingResultSignatories(
  db: SupabaseClient,
): Promise<{ signatories: ImagingResultSignatoriesMap; error: string | null }> {
  const { data, error } = await db
    .from(IMAGING_RESULT_SIGNATORIES_TABLE)
    .select(SIGNATORY_SELECT)
    .in("role", [...IMAGING_SIGNATURE_ROLES]);
  if (error) return { signatories: toMap([]), error: error.message };
  const rows = (data ?? [])
    .map((r) => mapRow(r as Record<string, unknown>))
    .filter((r): r is ImagingResultSignatoryRow => r != null);
  return { signatories: toMap(rows), error: null };
}

function safeText(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

export type ImagingResultSignatoriesPayload = Partial<
  Record<ImagingSignatureRole, { full_name?: unknown; license_no?: unknown }>
>;

export async function setImagingSignatorySignaturePath(
  db: SupabaseClient,
  role: ImagingSignatureRole,
  signatureStoragePath: string | null,
): Promise<{ signatories: ImagingResultSignatoriesMap; error: string | null }> {
  const now = new Date().toISOString();
  const { error } = await db.from(IMAGING_RESULT_SIGNATORIES_TABLE).upsert(
    {
      role,
      signature_storage_path: signatureStoragePath,
      updated_at: now,
    },
    { onConflict: "role" },
  );
  if (error) return { signatories: toMap([]), error: error.message };
  return fetchImagingResultSignatories(db);
}

export async function fetchImagingSignatorySignaturePath(
  db: SupabaseClient,
  role: ImagingSignatureRole,
): Promise<{ path: string | null; error: string | null }> {
  const { signatories, error } = await fetchImagingResultSignatories(db);
  if (error) return { path: null, error };
  return { path: signatories[role].signature_storage_path, error: null };
}

export async function upsertImagingResultSignatories(
  db: SupabaseClient,
  payload: ImagingResultSignatoriesPayload,
): Promise<{ signatories: ImagingResultSignatoriesMap; error: string | null }> {
  const now = new Date().toISOString();
  const rows: Array<{
    role: ImagingSignatureRole;
    full_name: string | null;
    license_no: string | null;
    updated_at: string;
  }> = [];

  for (const role of IMAGING_SIGNATURE_ROLES) {
    const patch = payload[role];
    if (patch === undefined) continue;
    rows.push({
      role,
      full_name: safeText(patch.full_name),
      license_no: safeText(patch.license_no),
      updated_at: now,
    });
  }

  if (rows.length === 0) {
    return fetchImagingResultSignatories(db);
  }

  const { error } = await db.from(IMAGING_RESULT_SIGNATORIES_TABLE).upsert(rows, { onConflict: "role" });
  if (error) return { signatories: toMap([]), error: error.message };
  return fetchImagingResultSignatories(db);
}
