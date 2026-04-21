import { NextResponse } from "next/server";
import { queueAdminClient } from "@/lib/receptionQueueServer";
import type { QueueTicketStatus } from "@/lib/queueReception";

const ACTIVE_STATUSES: QueueTicketStatus[] = ["Waiting", "Called", "Serving"];

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

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
  issued_at: string;
  called_at: string | null;
  serving_at: string | null;
  encounter_id: string | null;
  lab_request_id: string | null;
  notes: string | null;
};

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

  let base = admin
    .from("queue_tickets")
    .select(
      "id, queue_display, patient_name, status, issued_at, called_at, serving_at, encounter_id, lab_request_id, notes",
      { count: "exact" },
    )
    .eq("counter_id", counterId)
    .order("issued_at", { ascending: true });

  // Default view: today's active tickets. Search can request a broader scope.
  if (scope === "all") {
    base = base.gte("ticket_date", isoDateDaysAgo(days));
  } else if (scope === "today_all") {
    base = base.eq("ticket_date", todayIsoDate());
  } else {
    // active_today (default)
    base = base.eq("ticket_date", todayIsoDate()).in("status", ACTIVE_STATUSES);
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

  return NextResponse.json({
    counterCode: code,
    rows: (data ?? []) as LabQueueRow[],
    count: count ?? 0,
  });
}

