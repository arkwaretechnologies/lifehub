import { supabase } from "@/lib/supabaseClient";
import { fetchLabTestsByIds } from "@/lib/labTests";

export const LAB_REQUESTS_TABLE = "lab_requests" as const;
export const LAB_REQUEST_ITEMS_TABLE = "lab_request_items" as const;

export type LabRequestItemPriority = "Routine" | "STAT";

export type CreateLabRequestInput = {
  /** Set `null` for walk-in (no consultation visit); then `patientId` is required. */
  encounterId: string | null;
  patientId: number | null;
  referringPhysician: string | null;
  physicianId: number | null;
  /** Header row `lab_requests.priority` (required in DB). */
  priority: string;
  remarks: string | null;
  labTestIds: string[];
  /** Optional per-item priority (must satisfy CHECK or be null). */
  itemPriority?: LabRequestItemPriority | null;
};

function localDateYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function localTimeHms(d: Date): string {
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  const s = String(d.getSeconds()).padStart(2, "0");
  return `${h}:${min}:${s}`;
}

/**
 * Inserts `lab_requests` then `lab_request_items`. Rolls back the header row if items fail.
 */
export async function createLabRequestWithItems(
  input: CreateLabRequestInput
): Promise<{ labRequestId: string | null; error: string | null }> {
  const ids = [...new Set(input.labTestIds.map((x) => x.trim()).filter(Boolean))];
  if (ids.length === 0) {
    return { labRequestId: null, error: "Select at least one lab test." };
  }

  const enc = input.encounterId != null ? String(input.encounterId).trim() : "";
  if (input.encounterId != null && enc === "") {
    return { labRequestId: null, error: "Invalid encounter." };
  }
  if (input.encounterId == null && (input.patientId == null || !Number.isFinite(input.patientId) || input.patientId <= 0)) {
    return { labRequestId: null, error: "Walk-in lab orders require a patient." };
  }

  const now = new Date();
  const request_date = localDateYmd(now);
  const request_time = localTimeHms(now);

  const referring =
    input.referringPhysician != null && input.referringPhysician.trim() !== ""
      ? input.referringPhysician.trim()
      : null;
  const remarks =
    input.remarks != null && input.remarks.trim() !== "" ? input.remarks.trim() : null;

  const { data: row, error: insErr } = await supabase
    .from(LAB_REQUESTS_TABLE)
    .insert({
      encounter_id: enc === "" ? null : enc,
      patient_id: input.patientId,
      request_date,
      request_time,
      priority: input.priority.trim() || "Routine",
      referring_physician: referring,
      remarks,
      physician_id: input.physicianId,
    })
    .select("id")
    .single();

  if (insErr) {
    return { labRequestId: null, error: insErr.message };
  }

  const labRequestId = (row as { id?: string } | null)?.id ?? null;
  if (!labRequestId) {
    return { labRequestId: null, error: "Could not create lab request." };
  }

  const itemPriority = input.itemPriority ?? null;
  const items = ids.map((lab_test_id) => ({
    lab_request_id: labRequestId,
    lab_test_id,
    notes: null as string | null,
    priority: itemPriority,
  }));

  const { error: itemsErr } = await supabase.from(LAB_REQUEST_ITEMS_TABLE).insert(items);

  if (itemsErr) {
    await supabase.from(LAB_REQUESTS_TABLE).delete().eq("id", labRequestId);
    return { labRequestId: null, error: itemsErr.message };
  }

  return { labRequestId, error: null };
}

export function parsePatientIdForLab(raw: string | null | undefined): number | null {
  if (raw == null || String(raw).trim() === "") return null;
  const n = Number.parseInt(String(raw).trim(), 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

export type EncounterLabRequestSummary = {
  id: string;
  request_date: string;
  request_time: string | null;
  priority: string;
  remarks: string | null;
  created_at: string;
  labTestIds: string[];
};

export type LabRequestHeaderRow = {
  id: string;
  patient_id: number | null;
  encounter_id: string | null;
  request_date: string;
  request_time: string | null;
  priority: string;
  remarks: string | null;
  created_at: string;
};

export async function fetchLabRequestHeaderById(labRequestId: string): Promise<{
  row: LabRequestHeaderRow | null;
  error: string | null;
}> {
  const id = labRequestId.trim();
  if (!id) return { row: null, error: "Missing lab order id." };

  const { data, error } = await supabase
    .from(LAB_REQUESTS_TABLE)
    .select("id, patient_id, encounter_id, request_date, request_time, priority, remarks, created_at")
    .eq("id", id)
    .maybeSingle();

  if (error) return { row: null, error: error.message };
  return { row: (data as LabRequestHeaderRow | null) ?? null, error: null };
}

/**
 * All lab requests for an encounter, with item test ids (newest request first).
 */
export async function fetchLabRequestsForEncounter(
  encounterId: string
): Promise<{
  requests: EncounterLabRequestSummary[];
  requestedTestIds: string[];
  error: string | null;
}> {
  const id = encounterId.trim();
  if (!id) {
    return { requests: [], requestedTestIds: [], error: null };
  }

  const { data: reqRows, error: reqErr } = await supabase
    .from(LAB_REQUESTS_TABLE)
    .select("id, request_date, request_time, priority, remarks, created_at")
    .eq("encounter_id", id)
    .order("created_at", { ascending: false });

  if (reqErr) {
    return { requests: [], requestedTestIds: [], error: reqErr.message };
  }

  const requestsRaw = (reqRows ?? []) as {
    id: string;
    request_date: string;
    request_time: string | null;
    priority: string;
    remarks: string | null;
    created_at: string;
  }[];

  if (requestsRaw.length === 0) {
    return { requests: [], requestedTestIds: [], error: null };
  }

  const requestIds = requestsRaw.map((r) => r.id);
  const { data: itemRows, error: itemErr } = await supabase
    .from(LAB_REQUEST_ITEMS_TABLE)
    .select("lab_request_id, lab_test_id")
    .in("lab_request_id", requestIds);

  if (itemErr) {
    return { requests: [], requestedTestIds: [], error: itemErr.message };
  }

  const items = (itemRows ?? []) as { lab_request_id: string; lab_test_id: string }[];
  const byRequest = new Map<string, string[]>();
  const allTestIds = new Set<string>();
  for (const row of items) {
    const list = byRequest.get(row.lab_request_id) ?? [];
    list.push(row.lab_test_id);
    byRequest.set(row.lab_request_id, list);
    allTestIds.add(row.lab_test_id);
  }

  const requests: EncounterLabRequestSummary[] = requestsRaw.map((r) => ({
    id: r.id,
    request_date: r.request_date,
    request_time: r.request_time,
    priority: r.priority,
    remarks: r.remarks,
    created_at: r.created_at,
    labTestIds: byRequest.get(r.id) ?? [],
  }));

  return {
    requests,
    requestedTestIds: [...allTestIds],
    error: null,
  };
}

export type LabRequestItemDetailRow = {
  id: string;
  lab_request_id: string;
  lab_test_id: string;
  notes: string | null;
  priority: string | null;
  test_name: string | null;
  result_value: string | null;
  result_unit: string | null;
  reference_range: string | null;
  flag: string | null;
  result_remarks: string | null;
  result_status: string | null;
};

/** All `lab_request_items` rows for the given requests, with `lab_tests.name`. */
export async function fetchLabRequestItemDetailsForRequestIds(requestIds: string[]): Promise<{
  items: LabRequestItemDetailRow[];
  error: string | null;
}> {
  const ids = [...new Set(requestIds.map((x) => String(x).trim()).filter(Boolean))];
  if (ids.length === 0) return { items: [], error: null };

  const { data, error } = await supabase
    .from(LAB_REQUEST_ITEMS_TABLE)
    .select("id, lab_request_id, lab_test_id, notes, priority")
    .in("lab_request_id", ids);

  if (error) return { items: [], error: error.message };

  const raw = (data ?? []) as Array<{
    id: string;
    lab_request_id: string;
    lab_test_id: string;
    notes: string | null;
    priority: string | null;
  }>;

  const testIds = [...new Set(raw.map((r) => r.lab_test_id).filter(Boolean))];
  const { testsById, error: testErr } = await fetchLabTestsByIds(testIds);
  if (testErr) return { items: [], error: testErr };

  const itemIds = raw.map((r) => r.id).filter(Boolean);
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
    const { data: resultRows, error: resultErr } = await supabase
      .from("lab_results")
      .select("lab_request_item_id, result_value, result_unit, reference_range, flag, remarks, status")
      .in("lab_request_item_id", itemIds);
    if (resultErr) return { items: [], error: resultErr.message };
    for (const rr of (resultRows ?? []) as Array<{
      lab_request_item_id: string;
      result_value: string | null;
      result_unit: string | null;
      reference_range: string | null;
      flag: string | null;
      remarks: string | null;
      status: string | null;
    }>) {
      resultsByItemId.set(rr.lab_request_item_id, {
        result_value: rr.result_value,
        result_unit: rr.result_unit,
        reference_range: rr.reference_range,
        flag: rr.flag,
        remarks: rr.remarks,
        status: rr.status,
      });
    }
  }

  const items: LabRequestItemDetailRow[] = raw.map((r) => {
    const result = resultsByItemId.get(r.id);
    return {
      id: r.id,
      lab_request_id: r.lab_request_id,
      lab_test_id: r.lab_test_id,
      notes: r.notes,
      priority: r.priority,
      test_name: testsById.get(r.lab_test_id)?.name ?? null,
      result_value: result?.result_value ?? null,
      result_unit: result?.result_unit ?? null,
      reference_range: result?.reference_range ?? null,
      flag: result?.flag ?? null,
      result_remarks: result?.remarks ?? null,
      result_status: result?.status ?? null,
    };
  });

  items.sort((a, b) => {
    const cr = a.lab_request_id.localeCompare(b.lab_request_id);
    if (cr !== 0) return cr;
    return a.id.localeCompare(b.id);
  });

  return { items, error: null };
}

export async function deleteLabRequestsForEncounter(encounterId: string): Promise<{ error: string | null }> {
  const id = encounterId.trim();
  if (!id) return { error: null };

  const { data: reqRows, error: reqErr } = await supabase
    .from(LAB_REQUESTS_TABLE)
    .select("id")
    .eq("encounter_id", id);

  if (reqErr) return { error: reqErr.message };
  const reqIds = ((reqRows ?? []) as Array<{ id: string }>).map((r) => r.id).filter(Boolean);
  if (reqIds.length === 0) return { error: null };

  const { error: itemsErr } = await supabase.from(LAB_REQUEST_ITEMS_TABLE).delete().in("lab_request_id", reqIds);
  if (itemsErr) return { error: itemsErr.message };

  const { error: delErr } = await supabase.from(LAB_REQUESTS_TABLE).delete().in("id", reqIds);
  if (delErr) return { error: delErr.message };

  return { error: null };
}
