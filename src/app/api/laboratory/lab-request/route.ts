import { NextResponse } from "next/server";
import { queueAdminClient } from "@/lib/receptionQueueServer";

type LabRequestHeader = {
  id: string;
  encounter_id: string | null;
  patient_id: number | null;
  request_date: string;
  request_time: string | null;
  priority: string;
  remarks: string | null;
  created_at: string;
};

export type LabRequestItemView = {
  id: string;
  lab_test_id: string;
  test_name: string | null;
  specimen_type: string | null;
  priority: string | null;
  notes: string | null;
};

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("labRequestId")?.trim() ?? "";
  if (!id) {
    return NextResponse.json({ error: "labRequestId is required." }, { status: 400 });
  }

  const admin = queueAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." }, { status: 500 });
  }

  const { data: header, error: hErr } = await admin
    .from("lab_requests")
    .select("id, encounter_id, patient_id, request_date, request_time, priority, remarks, created_at")
    .eq("id", id)
    .maybeSingle();

  if (hErr) return NextResponse.json({ error: hErr.message }, { status: 500 });
  if (!header) return NextResponse.json({ error: "Lab request not found." }, { status: 404 });

  const { data: items, error: iErr } = await admin
    .from("lab_request_items")
    .select("id, lab_test_id, notes, priority")
    .eq("lab_request_id", id);

  if (iErr) return NextResponse.json({ error: iErr.message }, { status: 500 });

  const itemRows = (items ?? []) as Array<{
    id: string;
    lab_test_id: string;
    notes: string | null;
    priority: string | null;
  }>;

  const testIds = [...new Set(itemRows.map((r) => r.lab_test_id).filter(Boolean))];
  const testsById = new Map<string, { name: string | null; specimen_type: string | null }>();
  if (testIds.length > 0) {
    const { data: tests, error: tErr } = await admin
      .from("lab_tests")
      .select("id, name, specimen_type")
      .in("id", testIds);
    if (tErr) return NextResponse.json({ error: tErr.message }, { status: 500 });
    for (const t of (tests ?? []) as Array<{ id: string; name: string | null; specimen_type: string | null }>) {
      testsById.set(t.id, { name: t.name, specimen_type: t.specimen_type });
    }
  }

  const outItems: LabRequestItemView[] = itemRows.map((r) => {
    const t = testsById.get(r.lab_test_id);
    return {
      id: r.id,
      lab_test_id: r.lab_test_id,
      test_name: t?.name ?? null,
      specimen_type: t?.specimen_type ?? null,
      priority: r.priority,
      notes: r.notes,
    };
  });

  outItems.sort((a, b) => (a.test_name ?? a.lab_test_id).localeCompare(b.test_name ?? b.lab_test_id));

  return NextResponse.json({
    header: header as LabRequestHeader,
    items: outItems,
  });
}

