import { NextResponse } from "next/server";
import {
  fetchLabRequestItemsForRequestIds,
  loadLabTestCatalogForTestIds,
} from "@/lib/labRequests";
import { filterLabRequestItemsForResultEntry } from "@/lib/labTests";
import { queueAdminClient } from "@/lib/receptionQueueServer";

export type PatientPriorLabResultEntry = {
  lab_request_id: string;
  request_date: string;
  request_time: string | null;
  lab_test_id: string;
  test_name: string | null;
  result_value: string;
  result_unit: string | null;
  reference_range: string | null;
  flag: string | null;
  remarks: string | null;
  result_status: string | null;
};

function parsePositiveInt(raw: string | null, fallback: number, max: number): number {
  const n = Number.parseInt(String(raw ?? ""), 10);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(n, max);
}

function hasResultValue(v: string | null | undefined): boolean {
  return String(v ?? "").trim() !== "";
}

/** Prior lab result lines for one patient (other requests), keyed by test for result-entry UI. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const patientIdRaw = url.searchParams.get("patientId")?.trim() ?? "";
  const excludeRequestId = url.searchParams.get("excludeLabRequestId")?.trim() ?? "";
  const limit = parsePositiveInt(url.searchParams.get("limit"), 30, 50);

  const patientId = Number(patientIdRaw);
  if (!Number.isFinite(patientId) || patientId <= 0) {
    return NextResponse.json({ error: "patientId is required." }, { status: 400 });
  }

  const admin = queueAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." }, { status: 500 });
  }

  let reqQuery = admin
    .from("lab_requests")
    .select("id, request_date, request_time, created_at")
    .eq("patient_id", patientId)
    .order("request_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit + (excludeRequestId ? 1 : 0));

  if (excludeRequestId) {
    reqQuery = reqQuery.neq("id", excludeRequestId);
  }

  const { data: reqRows, error: reqErr } = await reqQuery;
  if (reqErr) return NextResponse.json({ error: reqErr.message }, { status: 500 });

  const requests = ((reqRows ?? []) as Array<{
    id: string;
    request_date: string;
    request_time: string | null;
  }>).slice(0, limit);

  if (requests.length === 0) {
    return NextResponse.json({ entries: [] as PatientPriorLabResultEntry[] });
  }

  const requestIds = requests.map((r) => r.id);
  const reqMeta = new Map(requests.map((r) => [r.id, r]));

  const stored = await fetchLabRequestItemsForRequestIds(admin, requestIds);
  if (stored.error) return NextResponse.json({ error: stored.error }, { status: 500 });

  const allTestIds = [...new Set(stored.items.map((i) => i.lab_test_id).filter(Boolean))];
  const catRes = await loadLabTestCatalogForTestIds(admin, allTestIds);
  if (catRes.error) return NextResponse.json({ error: catRes.error }, { status: 500 });

  const itemsByRequest = new Map<string, typeof stored.items>();
  for (const row of stored.items) {
    const list = itemsByRequest.get(row.lab_request_id) ?? [];
    list.push(row);
    itemsByRequest.set(row.lab_request_id, list);
  }

  const resultEntryItems = requests.flatMap((req) =>
    filterLabRequestItemsForResultEntry(itemsByRequest.get(req.id) ?? [], catRes.catalog),
  );

  const itemIds = resultEntryItems.map((r) => r.id).filter(Boolean);
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
      if (!hasResultValue(r.result_value)) continue;
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

  const testIds = [...new Set(resultEntryItems.map((r) => r.lab_test_id).filter(Boolean))];
  const testsById = new Map<string, { name: string | null }>();
  if (testIds.length > 0) {
    const { data: tests, error: tErr } = await admin.from("lab_tests").select("id, name").in("id", testIds);
    if (tErr) return NextResponse.json({ error: tErr.message }, { status: 500 });
    for (const t of (tests ?? []) as Array<{ id: string; name: string | null }>) {
      testsById.set(t.id, { name: t.name });
    }
  }

  const entries: PatientPriorLabResultEntry[] = [];
  for (const item of resultEntryItems) {
    const rr = resultsByItemId.get(item.id);
    if (!rr || !hasResultValue(rr.result_value)) continue;
    const meta = reqMeta.get(item.lab_request_id);
    if (!meta) continue;
    entries.push({
      lab_request_id: item.lab_request_id,
      request_date: meta.request_date,
      request_time: meta.request_time,
      lab_test_id: item.lab_test_id,
      test_name: testsById.get(item.lab_test_id)?.name ?? null,
      result_value: String(rr.result_value ?? "").trim(),
      result_unit: rr.result_unit,
      reference_range: rr.reference_range,
      flag: rr.flag,
      remarks: rr.remarks,
      result_status: rr.status,
    });
  }

  entries.sort((a, b) => {
    const d = b.request_date.localeCompare(a.request_date);
    if (d !== 0) return d;
    const ta = String(b.request_time ?? "");
    const tb = String(a.request_time ?? "");
    if (ta !== tb) return ta.localeCompare(tb);
    return (a.test_name ?? a.lab_test_id).localeCompare(b.test_name ?? b.lab_test_id);
  });

  return NextResponse.json({ entries });
}
