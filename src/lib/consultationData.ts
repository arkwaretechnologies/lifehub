import {
  buildConsultationPatient,
  type ConsultationEncounterSummary,
  type ConsultationPatient,
  type ConsultationPatientProfile,
} from "@/components/consultation/consultationTypes";
import { supabase } from "@/lib/supabaseClient";

const ENCOUNTERS_TABLE = "encounters";
const PATIENTS_TABLE = "patients";
const USERS_TABLE = "users";

/** Subset of `patients` columns returned with encounter embeds. */
export type ConsultationPatientRow = {
  id: string | number;
  name: string | null;
  date_of_birth: string | null;
  sex: string | null;
  civil_status: string | null;
  address: string | null;
  contact_no: string | null;
  occupation: string | null;
  referring_physician: string | number | null;
  philhealth_no: number | null;
};

/** Full `patients` row for consultation home table (aligned with patient records page). */
export type ConsultationPatientListRow = {
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
};

export type EncounterRow = {
  trans_id: string;
  patient_id: number;
  encounter_date: string;
  encounter_time: string | null;
  queue_no: string | null;
  chief_complaint: string | null;
  referring_physician: number | null;
  physician_id: number | null;
};

type EncounterWithPatient = EncounterRow & { patients: ConsultationPatientRow | ConsultationPatientRow[] | null };

function unwrapPatient(embed: ConsultationPatientRow | ConsultationPatientRow[] | null): ConsultationPatientRow | null {
  if (!embed) return null;
  return Array.isArray(embed) ? embed[0] ?? null : embed;
}

/** PostgREST `.or()` filter for patient text search (aligned with patient page). */
function buildPatientSearchOrFilter(raw: string): string {
  const t = raw.trim().replace(/,/g, " ").toUpperCase();
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

function isUuid(s: string): boolean {
  const t = s.trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(t);
}

function formatEncounterTime(value: string | null | undefined): string {
  if (value == null || String(value).trim() === "") return "";
  const s = String(value);
  if (s.length >= 5 && s[4] === ":") return s.slice(0, 5);
  const m = s.match(/(\d{1,2}:\d{2})/);
  return m?.[1] ?? "";
}

function ageFromDob(iso: string | null | undefined): number {
  if (!iso || iso.length < 10) return 0;
  const d = new Date(iso.slice(0, 10));
  if (Number.isNaN(d.getTime())) return 0;
  const t = new Date();
  let age = t.getFullYear() - d.getFullYear();
  const mo = t.getMonth() - d.getMonth();
  if (mo < 0 || (mo === 0 && t.getDate() < d.getDate())) age--;
  return Math.max(0, age);
}

function formatPhilhealthDisplay(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "";
  return String(n);
}

function formatReferringFromPatient(
  value: string | number | null | undefined,
  userLabelById: Map<string, string>
): string {
  if (value === null || value === undefined || String(value).trim() === "") return "";
  const s = String(value).trim();
  if (/^\d+$/.test(s)) {
    return userLabelById.get(s) ?? `USER ID ${s}`;
  }
  return s.toUpperCase();
}

function referringForEncounterBanner(
  encounter: EncounterRow,
  patient: ConsultationPatientRow,
  userLabelById: Map<string, string>
): string {
  if (encounter.referring_physician != null) {
    const id = String(encounter.referring_physician);
    return userLabelById.get(id) ?? `USER ID ${id}`;
  }
  return formatReferringFromPatient(patient.referring_physician, userLabelById);
}

export function patientRowToConsultationProfile(
  p: ConsultationPatientRow,
  userLabelById: Map<string, string>
): ConsultationPatientProfile {
  const dob = p.date_of_birth?.length ? p.date_of_birth.slice(0, 10) : "";
  const sex = (p.sex ?? "").toUpperCase() || "—";
  const age = ageFromDob(p.date_of_birth);
  return {
    patientId: String(p.id),
    name: (p.name ?? "").trim(),
    ageSex: `${age} / ${sex}`,
    dob,
    civilStatus: (p.civil_status ?? "").toUpperCase(),
    address: (p.address ?? "").toUpperCase(),
    contactNo: (p.contact_no ?? "").toUpperCase(),
    occupation: (p.occupation ?? "").toUpperCase(),
    referringPhysician: formatReferringFromPatient(p.referring_physician, userLabelById),
    philhealthNo: formatPhilhealthDisplay(p.philhealth_no),
  };
}

function encounterToSummary(row: EncounterRow): ConsultationEncounterSummary {
  const date = row.encounter_date?.length ? row.encounter_date.slice(0, 10) : "";
  const qn = row.queue_no?.trim();
  return {
    id: row.trans_id,
    patientId: String(row.patient_id),
    date,
    time: formatEncounterTime(row.encounter_time),
    chiefComplaint: row.chief_complaint?.trim() ? row.chief_complaint.trim() : undefined,
    queueNo: qn ? qn.toUpperCase() : undefined,
  };
}

function sortEncountersDesc(a: ConsultationEncounterSummary, b: ConsultationEncounterSummary): number {
  const da = a.date.localeCompare(b.date);
  if (da !== 0) return -da;
  return b.time.localeCompare(a.time);
}

const ENCOUNTER_SELECT = `
  trans_id,
  patient_id,
  encounter_date,
  encounter_time,
  queue_no,
  chief_complaint,
  referring_physician,
  physician_id,
  patients!encounters_patient_id_fkey (
    id,
    name,
    date_of_birth,
    sex,
    civil_status,
    address,
    contact_no,
    occupation,
    referring_physician,
    philhealth_no
  )
`;

async function fetchEncountersWithPatients(options: {
  limit: number;
  patientIds?: number[];
  transIdEq?: string;
}): Promise<{ rows: EncounterWithPatient[]; error: string | null }> {
  let q = supabase
    .from(ENCOUNTERS_TABLE)
    .select(ENCOUNTER_SELECT)
    .order("encounter_date", { ascending: false })
    .order("encounter_time", { ascending: false })
    .limit(options.limit);

  if (options.patientIds && options.patientIds.length > 0) {
    q = q.in("patient_id", options.patientIds);
  }
  if (options.transIdEq) {
    q = q.eq("trans_id", options.transIdEq);
  }

  const { data, error } = await q;
  if (error) return { rows: [], error: error.message };
  return { rows: (data ?? []) as EncounterWithPatient[], error: null };
}

async function fetchUserLabels(userIds: Iterable<number | null | undefined>): Promise<Map<string, string>> {
  const ids = [...new Set([...userIds].filter((x): x is number => x != null && Number.isFinite(x)))];
  if (ids.length === 0) return new Map();

  const { data, error } = await supabase.from(USERS_TABLE).select("user_id, fullname").in("user_id", ids);

  const m = new Map<string, string>();
  if (error) return m;
  for (const row of data ?? []) {
    const u = row as { user_id: string | number; fullname: string | null };
    if (u.user_id === null || u.user_id === undefined) continue;
    const name = (u.fullname ?? "").trim().toUpperCase();
    m.set(String(u.user_id), name || `USER ${u.user_id}`);
  }
  return m;
}

function collectUserIdsFromRows(rows: EncounterWithPatient[]): number[] {
  const out: number[] = [];
  for (const r of rows) {
    if (r.referring_physician != null) out.push(r.referring_physician);
    if (r.physician_id != null) out.push(r.physician_id);
    const p = unwrapPatient(r.patients);
    if (p?.referring_physician != null && /^\d+$/.test(String(p.referring_physician).trim())) {
      out.push(Number.parseInt(String(p.referring_physician), 10));
    }
  }
  return out;
}

export async function fetchConsultationPatientsPage(
  pageIndex: number,
  pageSize: number,
  searchRaw: string
): Promise<{ rows: ConsultationPatientListRow[]; count: number; error: string | null }> {
  const from = pageIndex * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from(PATIENTS_TABLE)
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false });

  const orFilter = buildPatientSearchOrFilter(searchRaw);
  if (orFilter) {
    query = query.or(orFilter);
  }

  const { data, error, count } = await query.range(from, to);

  if (error) {
    return { rows: [], count: 0, error: error.message };
  }

  return {
    rows: (data ?? []) as ConsultationPatientListRow[],
    count: count ?? 0,
    error: null,
  };
}

export async function fetchEncountersForPatient(
  patientId: number
): Promise<{ encounters: ConsultationEncounterSummary[]; error: string | null }> {
  const { data, error } = await supabase
    .from(ENCOUNTERS_TABLE)
    .select(
      "trans_id, patient_id, encounter_date, encounter_time, queue_no, chief_complaint, referring_physician, physician_id"
    )
    .eq("patient_id", patientId)
    .order("encounter_date", { ascending: false })
    .order("encounter_time", { ascending: false })
    .limit(500);

  if (error) {
    return { encounters: [], error: error.message };
  }

  const encounters = (data ?? []).map((row) => encounterToSummary(row as EncounterRow));
  encounters.sort(sortEncountersDesc);
  return { encounters, error: null };
}

export async function createEncounterForPatient(
  patientId: number
): Promise<{ transId: string | null; error: string | null }> {
  if (!Number.isFinite(patientId)) {
    return { transId: null, error: "Invalid patient." };
  }

  const { data, error } = await supabase
    .from(ENCOUNTERS_TABLE)
    .insert({ patient_id: patientId })
    .select("trans_id")
    .maybeSingle();

  if (error) {
    return { transId: null, error: error.message };
  }

  const transId = (data as { trans_id?: string } | null)?.trans_id;
  if (!transId) {
    return {
      transId: null,
      error: "Encounter was not created. Check database permissions (RLS) or try again.",
    };
  }

  return { transId, error: null };
}

export async function fetchEncounterWorkspacePatient(encounterId: string): Promise<ConsultationPatient | null> {
  const id = encounterId.trim();
  if (!isUuid(id)) return null;

  const { rows, error } = await fetchEncountersWithPatients({ limit: 1, transIdEq: id });
  if (error || !rows[0]) return null;

  const row = rows[0];
  const patient = unwrapPatient(row.patients);
  if (!patient) return null;

  const userLabelById = await fetchUserLabels(collectUserIdsFromRows([row]));
  const profile = patientRowToConsultationProfile(patient, userLabelById);
  profile.referringPhysician = referringForEncounterBanner(row, patient, userLabelById);

  return buildConsultationPatient(profile, encounterToSummary(row));
}
