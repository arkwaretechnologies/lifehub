import type { SupabaseClient } from "@supabase/supabase-js";
import { queueAdminClient } from "@/lib/receptionQueueServer";

export type FollowUpDayRow = {
  transId: string;
  patientId: number;
  patientName: string;
  contactNo: string | null;
  followUpDate: string;
  sourceEncounterDate: string;
  encounterTime: string | null;
  queueNo: string | null;
  chiefComplaint: string | null;
};

export type FollowUpMonthDayCount = {
  date: string;
  count: number;
};

type PatientEmbed = {
  id?: number | null;
  name?: string | null;
  contact_no?: string | null;
};

type EncounterFollowUpDbRow = {
  trans_id: string;
  follow_up_date: string | null;
  encounter_date: string | null;
  encounter_time: string | null;
  queue_no: string | null;
  chief_complaint: string | null;
  patient_id: number | null;
  patients: PatientEmbed | PatientEmbed[] | null;
};

function unwrapPatient(embed: EncounterFollowUpDbRow["patients"]): PatientEmbed | null {
  if (!embed) return null;
  return Array.isArray(embed) ? embed[0] ?? null : embed;
}

function ymd(raw: string | null | undefined): string {
  if (raw == null || String(raw).trim() === "") return "";
  return String(raw).trim().slice(0, 10);
}

function isYmd(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function isYearMonth(s: string): boolean {
  return /^\d{4}-\d{2}$/.test(s);
}

/** Inclusive month bounds as YYYY-MM-DD for a YYYY-MM key. */
export function monthBoundsYmd(yearMonth: string): { start: string; end: string } | null {
  if (!isYearMonth(yearMonth)) return null;
  const [ys, ms] = yearMonth.split("-");
  const y = Number(ys);
  const m = Number(ms);
  if (!Number.isFinite(y) || m < 1 || m > 12) return null;
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const mm = String(m).padStart(2, "0");
  return {
    start: `${y}-${mm}-01`,
    end: `${y}-${mm}-${String(lastDay).padStart(2, "0")}`,
  };
}

function mapRow(row: EncounterFollowUpDbRow): FollowUpDayRow | null {
  const patient = unwrapPatient(row.patients);
  const patientId = Number(patient?.id ?? row.patient_id);
  if (!Number.isFinite(patientId)) return null;
  const followUpDate = ymd(row.follow_up_date);
  if (!followUpDate) return null;
  return {
    transId: String(row.trans_id),
    patientId,
    patientName: String(patient?.name ?? "").trim() || "Unknown patient",
    contactNo: String(patient?.contact_no ?? "").trim() || null,
    followUpDate,
    sourceEncounterDate: ymd(row.encounter_date),
    encounterTime: row.encounter_time != null ? String(row.encounter_time) : null,
    queueNo: row.queue_no != null ? String(row.queue_no).trim() || null : null,
    chiefComplaint: row.chief_complaint != null ? String(row.chief_complaint).trim() || null : null,
  };
}

export async function fetchFollowUpsForDate(
  dateYmd: string,
  adminClient?: SupabaseClient | null
): Promise<{ rows: FollowUpDayRow[]; error: string | null }> {
  if (!isYmd(dateYmd)) {
    return { rows: [], error: "Invalid date. Use YYYY-MM-DD." };
  }
  const admin = adminClient === undefined ? queueAdminClient() : adminClient;
  if (!admin) {
    return { rows: [], error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." };
  }

  const { data, error } = await admin
    .from("encounters")
    .select(
      `
      trans_id,
      follow_up_date,
      encounter_date,
      encounter_time,
      queue_no,
      chief_complaint,
      patient_id,
      patients!encounters_patient_id_fkey ( id, name, contact_no )
    `
    )
    .eq("follow_up_date", dateYmd)
    .order("encounter_date", { ascending: false });

  if (error) {
    return { rows: [], error: error.message };
  }

  const rows = ((data ?? []) as EncounterFollowUpDbRow[])
    .map(mapRow)
    .filter((r): r is FollowUpDayRow => r != null);

  return { rows, error: null };
}

export async function fetchFollowUpCountsForMonth(
  yearMonth: string,
  adminClient?: SupabaseClient | null
): Promise<{ days: FollowUpMonthDayCount[]; error: string | null }> {
  const bounds = monthBoundsYmd(yearMonth);
  if (!bounds) {
    return { days: [], error: "Invalid month. Use YYYY-MM." };
  }
  const admin = adminClient === undefined ? queueAdminClient() : adminClient;
  if (!admin) {
    return { days: [], error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." };
  }

  const { data, error } = await admin
    .from("encounters")
    .select("follow_up_date")
    .gte("follow_up_date", bounds.start)
    .lte("follow_up_date", bounds.end)
    .not("follow_up_date", "is", null);

  if (error) {
    return { days: [], error: error.message };
  }

  const counts = new Map<string, number>();
  for (const row of data ?? []) {
    const d = ymd((row as { follow_up_date?: string | null }).follow_up_date);
    if (!d) continue;
    counts.set(d, (counts.get(d) ?? 0) + 1);
  }

  const days: FollowUpMonthDayCount[] = [...counts.entries()]
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return { days, error: null };
}
