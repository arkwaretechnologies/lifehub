import { supabase } from "@/lib/supabaseClient";

export const LAB_REQUESTS_TABLE = "lab_requests" as const;
export const LAB_REQUEST_ITEMS_TABLE = "lab_request_items" as const;

export type LabRequestItemPriority = "Routine" | "STAT";

export type CreateLabRequestInput = {
  encounterId: string;
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
      encounter_id: input.encounterId,
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
