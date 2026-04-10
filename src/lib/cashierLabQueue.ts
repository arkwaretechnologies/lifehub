import { supabase } from "@/lib/supabaseClient";
import { PHYSICIAN_FEE_SALES_TABLE, PHYSICIAN_FEE_STATUS_PAID } from "@/lib/physicianFeeSales";
import {
  LAB_REQUEST_ITEMS_TABLE,
  LAB_REQUESTS_TABLE,
  type EncounterLabRequestSummary,
} from "@/lib/labRequests";

const LAB_SALES_TABLE = "lab_sales" as const;

const PAGE_SIZE = 1000;
const ENCOUNTER_IN_CHUNK = 120;
const LAB_REQ_ITEMS_CHUNK = 200;

export { PHYSICIAN_FEE_STATUS_PAID } from "@/lib/physicianFeeSales";

/**
 * `encounter_id` values from `physician_fee_sales` where `status` is not `PAID`
 * (includes `status` null — same idea as `IS DISTINCT FROM 'PAID'`).
 * Count = number of such sale rows per encounter (usually 1).
 */
export async function fetchCashierUnpaidPhysicianFeeEncounterCounts(): Promise<{
  pendingByEncounterId: Map<string, number>;
  error: string | null;
}> {
  const pendingByEncounterId = new Map<string, number>();
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from(PHYSICIAN_FEE_SALES_TABLE)
      .select("encounter_id")
      .not("encounter_id", "is", null)
      .or(`status.is.null,status.neq.${PHYSICIAN_FEE_STATUS_PAID}`)
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      return { pendingByEncounterId: new Map(), error: error.message };
    }

    const rows = data ?? [];
    for (const r of rows) {
      const enc = (r as { encounter_id?: string }).encounter_id;
      if (!enc || String(enc).trim() === "") continue;
      const id = String(enc);
      pendingByEncounterId.set(id, (pendingByEncounterId.get(id) ?? 0) + 1);
    }

    if (rows.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return { pendingByEncounterId, error: null };
}

/** Any `lab_sales` row with a non-null `lab_request_id` counts as “already billed”. */
async function fetchLabRequestIdsReferencedInLabSales(): Promise<{
  set: Set<string>;
  error: string | null;
}> {
  const set = new Set<string>();
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from(LAB_SALES_TABLE)
      .select("lab_request_id")
      .not("lab_request_id", "is", null)
      .range(from, from + PAGE_SIZE - 1);

    if (error) return { set, error: error.message };

    const rows = data ?? [];
    for (const r of rows) {
      const id = (r as { lab_request_id?: string }).lab_request_id;
      if (id) set.add(String(id));
    }
    if (rows.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return { set, error: null };
}

/**
 * Lab requests for the given encounters whose `id` never appears as `lab_sales.lab_request_id`.
 */
export async function fetchLabRequestsWithoutLabSaleForEncounters(
  encounterIds: string[],
): Promise<{ byEncounter: Map<string, EncounterLabRequestSummary[]>; error: string | null }> {
  const byEncounter = new Map<string, EncounterLabRequestSummary[]>();
  const uniqueEnc = [...new Set(encounterIds.map((x) => String(x).trim()).filter(Boolean))];
  if (uniqueEnc.length === 0) {
    return { byEncounter, error: null };
  }

  const sold = await fetchLabRequestIdsReferencedInLabSales();
  if (sold.error) {
    return { byEncounter: new Map(), error: sold.error };
  }

  type ReqRow = {
    id: string;
    encounter_id: string;
    request_date: string;
    request_time: string | null;
    priority: string;
    remarks: string | null;
    created_at: string;
  };

  const pendingRaw: ReqRow[] = [];

  for (let i = 0; i < uniqueEnc.length; i += ENCOUNTER_IN_CHUNK) {
    const chunk = uniqueEnc.slice(i, i + ENCOUNTER_IN_CHUNK);
    const { data, error } = await supabase
      .from(LAB_REQUESTS_TABLE)
      .select("id, encounter_id, request_date, request_time, priority, remarks, created_at")
      .in("encounter_id", chunk)
      .order("created_at", { ascending: false });

    if (error) {
      return { byEncounter: new Map(), error: error.message };
    }

    for (const r of (data ?? []) as ReqRow[]) {
      if (!r.id || !r.encounter_id) continue;
      if (sold.set.has(String(r.id))) continue;
      pendingRaw.push(r);
    }
  }

  if (pendingRaw.length === 0) {
    return { byEncounter, error: null };
  }

  const pendingIds = pendingRaw.map((r) => r.id);
  const byRequestTests = new Map<string, string[]>();

  for (let i = 0; i < pendingIds.length; i += LAB_REQ_ITEMS_CHUNK) {
    const chunk = pendingIds.slice(i, i + LAB_REQ_ITEMS_CHUNK);
    const { data: itemRows, error: itemErr } = await supabase
      .from(LAB_REQUEST_ITEMS_TABLE)
      .select("lab_request_id, lab_test_id")
      .in("lab_request_id", chunk);

    if (itemErr) {
      return { byEncounter: new Map(), error: itemErr.message };
    }

    for (const row of (itemRows ?? []) as { lab_request_id: string; lab_test_id: string }[]) {
      const list = byRequestTests.get(row.lab_request_id) ?? [];
      list.push(row.lab_test_id);
      byRequestTests.set(row.lab_request_id, list);
    }
  }

  for (const r of pendingRaw) {
    const summary: EncounterLabRequestSummary = {
      id: r.id,
      request_date: r.request_date,
      request_time: r.request_time,
      priority: r.priority,
      remarks: r.remarks,
      created_at: r.created_at,
      labTestIds: byRequestTests.get(r.id) ?? [],
    };
    const enc = String(r.encounter_id);
    const list = byEncounter.get(enc) ?? [];
    list.push(summary);
    byEncounter.set(enc, list);
  }

  return { byEncounter, error: null };
}

/**
 * Walk-in lab orders: `lab_requests` with no visit (`encounter_id` null), not yet on `lab_sales`.
 */
export async function fetchStandaloneLabRequestsWithoutLabSaleForPatient(patientId: number): Promise<{
  requests: EncounterLabRequestSummary[];
  error: string | null;
}> {
  if (!Number.isFinite(patientId) || patientId <= 0) {
    return { requests: [], error: null };
  }

  const sold = await fetchLabRequestIdsReferencedInLabSales();
  if (sold.error) {
    return { requests: [], error: sold.error };
  }

  const { data, error } = await supabase
    .from(LAB_REQUESTS_TABLE)
    .select("id, request_date, request_time, priority, remarks, created_at")
    .is("encounter_id", null)
    .eq("patient_id", patientId)
    .order("created_at", { ascending: false });

  if (error) {
    return { requests: [], error: error.message };
  }

  type ReqRow = {
    id: string;
    request_date: string;
    request_time: string | null;
    priority: string;
    remarks: string | null;
    created_at: string;
  };

  const requestsRaw = ((data ?? []) as ReqRow[]).filter((r) => r.id && !sold.set.has(String(r.id)));

  if (requestsRaw.length === 0) {
    return { requests: [], error: null };
  }

  const pendingIds = requestsRaw.map((r) => r.id);
  const byRequestTests = new Map<string, string[]>();

  for (let i = 0; i < pendingIds.length; i += LAB_REQ_ITEMS_CHUNK) {
    const chunk = pendingIds.slice(i, i + LAB_REQ_ITEMS_CHUNK);
    const { data: itemRows, error: itemErr } = await supabase
      .from(LAB_REQUEST_ITEMS_TABLE)
      .select("lab_request_id, lab_test_id")
      .in("lab_request_id", chunk);

    if (itemErr) {
      return { requests: [], error: itemErr.message };
    }

    for (const row of (itemRows ?? []) as { lab_request_id: string; lab_test_id: string }[]) {
      const list = byRequestTests.get(row.lab_request_id) ?? [];
      list.push(row.lab_test_id);
      byRequestTests.set(row.lab_request_id, list);
    }
  }

  const requests: EncounterLabRequestSummary[] = requestsRaw.map((r) => ({
    id: r.id,
    request_date: r.request_date,
    request_time: r.request_time,
    priority: r.priority,
    remarks: r.remarks,
    created_at: r.created_at,
    labTestIds: byRequestTests.get(r.id) ?? [],
  }));

  return { requests, error: null };
}
