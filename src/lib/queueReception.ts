import { supabase } from "@/lib/supabaseClient";
import { authenticatedFetch } from "@/lib/authenticatedFetch";
import { sanitizePatientSearchQuery } from "@/lib/patientsCatalog";
import { queueTicketTodayIsoDate } from "@/lib/queueTicketDate";

/** Aligns with lifehub-queuing `src/queue/types.ts` */
export type QueueTicketStatus =
  | "Waiting"
  | "Called"
  | "Collected"
  | "Serving"
  | "Completed"
  | "Skipped"
  | "Cancelled"
  | "No Show";

export type QueueCounterRow = {
  /** `queue_counters.id` (bigint in DB; may arrive as number from PostgREST). */
  id: string | number;
  code: string;
  name: string | null;
  description: string | null;
  /** Short label for queue numbers (e.g. C1, L); optional if column not migrated yet. */
  prefix?: string | null;
  /** App `users.user_id` for doctor/clinic counters — copied to `encounters.physician_id` on reception check-in. */
  user_id?: number | string | null;
};

export type QueuePriorityRow = {
  id: number;
  code: string;
  name: string | null;
};

/** Matches `public.queue_tickets` (LifeHub / queuing schema). */
export type QueueTicketRow = {
  id: string;
  counter_id: string | number;
  priority_id: number;
  patient_id: number | null;
  queue_number: number;
  queue_display: string;
  ticket_date: string;
  status: QueueTicketStatus;
  registration_type: string | null;
  patient_name: string | null;
  contact_no: string | null;
  reason: string | null;
  notes: string | null;
  issued_at: string;
  called_at: string | null;
  serving_at: string | null;
  /** `encounters.trans_id` when linked (consultation / lab check-in). */
  encounter_id?: string | null;
};

/** Columns loaded for reception (keep in sync with `receptionQueueServer`). */
export const QUEUE_TICKET_RECEPTION_SELECT =
  "id, counter_id, priority_id, patient_id, queue_number, queue_display, ticket_date, status, registration_type, patient_name, contact_no, reason, notes, issued_at, called_at, serving_at, encounter_id" as const;

const ACTIVE_STATUSES: QueueTicketStatus[] = ["Waiting", "Called", "Serving"];

function parseCounterCodesEnv(): string[] | null {
  const raw = process.env.NEXT_PUBLIC_RECEPTION_QUEUE_COUNTER_CODES?.trim();
  if (!raw) return null;
  return raw
    .split(",")
    .map((c) => c.trim().toUpperCase())
    .filter(Boolean);
}

/** Counter where entrance / kiosk tickets are issued (lifehub-queuing default: ENTRANCE). */
export function getEntranceCounterCode(): string {
  return (process.env.NEXT_PUBLIC_RECEPTION_ENTRANCE_COUNTER_CODE ?? "ENTRANCE").trim().toUpperCase();
}

export async function fetchQueueCounterByCode(
  code: string,
): Promise<{ counter: QueueCounterRow | null; error: string | null }> {
  const want = code.trim().toUpperCase();
  const { data, error } = await supabase
    .from("queue_counters")
    .select("id, code, name, description, prefix, user_id")
    .eq("is_active", true);

  if (error) {
    return { counter: null, error: error.message };
  }
  const rows = (data ?? []) as QueueCounterRow[];
  const counter = rows.find((c) => c.code.trim().toUpperCase() === want) ?? null;
  return { counter, error: null };
}

export async function fetchQueueCounters(): Promise<{ counters: QueueCounterRow[]; error: string | null }> {
  const { data, error } = await supabase
    .from("queue_counters")
    .select("id, code, name, description, prefix, user_id")
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (error) {
    return { counters: [], error: error.message };
  }

  let rows = (data ?? []) as QueueCounterRow[];
  const filterCodes = parseCounterCodesEnv();
  if (filterCodes?.length) {
    const set = new Set(filterCodes);
    rows = rows.filter((c) => set.has(c.code.trim().toUpperCase()));
    const order = new Map(filterCodes.map((c, i) => [c, i]));
    rows.sort((a, b) => (order.get(a.code.toUpperCase()) ?? 99) - (order.get(b.code.toUpperCase()) ?? 99));
  }

  return { counters: rows, error: null };
}

export async function fetchQueuePriorities(): Promise<{ priorities: QueuePriorityRow[]; error: string | null }> {
  const { data, error } = await supabase
    .from("queue_priorities")
    .select("id, code, name")
    .eq("is_active", true);

  if (error) {
    return { priorities: [], error: error.message };
  }
  return { priorities: (data ?? []) as QueuePriorityRow[], error: null };
}

export async function fetchTodayTicketsForCounters(
  counterIds: string[],
): Promise<{ tickets: QueueTicketRow[]; error: string | null }> {
  if (counterIds.length === 0) {
    return { tickets: [], error: null };
  }

  const { data, error } = await supabase
    .from("queue_tickets")
    .select(QUEUE_TICKET_RECEPTION_SELECT)
    .in("counter_id", counterIds)
    .eq("ticket_date", queueTicketTodayIsoDate())
    .in("status", ACTIVE_STATUSES)
    .order("issued_at", { ascending: true });

  if (error) {
    return { tickets: [], error: error.message };
  }
  return { tickets: (data ?? []) as QueueTicketRow[], error: null };
}

export async function updateTicketStatus(
  ticketId: string,
  status: QueueTicketStatus,
  timestamps: { called_at?: string | null; serving_at?: string | null },
): Promise<{ error: string | null }> {
  const payload: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
  };
  if ("called_at" in timestamps) payload.called_at = timestamps.called_at;
  if ("serving_at" in timestamps) payload.serving_at = timestamps.serving_at;

  const { error } = await supabase.from("queue_tickets").update(payload).eq("id", ticketId);

  return { error: error?.message ?? null };
}

function announceQueueNumberSpeechSynthesis(
  display: string,
  counterName: string | null,
  patientName?: string | null,
): void {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  const num = display.replace(/-/g, " ");
  const name = patientName?.trim();
  const text = name
    ? `Now serving queue number ${num}, ${name}`
    : `Now serving queue number ${num}${counterName ? `, ${counterName}` : ""}`;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 0.92;
  u.lang = "en-PH";
  window.speechSynthesis.speak(u);
}

/**
 * Announces the queue call. If `ELEVENLABS_API_KEY` is set on the server, plays ElevenLabs TTS via `/api/tts/elevenlabs`;
 * otherwise uses the browser speech synthesis API.
 */
export async function announceQueueNumber(
  display: string,
  counterName: string | null,
  patientName?: string | null,
): Promise<void> {
  const num = display.replace(/-/g, " ");
  const name = patientName?.trim();
  const text = name
    ? `Now serving queue number ${num}, ${name}`
    : `Now serving queue number ${num}${counterName ? `, ${counterName}` : ""}`;

  if (typeof window !== "undefined") {
    try {
      const res = await authenticatedFetch("/api/tts/elevenlabs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.onended = () => URL.revokeObjectURL(url);
        audio.onerror = () => URL.revokeObjectURL(url);
        try {
          await audio.play();
          return;
        } catch {
          URL.revokeObjectURL(url);
          /* fall through to speechSynthesis */
        }
      }
    } catch {
      /* fall through to speechSynthesis */
    }
  }

  announceQueueNumberSpeechSynthesis(display, counterName, patientName);
}

function counterIdInSet(counterId: unknown, idSet: Set<string>): boolean {
  if (counterId == null || counterId === "") return false;
  const s = String(counterId);
  if (idSet.has(s)) return true;
  const n = Number(counterId);
  if (!Number.isFinite(n)) return false;
  for (const id of idSet) {
    if (Number(id) === n) return true;
  }
  return false;
}

export function subscribeQueueTickets(
  counterIds: string[],
  onEvent: (reason: "change") => void,
  onChannelStatus?: (subscribed: boolean) => void,
): () => void {
  if (counterIds.length === 0) {
    return () => {};
  }

  const idSet = new Set(counterIds.map((x) => String(x)));
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  const notify = () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      onEvent("change");
    }, 300);
  };

  const channel = supabase
    .channel(`lifehub_reception_queue_tickets_${[...idSet].sort().join("_")}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "queue_tickets" },
      (payload) => {
        const row = (payload.new ?? payload.old) as { counter_id?: string | number } | null;
        if (row && counterIdInSet(row.counter_id, idSet)) {
          notify();
        }
      },
    )
    .subscribe((status) => {
      onChannelStatus?.(status === "SUBSCRIBED");
    });

  return () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    void supabase.removeChannel(channel);
  };
}

export async function fetchReceptionQueueTicketsFromApi(): Promise<{
  tickets: QueueTicketRow[];
  error: string | null;
}> {
  const res = await authenticatedFetch("/api/reception/queue-tickets", { cache: "no-store" });
  const json = (await res.json().catch(() => ({}))) as { error?: string; tickets?: QueueTicketRow[] };
  if (!res.ok) {
    return {
      tickets: [],
      error: typeof json.error === "string" ? json.error : `Request failed (${res.status})`,
    };
  }
  return { tickets: json.tickets ?? [], error: null };
}

export type ReceptionQueueApiResult = {
  error: string | null;
  warnings: string[];
  counters: QueueCounterRow[];
  entranceCounter: QueueCounterRow | null;
  priorities: QueuePriorityRow[];
  tickets: QueueTicketRow[];
};

export async function fetchReceptionQueueStateFromApi(): Promise<ReceptionQueueApiResult> {
  const empty: ReceptionQueueApiResult = {
    error: null,
    warnings: [],
    counters: [],
    entranceCounter: null,
    priorities: [],
    tickets: [],
  };

  const res = await authenticatedFetch("/api/reception/queue-state", { cache: "no-store" });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;

  if (!res.ok) {
    return {
      ...empty,
      error: typeof json.error === "string" ? json.error : `Request failed (${res.status})`,
      warnings: Array.isArray(json.warnings) ? (json.warnings as string[]) : [],
    };
  }

  return {
    error: null,
    warnings: Array.isArray(json.warnings) ? (json.warnings as string[]) : [],
    counters: (json.counters as QueueCounterRow[]) ?? [],
    entranceCounter: (json.entranceCounter as QueueCounterRow | null) ?? null,
    priorities: (json.priorities as QueuePriorityRow[]) ?? [],
    tickets: (json.tickets as QueueTicketRow[]) ?? [],
  };
}

export type ReceptionTriageRoute = "consultation" | "laboratory";

export type ReceptionPatientSearchRow = {
  id: number;
  name: string | null;
  contact_no: string | null;
  date_of_birth: string | null;
  sex: string | null;
  address: string | null;
};

/** Server-side search; only runs when sanitized query has at least 2 characters (large-table safe). */
export async function searchPatientsFromApi(q: string): Promise<{ rows: ReceptionPatientSearchRow[]; error: string | null }> {
  const safe = sanitizePatientSearchQuery(q);
  if (safe.length < 2) return { rows: [], error: null };
  const res = await authenticatedFetch(`/api/reception/patient-search?q=${encodeURIComponent(safe)}`, { cache: "no-store" });
  const json = (await res.json().catch(() => ({}))) as { error?: string; rows?: ReceptionPatientSearchRow[] };
  if (!res.ok) return { rows: [], error: json.error ?? `Request failed (${res.status})` };
  return { rows: json.rows ?? [], error: null };
}

export async function createPatientFromApi(input: {
  name: string;
  sex: string;
  date_of_birth: string;
  address: string;
  contact_no: string;
  email_address?: string | null;
  occupation?: string | null;
}): Promise<{ patient: ReceptionPatientSearchRow | null; error: string | null }> {
  const res = await authenticatedFetch("/api/reception/patient-create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string; patient?: ReceptionPatientSearchRow | null };
  if (!res.ok) return { patient: null, error: json.error ?? `Request failed (${res.status})` };
  return { patient: json.patient ?? null, error: null };
}

export type ReceptionConsultationCheckinApiResult = {
  error: string | null;
  transId?: string;
  destinationQueueDisplay?: string;
  destinationCounterCode?: string;
};

export type ReceptionPrepareLabApiResult = {
  error: string | null;
  transId?: string;
  labRequestId?: string | null;
  imagingRequestId?: string | null;
  includesLab?: boolean;
  includesImaging?: boolean;
};

export async function patchReceptionQueueTicket(
  ticketId: string,
  action: "call" | "start" | "complete",
): Promise<{ error: string | null }>;

export async function patchReceptionQueueTicket(
  ticketId: string,
  action: "start_with_triage",
  triage: {
    complaint: string;
    triageNotes: string;
    route: "consultation";
    priorNotes: string | null;
    patient: { id: number; name: string; contact_no: string | null } | null;
    doctorCounterCode: string;
    vitals?: {
      bp: string;
      hr: string;
      rr: string;
      temp: string;
      o2: string;
      weight_kg: string;
      height_cm: string;
      bmi: string;
    } | null;
  },
): Promise<ReceptionConsultationCheckinApiResult>;

export async function patchReceptionQueueTicket(
  ticketId: string,
  action: "call" | "start" | "complete" | "start_with_triage",
  triage?: {
    complaint: string;
    triageNotes: string;
    route: "consultation";
    priorNotes: string | null;
    patient: { id: number; name: string; contact_no: string | null } | null;
    doctorCounterCode: string;
    vitals?: {
      bp: string;
      hr: string;
      rr: string;
      temp: string;
      o2: string;
      weight_kg: string;
      height_cm: string;
      bmi: string;
    } | null;
  },
): Promise<{ error: string | null } | ReceptionConsultationCheckinApiResult> {
  const body: Record<string, unknown> = { ticketId, action };
  if (action === "start_with_triage" && triage) {
    body.complaint = triage.complaint;
    body.triageNotes = triage.triageNotes;
    body.route = triage.route;
    body.priorNotes = triage.priorNotes;
    body.patient = triage.patient;
    body.vitals = triage.vitals ?? null;
    body.doctorCounterCode = triage.doctorCounterCode;
  }

  const res = await authenticatedFetch("/api/reception/queue-ticket", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as {
    error?: string;
    transId?: string;
    destinationQueueDisplay?: string;
    destinationCounterCode?: string;
  };
  if (!res.ok) {
    return { error: json.error ?? `Request failed (${res.status})` };
  }
  if (action === "start_with_triage") {
    return {
      error: null,
      transId: json.transId,
      destinationQueueDisplay: json.destinationQueueDisplay,
      destinationCounterCode: json.destinationCounterCode,
    };
  }
  return { error: null };
}

export type RecallQueueTicketResult = {
  error: string | null;
};

/** Re-announce on queue TV (bumps `called_at`; does not change ticket status). */
export async function recallQueueTicketAnnounce(ticketId: string): Promise<RecallQueueTicketResult> {
  const id = ticketId.trim();
  if (!id) return { error: "Missing ticket id." };

  const res = await authenticatedFetch("/api/reception/queue-ticket", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ticketId: id, action: "recall" }),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) {
    return { error: json.error ?? `Request failed (${res.status})` };
  }
  return { error: null };
}

export type CallQueueForEncounterApiResult = {
  error: string | null;
  queueDisplay?: string;
  patientName?: string | null;
  counterName?: string | null;
};

/** Physician Appointments: call today's Waiting ticket linked to the encounter (`encounter_id` = transId). */
export async function callQueueForEncounterFromApi(
  transId: string,
  physicianUserId: number,
): Promise<CallQueueForEncounterApiResult> {
  const res = await authenticatedFetch("/api/reception/queue-call-by-encounter", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ transId: transId.trim(), physicianUserId }),
  });
  const json = (await res.json().catch(() => ({}))) as {
    error?: string;
    queueDisplay?: string;
    patientName?: string | null;
    counterName?: string | null;
  };
  if (!res.ok) {
    return { error: json.error ?? `Request failed (${res.status})` };
  }
  return {
    error: null,
    queueDisplay: json.queueDisplay,
    patientName: json.patientName,
    counterName: json.counterName,
  };
}

export async function prepareReceptionLabCheckinFromApi(body: {
  ticketId: string;
  triageNotes: string;
  priorNotes: string | null;
  patient: { id: number; name: string; contact_no: string | null };
  labTestIds: string[];
  labPackageIds?: number[];
  imagingSelection?: Record<string, { checked: boolean; view: string }>;
}): Promise<ReceptionPrepareLabApiResult> {
  const res = await authenticatedFetch("/api/reception/queue-ticket", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ticketId: body.ticketId,
      action: "prepare_lab_checkin",
      triageNotes: body.triageNotes,
      priorNotes: body.priorNotes,
      patient: body.patient,
      labTestIds: body.labTestIds,
      labPackageIds: body.labPackageIds ?? [],
      imagingSelection: body.imagingSelection ?? {},
    }),
  });
  const json = (await res.json().catch(() => ({}))) as {
    error?: string;
    transId?: string;
    labRequestId?: string | null;
    imagingRequestId?: string | null;
    includesLab?: boolean;
    includesImaging?: boolean;
  };
  if (!res.ok) {
    return { error: json.error ?? `Request failed (${res.status})` };
  }
  return {
    error: null,
    transId: json.transId,
    labRequestId: json.labRequestId ?? null,
    imagingRequestId: json.imagingRequestId ?? null,
    includesLab: json.includesLab ?? Boolean(json.labRequestId),
    includesImaging: json.includesImaging ?? Boolean(json.imagingRequestId),
  };
}

export async function completeEntranceAfterLabIntakeFromApi(body: {
  entranceTicketId: string;
  transId: string;
  labRequestId?: string | null;
  imagingRequestId?: string | null;
  includesLab?: boolean;
  includesImaging?: boolean;
  patient: { id: number; name: string; contact_no: string | null };
}): Promise<{
  error: string | null;
  transId?: string;
  labQueueDisplay?: string;
  labQueueTicketId?: string;
}> {
  const res = await authenticatedFetch("/api/reception/lab-intake-complete-entrance", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      entranceTicketId: body.entranceTicketId,
      transId: body.transId,
      labRequestId: body.labRequestId ?? null,
      imagingRequestId: body.imagingRequestId ?? null,
      includesLab: body.includesLab,
      includesImaging: body.includesImaging,
      patient: body.patient,
    }),
  });
  const json = (await res.json().catch(() => ({}))) as {
    error?: string;
    transId?: string;
    labQueueDisplay?: string;
    labQueueTicketId?: string;
  };
  if (!res.ok) {
    return { error: json.error ?? `Request failed (${res.status})` };
  }
  return {
    error: null,
    transId: json.transId,
    labQueueDisplay: json.labQueueDisplay,
    labQueueTicketId: json.labQueueTicketId,
  };
}

export async function finalizeReceptionLabCheckinFromApi(body: {
  entranceTicketId: string;
  transId: string;
  labRequestId: string;
  patient: { id: number; name: string; contact_no: string | null };
}): Promise<{
  error: string | null;
  transId?: string;
  destinationQueueDisplay?: string;
  destinationCounterCode?: string;
}> {
  const res = await authenticatedFetch("/api/reception/lab-checkin-finalize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as {
    error?: string;
    transId?: string;
    destinationQueueDisplay?: string;
    destinationCounterCode?: string;
  };
  if (!res.ok) {
    return { error: json.error ?? `Request failed (${res.status})` };
  }
  return {
    error: null,
    transId: json.transId,
    destinationQueueDisplay: json.destinationQueueDisplay,
    destinationCounterCode: json.destinationCounterCode,
  };
}

const QUEUE_NOTE_ID_SEGMENT = /^(?:trans_id|lab requests?|imaging requests?)\b/i;

/** Dashboard / queue UI: hide internal UUIDs and tag lines; keep human queue-location notes. */
export function formatQueueTicketNotesForDisplay(raw: string | null | undefined): string {
  let s = (raw ?? "").trim();
  if (!s) return "—";

  s = s.replace(/\s*·\s*trans_id\s+[0-9a-f-]{8,}/gi, "");
  s = s.replace(/\btrans_id\s+[0-9a-f-]{8,}/gi, "");
  s = s.replace(/\s*·\s*Lab requests?:\s*(?:[0-9a-f-]{8,}(?:\s*,\s*)?)+/gi, "");
  s = s.replace(/\s*·\s*Imaging requests?:\s*(?:[0-9a-f-]{8,}(?:\s*,\s*)?)+/gi, "");

  s = s
    .split(/\r?\n/)
    .filter((line) => !/^\s*\[(?:Active|Specimen)\]\b/i.test(line))
    .join("\n");

  const parts = s
    .split(/\s*·\s*/)
    .map((p) => p.trim())
    .filter(Boolean)
    .filter((p) => !QUEUE_NOTE_ID_SEGMENT.test(p));

  const joined = parts.join(" · ").trim();
  return joined || "—";
}

/** Parses `Reception route: …` line appended at check-in. */
export function parseReceptionRouteFromNotes(notes: string | null): ReceptionTriageRoute | null {
  if (!notes?.trim()) return null;
  if (/Reception route:\s*Doctor consultation/i.test(notes)) return "consultation";
  if (/Reception route:\s*Laboratory only/i.test(notes)) return "laboratory";
  return null;
}
