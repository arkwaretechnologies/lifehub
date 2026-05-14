import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";
import { fetchLabPackageDetailsMap, fetchLabPackageMemberTestIdsMap, type LabPackageDetail } from "@/lib/labPackages";

export type { LabPackageDetail } from "@/lib/labPackages";

export const LAB_REQUESTS_TABLE = "lab_requests" as const;
export const LAB_REQUEST_ITEMS_TABLE = "lab_request_items" as const;
export const LAB_REQUEST_PACKAGES_TABLE = "lab_request_packages" as const;

const LAB_REQ_PKG_CHUNK = 200;

export type LabRequestItemPriority = "Routine" | "STAT";

export type CreateLabRequestInput = {
  /** Set `null` for walk-in (no consultation visit); then `patientId` is required. */
  encounterId: string | null;
  patientId: number | null;
  referringPhysician: string | null;
  physicianId: number | null;
  /** Header row `lab_requests.priority` (required in DB). */
  priority: string;
  /** Free text (LH lab request form clinical data / provisional diagnosis). */
  clinicalDiagnosis: string | null;
  remarks: string | null;
  labTestIds: string[];
  /** Optional per-item priority (must satisfy CHECK or be null). */
  itemPriority?: LabRequestItemPriority | null;
  /** Catalog `lab_packages.id` rows acquired on this request (order preserved). */
  packageIds?: number[] | null;
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

export function normalizeLabRequestPackageIdList(raw: unknown[] | null | undefined): number[] {
  if (raw == null || !Array.isArray(raw)) return [];
  const out: number[] = [];
  const seen = new Set<number>();
  for (const x of raw) {
    const n = typeof x === "number" ? x : Number(String(x));
    if (!Number.isFinite(n) || n <= 0) continue;
    const id = Math.trunc(n);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/**
 * Inserts `lab_requests`, optional `lab_request_packages`, then `lab_request_items`.
 * Rolls back the header row (and package rows) if items fail.
 */
export async function createLabRequestWithItems(
  input: CreateLabRequestInput,
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
  const clinicalDiagnosis =
    input.clinicalDiagnosis != null && input.clinicalDiagnosis.trim() !== ""
      ? input.clinicalDiagnosis.trim()
      : null;

  const packageIds = normalizeLabRequestPackageIdList(input.packageIds ?? []);

  const { data: row, error: insErr } = await supabase
    .from(LAB_REQUESTS_TABLE)
    .insert({
      encounter_id: enc === "" ? null : enc,
      patient_id: input.patientId,
      request_date,
      request_time,
      priority: input.priority.trim() || "Routine",
      referring_physician: referring,
      clinical_diagnosis: clinicalDiagnosis,
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

  if (packageIds.length > 0) {
    const pkgRows = packageIds.map((lab_package_id, sort_order) => ({
      lab_request_id: labRequestId,
      lab_package_id,
      sort_order,
    }));
    const { error: pkgErr } = await supabase.from(LAB_REQUEST_PACKAGES_TABLE).insert(pkgRows);
    if (pkgErr) {
      await supabase.from(LAB_REQUESTS_TABLE).delete().eq("id", labRequestId);
      return { labRequestId: null, error: pkgErr.message };
    }
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

/** Normalize `lab_packages.id` / junction `lab_package_id` (`bigint` / string) to positive integer or null. */
export function parseLabRequestPackageId(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  const n = typeof raw === "number" ? raw : Number(String(raw));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.trunc(n);
}

export type EncounterLabRequestSummary = {
  id: string;
  request_date: string;
  request_time: string | null;
  priority: string;
  clinical_diagnosis: string | null;
  remarks: string | null;
  created_at: string;
  labTestIds: string[];
  /** Resolved catalog rows for packages on this request (order = `lab_request_packages.sort_order`). */
  lab_packages: LabPackageDetail[];
  /** Tests that belong to at least one attached package (for mixed bundle + à la carte pricing). */
  package_covered_test_ids: string[];
};

export function labRequestPackagesDisplayNames(req: Pick<EncounterLabRequestSummary, "lab_packages">): string {
  const names = req.lab_packages.map((p) => (p.name ?? "").trim()).filter(Boolean);
  return names.join(", ");
}

/** `lab_request_id` → ordered `lab_package_id` list from `lab_request_packages`. */
export async function fetchLabRequestPackageIdsByRequestIdMap(
  db: SupabaseClient,
  requestIds: string[],
): Promise<{ map: Map<string, number[]>; error: string | null }> {
  const map = new Map<string, number[]>();
  const ids = [...new Set(requestIds.map((x) => String(x).trim()).filter(Boolean))];
  if (ids.length === 0) return { map, error: null };

  for (let i = 0; i < ids.length; i += LAB_REQ_PKG_CHUNK) {
    const chunk = ids.slice(i, i + LAB_REQ_PKG_CHUNK);
    const { data, error } = await db
      .from(LAB_REQUEST_PACKAGES_TABLE)
      .select("lab_request_id, lab_package_id, sort_order")
      .in("lab_request_id", chunk)
      .order("lab_request_id", { ascending: true })
      .order("sort_order", { ascending: true });

    if (error) return { map: new Map(), error: error.message };

    for (const row of (data ?? []) as Array<{
      lab_request_id?: string;
      lab_package_id?: unknown;
      sort_order?: number | null;
    }>) {
      const rid = String(row.lab_request_id ?? "").trim();
      const pid = parseLabRequestPackageId(row.lab_package_id);
      if (!rid || pid == null) continue;
      const list = map.get(rid) ?? [];
      list.push(pid);
      map.set(rid, list);
    }
  }

  return { map, error: null };
}

export async function attachLabRequestSummariesPackagesForDb(
  db: SupabaseClient,
  summaries: EncounterLabRequestSummary[],
): Promise<EncounterLabRequestSummary[]> {
  if (summaries.length === 0) return summaries;

  const { map: junctionMap, error: jErr } = await fetchLabRequestPackageIdsByRequestIdMap(db, summaries.map((s) => s.id));
  if (jErr) {
    return summaries.map((s) => ({ ...s, lab_packages: [], package_covered_test_ids: [] }));
  }

  const allPkgIds = [...new Set([...junctionMap.values()].flat())];
  const details = await fetchLabPackageDetailsMap(db, allPkgIds);
  if (details.error) {
    return summaries.map((s) => ({ ...s, lab_packages: [], package_covered_test_ids: [] }));
  }

  const members = await fetchLabPackageMemberTestIdsMap(db, allPkgIds);
  if (members.error) {
    return summaries.map((s) => ({ ...s, lab_packages: [], package_covered_test_ids: [] }));
  }

  return summaries.map((s) => {
    const pkgIds = junctionMap.get(s.id) ?? [];
    const lab_packages = pkgIds.map((pid) => details.byId.get(pid)).filter((x): x is LabPackageDetail => x != null);
    const covered = new Set<string>();
    for (const pid of pkgIds) {
      for (const tid of members.byPackageId.get(pid) ?? []) covered.add(tid);
    }
    return { ...s, lab_packages, package_covered_test_ids: [...covered] };
  });
}

/** Resolve `lab_packages` + `package_covered_test_ids` from `lab_request_packages` (batch). */
export async function enrichEncounterLabRequestSummariesWithPackages(
  summaries: EncounterLabRequestSummary[],
): Promise<EncounterLabRequestSummary[]> {
  return attachLabRequestSummariesPackagesForDb(supabase, summaries);
}

export type LabRequestHeaderRow = {
  id: string;
  patient_id: number | null;
  encounter_id: string | null;
  request_date: string;
  request_time: string | null;
  priority: string;
  clinical_diagnosis: string | null;
  remarks: string | null;
  created_at: string;
  lab_packages: LabPackageDetail[];
  package_covered_test_ids: string[];
};

export async function fetchLabRequestHeaderById(labRequestId: string): Promise<{
  row: LabRequestHeaderRow | null;
  error: string | null;
}> {
  const id = labRequestId.trim();
  if (!id) return { row: null, error: "Missing lab order id." };

  const { data, error } = await supabase
    .from(LAB_REQUESTS_TABLE)
    .select("id, patient_id, encounter_id, request_date, request_time, priority, clinical_diagnosis, remarks, created_at")
    .eq("id", id)
    .maybeSingle();

  if (error) return { row: null, error: error.message };
  const raw = data as Record<string, unknown> | null;
  if (!raw) return { row: null, error: null };

  const core: EncounterLabRequestSummary = {
    id: String(raw.id ?? ""),
    request_date: String(raw.request_date ?? ""),
    request_time: raw.request_time == null ? null : String(raw.request_time),
    priority: String(raw.priority ?? ""),
    clinical_diagnosis: raw.clinical_diagnosis == null ? null : String(raw.clinical_diagnosis),
    remarks: raw.remarks == null ? null : String(raw.remarks),
    created_at: String(raw.created_at ?? ""),
    labTestIds: [],
    lab_packages: [],
    package_covered_test_ids: [],
  };

  const [enriched] = await attachLabRequestSummariesPackagesForDb(supabase, [core]);

  const row: LabRequestHeaderRow = {
    id: enriched.id,
    patient_id: (() => {
      const v = raw.patient_id;
      if (v == null || v === "") return null;
      const n = typeof v === "number" ? v : Number(String(v));
      return Number.isFinite(n) ? Math.trunc(n) : null;
    })(),
    encounter_id: raw.encounter_id == null ? null : String(raw.encounter_id),
    request_date: enriched.request_date,
    request_time: enriched.request_time,
    priority: enriched.priority,
    clinical_diagnosis: enriched.clinical_diagnosis,
    remarks: enriched.remarks,
    created_at: enriched.created_at,
    lab_packages: enriched.lab_packages,
    package_covered_test_ids: enriched.package_covered_test_ids,
  };
  return { row, error: null };
}

/**
 * All lab requests for an encounter, with item test ids (newest request first).
 */
export async function fetchLabRequestsForEncounter(
  encounterId: string,
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
    .select("id, request_date, request_time, priority, clinical_diagnosis, remarks, created_at")
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
    clinical_diagnosis: string | null;
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

  const summaries: EncounterLabRequestSummary[] = requestsRaw.map((r) => ({
    id: r.id,
    request_date: r.request_date,
    request_time: r.request_time,
    priority: r.priority,
    clinical_diagnosis: r.clinical_diagnosis,
    remarks: r.remarks,
    created_at: r.created_at,
    labTestIds: byRequest.get(r.id) ?? [],
    lab_packages: [],
    package_covered_test_ids: [],
  }));

  const requests = await attachLabRequestSummariesPackagesForDb(supabase, summaries);

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

/** Package fields — used by cashier checkout (visit + standalone lab pay). */
export type LabRequestPackagePricing = Pick<EncounterLabRequestSummary, "lab_packages" | "package_covered_test_ids">;

export function labRequestPackagePriceTotal(req: LabRequestPackagePricing): number {
  let s = 0;
  for (const p of req.lab_packages) {
    if (Number.isFinite(p.package_price) && p.package_price > 0) s += p.package_price;
  }
  return s;
}

/** True when summed `package_price` on linked packages is positive (bundle has a list price). */
export function isBillingAsLabPackage(req: LabRequestPackagePricing): boolean {
  return labRequestPackagePriceTotal(req) > 0;
}

/**
 * True when member tests should not be priced à la carte: either the bundle has a positive package price,
 * or the request has package coverage rows (e.g. follow bundle even at ₱0 — do not require catalog prices on covered tests).
 */
export function labRequestUsesPackageBundling(req: LabRequestPackagePricing): boolean {
  if ((req.lab_packages?.length ?? 0) === 0) return false;
  if (labRequestPackagePriceTotal(req) > 0) return true;
  return (req.package_covered_test_ids?.length ?? 0) > 0;
}

/** Amount due for one lab request: sum of bundle list prices plus any à la carte lines not covered by those packages. */
export function labRequestCheckoutSubtotal(
  req: LabRequestPackagePricing,
  items: Array<Pick<LabRequestItemDetailRow, "id" | "lab_test_id">>,
  unitPriceByTestId: Map<string, number>,
): number {
  const pkgTotal = labRequestPackagePriceTotal(req);
  if (labRequestUsesPackageBundling(req)) {
    const cov = new Set(req.package_covered_test_ids ?? []);
    let extra = 0;
    for (const it of items) {
      if (!cov.has(it.lab_test_id)) extra += unitPriceByTestId.get(it.lab_test_id) ?? 0;
    }
    return pkgTotal + extra;
  }
  let s = 0;
  for (const it of items) {
    s += unitPriceByTestId.get(it.lab_test_id) ?? 0;
  }
  return s;
}

/** Per-line unit fee for cashier table and lab_sale_lines: bundle total on first covered line; uncovered lines use catalog. */
export function labLineCheckoutUnitFee(
  req: LabRequestPackagePricing,
  items: Array<Pick<LabRequestItemDetailRow, "id" | "lab_test_id">>,
  item: Pick<LabRequestItemDetailRow, "id" | "lab_test_id">,
  unitPriceByTestId: Map<string, number>,
): number {
  const pkgTotal = labRequestPackagePriceTotal(req);
  if (!labRequestUsesPackageBundling(req)) {
    return unitPriceByTestId.get(item.lab_test_id) ?? 0;
  }
  const cov = new Set(req.package_covered_test_ids ?? []);
  const firstCovered = items.find((it) => cov.has(it.lab_test_id));
  const anchor = cov.size > 0 ? (firstCovered ?? items[0]) : items[0];
  if (!anchor) return 0;
  if (item.id !== anchor.id) {
    if (!cov.has(item.lab_test_id)) return unitPriceByTestId.get(item.lab_test_id) ?? 0;
    return 0;
  }
  const selfExtra = cov.has(item.lab_test_id) ? 0 : unitPriceByTestId.get(item.lab_test_id) ?? 0;
  return pkgTotal + selfExtra;
}

/** True if some per-test line still has no checkout price — then Pay should stay blocked. */
export function hasUnpricedNonPackageLabLines(
  requests: Array<LabRequestPackagePricing & { id: string }>,
  labItemsByRequestId: Map<string, Array<Pick<LabRequestItemDetailRow, "lab_test_id">>>,
  unitPriceByTestId: Map<string, number>,
): boolean {
  for (const req of requests) {
    const items = labItemsByRequestId.get(req.id) ?? [];
    if (labRequestUsesPackageBundling(req)) {
      const cov = new Set(req.package_covered_test_ids ?? []);
      for (const it of items) {
        if (cov.has(it.lab_test_id)) continue;
        if ((unitPriceByTestId.get(it.lab_test_id) ?? 0) <= 0) return true;
      }
      continue;
    }
    for (const it of items) {
      if ((unitPriceByTestId.get(it.lab_test_id) ?? 0) <= 0) return true;
    }
  }
  return false;
}

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
  const testsById = new Map<
    string,
    { id: string; name: string | null; unit: string | null; reference_range: string | null }
  >();
  if (testIds.length > 0) {
    const { data: testRows, error: testErr } = await supabase
      .from("lab_tests")
      .select("id, name, unit, reference_range")
      .in("id", testIds);
    if (testErr) return { items: [], error: testErr.message };
    for (const t of (testRows ?? []) as Array<{
      id: string;
      name: string | null;
      unit: string | null;
      reference_range: string | null;
    }>) {
      testsById.set(t.id, t);
    }
  }

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
      result_unit: result?.result_unit ?? testsById.get(r.lab_test_id)?.unit ?? null,
      reference_range: result?.reference_range ?? testsById.get(r.lab_test_id)?.reference_range ?? null,
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

  const { data: reqRows, error: reqErr } = await supabase.from(LAB_REQUESTS_TABLE).select("id").eq("encounter_id", id);

  if (reqErr) return { error: reqErr.message };
  const reqIds = ((reqRows ?? []) as Array<{ id: string }>).map((r) => r.id).filter(Boolean);
  if (reqIds.length === 0) return { error: null };

  const { error: itemsErr } = await supabase.from(LAB_REQUEST_ITEMS_TABLE).delete().in("lab_request_id", reqIds);
  if (itemsErr) return { error: itemsErr.message };

  const { error: delErr } = await supabase.from(LAB_REQUESTS_TABLE).delete().in("id", reqIds);
  if (delErr) return { error: delErr.message };

  return { error: null };
}
