import { NextResponse } from "next/server";
import type { LabPackageDetail } from "@/lib/labPackages";
import { attachLabRequestSummariesPackagesForDb, type EncounterLabRequestSummary } from "@/lib/labRequests";
import { queueAdminClient } from "@/lib/receptionQueueServer";

type LabRequestHeader = {
  id: string;
  encounter_id: string | null;
  patient_id: number | null;
  request_date: string;
  request_time: string | null;
  priority: string;
  clinical_diagnosis: string | null;
  remarks: string | null;
  created_at: string;
};

/** Full header returned by GET (includes resolved patient label + LAB queue ticket if any). */
export type LabRequestHeaderView = LabRequestHeader & {
  patient_name: string | null;
  queue_display: string | null;
  lab_packages: LabPackageDetail[];
  package_covered_test_ids: string[];
};

export type LabRequestItemView = {
  id: string;
  lab_test_id: string;
  test_name: string | null;
  specimen_type: string | null;
  priority: string | null;
  notes: string | null;
  collected_item?: string | null;
  // lab_results (optional; present when available)
  result_value?: string | null;
  result_unit?: string | null;
  reference_range?: string | null;
  flag?: string | null;
  remarks?: string | null;
  result_status?: string | null;
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
    .select("id, encounter_id, patient_id, request_date, request_time, priority, clinical_diagnosis, remarks, created_at")
    .eq("id", id)
    .maybeSingle();

  if (hErr) return NextResponse.json({ error: hErr.message }, { status: 500 });
  if (!header) return NextResponse.json({ error: "Lab request not found." }, { status: 404 });

  const baseHeader = header as LabRequestHeader;

  const pkgSeed: EncounterLabRequestSummary = {
    id: baseHeader.id,
    request_date: baseHeader.request_date,
    request_time: baseHeader.request_time,
    priority: baseHeader.priority,
    clinical_diagnosis: baseHeader.clinical_diagnosis,
    remarks: baseHeader.remarks,
    created_at: baseHeader.created_at,
    labTestIds: [],
    lab_packages: [],
    package_covered_test_ids: [],
  };
  const [pkgRow] = await attachLabRequestSummariesPackagesForDb(admin, [pkgSeed]);
  const lab_packages = pkgRow?.lab_packages ?? [];
  const package_covered_test_ids = pkgRow?.package_covered_test_ids ?? [];
  let patient_name: string | null = null;
  if (baseHeader.patient_id != null) {
    const { data: pat, error: pErr } = await admin.from("patients").select("name").eq("id", baseHeader.patient_id).maybeSingle();
    if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });
    const rawName = (pat as { name?: string | null } | null)?.name ?? null;
    patient_name =
      rawName != null && String(rawName).trim() !== ""
        ? String(rawName).trim()
        : null;
  }

  const { data: qtRow, error: qtErr } = await admin
    .from("queue_tickets")
    .select("queue_display")
    .eq("lab_request_id", id)
    .order("issued_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (qtErr) return NextResponse.json({ error: qtErr.message }, { status: 500 });
  const queue_display = ((qtRow as { queue_display?: string | null } | null)?.queue_display ?? null)?.trim() || null;

  const { data: items, error: iErr } = await admin
    .from("lab_request_items")
    .select("id, lab_test_id, notes, priority, collected_item")
    .eq("lab_request_id", id);

  if (iErr) return NextResponse.json({ error: iErr.message }, { status: 500 });

  const itemRows = (items ?? []) as Array<{
    id: string;
    lab_test_id: string;
    notes: string | null;
    priority: string | null;
    collected_item?: string | null;
  }>;

  // Load existing lab results keyed by item id (1 row per item).
  const itemIds = itemRows.map((r) => r.id).filter(Boolean);
  const resultsByItemId = new Map<
    string,
    {
      result_value: string | null;
      result_unit: string | null;
      reference_range: string | null;
      flag: string | null;
      remarks: string | null;
      status: string | null;
    }
  >();
  if (itemIds.length > 0) {
    const { data: rRows, error: rErr } = await admin
      .from("lab_results")
      .select("lab_request_item_id, result_value, result_unit, reference_range, flag, remarks, status")
      .in("lab_request_item_id", itemIds);
    if (rErr) return NextResponse.json({ error: rErr.message }, { status: 500 });
    for (const r of (rRows ?? []) as Array<{
      lab_request_item_id: string;
      result_value: string | null;
      result_unit: string | null;
      reference_range: string | null;
      flag: string | null;
      remarks: string | null;
      status: string | null;
    }>) {
      resultsByItemId.set(r.lab_request_item_id, {
        result_value: r.result_value,
        result_unit: r.result_unit,
        reference_range: r.reference_range,
        flag: r.flag,
        remarks: r.remarks,
        status: r.status,
      });
    }
  }

  const testIds = [...new Set(itemRows.map((r) => r.lab_test_id).filter(Boolean))];
  const testsById = new Map<
    string,
    {
      name: string | null;
      specimen_type: string | null;
      unit: string | null;
      reference_range: string | null;
    }
  >();
  if (testIds.length > 0) {
    const { data: tests, error: tErr } = await admin
      .from("lab_tests")
      .select("id, name, specimen_type, unit, reference_range")
      .in("id", testIds);
    if (tErr) return NextResponse.json({ error: tErr.message }, { status: 500 });
    for (const t of (tests ?? []) as Array<{
      id: string;
      name: string | null;
      specimen_type: string | null;
      unit: string | null;
      reference_range: string | null;
    }>) {
      testsById.set(t.id, {
        name: t.name,
        specimen_type: t.specimen_type,
        unit: t.unit,
        reference_range: t.reference_range,
      });
    }
  }

  const outItems: LabRequestItemView[] = itemRows.map((r) => {
    const t = testsById.get(r.lab_test_id);
    const rr = resultsByItemId.get(r.id) ?? null;
    return {
      id: r.id,
      lab_test_id: r.lab_test_id,
      test_name: t?.name ?? null,
      specimen_type: t?.specimen_type ?? null,
      priority: r.priority,
      notes: r.notes,
      collected_item: r.collected_item ?? null,
      result_value: rr?.result_value ?? null,
      result_unit: rr?.result_unit ?? t?.unit ?? null,
      reference_range: rr?.reference_range ?? t?.reference_range ?? null,
      flag: rr?.flag ?? null,
      remarks: rr?.remarks ?? null,
      result_status: rr?.status ?? null,
    };
  });

  outItems.sort((a, b) => (a.test_name ?? a.lab_test_id).localeCompare(b.test_name ?? b.lab_test_id));

  const headerOut: LabRequestHeaderView = {
    ...baseHeader,
    patient_name,
    queue_display,
    lab_packages,
    package_covered_test_ids,
  };

  return NextResponse.json({
    header: headerOut,
    items: outItems,
  });
}

