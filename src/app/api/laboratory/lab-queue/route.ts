import { NextResponse } from "next/server";
import { queueTicketTodayIsoDate } from "@/lib/queueTicketDate";
import { adminLabRequestIdsWithLabSales, queueAdminClient } from "@/lib/receptionQueueServer";
import type { QueueTicketStatus } from "@/lib/queueReception";

const ACTIVE_STATUSES: QueueTicketStatus[] = ["Waiting", "Called", "Collected", "Serving"];

function labQueueCode(): string {
  return (process.env.NEXT_PUBLIC_RECEPTION_LAB_QUEUE_CODE ?? "LAB").trim().toUpperCase();
}

function isoDateDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - Math.max(0, Math.floor(days)));
  return d.toISOString().slice(0, 10);
}

export type LabQueueRow = {
  id: string;
  queue_display: string;
  patient_name: string | null;
  status: QueueTicketStatus;
  /** Queue calendar date (yyyy-mm-dd). */
  ticket_date: string | null;
  issued_at: string;
  called_at: string | null;
  serving_at: string | null;
  encounter_id: string | null;
  lab_request_id: string | null;
  notes: string | null;
  /** From linked `lab_requests` when present. */
  request_date?: string | null;
  request_time?: string | null;
};

const LAB_REQUEST_UUID_RE =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

function labRequestIdFromNotes(notes: string | null | undefined): string | null {
  const m = String(notes ?? "").match(LAB_REQUEST_UUID_RE);
  return m?.[0] ?? null;
}

/** Older queue tickets may lack `lab_request_id`; resolve from notes or encounter. */
async function attachResolvedLabRequestIdsToQueueRows(
  admin: NonNullable<ReturnType<typeof queueAdminClient>>,
  rows: LabQueueRow[],
): Promise<LabQueueRow[]> {
  const fromNotes = rows.map((r) => {
    if (String(r.lab_request_id ?? "").trim()) return r;
    const fromNote = labRequestIdFromNotes(r.notes);
    return fromNote ? { ...r, lab_request_id: fromNote } : r;
  });

  const missingEncounter = fromNotes.filter(
    (r) => !String(r.lab_request_id ?? "").trim() && String(r.encounter_id ?? "").trim(),
  );
  if (missingEncounter.length === 0) return fromNotes;

  const encounterIds = [...new Set(missingEncounter.map((r) => String(r.encounter_id).trim()))];
  const { data, error } = await admin
    .from("lab_requests")
    .select("id, encounter_id, request_date")
    .in("encounter_id", encounterIds);
  if (error) return fromNotes;

  const byEncounter = new Map<string, Array<{ id: string; request_date: string }>>();
  for (const lr of (data ?? []) as Array<{ id: string; encounter_id: string; request_date: string }>) {
    const eid = String(lr.encounter_id ?? "").trim();
    if (!eid) continue;
    const list = byEncounter.get(eid) ?? [];
    list.push({ id: lr.id, request_date: lr.request_date });
    byEncounter.set(eid, list);
  }

  return fromNotes.map((r) => {
    if (String(r.lab_request_id ?? "").trim()) return r;
    const eid = String(r.encounter_id ?? "").trim();
    if (!eid) return r;
    const candidates = byEncounter.get(eid) ?? [];
    if (candidates.length === 0) return r;
    const ticketDate = String(r.ticket_date ?? "").trim().slice(0, 10);
    const onDate = ticketDate ? candidates.filter((c) => c.request_date === ticketDate) : [];
    const pool = onDate.length > 0 ? onDate : candidates;
    const pick = [...pool].sort((a, b) => b.request_date.localeCompare(a.request_date))[0];
    return pick ? { ...r, lab_request_id: pick.id } : r;
  });
}

async function attachLabRequestDatesToQueueRows(
  admin: NonNullable<ReturnType<typeof queueAdminClient>>,
  rows: LabQueueRow[],
): Promise<LabQueueRow[]> {
  const ids = [...new Set(rows.map((r) => String(r.lab_request_id ?? "").trim()).filter(Boolean))];
  if (ids.length === 0) return rows;

  const { data, error } = await admin
    .from("lab_requests")
    .select("id, request_date, request_time")
    .in("id", ids);
  if (error) return rows;

  const byId = new Map<string, { request_date: string; request_time: string | null }>();
  for (const row of (data ?? []) as Array<{
    id: string;
    request_date: string;
    request_time: string | null;
  }>) {
    byId.set(row.id, { request_date: row.request_date, request_time: row.request_time });
  }

  return rows.map((r) => {
    const lr = String(r.lab_request_id ?? "").trim();
    const meta = lr ? byId.get(lr) : undefined;
    if (!meta) return r;
    return { ...r, request_date: meta.request_date, request_time: meta.request_time };
  });
}

/** Lab orders for matching patients not already listed on a queue ticket row. */
async function fetchLabRequestQueueRowsForPatientSearch(
  admin: NonNullable<ReturnType<typeof queueAdminClient>>,
  q: string,
  existingLabRequestIds: Set<string>,
  limit: number,
): Promise<LabQueueRow[]> {
  const term = q.trim();
  if (term.length < 2) return [];

  const { data: pats, error: pErr } = await admin
    .from("patients")
    .select("id, name")
    .ilike("name", `%${term}%`)
    .limit(30);
  if (pErr || !pats?.length) return [];

  const patientIds = (pats as Array<{ id: number }>).map((p) => p.id).filter((id) => Number.isFinite(id));
  if (patientIds.length === 0) return [];

  const { data: reqs, error: rErr } = await admin
    .from("lab_requests")
    .select("id, patient_id, encounter_id, request_date, request_time, created_at")
    .in("patient_id", patientIds)
    .order("request_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(Math.min(limit, 40));
  if (rErr || !reqs?.length) return [];

  const nameById = new Map<number, string>();
  for (const p of pats as Array<{ id: number; name?: string | null }>) {
    const n = String(p.name ?? "").trim();
    if (n) nameById.set(p.id, n);
  }

  const reqList = (reqs as Array<{
    id: string;
    patient_id: number;
    encounter_id: string | null;
    request_date: string;
    request_time: string | null;
    created_at: string;
  }>).filter((r) => !existingLabRequestIds.has(r.id));

  if (reqList.length === 0) return [];

  const reqIds = reqList.map((r) => r.id);
  const displayByReq = new Map<string, string>();
  const { data: qtRows } = await admin
    .from("queue_tickets")
    .select("lab_request_id, queue_display")
    .in("lab_request_id", reqIds);
  for (const qt of (qtRows ?? []) as Array<{ lab_request_id?: string | null; queue_display?: string | null }>) {
    const rid = String(qt.lab_request_id ?? "").trim();
    const qd = String(qt.queue_display ?? "").trim();
    if (rid && qd && !displayByReq.has(rid)) displayByReq.set(rid, qd);
  }

  return reqList.map((r) => {
    const issued =
      String(r.created_at ?? "").trim() ||
      `${String(r.request_date).slice(0, 10)}T00:00:00.000Z`;
    return {
      id: `lab-request:${r.id}`,
      queue_display: displayByReq.get(r.id) ?? "—",
      patient_name: nameById.get(r.patient_id) ?? null,
      status: "Completed" as QueueTicketStatus,
      ticket_date: String(r.request_date).slice(0, 10),
      issued_at: issued,
      called_at: null,
      serving_at: null,
      encounter_id: r.encounter_id,
      lab_request_id: r.id,
      notes: null,
      request_date: r.request_date,
      request_time: r.request_time,
    };
  });
}

async function enrichLabQueueRows(
  admin: NonNullable<ReturnType<typeof queueAdminClient>>,
  rows: LabQueueRow[],
): Promise<LabQueueRow[]> {
  const withReq = await attachResolvedLabRequestIdsToQueueRows(admin, rows);
  return attachLabRequestDatesToQueueRows(admin, withReq);
}

function parsePositiveInt(raw: string | null, fallback: number): number {
  const n = Number.parseInt(String(raw ?? ""), 10);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return n;
}

function isUuidLike(v: string): boolean {
  const s = v.trim();
  // 8-4-4-4-12 hex (case-insensitive)
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

export async function GET(req: Request) {
  const admin = queueAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." }, { status: 500 });
  }

  const url = new URL(req.url);
  const qRaw = (url.searchParams.get("q") ?? "").trim();
  const page = parsePositiveInt(url.searchParams.get("page"), 0);
  const pageSize = Math.min(Math.max(parsePositiveInt(url.searchParams.get("pageSize"), 10) || 10, 5), 50);
  const scope = String(url.searchParams.get("scope") ?? "active_today").trim().toLowerCase();
  const days = Math.min(Math.max(parsePositiveInt(url.searchParams.get("days"), 30) || 30, 1), 365);

  const code = labQueueCode();
  const { data: counter, error: cErr } = await admin
    .from("queue_counters")
    .select("id, code")
    .eq("is_active", true)
    .eq("code", code)
    .limit(1)
    .maybeSingle();

  if (cErr) {
    return NextResponse.json({ error: cErr.message }, { status: 500 });
  }
  if (!counter) {
    return NextResponse.json(
      { error: `No active queue counter with code “${code}”.` },
      { status: 404 },
    );
  }

  const counterId = (counter as { id?: string | number }).id;
  if (counterId == null) {
    return NextResponse.json({ error: "Invalid LAB counter id." }, { status: 500 });
  }

  const todayIso = queueTicketTodayIsoDate();

  let base = admin
    .from("queue_tickets")
    .select(
      "id, queue_display, patient_name, status, ticket_date, issued_at, called_at, serving_at, encounter_id, lab_request_id, notes",
      { count: "exact" },
    )
    .eq("counter_id", counterId)
    .order("issued_at", { ascending: true });

  // Default view: today's active tickets. Search can request a broader scope.
  if (scope === "all") {
    base = base.gte("ticket_date", isoDateDaysAgo(days));
  } else if (scope === "today_all") {
    base = base.eq("ticket_date", todayIso);
  } else {
    // active_today (default)
    base = base.eq("ticket_date", todayIso).in("status", ACTIVE_STATUSES);
  }

  /** Hide LAB tickets linked to unpaid visit lab orders (reserved at reception until cashier payment). */
  const ticketDateForPaidFilter = scope === "all" ? null : todayIso;
  if (ticketDateForPaidFilter) {
    const { data: pendingRows, error: pendingErr } = await admin
      .from("queue_tickets")
      .select("lab_request_id")
      .eq("counter_id", counterId)
      .eq("ticket_date", ticketDateForPaidFilter)
      .not("lab_request_id", "is", null);
    if (pendingErr) {
      return NextResponse.json({ error: pendingErr.message }, { status: 500 });
    }
    const linkedIds = [
      ...new Set(
        ((pendingRows ?? []) as Array<{ lab_request_id?: string | null }>)
          .map((r) => String(r.lab_request_id ?? "").trim())
          .filter(Boolean),
      ),
    ];
    if (linkedIds.length > 0) {
      const { ids: paidIds, error: paidErr } = await adminLabRequestIdsWithLabSales(admin, linkedIds);
      if (paidErr) {
        return NextResponse.json({ error: paidErr }, { status: 500 });
      }
      const unpaidIds = linkedIds.filter((id) => !paidIds.has(id));
      if (unpaidIds.length > 0) {
        base = base.not("lab_request_id", "in", `(${unpaidIds.join(",")})`);
      }
    }
  }

  const q = qRaw.replace(/\s+/g, " ").trim();
  const qIsUuid = isUuidLike(q);
  const orParts: string[] = [];
  if (q.length >= 2) {
    // Text-like matches
    orParts.push(`patient_name.ilike.%${q}%`);
    orParts.push(`queue_display.ilike.%${q}%`);
  }
  // UUID columns: only allow equality if the query looks like a UUID, otherwise Postgres errors on ilike.
  if (qIsUuid) {
    orParts.push(`encounter_id.eq.${q}`);
    orParts.push(`lab_request_id.eq.${q}`);
  }

  const query =
    orParts.length > 0
      ? base.or(orParts.join(","))
      : base;

  const from = page * pageSize;
  const to = from + pageSize - 1;
  const { data, error, count } = await query.range(from, to);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rawRows = (data ?? []) as LabQueueRow[];
  let rows = await enrichLabQueueRows(admin, rawRows);

  let totalCount = count ?? rows.length;
  if (scope === "all" && q.length >= 2 && page === 0) {
    const existingReqIds = new Set(
      rows.map((r) => String(r.lab_request_id ?? "").trim()).filter(Boolean),
    );
    const extra = await fetchLabRequestQueueRowsForPatientSearch(admin, q, existingReqIds, 30);
    if (extra.length > 0) {
      rows = [...rows, ...extra].sort((a, b) => {
        const d = b.issued_at.localeCompare(a.issued_at);
        if (d !== 0) return d;
        return (a.queue_display ?? "").localeCompare(b.queue_display ?? "");
      });
      totalCount += extra.length;
    }
  }

  return NextResponse.json({
    counterCode: code,
    rows,
    count: totalCount,
  });
}

