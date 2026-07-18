import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";
import { invalidateCachesClient } from "@/lib/cacheInvalidateClient";
import { fetchLabPackageDetailsMap, fetchLabPackageMemberTestIdsMap, fetchLabPackageIdsForTestIds, type LabPackageDetail } from "@/lib/labPackages";
import { validateEncounterLabCreate } from "@/lib/encounterDiagnosticOrderState";
import { syncUnpaidImagingItemsToPackageCoverage, ensureImagingRequestForLabPackages } from "@/lib/imagingRequests";
import { attachPanelLinksToCatalogItems } from "@/lib/labTestPanelLinks";
import {
  buildLabRequestItemRows,
  collapseComponentsToPanel,
  filterLabRequestItemsForResultEntry,
  fetchLabTestCatalogRows,
  isMissingDbColumnError,
  LAB_TESTS_TABLE,
  mapLabTestCatalogItem,
  type LabTestCatalogItem,
} from "@/lib/labTests";

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
  /** Skip duplicate-check fetch when the caller already replaced encounter lab state (e.g. `isNew` full replace). */
  skipEncounterValidation?: boolean;
};

import { clinicDateYmd, clinicTimeHms } from "@/lib/queueTicketDate";

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
  const packageIds = normalizeLabRequestPackageIdList(input.packageIds ?? []);
  if (ids.length === 0 && packageIds.length === 0) {
    return { labRequestId: null, error: "Select at least one lab test or package." };
  }

  const enc = input.encounterId != null ? String(input.encounterId).trim() : "";
  if (input.encounterId != null && enc === "") {
    return { labRequestId: null, error: "Invalid encounter." };
  }
  if (input.encounterId == null && (input.patientId == null || !Number.isFinite(input.patientId) || input.patientId <= 0)) {
    return { labRequestId: null, error: "Walk-in lab orders require a patient." };
  }

  let labTestIdsToSave = ids;
  let packageIdsToSave = packageIds;
  let catalog: LabTestCatalogItem[] | null = null;

  const loadCatalog = async (): Promise<{ catalog: LabTestCatalogItem[]; error: string | null }> => {
    if (catalog) return { catalog, error: null };
    const catalogFetch = await fetchLabTestCatalogRows(supabase);
    if (catalogFetch.error) return { catalog: [], error: catalogFetch.error };
    let rows = catalogFetch.rows.map((raw) => mapLabTestCatalogItem(raw));
    const attached = await attachPanelLinksToCatalogItems(supabase, rows);
    if (attached.error) return { catalog: [], error: attached.error };
    catalog = attached.tests;
    return { catalog, error: null };
  };

  if (enc && !input.skipEncounterValidation) {
    const loaded = await loadCatalog();
    if (loaded.error) return { labRequestId: null, error: loaded.error };
    const validated = await validateEncounterLabCreate(supabase, enc, ids, packageIds, loaded.catalog);
    if (validated.error) return { labRequestId: null, error: validated.error };
    labTestIdsToSave = validated.labTestIds;
    packageIdsToSave = validated.packageIds;
  }

  // Ensure package member tests are always persisted as items (lab queue / results),
  // even if the caller only passed packageIds.
  if (packageIdsToSave.length > 0) {
    const members = await fetchLabPackageMemberTestIdsMap(supabase, packageIdsToSave);
    if (members.error) return { labRequestId: null, error: members.error };
    const merged = new Set(labTestIdsToSave);
    for (const list of members.byPackageId.values()) {
      for (const tid of list) merged.add(tid);
    }
    if (merged.size > labTestIdsToSave.length) {
      const loaded = await loadCatalog();
      if (loaded.error) return { labRequestId: null, error: loaded.error };
      labTestIdsToSave = collapseComponentsToPanel([...merged], loaded.catalog);
    }
  }

  if (labTestIdsToSave.length === 0 && packageIdsToSave.length === 0) {
    return { labRequestId: null, error: "Select at least one lab test or package." };
  }

  const now = new Date();
  const request_date = clinicDateYmd(now);
  const request_time = clinicTimeHms(now);

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

  if (packageIdsToSave.length > 0) {
    const pkgRows = packageIdsToSave.map((lab_package_id, sort_order) => ({
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

  if (labTestIdsToSave.length > 0) {
    const loaded = await loadCatalog();
    if (loaded.error) {
      await supabase.from(LAB_REQUESTS_TABLE).delete().eq("id", labRequestId);
      return { labRequestId: null, error: loaded.error };
    }

    const itemSpecs = buildLabRequestItemRows(labTestIdsToSave, loaded.catalog);
    const items = itemSpecs.map((row) => ({
      lab_request_id: labRequestId,
      lab_test_id: row.lab_test_id,
      notes: null as string | null,
      priority: itemPriority,
      is_billable: row.is_billable,
    }));

    const { error: itemsErr } = await supabase.from(LAB_REQUEST_ITEMS_TABLE).insert(items);

    if (itemsErr) {
      await supabase.from(LAB_REQUESTS_TABLE).delete().eq("id", labRequestId);
      return { labRequestId: null, error: itemsErr.message };
    }
  }

  if (enc && packageIdsToSave.length > 0) {
    const sync = await syncUnpaidImagingItemsToPackageCoverage(supabase, enc, packageIdsToSave);
    if (sync.error) {
      await supabase.from(LAB_REQUESTS_TABLE).delete().eq("id", labRequestId);
      return { labRequestId: null, error: sync.error };
    }
    const ensured = await ensureImagingRequestForLabPackages(supabase, {
      encounterId: enc,
      patientId: input.patientId,
      packageIds: packageIdsToSave,
      remarks: "Laboratory package imaging",
    });
    if (ensured.error) {
      await supabase.from(LAB_REQUESTS_TABLE).delete().eq("id", labRequestId);
      return { labRequestId: null, error: ensured.error };
    }
  }

  invalidateCachesClient(["report"]);

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

/** Package junction ids only — skips package detail + member test lookups (faster modal open). */
async function attachLabRequestPackageIdsOnly(
  db: SupabaseClient,
  summaries: EncounterLabRequestSummary[],
): Promise<EncounterLabRequestSummary[]> {
  if (summaries.length === 0) return summaries;

  const { map: junctionMap, error: jErr } = await fetchLabRequestPackageIdsByRequestIdMap(
    db,
    summaries.map((s) => s.id),
  );
  if (jErr) {
    return summaries.map((s) => ({ ...s, lab_packages: [], package_covered_test_ids: [] }));
  }

  return summaries.map((s) => {
    const pkgIds = junctionMap.get(s.id) ?? [];
    const lab_packages = pkgIds.map((pid) => ({
      id: pid,
      name: "",
      description: null,
      package_price: 0,
    }));
    return { ...s, lab_packages, package_covered_test_ids: [] };
  });
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
export type FetchLabRequestsForEncounterOptions = {
  /** When false, only junction package ids are loaded (faster). Default true. */
  includePackageDetails?: boolean;
};

export type FetchLabRequestsForEncounterResult = {
  requests: EncounterLabRequestSummary[];
  requestedTestIds: string[];
  requestedPackageIds: number[];
  storedItems: LabRequestItemStoredRow[];
  error: string | null;
};

export async function fetchLabRequestsForEncounter(
  encounterId: string,
  options?: FetchLabRequestsForEncounterOptions,
): Promise<FetchLabRequestsForEncounterResult> {
  const includePackageDetails = options?.includePackageDetails !== false;
  const id = encounterId.trim();
  if (!id) {
    return { requests: [], requestedTestIds: [], requestedPackageIds: [], storedItems: [], error: null };
  }

  const { data: reqRows, error: reqErr } = await supabase
    .from(LAB_REQUESTS_TABLE)
    .select("id, request_date, request_time, priority, clinical_diagnosis, remarks, created_at")
    .eq("encounter_id", id)
    .order("created_at", { ascending: false });

  if (reqErr) {
    return { requests: [], requestedTestIds: [], requestedPackageIds: [], storedItems: [], error: reqErr.message };
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
    return { requests: [], requestedTestIds: [], requestedPackageIds: [], storedItems: [], error: null };
  }

  const requestIds = requestsRaw.map((r) => r.id);
  const itemRes = await fetchLabRequestItemsForRequestIds(supabase, requestIds);
  if (itemRes.error) {
    return { requests: [], requestedTestIds: [], requestedPackageIds: [], storedItems: [], error: itemRes.error };
  }

  const items = itemRes.items;
  const byRequest = new Map<string, string[]>();
  const allTestIds = new Set<string>();
  for (const row of items) {
    if (!row.is_billable) continue;
    const list = byRequest.get(row.lab_request_id) ?? [];
    list.push(row.lab_test_id);
    byRequest.set(row.lab_request_id, list);
    allTestIds.add(row.lab_test_id);
  }
  for (const row of items) {
    if (row.is_billable) continue;
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

  const requests = includePackageDetails
    ? await attachLabRequestSummariesPackagesForDb(supabase, summaries)
    : await attachLabRequestPackageIdsOnly(supabase, summaries);

  const requestedPackageIds = [
    ...new Set(
      requests.flatMap((r) => r.lab_packages.map((p) => p.id)).filter((n) => Number.isFinite(n) && n > 0),
    ),
  ];

  return {
    requests,
    requestedTestIds: [...allTestIds],
    requestedPackageIds,
    storedItems: items,
    error: null,
  };
}

export type LabRequestItemDetailRow = {
  id: string;
  lab_request_id: string;
  lab_test_id: string;
  is_billable: boolean;
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

export type LabDisplayPricedItem = { name: string; price: number; testId?: string };

export type LabPackageDisplayLookup = ReadonlyMap<number, { name: string; package_price: number }>;

function packageDetailsFromRequestAndLookup(
  req: EncounterLabRequestSummary,
  lookup: LabPackageDisplayLookup | undefined,
): LabPackageDisplayLookup {
  const m = new Map<number, { name: string; package_price: number }>();
  for (const pkg of req.lab_packages ?? []) {
    const n = parseLabRequestPackageId(pkg.id);
    if (n == null) continue;
    m.set(n, { name: pkg.name ?? "", package_price: pkg.package_price ?? 0 });
  }
  if (lookup) {
    for (const [n, d] of lookup) {
      if (!m.has(n)) m.set(n, d);
    }
  }
  return m;
}

function groupUnsoldTestsAsCatalogPackages(
  unsoldTestIds: readonly string[],
  membersByPackageId: ReadonlyMap<number, readonly string[]>,
  packageDetailsByNum: LabPackageDisplayLookup,
  priceMap: Map<string, number>,
): { items: LabDisplayPricedItem[]; accounted: Set<string> } {
  const unsoldSet = new Set(unsoldTestIds);
  const items: LabDisplayPricedItem[] = [];
  const accounted = new Set<string>();
  const pkgNums = [...membersByPackageId.keys()].sort(
    (a, b) => (membersByPackageId.get(b)?.length ?? 0) - (membersByPackageId.get(a)?.length ?? 0),
  );

  for (const pkgNum of pkgNums) {
    const members = membersByPackageId.get(pkgNum) ?? [];
    if (members.length === 0) continue;
    const allMembersUnsold = members.every((m) => unsoldSet.has(m) && !accounted.has(m));
    if (!allMembersUnsold) continue;
    const detail = packageDetailsByNum.get(pkgNum);
    const label = detail?.name?.trim() || `Package #${pkgNum}`;
    const catalogPrice = detail?.package_price ?? 0;
    const price =
      catalogPrice > 0
        ? catalogPrice
        : roundMoney2(members.reduce((s, tid) => s + (priceMap.get(tid) ?? 0), 0));
    items.push({ name: `${label} (laboratory package)`, price });
    for (const m of members) accounted.add(m);
  }
  return { items, accounted };
}

function roundMoney2(n: number): number {
  return Math.round(n * 100) / 100;
}

function packageMemberTestIdsForDisplay(
  req: EncounterLabRequestSummary,
  pkg: LabPackageDetail,
  membersByPackageId: ReadonlyMap<number, readonly string[]> | undefined,
): string[] {
  const pkgNum = parseLabRequestPackageId(pkg.id);
  if (pkgNum != null && membersByPackageId?.has(pkgNum)) {
    return [...(membersByPackageId.get(pkgNum) ?? [])];
  }
  if ((req.lab_packages?.length ?? 0) === 1) {
    return [...(req.package_covered_test_ids ?? [])];
  }
  return [];
}

/** Display lines for an unpaid lab request (cashier / charges — package bundle + à la carte). */
export function buildLabDueDisplayItemsForRequest(
  req: EncounterLabRequestSummary,
  priceMap: Map<string, number>,
  testsById: Map<string, { name: string }>,
  membersByPackageId?: ReadonlyMap<number, readonly string[]>,
  packageDetailsLookup?: LabPackageDisplayLookup,
): LabDisplayPricedItem[] {
  const cov = new Set(req.package_covered_test_ids ?? []);
  if (labRequestUsesPackageBundling(req)) {
    const items: LabDisplayPricedItem[] = [];
    for (const pkg of req.lab_packages) {
      const p = Number.isFinite(pkg.package_price) ? pkg.package_price : 0;
      const label = (pkg.name ?? "").trim() || "Laboratory package";
      items.push({ name: `${label} (laboratory package)`, price: p });
    }
    for (const tid of req.labTestIds) {
      if (cov.has(tid)) continue;
      items.push({
        name: testsById.get(tid)?.name ?? `Lab test ${tid.slice(0, 8)}…`,
        price: priceMap.get(tid) ?? 0,
        testId: tid,
      });
    }
    return items;
  }

  if (membersByPackageId && membersByPackageId.size > 0 && req.labTestIds.length > 0) {
    const details = packageDetailsFromRequestAndLookup(req, packageDetailsLookup);
    const grouped = groupUnsoldTestsAsCatalogPackages(
      req.labTestIds,
      membersByPackageId,
      details,
      priceMap,
    );
    if (grouped.items.length > 0) {
      const items: LabDisplayPricedItem[] = [...grouped.items];
      for (const tid of req.labTestIds) {
        if (grouped.accounted.has(tid)) continue;
        items.push({
          name: testsById.get(tid)?.name ?? `Lab test ${tid.slice(0, 8)}…`,
          price: priceMap.get(tid) ?? 0,
          testId: tid,
        });
      }
      return items;
    }
  }

  return req.labTestIds.map((tid) => ({
    name: testsById.get(tid)?.name ?? `Lab test ${tid.slice(0, 8)}…`,
    price: priceMap.get(tid) ?? 0,
    testId: tid,
  }));
}

/** Display lines for billable tests on a paid request that are not yet on a lab_sale. */
export function buildLabAdditionalDueDisplayItems(
  req: EncounterLabRequestSummary,
  soldTestIds: ReadonlySet<string>,
  priceMap: Map<string, number>,
  testsById: Map<string, { name: string }>,
  membersByPackageId?: ReadonlyMap<number, readonly string[]>,
  packageDetailsLookup?: LabPackageDisplayLookup,
): LabDisplayPricedItem[] {
  const unsoldTestIds = req.labTestIds
    .map((tid) => String(tid).trim())
    .filter((id) => id && !soldTestIds.has(id));
  if (unsoldTestIds.length === 0) return [];

  const unsoldSet = new Set(unsoldTestIds);
  const items: LabDisplayPricedItem[] = [];
  const accounted = new Set<string>();
  const details = packageDetailsFromRequestAndLookup(req, packageDetailsLookup);

  if (labRequestUsesPackageBundling(req)) {
    for (const pkg of req.lab_packages) {
      const memberIds = packageMemberTestIdsForDisplay(req, pkg, membersByPackageId);
      const unsoldMembers = memberIds.filter((tid) => unsoldSet.has(tid));
      if (unsoldMembers.length === 0) continue;
      const p = Number.isFinite(pkg.package_price) ? pkg.package_price : 0;
      const label = (pkg.name ?? "").trim() || "Laboratory package";
      items.push({ name: `${label} (laboratory package)`, price: p });
      for (const tid of unsoldMembers) accounted.add(tid);
    }
    for (const tid of unsoldTestIds) {
      if (accounted.has(tid)) continue;
      items.push({
        name: testsById.get(tid)?.name ?? `Lab test ${tid.slice(0, 8)}…`,
        price: priceMap.get(tid) ?? 0,
        testId: tid,
      });
    }
    if (items.some((it) => !it.testId)) return items;
  }

  if (membersByPackageId && membersByPackageId.size > 0) {
    const grouped = groupUnsoldTestsAsCatalogPackages(
      unsoldTestIds,
      membersByPackageId,
      details,
      priceMap,
    );
    if (grouped.items.length > 0) {
      const out: LabDisplayPricedItem[] = [...grouped.items];
      for (const tid of unsoldTestIds) {
        if (grouped.accounted.has(tid)) continue;
        out.push({
          name: testsById.get(tid)?.name ?? `Lab test ${tid.slice(0, 8)}…`,
          price: priceMap.get(tid) ?? 0,
          testId: tid,
        });
      }
      return out;
    }
  }

  return unsoldTestIds.map((tid) => ({
    name: testsById.get(tid)?.name ?? `Lab test ${tid.slice(0, 8)}…`,
    price: priceMap.get(tid) ?? 0,
    testId: tid,
  }));
}

/** Load package members + names for display grouping (junction rows + catalog inference from test ids). */
export async function resolveLabPackageDisplayContext(
  testIds: string[],
  junctionPackageNums: number[],
): Promise<{
  membersByPackageId: Map<number, string[]>;
  packageDetailsLookup: Map<number, { name: string; package_price: number }>;
  error: string | null;
}> {
  const inferred = await fetchLabPackageIdsForTestIds(supabase, testIds);
  if (inferred.error) {
    return { membersByPackageId: new Map(), packageDetailsLookup: new Map(), error: inferred.error };
  }
  const allNums = [
    ...new Set([
      ...junctionPackageNums.filter((n) => Number.isFinite(n) && n > 0),
      ...inferred.packageIds,
    ]),
  ];
  if (allNums.length === 0) {
    return { membersByPackageId: new Map(), packageDetailsLookup: new Map(), error: null };
  }
  const members = await fetchLabPackageMemberTestIdsMap(supabase, allNums);
  if (members.error) {
    return { membersByPackageId: new Map(), packageDetailsLookup: new Map(), error: members.error };
  }
  const details = await fetchLabPackageDetailsMap(supabase, allNums);
  if (details.error) {
    return { membersByPackageId: new Map(), packageDetailsLookup: new Map(), error: details.error };
  }
  const packageDetailsLookup = new Map<number, { name: string; package_price: number }>();
  for (const [n, d] of details.byId) {
    packageDetailsLookup.set(n, { name: d.name, package_price: d.package_price });
  }
  return { membersByPackageId: members.byPackageId, packageDetailsLookup, error: null };
}

/** `lab_test_id`s on `lab_sale_items` for the given requests (actually paid at cashier). */
export async function fetchLabSoldTestIdsByRequestIds(
  requestIds: string[],
): Promise<{ soldTestIds: Set<string>; error: string | null }> {
  const ids = [...new Set(requestIds.map((x) => String(x).trim()).filter(Boolean))];
  const soldTestIds = new Set<string>();
  if (ids.length === 0) return { soldTestIds, error: null };

  const { data: sales, error: sErr } = await supabase
    .from("lab_sales")
    .select("id, lab_request_id")
    .in("lab_request_id", ids);
  if (sErr) return { soldTestIds, error: sErr.message };

  const saleIds = ((sales ?? []) as Array<{ id?: string | null }>)
    .map((r) => String(r.id ?? "").trim())
    .filter(Boolean);
  if (saleIds.length === 0) return { soldTestIds, error: null };

  const { data: lines, error: lErr } = await supabase
    .from("lab_sale_items")
    .select("lab_test_id")
    .in("lab_sale_id", saleIds);
  if (lErr) return { soldTestIds, error: lErr.message };

  for (const row of (lines ?? []) as Array<{ lab_test_id?: string | null }>) {
    const tid = String(row.lab_test_id ?? "").trim();
    if (tid) soldTestIds.add(tid);
  }
  return { soldTestIds, error: null };
}

export type FetchLabRequestItemDetailsOptions = {
  /** When true (default), only billable rows for cashier; applies legacy panel collapse when needed. */
  billableOnly?: boolean;
  /** When true, only result-entry rows for lab results (non-billable + legacy component rows). */
  resultEntryOnly?: boolean;
};

type LabRequestItemRawRow = {
  id: string;
  lab_request_id: string;
  lab_test_id: string;
  is_billable: boolean;
  notes: string | null;
  priority: string | null;
};

function isMissingOptionalItemColumnError(message: string | undefined): boolean {
  return (
    isMissingDbColumnError(message, "is_billable") || isMissingDbColumnError(message, "collected_item")
  );
}

/** Billable when orderable; non-orderable catalog rows are result-entry components. */
function inferLabRequestItemBillable(testId: string, catalog: LabTestCatalogItem[]): boolean {
  const t = catalog.find((x) => x.id === testId);
  if (!t) return true;
  return t.is_orderable !== false;
}

export type LabRequestItemStoredRow = {
  id: string;
  lab_request_id: string;
  lab_test_id: string;
  is_billable: boolean;
  notes: string | null;
  priority: string | null;
  collected_item?: string | null;
};

/**
 * Loads lab_request_items with `is_billable` when the column exists; otherwise infers from catalog.
 * Retries without `is_billable` when the migration has not been applied yet.
 */
export async function fetchLabRequestItemsForRequestIds(
  db: SupabaseClient,
  requestIds: string[],
): Promise<{ items: LabRequestItemStoredRow[]; error: string | null }> {
  const ids = [...new Set(requestIds.map((x) => String(x).trim()).filter(Boolean))];
  if (ids.length === 0) return { items: [], error: null };

  const selectFull = "id, lab_request_id, lab_test_id, is_billable, notes, priority, collected_item";
  const selectMinimal = "id, lab_request_id, lab_test_id, notes, priority";

  const first = await db.from(LAB_REQUEST_ITEMS_TABLE).select(selectFull).in("lab_request_id", ids);

  let usedLegacySelect = false;
  let rows: Array<Record<string, unknown>> = [];
  if (first.error && isMissingOptionalItemColumnError(first.error.message)) {
    usedLegacySelect = true;
    const retry = await db.from(LAB_REQUEST_ITEMS_TABLE).select(selectMinimal).in("lab_request_id", ids);
    if (retry.error) return { items: [], error: retry.error.message };
    rows = (retry.data ?? []) as Array<Record<string, unknown>>;
  } else if (first.error) {
    return { items: [], error: first.error.message };
  } else {
    rows = (first.data ?? []) as Array<Record<string, unknown>>;
  }

  let items: LabRequestItemStoredRow[] = rows.map((r) => ({
    id: String(r.id ?? ""),
    lab_request_id: String(r.lab_request_id),
    lab_test_id: String(r.lab_test_id),
    is_billable: usedLegacySelect ? true : r.is_billable !== false,
    notes: (r.notes as string | null) ?? null,
    priority: (r.priority as string | null) ?? null,
    collected_item: (r.collected_item as string | null) ?? null,
  }));

  if (usedLegacySelect) {
    const testIds = [...new Set(items.map((i) => i.lab_test_id))];
    const catRes = await loadLabTestCatalogForTestIds(db, testIds);
    if (catRes.error) return { items: [], error: catRes.error };
    items = items.map((row) => ({
      ...row,
      is_billable: inferLabRequestItemBillable(row.lab_test_id, catRes.catalog),
    }));
  }

  return { items, error: null };
}

export async function loadLabTestCatalogForTestIds(
  db: SupabaseClient,
  testIds: string[],
): Promise<{ catalog: LabTestCatalogItem[]; error: string | null }> {
  const ids = [...new Set(testIds.map((x) => String(x).trim()).filter(Boolean))];
  if (ids.length === 0) return { catalog: [], error: null };

  const fetched = await fetchLabTestCatalogRows(db, { testIds: ids });
  if (fetched.error) return { catalog: [], error: fetched.error };

  let catalog = fetched.rows.map((raw) => mapLabTestCatalogItem(raw));
  const attached = await attachPanelLinksToCatalogItems(db, catalog);
  if (attached.error) return { catalog: [], error: attached.error };
  return { catalog: attached.tests, error: null };
}

async function loadLabTestOrderableMap(testIds: string[]): Promise<Map<string, boolean>> {
  const map = new Map<string, boolean>();
  const ids = [...new Set(testIds.filter(Boolean))];
  if (ids.length === 0) return map;
  const { data, error } = await supabase.from(LAB_TESTS_TABLE).select("id, is_orderable").in("id", ids);
  if (error) return map;
  for (const t of (data ?? []) as Array<{ id: string; is_orderable?: boolean | null }>) {
    map.set(t.id, t.is_orderable !== false);
  }
  return map;
}

async function loadPanelIdByComponentIdMap(componentIds: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const ids = [...new Set(componentIds.filter(Boolean))];
  if (ids.length === 0) return map;
  const { data, error } = await supabase
    .from("lab_test_panel_links")
    .select("panel_lab_test_id, component_lab_test_id")
    .in("component_lab_test_id", ids);
  if (error) return map;
  for (const l of (data ?? []) as Array<{
    panel_lab_test_id: string;
    component_lab_test_id: string;
  }>) {
    if (!map.has(l.component_lab_test_id)) map.set(l.component_lab_test_id, l.panel_lab_test_id);
  }
  return map;
}

/** One billable line per panel when legacy orders only have component rows (or none marked billable). */
async function fetchLegacyBillablePanelItemsForRequestIds(requestIds: string[]): Promise<{
  items: LabRequestItemRawRow[];
  error: string | null;
}> {
  const stored = await fetchLabRequestItemsForRequestIds(supabase, requestIds);
  if (stored.error) return { items: [], error: stored.error };

  const all = stored.items as LabRequestItemRawRow[];
  const orderable = await loadLabTestOrderableMap(all.map((r) => r.lab_test_id));
  const componentRows = all.filter((r) => orderable.get(r.lab_test_id) === false);
  if (componentRows.length === 0) return { items: [], error: null };

  const panelByComponent = await loadPanelIdByComponentIdMap(componentRows.map((r) => r.lab_test_id));
  const byReqPanel = new Map<string, LabRequestItemRawRow>();

  for (const row of componentRows) {
    const panelId = panelByComponent.get(row.lab_test_id);
    if (!panelId) continue;
    const key = `${row.lab_request_id}\0${panelId}`;
    if (!byReqPanel.has(key)) {
      byReqPanel.set(key, {
        ...row,
        lab_test_id: panelId,
        is_billable: true,
      });
    }
  }

  return { items: [...byReqPanel.values()], error: null };
}

/** Pre-migration orders: many billable component lines → one panel line each for checkout. */
async function collapseLegacyBillableComponentLines(
  rows: LabRequestItemRawRow[],
): Promise<LabRequestItemRawRow[]> {
  if (rows.length === 0) return rows;
  const orderable = await loadLabTestOrderableMap(rows.map((r) => r.lab_test_id));
  const allComponents = rows.every((r) => orderable.get(r.lab_test_id) === false);
  if (!allComponents) return rows;

  const legacy = await fetchLegacyBillablePanelItemsForRequestIds([
    ...new Set(rows.map((r) => r.lab_request_id)),
  ]);
  return legacy.error || legacy.items.length === 0 ? rows : legacy.items;
}

/** All `lab_request_items` rows for the given requests, with `lab_tests.name`. */
export async function fetchLabRequestItemDetailsForRequestIds(
  requestIds: string[],
  options: FetchLabRequestItemDetailsOptions = {},
): Promise<{
  items: LabRequestItemDetailRow[];
  error: string | null;
}> {
  const billableOnly = options.billableOnly !== false;
  const resultEntryOnly = options.resultEntryOnly === true;
  const ids = [...new Set(requestIds.map((x) => String(x).trim()).filter(Boolean))];
  if (ids.length === 0) return { items: [], error: null };

  const stored = await fetchLabRequestItemsForRequestIds(supabase, ids);
  if (stored.error) return { items: [], error: stored.error };

  let raw: LabRequestItemRawRow[] = stored.items;

  if (resultEntryOnly) {
    const testIds = [...new Set(raw.map((r) => r.lab_test_id).filter(Boolean))];
    const catRes = await loadLabTestCatalogForTestIds(supabase, testIds);
    if (catRes.error) return { items: [], error: catRes.error };
    raw = filterLabRequestItemsForResultEntry(raw, catRes.catalog);
  } else if (billableOnly) {
    raw = raw.filter((r) => r.is_billable);
    if (raw.length === 0) {
      const legacy = await fetchLegacyBillablePanelItemsForRequestIds(ids);
      if (legacy.error) return { items: [], error: legacy.error };
      raw = legacy.items;
    } else {
      raw = await collapseLegacyBillableComponentLines(raw);
    }
  }

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
      is_billable: r.is_billable !== false,
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

  const { error: pkgErr } = await supabase.from(LAB_REQUEST_PACKAGES_TABLE).delete().in("lab_request_id", reqIds);
  if (pkgErr) return { error: pkgErr.message };

  const { error: delErr } = await supabase.from(LAB_REQUESTS_TABLE).delete().in("id", reqIds);
  if (delErr) return { error: delErr.message };

  return { error: null };
}

/** Delete lab requests on an encounter that have no `lab_sales` row (unpaid at cashier). */
export async function deleteUnpaidLabRequestsForEncounter(
  encounterId: string,
): Promise<{ error: string | null }> {
  const id = encounterId.trim();
  if (!id) return { error: null };

  const { data: reqRows, error: reqErr } = await supabase
    .from(LAB_REQUESTS_TABLE)
    .select("id")
    .eq("encounter_id", id);
  if (reqErr) return { error: reqErr.message };

  const reqIds = ((reqRows ?? []) as Array<{ id: string }>).map((r) => r.id).filter(Boolean);
  if (reqIds.length === 0) return { error: null };

  const { data: salesRows, error: salesErr } = await supabase
    .from("lab_sales")
    .select("lab_request_id")
    .in("lab_request_id", reqIds);
  if (salesErr) return { error: salesErr.message };

  const paidReqIds = new Set(
    ((salesRows ?? []) as Array<{ lab_request_id?: string | null }>)
      .map((r) => String(r.lab_request_id ?? "").trim())
      .filter(Boolean),
  );
  const unpaidReqIds = reqIds.filter((rid) => !paidReqIds.has(rid));
  if (unpaidReqIds.length === 0) return { error: null };

  const { error: itemsErr } = await supabase
    .from(LAB_REQUEST_ITEMS_TABLE)
    .delete()
    .in("lab_request_id", unpaidReqIds);
  if (itemsErr) return { error: itemsErr.message };

  const { error: pkgErr } = await supabase
    .from(LAB_REQUEST_PACKAGES_TABLE)
    .delete()
    .in("lab_request_id", unpaidReqIds);
  if (pkgErr) return { error: pkgErr.message };

  const { error: delErr } = await supabase.from(LAB_REQUESTS_TABLE).delete().in("id", unpaidReqIds);
  if (delErr) return { error: delErr.message };

  return { error: null };
}
