import type { SupabaseClient } from "@supabase/supabase-js";
import { formatDateMMDDYYYY, formatLabTime } from "@/lib/dateDisplay";

export type ResultsPrintPatientHeader = {
  patient_name: string | null;
  patient_id?: number | null;
  request_date: string;
  request_time: string | null;
  patient_date_of_birth: string | null;
  patient_sex: string | null;
  patient_age_years: number | null;
  patient_address: string | null;
  patient_contact_no: string | null;
  patient_philhealth_no: string | null;
  requesting_physician: string | null;
  results_released_at: string | null;
};

function parseYmdParts(s: string): { y: number; m: number; d: number } | null {
  const t = s.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return null;
  const [ys, ms, ds] = t.split("-");
  const y = Number(ys);
  const m = Number(ms);
  const d = Number(ds);
  if (!Number.isFinite(y) || m < 1 || m > 12 || d < 1 || d > 31) return null;
  return { y, m, d };
}

/** Whole years from DOB to reference date (request date), both yyyy-mm-dd. */
export function ageYearsAt(dobYmd: string | null | undefined, refYmd: string): number | null {
  const db = parseYmdParts(String(dobYmd ?? ""));
  const rb = parseYmdParts(refYmd);
  if (!db || !rb) return null;
  let age = rb.y - db.y;
  if (rb.m < db.m || (rb.m === db.m && rb.d < db.d)) age -= 1;
  return age >= 0 && age < 150 ? age : null;
}

export async function resolveRequestingPhysicianLabel(
  admin: SupabaseClient,
  referring: string | null | undefined,
  physicianId: number | null | undefined,
): Promise<string | null> {
  const ref = (referring ?? "").trim();
  if (ref && !/^\d+$/.test(ref)) return ref;

  const uid =
    physicianId != null && Number.isFinite(physicianId)
      ? Math.trunc(physicianId)
      : ref !== "" && /^\d+$/.test(ref)
        ? Number(ref)
        : null;
  if (uid != null && uid > 0) {
    const { data: uRow, error: uErr } = await admin.from("users").select("fullname").eq("user_id", uid).maybeSingle();
    if (!uErr) {
      const fn = String((uRow as { fullname?: string | null } | null)?.fullname ?? "").trim();
      if (fn) return fn;
    }
  }
  return ref || null;
}

export function formatResultsRequestDateTime(requestDate: string, requestTime: string | null): string {
  const d = formatDateMMDDYYYY(requestDate);
  const t = formatLabTime(requestTime);
  if (!d) return t === "—" ? "—" : t;
  return t === "—" ? d : `${d} · ${t}`;
}

/** Local calendar + clock from ISO for "date released" line. */
export function formatResultsReleasedDateTime(iso: string | null | undefined): string {
  if (iso == null || String(iso).trim() === "") return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const y = d.getFullYear();
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${mm}-${day}-${y} · ${h}:${min}`;
}

export function formatPatientAgeSex(header: ResultsPrintPatientHeader): string {
  const age = header.patient_age_years;
  const sex = (header.patient_sex ?? "").trim();
  if (age != null && Number.isFinite(age)) return `${Math.trunc(age)}/${sex || "—"}`;
  return sex ? `—/${sex}` : "—";
}

export type PatientRowFields = {
  patient_name: string | null;
  patient_date_of_birth: string | null;
  patient_sex: string | null;
  patient_address: string | null;
  patient_contact_no: string | null;
  patient_philhealth_no: string | null;
};

export function parsePatientRowFields(
  pat: {
    name?: string | null;
    date_of_birth?: string | null;
    sex?: string | null;
    address?: string | null;
    contact_no?: string | null;
    philhealth_no?: number | null;
  } | null,
): PatientRowFields {
  const prow = pat;
  const rawName = prow?.name ?? null;
  const patient_name =
    rawName != null && String(rawName).trim() !== "" ? String(rawName).trim() : null;
  const patient_date_of_birth =
    prow?.date_of_birth != null && String(prow.date_of_birth).trim() !== ""
      ? String(prow.date_of_birth).trim().slice(0, 10)
      : null;
  const patient_sex =
    prow?.sex != null && String(prow.sex).trim() !== "" ? String(prow.sex).trim().toUpperCase() : null;
  const patient_address =
    prow?.address != null && String(prow.address).trim() !== "" ? String(prow.address).trim() : null;
  const patient_contact_no =
    prow?.contact_no != null && String(prow.contact_no).trim() !== ""
      ? String(prow.contact_no).trim()
      : null;
  const patient_philhealth_no =
    prow?.philhealth_no != null && Number.isFinite(Number(prow.philhealth_no))
      ? String(prow.philhealth_no)
      : null;
  return {
    patient_name,
    patient_date_of_birth,
    patient_sex,
    patient_address,
    patient_contact_no,
    patient_philhealth_no,
  };
}
