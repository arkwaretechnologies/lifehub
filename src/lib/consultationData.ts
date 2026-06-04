import {
  buildConsultationPatient,
  type ConsultationEncounterSummary,
  type ConsultationPatient,
  type ConsultationPatientProfile,
} from "@/components/consultation/consultationTypes";
import {
  fetchCashierUnpaidPhysicianFeeEncounterCounts,
  fetchEncounterTransIdsWithPendingDiagnosticAmendments,
  fetchEncounterTransIdsWithUnpaidImagingRequests,
  fetchEncounterTransIdsWithUnpaidLabRequests,
} from "@/lib/cashierLabQueue";
import { buildPatientSearchOrFilter, PATIENT_DIRECTORY_SELECT, sanitizePatientSearchQuery } from "@/lib/patientsCatalog";
import { supabase } from "@/lib/supabaseClient";
import { queueTicketTodayIsoDate } from "@/lib/queueTicketDate";
import { numericIdFromUnknown } from "@/lib/sessionUserId";

const ENCOUNTERS_TABLE = "encounters";
const PATIENTS_TABLE = "patients";
const USERS_TABLE = "users";
const QUEUE_TICKETS_TABLE = "queue_tickets";

/** Subset of `patients` columns returned with encounter embeds. */
export type ConsultationPatientRow = {
  id: string | number;
  name: string | null;
  date_of_birth: string | null;
  sex: string | null;
  civil_status: string | null;
  address: string | null;
  contact_no: string | null;
  email_address?: string | null;
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
  /** Present when loaded via {@link PATIENT_DIRECTORY_SELECT} (directory / pagination). */
  created_at?: string;
  updated_at?: string | null;
};

export type EncounterRow = {
  trans_id: string;
  patient_id: number;
  encounter_date: string;
  encounter_time: string | null;
  queue_no: string | null;
  chief_complaint: string | null;
  history_of_present_illness?: string | null;
  clinical_diagnosis?: string | null;
  plan_labs?: boolean | null;
  plan_imaging?: boolean | null;
  plan_medications?: boolean | null;
  plan_referral?: boolean | null;
  plan_notes?: string | null;
  disposition?: string | null;
  referring_physician: number | null;
  physician_id: number | null;
};

type EncounterWithPatient = EncounterRow & { patients: ConsultationPatientRow | ConsultationPatientRow[] | null };

function unwrapPatient(embed: ConsultationPatientRow | ConsultationPatientRow[] | null): ConsultationPatientRow | null {
  if (!embed) return null;
  return Array.isArray(embed) ? embed[0] ?? null : embed;
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

/** Appointments list: same embed as {@link ENCOUNTER_SELECT} plus fields used for visit status chips. */
const PHYSICIAN_APPOINTMENTS_SELECT = `
  trans_id,
  patient_id,
  encounter_date,
  encounter_time,
  queue_no,
  chief_complaint,
  referring_physician,
  physician_id,
  clinical_diagnosis,
  disposition,
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

/** Cashier search list: encounter + patient row (includes `email_address` for parity with patient directory). */
const CASHIER_ENCOUNTER_SEARCH_SELECT = `
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
    email_address,
    occupation,
    referring_physician,
    philhealth_no
  )
`;

export type CashierEncounterSearchRow = {
  encounter: ConsultationEncounterSummary;
  patient: ConsultationPatientListRow;
};

/**
 * Patient ids whose name matches the token (and `id` when the token is all digits).
 * Resolved separately because PostgREST cannot parse `patients.name` inside an `encounters` `.or()` filter.
 */
async function fetchPatientIdsForCashierSearchToken(
  tok: string,
): Promise<{ ids: number[]; error: string | null }> {
  const t = tok.trim();
  if (!t) return { ids: [], error: null };
  // Patient names are stored uppercase; normalize for `name.ilike`.
  const safeTok = sanitizePatientSearchQuery(t);
  const upper = safeTok.toUpperCase();
  if (!upper) return { ids: [], error: null };
  const escaped = upper.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
  const likePattern = `%${escaped}%`;
  let orFilter = `name.ilike.${likePattern}`;
  if (/^\d+$/.test(safeTok)) {
    orFilter = `${orFilter},id.eq.${safeTok}`;
  }
  const { data, error } = await supabase.from(PATIENTS_TABLE).select("id").or(orFilter).limit(200);
  if (error) return { ids: [], error: error.message };
  const ids = [
    ...new Set(
      (data ?? [])
        .map((r) => Number((r as { id: unknown }).id))
        .filter((n) => Number.isFinite(n)),
    ),
  ];
  return { ids, error: null };
}

/**
 * `trans_id`s matching one token (OR): patient directory hits, full-UUID equality, numeric `patient_id`, and
 * substring match on `trans_id` when the database accepts `ilike` on that column (PostgREST forbids `::` casts
 * inside `or=(...)`, so substring cannot live in the same `.or()` string as `patient_id.in`).
 */
async function fetchTransIdsMatchingCashierToken(
  tok: string,
  patientIds: number[],
): Promise<{ ids: Set<string>; error: string | null }> {
  const t = tok.trim();
  if (!t) return { ids: new Set(), error: null };
  // `trans_id` UUIDs are stored lowercase; normalize for `ilike` / `eq`.
  const lower = t.toLowerCase();
  const escapedTrans = lower.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
  const transLikePattern = `%${escapedTrans}%`;
  const out = new Set<string>();

  const orParts: string[] = [];
  if (patientIds.length > 0) {
    orParts.push(`patient_id.in.(${patientIds.join(",")})`);
  }
  if (isUuid(t)) {
    orParts.push(`trans_id.eq.${lower}`);
  }
  if (/^\d+$/.test(t)) {
    orParts.push(`patient_id.eq.${t}`);
  }

  if (orParts.length > 0) {
    const { data, error } = await supabase.from(ENCOUNTERS_TABLE).select("trans_id").or(orParts.join(","));
    if (error) return { ids: new Set(), error: error.message };
    for (const row of data ?? []) {
      const id = (row as { trans_id: string | null }).trans_id;
      if (id != null && id !== "") out.add(String(id));
    }
  }

  const { data: byText, error: textErr } = await supabase
    .from(ENCOUNTERS_TABLE)
    .select("trans_id")
    .ilike("trans_id", transLikePattern);
  if (!textErr && byText) {
    for (const row of byText) {
      const id = (row as { trans_id: string | null }).trans_id;
      if (id != null && id !== "") out.add(String(id));
    }
  }

  return { ids: out, error: null };
}

async function fetchEncountersWithPatients(options: {
  limit: number;
  patientIds?: number[];
  transIdEq?: string;
  transIdsIn?: string[];
  physicianIdEq?: number;
  /** Defaults to {@link ENCOUNTER_SELECT}. */
  select?: string;
}): Promise<{ rows: EncounterWithPatient[]; error: string | null }> {
  const select = options.select ?? ENCOUNTER_SELECT;
  let q = supabase
    .from(ENCOUNTERS_TABLE)
    .select(select)
    .order("encounter_date", { ascending: false })
    .order("encounter_time", { ascending: false })
    .limit(options.limit);

  if (options.patientIds && options.patientIds.length > 0) {
    q = q.in("patient_id", options.patientIds);
  }
  if (options.transIdEq) {
    q = q.eq("trans_id", options.transIdEq);
  }
  if (options.transIdsIn && options.transIdsIn.length > 0) {
    q = q.in("trans_id", options.transIdsIn);
  }
  if (options.physicianIdEq != null && Number.isFinite(options.physicianIdEq)) {
    q = q.eq("physician_id", options.physicianIdEq);
  }

  const { data, error } = await q;
  if (error) return { rows: [], error: error.message };
  return { rows: (data ?? []) as unknown as EncounterWithPatient[], error: null };
}

function sortEncountersByDateTimeDesc(rows: EncounterWithPatient[]): EncounterWithPatient[] {
  return [...rows].sort((a, b) => {
    const d = (b.encounter_date ?? "").localeCompare(a.encounter_date ?? "");
    if (d !== 0) return d;
    return (b.encounter_time ?? "").localeCompare(a.encounter_time ?? "");
  });
}

/** Active `queue_counters` assigned to this app user (`user_id`). */
async function fetchActiveCounterIdsForUser(userId: number): Promise<{ ids: string[]; error: string | null }> {
  const { data, error } = await supabase.from("queue_counters").select("id, user_id").eq("is_active", true);
  if (error) return { ids: [], error: error.message };
  const ids: string[] = [];
  for (const row of data ?? []) {
    const r = row as { id: string | number; user_id?: unknown };
    if (numericIdFromUnknown(r.user_id) === userId) {
      ids.push(String(r.id));
    }
  }
  return { ids, error: null };
}

type AppointmentQueueTicketRow = {
  id: string;
  encounter_id: string | null;
  patient_id: number | null;
  patient_name: string | null;
  queue_display: string;
  status: string;
  issued_at: string;
  ticket_date: string;
  counter_id: string | number;
  reason: string | null;
};

function timeFromIssuedAt(issuedAt: string): string {
  const issued = issuedAt.trim();
  if (!issued) return "";
  const dt = new Date(issued);
  if (Number.isNaN(dt.getTime())) return "";
  return dt.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

/** Today's Waiting / Called / Serving tickets on the given counters (includes tickets without `encounter_id`). */
async function fetchTodayAppointmentTicketsOnCounters(
  counterIds: string[],
): Promise<{ tickets: AppointmentQueueTicketRow[]; error: string | null }> {
  if (counterIds.length === 0) return { tickets: [], error: null };
  const ticketDate = queueTicketTodayIsoDate();
  const { data, error } = await supabase
    .from(QUEUE_TICKETS_TABLE)
    .select(
      "id, encounter_id, patient_id, patient_name, queue_display, status, issued_at, ticket_date, counter_id, reason",
    )
    .eq("ticket_date", ticketDate)
    .in("counter_id", counterIds)
    .in("status", ["Waiting", "Called", "Serving"]);
  if (error) return { tickets: [], error: error.message };
  return { tickets: (data ?? []) as AppointmentQueueTicketRow[], error: null };
}

function pickBestWaitingTicket(tickets: AppointmentQueueTicketRow[]): AppointmentQueueTicketRow | null {
  let best: AppointmentQueueTicketRow | null = null;
  for (const t of tickets) {
    if ((t.status ?? "").trim() !== "Waiting") continue;
    if (!best || (t.issued_at ?? "").localeCompare(best.issued_at ?? "") < 0) {
      best = t;
    }
  }
  return best;
}

function pickBestCalledTicket(tickets: AppointmentQueueTicketRow[]): AppointmentQueueTicketRow | null {
  let best: AppointmentQueueTicketRow | null = null;
  const rank = (s: string) => (s === "Serving" ? 2 : s === "Called" ? 1 : 0);
  for (const t of tickets) {
    const st = (t.status ?? "").trim();
    if (st !== "Called" && st !== "Serving") continue;
    if (!best) {
      best = t;
      continue;
    }
    const cmp = rank(st) - rank((best.status ?? "").trim());
    if (cmp > 0 || (cmp === 0 && (t.issued_at ?? "").localeCompare(best.issued_at ?? "") >= 0)) {
      best = t;
    }
  }
  return best;
}

function ticketToWaitingPick(
  t: AppointmentQueueTicketRow,
  counterNameById: Map<string, string>,
): WaitingQueueTicketPick {
  const cid = t.counter_id != null && t.counter_id !== "" ? String(t.counter_id) : "";
  return {
    ticketId: String(t.id),
    queueDisplay: (t.queue_display ?? "").trim() || "—",
    patientName: t.patient_name?.trim() ? t.patient_name.trim() : null,
    counterName: cid ? (counterNameById.get(cid) ?? null) : null,
  };
}

function ticketToCalledPick(
  t: AppointmentQueueTicketRow,
  counterNameById: Map<string, string>,
): CalledQueueTicketPick {
  const st = (t.status ?? "").trim();
  return {
    ...ticketToWaitingPick(t, counterNameById),
    status: (st === "Serving" ? "Serving" : "Called") as "Called" | "Serving",
  };
}

export type PhysicianAppointmentStatusChipColor = "default" | "success" | "info";

export type PhysicianAppointmentRow = {
  /** Stable React key: encounter `trans_id` or `ticket:{uuid}`. */
  rowKey: string;
  /** Waiting ticket with no `encounter_id` yet (reception routed, check-in pending). */
  queueOnly: boolean;
  transId: string;
  patientId: string;
  patientName: string;
  encounterDate: string;
  encounterTime: string;
  queueNo?: string;
  chiefComplaint?: string;
  statusLabel: string;
  statusChipColor: PhysicianAppointmentStatusChipColor;
  /** True when this encounter has a today `queue_tickets` row in **Waiting** (Click to Call applies). */
  hasWaitingQueueToday: boolean;
  /** When waiting: ticket id for `patchReceptionQueueTicket(..., "call")` (same as reception desk). */
  waitingQueueTicketId: string | null;
  waitingQueueDisplay: string | null;
  waitingQueueCounterName: string | null;
  waitingQueueTicketPatientName: string | null;
  /** Today ticket is **Called** or **Serving** (after call) — show in “open visit” queue; mutually exclusive with waiting. */
  hasCalledOrServingQueueToday: boolean;
  calledQueueTicketStatus: "Called" | "Serving" | null;
  calledQueueTicketId: string | null;
  calledQueueDisplay: string | null;
  calledQueueCounterName: string | null;
  calledQueueTicketPatientName: string | null;
};

export function appointmentListRowKey(row: PhysicianAppointmentRow): string {
  return row.rowKey;
}

/**
 * Derives appointment list status from `encounters.disposition` / `clinical_diagnosis` (no queue join).
 * Disposition wins when set; else non-empty diagnosis → "Documented"; else a neutral in-progress label (not "Open", to avoid confusion with "Open visit" actions).
 */
export function physicianAppointmentStatusFromEncounter(
  disposition: string | null | undefined,
  clinicalDiagnosis: string | null | undefined,
): { label: string; statusChipColor: PhysicianAppointmentStatusChipColor } {
  const disp = (disposition ?? "").trim();
  if (disp) return { label: disp, statusChipColor: "default" };
  const dx = (clinicalDiagnosis ?? "").trim();
  if (dx) return { label: "Documented", statusChipColor: "success" };
  return { label: "In progress", statusChipColor: "info" };
}

const DEFAULT_PHYSICIAN_ENCOUNTER_LIMIT = 200;

type WaitingQueueTicketPick = {
  ticketId: string;
  queueDisplay: string;
  patientName: string | null;
  counterName: string | null;
};

type CalledQueueTicketPick = WaitingQueueTicketPick & {
  status: "Called" | "Serving";
};

function encounterOriginalIdsOrdered(encounterTransIds: string[]): string[] {
  const seenLower = new Set<string>();
  const originalsOrdered: string[] = [];
  for (const t of encounterTransIds) {
    const o = t.trim();
    const k = o.toLowerCase();
    if (!k || seenLower.has(k)) continue;
    seenLower.add(k);
    originalsOrdered.push(o);
  }
  return originalsOrdered;
}


async function resolveCounterNamesForTickets(
  ticketRows: Iterable<{ counter_id?: string | number | null }>,
): Promise<Map<string, string>> {
  const counterIds = [
    ...new Set(
      [...ticketRows]
        .map((r) => (r.counter_id != null && r.counter_id !== "" ? String(r.counter_id) : ""))
        .filter(Boolean),
    ),
  ];
  const counterNameById = new Map<string, string>();
  if (counterIds.length === 0) return counterNameById;
  const { data: ctrData, error: ctrErr } = await supabase
    .from("queue_counters")
    .select("id, name, code")
    .in("id", counterIds);
  if (ctrErr) return counterNameById;
  for (const c of (ctrData ?? []) as { id: string | number; name?: string | null; code?: string | null }[]) {
    const id = String(c.id);
    const label = `${(c.name ?? "").trim() || (c.code ?? "").trim() || id}`;
    counterNameById.set(id, label);
  }
  return counterNameById;
}

function ticketCounterAllowed(
  counterId: string | number | null | undefined,
  counterIdFilter: Set<string> | undefined,
): boolean {
  if (!counterIdFilter || counterIdFilter.size === 0) return true;
  if (counterId == null || counterId === "") return false;
  return counterIdFilter.has(String(counterId));
}

/** One Waiting ticket per encounter (earliest `issued_at`) for today, with fields used by reception call + announce. */
async function fetchWaitingQueueTicketsTodayByEncounterIds(
  encounterTransIds: string[],
  counterIdFilter?: Set<string>,
): Promise<{ map: Map<string, WaitingQueueTicketPick>; error: string | null }> {
  const originalsOrdered = encounterOriginalIdsOrdered(encounterTransIds);
  if (originalsOrdered.length === 0) {
    return { map: new Map(), error: null };
  }
  const ticketDate = queueTicketTodayIsoDate();
  const CHUNK = 100;
  type Raw = {
    id: string;
    encounter_id?: string | null;
    queue_display?: string | null;
    patient_name?: string | null;
    counter_id?: string | number | null;
    issued_at?: string | null;
  };
  const bestByEncounter = new Map<string, Raw>();
  for (let i = 0; i < originalsOrdered.length; i += CHUNK) {
    const chunk = originalsOrdered.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from(QUEUE_TICKETS_TABLE)
      .select("id, encounter_id, queue_display, patient_name, counter_id, issued_at")
      .eq("ticket_date", ticketDate)
      .eq("status", "Waiting")
      .in("encounter_id", chunk);
    if (error) {
      return { map: new Map(), error: error.message };
    }
    for (const row of (data ?? []) as Raw[]) {
      if (!ticketCounterAllowed(row.counter_id, counterIdFilter)) continue;
      const eid = row.encounter_id?.trim().toLowerCase();
      if (!eid) continue;
      const prev = bestByEncounter.get(eid);
      const issued = (row.issued_at ?? "").trim();
      const prevIssued = (prev?.issued_at ?? "").trim();
      if (!prev || issued.localeCompare(prevIssued) < 0) {
        bestByEncounter.set(eid, row);
      }
    }
  }

  const counterNameById = await resolveCounterNamesForTickets(bestByEncounter.values());
  const map = new Map<string, WaitingQueueTicketPick>();
  for (const [eid, row] of bestByEncounter) {
    const qd = (row.queue_display ?? "").trim();
    const cid = row.counter_id != null && row.counter_id !== "" ? String(row.counter_id) : "";
    map.set(eid, {
      ticketId: String(row.id),
      queueDisplay: qd || "—",
      patientName: row.patient_name?.trim() ? row.patient_name.trim() : null,
      counterName: cid ? (counterNameById.get(cid) ?? null) : null,
    });
  }
  return { map, error: null };
}

/** Latest Called or Serving ticket per encounter for today (open visit). */
async function fetchCalledOrServingQueueTicketsTodayByEncounterIds(
  encounterTransIds: string[],
  counterIdFilter?: Set<string>,
): Promise<{ map: Map<string, CalledQueueTicketPick>; error: string | null }> {
  const originalsOrdered = encounterOriginalIdsOrdered(encounterTransIds);
  if (originalsOrdered.length === 0) {
    return { map: new Map(), error: null };
  }
  const ticketDate = queueTicketTodayIsoDate();
  const CHUNK = 100;
  type Raw = {
    id: string;
    encounter_id?: string | null;
    queue_display?: string | null;
    patient_name?: string | null;
    counter_id?: string | number | null;
    issued_at?: string | null;
    updated_at?: string | null;
    status?: string | null;
  };
  const bestByEncounter = new Map<string, Raw>();
  for (let i = 0; i < originalsOrdered.length; i += CHUNK) {
    const chunk = originalsOrdered.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from(QUEUE_TICKETS_TABLE)
      .select("id, encounter_id, queue_display, patient_name, counter_id, issued_at, updated_at, status")
      .eq("ticket_date", ticketDate)
      .in("status", ["Called", "Serving"])
      .in("encounter_id", chunk);
    if (error) {
      return { map: new Map(), error: error.message };
    }
    for (const row of (data ?? []) as Raw[]) {
      if (!ticketCounterAllowed(row.counter_id, counterIdFilter)) continue;
      const eid = row.encounter_id?.trim().toLowerCase();
      if (!eid) continue;
      const st = (row.status ?? "").trim();
      if (st !== "Called" && st !== "Serving") continue;
      const prev = bestByEncounter.get(eid);
      const tNew = (row.updated_at ?? row.issued_at ?? "").trim();
      const tPrev = (prev?.updated_at ?? prev?.issued_at ?? "").trim();
      const rank = (s: string) => (s === "Serving" ? 2 : s === "Called" ? 1 : 0);
      if (!prev) {
        bestByEncounter.set(eid, row);
        continue;
      }
      const prevSt = (prev.status ?? "").trim();
      const cmpRank = rank(st) - rank(prevSt);
      if (cmpRank > 0 || (cmpRank === 0 && tNew.localeCompare(tPrev) >= 0)) {
        bestByEncounter.set(eid, row);
      }
    }
  }

  const counterNameById = await resolveCounterNamesForTickets(bestByEncounter.values());
  const map = new Map<string, CalledQueueTicketPick>();
  for (const [eid, row] of bestByEncounter) {
    const st = (row.status ?? "").trim();
    if (st !== "Called" && st !== "Serving") continue;
    const qd = (row.queue_display ?? "").trim();
    const cid = row.counter_id != null && row.counter_id !== "" ? String(row.counter_id) : "";
    map.set(eid, {
      ticketId: String(row.id),
      queueDisplay: qd || "—",
      patientName: row.patient_name?.trim() ? row.patient_name.trim() : null,
      counterName: cid ? (counterNameById.get(cid) ?? null) : null,
      status: st as "Called" | "Serving",
    });
  }
  return { map, error: null };
}

/**
 * Appointments list for an app user (any role): only when `queue_counters.user_id` = user.
 * Loads **today** queue tickets on those counters (with or without `encounter_id`).
 */
export async function fetchEncountersForPhysician(
  physicianUserId: number,
  options?: { limit?: number; queueWaitingOnly?: boolean; queueCalledOrServingOnly?: boolean },
): Promise<{ rows: PhysicianAppointmentRow[]; error: string | null; noAssignedCounter?: boolean }> {
  if (!Number.isFinite(physicianUserId) || physicianUserId <= 0) {
    return { rows: [], error: null };
  }
  const limit = options?.limit ?? DEFAULT_PHYSICIAN_ENCOUNTER_LIMIT;

  const { ids: myCounterIds, error: counterErr } = await fetchActiveCounterIdsForUser(physicianUserId);
  if (counterErr) return { rows: [], error: counterErr };
  if (myCounterIds.length === 0) {
    return { rows: [], error: null, noAssignedCounter: true };
  }

  const { tickets, error: tErr } = await fetchTodayAppointmentTicketsOnCounters(myCounterIds);
  if (tErr) return { rows: [], error: tErr };
  if (tickets.length === 0) {
    return { rows: [], error: null };
  }

  const counterNameById = await resolveCounterNamesForTickets(tickets);

  const ticketsByEncounter = new Map<string, AppointmentQueueTicketRow[]>();
  const ticketOnly: AppointmentQueueTicketRow[] = [];
  const encounterTransIds: string[] = [];
  const seenEncounter = new Set<string>();

  for (const t of tickets) {
    const eid = t.encounter_id?.trim();
    if (eid) {
      const key = eid.toLowerCase();
      const list = ticketsByEncounter.get(key) ?? [];
      list.push(t);
      ticketsByEncounter.set(key, list);
      if (!seenEncounter.has(key)) {
        seenEncounter.add(key);
        encounterTransIds.push(eid);
      }
    } else {
      ticketOnly.push(t);
    }
  }

  const encounterByTransLower = new Map<string, EncounterWithPatient>();
  const CHUNK = 100;
  for (let i = 0; i < encounterTransIds.length; i += CHUNK) {
    const chunk = encounterTransIds.slice(i, i + CHUNK);
    const { rows: chunkRows, error } = await fetchEncountersWithPatients({
      limit: chunk.length,
      transIdsIn: chunk,
      select: PHYSICIAN_APPOINTMENTS_SELECT,
    });
    if (error) return { rows: [], error };
    for (const r of chunkRows) {
      const tid = encounterToSummary(r as EncounterRow).id.trim().toLowerCase();
      if (tid) encounterByTransLower.set(tid, r);
    }
  }

  const queueWaitingOnly = options?.queueWaitingOnly === true;
  const queueCalledOnly = options?.queueCalledOrServingOnly === true;
  const built: { row: PhysicianAppointmentRow; sortAt: string }[] = [];

  for (const [eidLower, encTickets] of ticketsByEncounter) {
    const enc = encounterByTransLower.get(eidLower);
    if (!enc) continue;

    const waitingT = pickBestWaitingTicket(encTickets);
    const calledT = waitingT ? null : pickBestCalledTicket(encTickets);
    const hasWaitingQueueToday = waitingT != null;
    const hasCalledOrServingQueueToday = calledT != null;
    if (queueWaitingOnly && !hasWaitingQueueToday) continue;
    if (queueCalledOnly && !hasCalledOrServingQueueToday) continue;

    const waiting = waitingT ? ticketToWaitingPick(waitingT, counterNameById) : null;
    const calledPick = calledT ? ticketToCalledPick(calledT, counterNameById) : null;
    const p = unwrapPatient(enc.patients);
    const summary = encounterToSummary(enc);
    const status = physicianAppointmentStatusFromEncounter(enc.disposition, enc.clinical_diagnosis);
    const sortIssuedAt = (waitingT ?? calledT)?.issued_at ?? "";

    built.push({
      sortAt: sortIssuedAt,
      row: {
        rowKey: summary.id,
        queueOnly: false,
        transId: summary.id,
        patientId: summary.patientId,
        patientName: (p?.name ?? "").trim() || "—",
        encounterDate: summary.date,
        encounterTime: summary.time,
        queueNo: summary.queueNo,
        chiefComplaint: summary.chiefComplaint,
        statusLabel: status.label,
        statusChipColor: status.statusChipColor,
        hasWaitingQueueToday,
        waitingQueueTicketId: waiting?.ticketId ?? null,
        waitingQueueDisplay: waiting?.queueDisplay ?? null,
        waitingQueueCounterName: waiting?.counterName ?? null,
        waitingQueueTicketPatientName: waiting?.patientName ?? null,
        hasCalledOrServingQueueToday,
        calledQueueTicketStatus: calledPick?.status ?? null,
        calledQueueTicketId: calledPick?.ticketId ?? null,
        calledQueueDisplay: calledPick?.queueDisplay ?? null,
        calledQueueCounterName: calledPick?.counterName ?? null,
        calledQueueTicketPatientName: calledPick?.patientName ?? null,
      },
    });
  }

  for (const t of ticketOnly) {
    const st = (t.status ?? "").trim();
    const hasWaitingQueueToday = st === "Waiting";
    const hasCalledOrServingQueueToday = st === "Called" || st === "Serving";
    if (queueWaitingOnly && !hasWaitingQueueToday) continue;
    if (queueCalledOnly && !hasCalledOrServingQueueToday) continue;

    const waiting = hasWaitingQueueToday ? ticketToWaitingPick(t, counterNameById) : null;
    const calledPick = hasCalledOrServingQueueToday ? ticketToCalledPick(t, counterNameById) : null;
    const queueStatus = hasWaitingQueueToday
      ? { label: "Queued", statusChipColor: "info" as const }
      : physicianAppointmentStatusFromEncounter(null, null);

    built.push({
      sortAt: t.issued_at,
      row: {
        rowKey: `ticket:${t.id}`,
        queueOnly: true,
        transId: "",
        patientId: t.patient_id != null ? String(t.patient_id) : "",
        patientName: (t.patient_name ?? "").trim() || "—",
        encounterDate: (t.ticket_date ?? "").trim(),
        encounterTime: timeFromIssuedAt(t.issued_at),
        queueNo: (t.queue_display ?? "").trim() || undefined,
        chiefComplaint: (t.reason ?? "").trim() || undefined,
        statusLabel: queueStatus.label,
        statusChipColor: queueStatus.statusChipColor,
        hasWaitingQueueToday,
        waitingQueueTicketId: waiting?.ticketId ?? null,
        waitingQueueDisplay: waiting?.queueDisplay ?? null,
        waitingQueueCounterName: waiting?.counterName ?? null,
        waitingQueueTicketPatientName: waiting?.patientName ?? null,
        hasCalledOrServingQueueToday,
        calledQueueTicketStatus: calledPick?.status ?? null,
        calledQueueTicketId: calledPick?.ticketId ?? null,
        calledQueueDisplay: calledPick?.queueDisplay ?? null,
        calledQueueCounterName: calledPick?.counterName ?? null,
        calledQueueTicketPatientName: calledPick?.patientName ?? null,
      },
    });
  }

  const sorted = built
    .sort((a, b) => b.sortAt.localeCompare(a.sortAt))
    .slice(0, limit)
    .map((x) => x.row);

  return { rows: sorted, error: null };
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
    .select(PATIENT_DIRECTORY_SELECT, { count: "exact" })
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

/**
 * Cashier: paginated encounter search by keywords (space-separated tokens are AND-ed).
 * Each token matches if it appears in patient name (matched uppercase), encounter `trans_id` (partial, lowercase), full UUID equality, or numeric `patient_id`.
 * Returns encounters that have unpaid `physician_fee_sales`, visit-linked `lab_requests` / `imaging_requests`
 * not yet on `lab_sales`, and/or pending `diagnostic_order_amendments` (post-payment order changes).
 */
export async function fetchCashierEncountersSearchPage(
  pageIndex: number,
  pageSize: number,
  searchRaw: string,
): Promise<{ rows: CashierEncounterSearchRow[]; count: number; error: string | null }> {
  const tokens = searchRaw
    .trim()
    .replace(/,/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (tokens.length === 0) {
    return { rows: [], count: 0, error: null };
  }

  const from = pageIndex * pageSize;
  const to = from + pageSize - 1;

  const [patientMatches, unpaidQueueRes, labPendingRes, amendPendingRes, imagingPendingRes] = await Promise.all([
    Promise.all(tokens.map((tok) => fetchPatientIdsForCashierSearchToken(tok))),
    fetchCashierUnpaidPhysicianFeeEncounterCounts(),
    fetchEncounterTransIdsWithUnpaidLabRequests(),
    fetchEncounterTransIdsWithPendingDiagnosticAmendments(),
    fetchEncounterTransIdsWithUnpaidImagingRequests(),
  ]);
  const patientLookupError = patientMatches.find((m) => m.error)?.error;
  if (patientLookupError) {
    return { rows: [], count: 0, error: patientLookupError };
  }
  if (unpaidQueueRes.error) {
    return { rows: [], count: 0, error: unpaidQueueRes.error };
  }
  if (labPendingRes.error) {
    return { rows: [], count: 0, error: labPendingRes.error };
  }
  if (amendPendingRes.error) {
    return { rows: [], count: 0, error: amendPendingRes.error };
  }
  if (imagingPendingRes.error) {
    return { rows: [], count: 0, error: imagingPendingRes.error };
  }

  const unpaidEncounterIds = new Set(
    [...unpaidQueueRes.pendingByEncounterId.keys()].map((k) => String(k).trim().toLowerCase()),
  );
  const eligibleEncounterIds = new Set<string>([
    ...unpaidEncounterIds,
    ...labPendingRes.ids,
    ...amendPendingRes.ids,
    ...imagingPendingRes.ids,
  ]);
  if (eligibleEncounterIds.size === 0) {
    return { rows: [], count: 0, error: null };
  }

  const transIdSets = await Promise.all(
    tokens.map((tok, i) => fetchTransIdsMatchingCashierToken(tok, patientMatches[i]?.ids ?? [])),
  );
  const transIdLookupError = transIdSets.find((s) => s.error)?.error;
  if (transIdLookupError) {
    return { rows: [], count: 0, error: transIdLookupError };
  }

  let intersection: Set<string> | null = null;
  for (const { ids } of transIdSets) {
    if (intersection === null) {
      intersection = new Set(ids);
    } else {
      const next = new Set<string>();
      for (const id of intersection) {
        if (ids.has(id)) next.add(id);
      }
      intersection = next;
    }
  }

  const allIdsRaw = intersection ? [...intersection] : [];
  const allIds = allIdsRaw.filter((id) => eligibleEncounterIds.has(String(id).trim().toLowerCase()));
  if (allIds.length === 0) {
    return { rows: [], count: 0, error: null };
  }

  type SortMeta = { trans_id: string; encounter_date: string; encounter_time: string | null; disposition?: string | null };
  const metaById = new Map<string, SortMeta>();
  const metaChunk = 120;
  for (let i = 0; i < allIds.length; i += metaChunk) {
    const chunk = allIds.slice(i, i + metaChunk);
    const { data: metaRows, error: metaErr } = await supabase
      .from(ENCOUNTERS_TABLE)
      .select("trans_id, encounter_date, encounter_time, disposition")
      .in("trans_id", chunk);
    if (metaErr) {
      return { rows: [], count: 0, error: metaErr.message };
    }
    for (const row of metaRows ?? []) {
      const r = row as SortMeta;
      if (r.trans_id == null || r.trans_id === "") continue;
      metaById.set(String(r.trans_id), { ...r, trans_id: String(r.trans_id) });
    }
  }

  const sortedIds = [...metaById.values()]
    .sort((a, b) => {
      const d = String(b.encounter_date).localeCompare(String(a.encounter_date));
      if (d !== 0) return d;
      return String(b.encounter_time ?? "").localeCompare(String(a.encounter_time ?? ""));
    })
    .map((r) => r.trans_id);

  const total = sortedIds.length;
  const pageIds = sortedIds.slice(from, to + 1);
  if (pageIds.length === 0) {
    return { rows: [], count: total, error: null };
  }

  const { data, error } = await supabase
    .from(ENCOUNTERS_TABLE)
    .select(CASHIER_ENCOUNTER_SEARCH_SELECT)
    .in("trans_id", pageIds);

  if (error) {
    return { rows: [], count: 0, error: error.message };
  }

  const byTransId = new Map<string, EncounterWithPatient>();
  for (const row of data ?? []) {
    const r = row as EncounterWithPatient;
    const tid = String((r as EncounterRow).trans_id);
    byTransId.set(tid, r);
  }

  const rowsRaw = pageIds.map((id) => byTransId.get(id)).filter((x): x is EncounterWithPatient => x != null);
  const rows: CashierEncounterSearchRow[] = [];
  for (const r of rowsRaw) {
    const p = unwrapPatient(r.patients);
    if (!p) continue;
    rows.push({
      encounter: encounterToSummary(r as EncounterRow),
      patient: {
        id: p.id,
        name: p.name,
        date_of_birth: p.date_of_birth,
        sex: p.sex,
        civil_status: p.civil_status,
        address: p.address,
        contact_no: p.contact_no,
        email_address: p.email_address ?? null,
        occupation: p.occupation,
        referring_physician: p.referring_physician,
        philhealth_no: p.philhealth_no,
      },
    });
  }

  return { rows, count: total, error: null };
}

export async function fetchPatientListRowById(patientId: number): Promise<{
  row: ConsultationPatientListRow | null;
  error: string | null;
}> {
  if (!Number.isFinite(patientId) || patientId <= 0) {
    return { row: null, error: null };
  }
  const { data, error } = await supabase.from(PATIENTS_TABLE).select(PATIENT_DIRECTORY_SELECT).eq("id", patientId).maybeSingle();
  if (error) return { row: null, error: error.message };
  return { row: (data as ConsultationPatientListRow | null) ?? null, error: null };
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

/** Cashier: load a single visit row for checkout, keyed by `trans_id`. */
export async function fetchEncounterSummaryByTransId(
  transIdRaw: string,
): Promise<{ encounter: ConsultationEncounterSummary | null; error: string | null }> {
  const id = transIdRaw.trim().toLowerCase();
  if (!isUuid(id)) {
    return { encounter: null, error: null };
  }
  const { data, error } = await supabase
    .from(ENCOUNTERS_TABLE)
    .select(
      "trans_id, patient_id, encounter_date, encounter_time, queue_no, chief_complaint, referring_physician, physician_id",
    )
    .eq("trans_id", id)
    .maybeSingle();

  if (error) {
    return { encounter: null, error: error.message };
  }
  if (!data) {
    return { encounter: null, error: null };
  }
  return { encounter: encounterToSummary(data as EncounterRow), error: null };
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

export type EncounterPhysicianRecordForm = {
  chief_complaint: string;
  history_of_present_illness: string;
};

export async function fetchEncounterPhysicianRecord(transId: string): Promise<{
  form: EncounterPhysicianRecordForm;
  error: string | null;
}> {
  const id = transId.trim();
  if (!isUuid(id)) {
    return {
      form: { chief_complaint: "", history_of_present_illness: "" },
      error: "Invalid encounter.",
    };
  }

  const { data, error } = await supabase
    .from(ENCOUNTERS_TABLE)
    .select("chief_complaint, history_of_present_illness")
    .eq("trans_id", id)
    .maybeSingle();

  if (error) {
    return {
      form: { chief_complaint: "", history_of_present_illness: "" },
      error: error.message,
    };
  }

  const row = data as {
    chief_complaint?: string | null;
    history_of_present_illness?: string | null;
  } | null;

  return {
    form: {
      chief_complaint: row?.chief_complaint ?? "",
      history_of_present_illness: row?.history_of_present_illness ?? "",
    },
    error: null,
  };
}

export async function persistEncounterPhysicianRecord(
  transId: string,
  form: EncounterPhysicianRecordForm
): Promise<{ error: string | null }> {
  const id = transId.trim();
  if (!isUuid(id)) {
    return { error: "Invalid encounter." };
  }

  const cc = form.chief_complaint.trim();
  const hpi = form.history_of_present_illness.trim();

  const { error } = await supabase
    .from(ENCOUNTERS_TABLE)
    .update({
      chief_complaint: cc || null,
      history_of_present_illness: hpi || null,
    })
    .eq("trans_id", id);

  return { error: error?.message ?? null };
}

export type EncounterAssessmentDiagnosisForm = {
  clinical_diagnosis: string;
};

export async function fetchEncounterClinicalDiagnosis(transId: string): Promise<{
  form: EncounterAssessmentDiagnosisForm;
  error: string | null;
}> {
  const id = transId.trim();
  if (!isUuid(id)) {
    return { form: { clinical_diagnosis: "" }, error: "Invalid encounter." };
  }

  const { data, error } = await supabase
    .from(ENCOUNTERS_TABLE)
    .select("clinical_diagnosis")
    .eq("trans_id", id)
    .maybeSingle();

  if (error) {
    return { form: { clinical_diagnosis: "" }, error: error.message };
  }

  const row = data as { clinical_diagnosis?: string | null } | null;
  return {
    form: { clinical_diagnosis: row?.clinical_diagnosis ?? "" },
    error: null,
  };
}

export async function persistEncounterClinicalDiagnosis(
  transId: string,
  form: EncounterAssessmentDiagnosisForm
): Promise<{ error: string | null }> {
  const id = transId.trim();
  if (!isUuid(id)) {
    return { error: "Invalid encounter." };
  }

  const dx = form.clinical_diagnosis.trim();

  const { error } = await supabase
    .from(ENCOUNTERS_TABLE)
    .update({
      clinical_diagnosis: dx || null,
    })
    .eq("trans_id", id);

  return { error: error?.message ?? null };
}

/** Matches `encounters.disposition` CHECK constraint. */
export const ENCOUNTER_DISPOSITION_VALUES = [
  "Home",
  "Medico Legal",
  "Advise Admission",
  "Absconded",
  "DAMA",
] as const;

export type EncounterDisposition = (typeof ENCOUNTER_DISPOSITION_VALUES)[number];

export type EncounterPlansTreatmentForm = {
  plan_labs: boolean;
  plan_imaging: boolean;
  plan_medications: boolean;
  plan_referral: boolean;
  plan_notes: string;
  disposition: EncounterDisposition | null;
};

function dispositionFromDb(raw: string | null | undefined): EncounterDisposition | null {
  if (raw == null || raw === "") return null;
  return (ENCOUNTER_DISPOSITION_VALUES as readonly string[]).includes(raw)
    ? (raw as EncounterDisposition)
    : null;
}

function bPlan(v: boolean | null | undefined): boolean {
  return !!v;
}

export async function fetchEncounterPlansTreatment(transId: string): Promise<{
  form: EncounterPlansTreatmentForm;
  error: string | null;
}> {
  const id = transId.trim();
  if (!isUuid(id)) {
    return {
      form: {
        plan_labs: false,
        plan_imaging: false,
        plan_medications: false,
        plan_referral: false,
        plan_notes: "",
        disposition: null,
      },
      error: "Invalid encounter.",
    };
  }

  const { data, error } = await supabase
    .from(ENCOUNTERS_TABLE)
    .select(
      "plan_labs, plan_imaging, plan_medications, plan_referral, plan_notes, disposition"
    )
    .eq("trans_id", id)
    .maybeSingle();

  if (error) {
    return {
      form: {
        plan_labs: false,
        plan_imaging: false,
        plan_medications: false,
        plan_referral: false,
        plan_notes: "",
        disposition: null,
      },
      error: error.message,
    };
  }

  const row = data as {
    plan_labs?: boolean | null;
    plan_imaging?: boolean | null;
    plan_medications?: boolean | null;
    plan_referral?: boolean | null;
    plan_notes?: string | null;
    disposition?: string | null;
  } | null;

  return {
    form: {
      plan_labs: bPlan(row?.plan_labs),
      plan_imaging: bPlan(row?.plan_imaging),
      plan_medications: bPlan(row?.plan_medications),
      plan_referral: bPlan(row?.plan_referral),
      plan_notes: row?.plan_notes ?? "",
      disposition: dispositionFromDb(row?.disposition),
    },
    error: null,
  };
}

export async function persistEncounterPlansTreatment(
  transId: string,
  form: EncounterPlansTreatmentForm
): Promise<{ error: string | null }> {
  const id = transId.trim();
  if (!isUuid(id)) {
    return { error: "Invalid encounter." };
  }

  const notes = form.plan_notes.trim();

  const { error } = await supabase
    .from(ENCOUNTERS_TABLE)
    .update({
      plan_labs: form.plan_labs,
      plan_imaging: form.plan_imaging,
      plan_medications: form.plan_medications,
      plan_referral: form.plan_referral,
      plan_notes: notes || null,
      disposition: form.disposition,
    })
    .eq("trans_id", id);

  return { error: error?.message ?? null };
}
