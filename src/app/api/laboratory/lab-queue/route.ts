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

export async function GET() {
  const admin = queueAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." }, { status: 500 });
  }

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

  const { data, error } = await admin
    .from("queue_tickets")
    .select(
      "id, queue_display, patient_name, status, issued_at, called_at, serving_at, encounter_id, lab_request_id, notes",
    )
    .eq("counter_id", counterId)
    .eq("ticket_date", todayIsoDate())
    .in("status", ACTIVE_STATUSES)
    .order("issued_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ counterCode: code, rows: (data ?? []) as LabQueueRow[] });
}

