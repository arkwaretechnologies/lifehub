import type { SupabaseClient } from "@supabase/supabase-js";
import { formatDateMMDDYYYY } from "@/lib/dateDisplay";
import { clinicTimeZone, queueTicketTodayIsoDate } from "@/lib/queueTicketDate";
import { formatQueueTicketNotesForDisplay } from "@/lib/queueReception";

const ACTIVE_QUEUE: string[] = ["Waiting", "Called", "Serving"];

export type DashboardAppointmentRow = {
  transId: string;
  patientName: string;
  diagnosis: string;
  timeLabel: string;
};

export type DashboardNextPatient = {
  patientName: string;
  diagnosis: string;
  patientId: string;
  age: string;
  lastVisit: string;
  queueTime: string;
  initials: string;
} | null;

export type DashboardWaitingRow = {
  id: string;
  patientName: string;
  notes: string;
  status: string;
};

export type DashboardSummary = {
  todayYmd: string;
  /** yyyy-mm for calendar header */
  calendarMonthLabel: string;
  stats: {
    totalPatientsToday: number;
    totalPatientsYesterday: number;
    queueCountToday: number;
    queueCountYesterday: number;
    ongoingConsultationsToday: number;
    ongoingConsultationsYesterday: number;
    completedDispositionToday: number;
    completedDispositionYesterday: number;
  };
  /** Three counts for the month (normalized in UI for the donut). */
  monthPatientSummary: {
    newRegistrations: number;
    encounterVisits: number;
    distinctPatients: number;
  };
  dispositionMonth: { label: string; percent: number }[];
  todayAppointments: DashboardAppointmentRow[];
  nextPatient: DashboardNextPatient;
  waitingQueue: DashboardWaitingRow[];
  /** Day-of-month (1–31) with at least one encounter this month */
  encounterDaysThisMonth: number[];
  /** Today's day-of-month in clinic TZ (for calendar highlight) */
  todayDayOfMonth: number;
  calendar: {
    daysInMonth: number;
    /** 0 = Sunday */
    firstWeekday0: number;
  };
};

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function clinicYmdParts(d: Date): { y: number; m: number; d: number } {
  const tz = clinicTimeZone();
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(d);
    const y = Number(parts.find((p) => p.type === "year")?.value ?? "");
    const m = Number(parts.find((p) => p.type === "month")?.value ?? "");
    const day = Number(parts.find((p) => p.type === "day")?.value ?? "");
    if (Number.isFinite(y) && Number.isFinite(m) && Number.isFinite(day)) return { y, m, d: day };
  } catch {
    /* fall through */
  }
  const loc = new Date();
  return { y: loc.getFullYear(), m: loc.getMonth() + 1, d: loc.getDate() };
}

function ymdFromParts(y: number, m: number, d: number): string {
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

/** Previous calendar day as yyyy-mm-dd (same clinic TZ as {@link queueTicketTodayIsoDate}). */
function addDaysYmd(ymd: string, deltaDays: number): string {
  const [ys, ms, ds] = ymd.split("-").map((x) => Number(x));
  if (!Number.isFinite(ys) || !Number.isFinite(ms) || !Number.isFinite(ds)) return ymd;
  const utc = Date.UTC(ys, ms - 1, ds + deltaDays);
  const t = new Date(utc);
  const { y, m, d } = clinicYmdParts(t);
  return ymdFromParts(y, m, d);
}

function monthRangeYmd(y: number, mo: number): { start: string; end: string } {
  const start = ymdFromParts(y, mo, 1);
  const lastD = new Date(y, mo, 0).getDate();
  const end = ymdFromParts(y, mo, lastD);
  return { start, end };
}

function formatEncounterTime12h(raw: string | null | undefined): string {
  if (raw == null || String(raw).trim() === "") return "—";
  const s = String(raw);
  let hh = 0;
  let mm = 0;
  if (s.length >= 5 && s[4] === ":") {
    hh = Number(s.slice(0, 2));
    mm = Number(s.slice(3, 5));
  } else {
    const m = s.match(/(\d{1,2}):(\d{2})/);
    if (!m) return s.slice(0, 8);
    hh = Number(m[1]);
    mm = Number(m[2]);
  }
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return "—";
  const ap = hh >= 12 ? "PM" : "AM";
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${h12}:${pad2(mm)} ${ap}`;
}

function initialsFromName(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
}

function ageFromDob(iso: string | null | undefined): string {
  if (!iso || iso.length < 10) return "—";
  const d = new Date(iso.slice(0, 10));
  if (Number.isNaN(d.getTime())) return "—";
  const t = new Date();
  let age = t.getFullYear() - d.getFullYear();
  const mo = t.getMonth() - d.getMonth();
  if (mo < 0 || (mo === 0 && t.getDate() < d.getDate())) age--;
  return Number.isFinite(age) && age >= 0 ? String(age) : "—";
}

export async function fetchDashboardSummary(admin: SupabaseClient): Promise<{ data: DashboardSummary | null; error: string | null }> {
  const todayYmd = queueTicketTodayIsoDate();
  const yesterdayYmd = addDaysYmd(todayYmd, -1);
  const { y, m, d: todayDom } = clinicYmdParts(new Date());
  const daysInMonth = new Date(y, m, 0).getDate();
  const firstWeekday0 = new Date(y, m - 1, 1).getDay();
  const { start: monthStart, end: monthEnd } = monthRangeYmd(y, m);
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const calendarMonthLabel = `${monthNames[m - 1] ?? ""} ${y}`;

  const [
    encTodayRes,
    encYesterdayRes,
    queueTodayRes,
    queueYesterdayRes,
    monthEncRes,
    newPatientsRes,
    waitRes,
    apptRes,
    encDaysRes,
  ] = await Promise.all([
    admin.from("encounters").select("patient_id, disposition").eq("encounter_date", todayYmd),
    admin.from("encounters").select("patient_id, disposition").eq("encounter_date", yesterdayYmd),
    admin.from("queue_tickets").select("id", { count: "exact", head: true }).eq("ticket_date", todayYmd).in("status", ACTIVE_QUEUE),
    admin.from("queue_tickets").select("id", { count: "exact", head: true }).eq("ticket_date", yesterdayYmd).in("status", ACTIVE_QUEUE),
    admin.from("encounters").select("patient_id, disposition").gte("encounter_date", monthStart).lte("encounter_date", monthEnd),
    admin.from("patients").select("id", { count: "exact", head: true }).gte("created_at", `${monthStart}T00:00:00`),
    admin
      .from("queue_tickets")
      .select("id, patient_name, notes, status, issued_at, encounter_id")
      .eq("ticket_date", todayYmd)
      .eq("status", "Waiting")
      .order("issued_at", { ascending: true })
      .limit(8),
    admin
      .from("encounters")
      .select(
        "trans_id, encounter_time, chief_complaint, clinical_diagnosis, disposition, patients!encounters_patient_id_fkey ( name )",
      )
      .eq("encounter_date", todayYmd)
      .order("encounter_time", { ascending: true, nullsFirst: false })
      .limit(12),
    admin.from("encounters").select("encounter_date").gte("encounter_date", monthStart).lte("encounter_date", monthEnd),
  ]);

  const errs = [
    encTodayRes.error,
    encYesterdayRes.error,
    queueTodayRes.error,
    queueYesterdayRes.error,
    monthEncRes.error,
    newPatientsRes.error,
    waitRes.error,
    apptRes.error,
    encDaysRes.error,
  ].filter(Boolean);
  if (errs.length > 0) {
    return { data: null, error: errs.map((e) => e!.message).join("; ") };
  }

  const encToday = (encTodayRes.data ?? []) as { patient_id: number; disposition: string | null }[];
  const encYesterday = (encYesterdayRes.data ?? []) as { patient_id: number; disposition: string | null }[];
  const monthEnc = (monthEncRes.data ?? []) as { patient_id: number; disposition: string | null }[];

  const distinctToday = new Set(encToday.map((r) => r.patient_id)).size;
  const distinctYesterday = new Set(encYesterday.map((r) => r.patient_id)).size;

  const ongoing = (rows: { disposition: string | null }[]) =>
    rows.filter((r) => (r.disposition ?? "").trim() === "").length;
  const completed = (rows: { disposition: string | null }[]) =>
    rows.filter((r) => (r.disposition ?? "").trim() !== "").length;

  const dispositionCounts = new Map<string, number>();
  for (const r of monthEnc) {
    const key = (r.disposition ?? "").trim() === "" ? "In progress" : (r.disposition ?? "").trim();
    dispositionCounts.set(key, (dispositionCounts.get(key) ?? 0) + 1);
  }
  const dispTotal = [...dispositionCounts.values()].reduce((a, b) => a + b, 0);
  const dispositionMonth = [...dispositionCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([label, n]) => ({
      label,
      percent: dispTotal > 0 ? Math.round((n / dispTotal) * 100) : 0,
    }));

  const patientIdsMonth = new Set(monthEnc.map((r) => r.patient_id));
  const newRegs = Number(newPatientsRes.count ?? 0);
  const encounterVisits = monthEnc.length;
  const distinctPatients = patientIdsMonth.size;

  const daySet = new Set<number>();
  for (const r of (encDaysRes.data ?? []) as { encounter_date: string }[]) {
    const dd = Number(String(r.encounter_date ?? "").slice(8, 10));
    if (Number.isFinite(dd) && dd >= 1 && dd <= 31) daySet.add(dd);
  }

  const apptRows = (apptRes.data ?? []) as Array<{
    trans_id: string;
    encounter_time: string | null;
    chief_complaint: string | null;
    clinical_diagnosis: string | null;
    disposition: string | null;
    patients: { name: string | null } | { name: string | null }[] | null;
  }>;
  const todayAppointments: DashboardAppointmentRow[] = apptRows.map((r) => {
    const pt = Array.isArray(r.patients) ? r.patients[0] : r.patients;
    const name = (pt?.name ?? "").trim() || "—";
    const dx = (r.clinical_diagnosis ?? "").trim() || (r.chief_complaint ?? "").trim() || "—";
    return {
      transId: r.trans_id,
      patientName: name,
      diagnosis: dx,
      timeLabel: formatEncounterTime12h(r.encounter_time),
    };
  });

  const waitRows = (waitRes.data ?? []) as Array<{
    id: string;
    patient_name: string | null;
    notes: string | null;
    status: string | null;
    encounter_id: string | null;
  }>;
  const waitingQueue: DashboardWaitingRow[] = waitRows.map((w) => ({
    id: w.id,
    patientName: (w.patient_name ?? "").trim() || "—",
    notes: formatQueueTicketNotesForDisplay(w.notes),
    status: (w.status ?? "").trim() || "Waiting",
  }));

  let nextPatient: DashboardNextPatient = null;
  const firstWait = waitRows[0];
  if (firstWait) {
    const encId = firstWait.encounter_id != null ? String(firstWait.encounter_id).trim() : "";
    let patientName = (firstWait.patient_name ?? "").trim() || "—";
    let diagnosis = "—";
    let patientId = "—";
    let age = "—";
    let lastVisit = "—";
    let queueTime = "—";
    if (encId) {
      const { data: encRow, error: encErr } = await admin
        .from("encounters")
        .select(
          "clinical_diagnosis, chief_complaint, encounter_time, patient_id, patients!encounters_patient_id_fkey ( name, date_of_birth )",
        )
        .eq("trans_id", encId)
        .maybeSingle();
      if (!encErr && encRow) {
        const er = encRow as {
          clinical_diagnosis: string | null;
          chief_complaint: string | null;
          encounter_time: string | null;
          patient_id: number;
          patients: { name: string | null; date_of_birth: string | null } | { name: string | null; date_of_birth: string | null }[] | null;
        };
        const p = Array.isArray(er.patients) ? er.patients[0] : er.patients;
        patientName = (p?.name ?? "").trim() || patientName;
        diagnosis =
          (er.clinical_diagnosis ?? "").trim() || (er.chief_complaint ?? "").trim() || "—";
        patientId = String(er.patient_id ?? "");
        age = ageFromDob(p?.date_of_birth ?? null);
        queueTime = formatEncounterTime12h(er.encounter_time);
        const { data: prevEnc, error: pvErr } = await admin
          .from("encounters")
          .select("encounter_date")
          .eq("patient_id", er.patient_id)
          .neq("trans_id", encId)
          .order("encounter_date", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!pvErr && prevEnc) {
          const pd = (prevEnc as { encounter_date?: string }).encounter_date ?? "";
          lastVisit = formatDateMMDDYYYY(pd) || "—";
        }
      }
    }
    nextPatient = {
      patientName,
      diagnosis,
      patientId,
      age,
      lastVisit,
      queueTime,
      initials: initialsFromName(patientName),
    };
  }

  const stats = {
    totalPatientsToday: distinctToday,
    totalPatientsYesterday: distinctYesterday,
    queueCountToday: queueTodayRes.count ?? 0,
    queueCountYesterday: queueYesterdayRes.count ?? 0,
    ongoingConsultationsToday: ongoing(encToday),
    ongoingConsultationsYesterday: ongoing(encYesterday),
    completedDispositionToday: completed(encToday),
    completedDispositionYesterday: completed(encYesterday),
  };

  const data: DashboardSummary = {
    todayYmd,
    calendarMonthLabel,
    stats,
    monthPatientSummary: {
      newRegistrations: newRegs,
      encounterVisits,
      distinctPatients,
    },
    dispositionMonth,
    todayAppointments,
    nextPatient,
    waitingQueue,
    encounterDaysThisMonth: [...daySet].sort((a, b) => a - b),
    todayDayOfMonth: todayDom,
    calendar: {
      daysInMonth,
      firstWeekday0,
    },
  };

  return { data, error: null };
}
