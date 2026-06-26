import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";
import type { ImagingCatalogRow, ImagingLineSelection } from "@/lib/imagingCatalog";
import {
  collapseComponentsToPanel,
  isLabPackageTestSatisfiedInUI,
  type LabTestCatalogItem,
} from "@/lib/labTests";
import { parseLabRequestPackageId, type EncounterLabRequestSummary } from "@/lib/labRequests";

export const LAB_PACKAGES_TABLE = "lab_packages" as const;
export const LAB_PACKAGE_TESTS_TABLE = "lab_package_tests" as const;
export const LAB_PACKAGE_IMAGING_TABLE = "lab_package_imaging" as const;

export type LabPackageRow = {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  sort_order: number | null;
  package_price: number;
};

export type LabPackageWithTests = LabPackageRow & {
  labTestIds: string[];
  imagingCatalogIds: string[];
};

/** Resolved row for cashier / APIs (bigint id normalized to number). */
export type LabPackageDetail = {
  id: number;
  name: string;
  description: string | null;
  package_price: number;
};

function numPrice(v: unknown): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : Number(String(v));
  return Number.isFinite(n) ? n : 0;
}

export function labPackageHasMembers(
  pkg: Pick<LabPackageWithTests, "labTestIds" | "imagingCatalogIds">,
): boolean {
  return (pkg.labTestIds?.length ?? 0) > 0 || (pkg.imagingCatalogIds?.length ?? 0) > 0;
}

/** Toggle imaging catalog checkboxes when a package is selected or cleared. */
export function applyPackageImagingSelection(
  imagingCatalogIds: string[],
  catalog: ImagingCatalogRow[],
  current: Record<string, ImagingLineSelection>,
  checked: boolean,
): Record<string, ImagingLineSelection> {
  const next = { ...current };
  for (const catalogId of imagingCatalogIds) {
    const code = resolveImagingCatalogCode(catalog, catalogId);
    if (!code) continue;
    next[code] = { ...(next[code] ?? { checked: false, view: "" }), checked };
  }
  return next;
}

function resolveImagingCatalogCode(catalog: ImagingCatalogRow[], catalogId: string): string | null {
  const needle = String(catalogId ?? "").trim();
  if (!needle) return null;
  const needleLower = needle.toLowerCase();
  const row =
    catalog.find((c) => String(c.id).trim().toLowerCase() === needleLower) ??
    catalog.find((c) => String(c.code ?? "").trim().toLowerCase() === needleLower);
  return row?.code?.trim() || null;
}

function packageIdSelected(selectedPackageIds: ReadonlySet<string>, packageId: string): boolean {
  const pid = String(packageId).trim();
  if (!pid) return false;
  for (const id of selectedPackageIds) {
    if (String(id).trim() === pid) return true;
  }
  return false;
}

/** All imaging study codes that appear on any package definition. */
export function packageMemberImagingCodes(
  packages: LabPackageWithTests[],
  catalog: ImagingCatalogRow[],
): Set<string> {
  const codes = new Set<string>();
  for (const pkg of packages) {
    for (const catalogId of pkg.imagingCatalogIds ?? []) {
      const code = resolveImagingCatalogCode(catalog, catalogId);
      if (code) codes.add(code);
    }
  }
  return codes;
}

/**
 * Keep package-member imaging checkboxes aligned with selected packages.
 * Unchecks studies no longer covered; checks newly covered package members.
 */
export function syncImagingFormWithSelectedPackages(
  packages: LabPackageWithTests[],
  selectedPackageIds: ReadonlySet<string>,
  catalog: ImagingCatalogRow[],
  current: Record<string, ImagingLineSelection>,
): Record<string, ImagingLineSelection> {
  if (catalog.length === 0) return current;
  const covered = imagingCatalogCodesCoveredByPackages(packages, selectedPackageIds, catalog);
  const memberCodes = packageMemberImagingCodes(packages, catalog);
  const next = { ...current };
  let changed = false;
  for (const code of memberCodes) {
    const wantChecked = covered.has(code);
    const cur = next[code] ?? { checked: false, view: "" };
    if (wantChecked) {
      if (!cur.checked) {
        next[code] = { ...cur, checked: true };
        changed = true;
      }
    } else if (cur.checked) {
      next[code] = { checked: false, view: "" };
      changed = true;
    }
  }
  return changed ? next : current;
}

/** Uncheck a removed package's imaging, then reconcile with remaining selections. */
export function applyRemovedPackageImagingSelection(
  removedPackage: Pick<LabPackageWithTests, "imagingCatalogIds">,
  allPackages: LabPackageWithTests[],
  selectedPackageIdsAfterRemoval: ReadonlySet<string>,
  catalog: ImagingCatalogRow[],
  current: Record<string, ImagingLineSelection>,
): Record<string, ImagingLineSelection> {
  const afterRemoval = applyPackageImagingSelection(
    removedPackage.imagingCatalogIds ?? [],
    catalog,
    current,
    false,
  );
  return syncImagingFormWithSelectedPackages(
    allPackages,
    selectedPackageIdsAfterRemoval,
    catalog,
    afterRemoval,
  );
}

/** Uncheck imaging from a removed package unless another selected package still includes it. */
export function removePackageImagingFromSelection(
  removedPackage: Pick<LabPackageWithTests, "imagingCatalogIds">,
  allPackages: LabPackageWithTests[],
  selectedPackageIdsAfterRemoval: ReadonlySet<string>,
  catalog: ImagingCatalogRow[],
  current: Record<string, ImagingLineSelection>,
): Record<string, ImagingLineSelection> {
  return applyRemovedPackageImagingSelection(
    removedPackage,
    allPackages,
    selectedPackageIdsAfterRemoval,
    catalog,
    current,
  );
}

/** Apply all selected packages' imaging members as checked. */
export function mergeSelectedPackagesImagingSelection(
  packages: LabPackageWithTests[],
  selectedPackageIds: Set<string>,
  catalog: ImagingCatalogRow[],
  current: Record<string, ImagingLineSelection>,
): Record<string, ImagingLineSelection> {
  let next = { ...current };
  for (const pkg of packages) {
    if (!packageIdSelected(selectedPackageIds, pkg.id)) continue;
    next = applyPackageImagingSelection(pkg.imagingCatalogIds ?? [], catalog, next, true);
  }
  return next;
}

export function imagingCatalogCodesCoveredByPackages(
  packages: LabPackageWithTests[],
  selectedPackageIds: ReadonlySet<string>,
  catalog: ImagingCatalogRow[],
): Set<string> {
  const codes = new Set<string>();
  for (const pkg of packages) {
    if (!packageIdSelected(selectedPackageIds, pkg.id)) continue;
    for (const catalogId of pkg.imagingCatalogIds ?? []) {
      const code = resolveImagingCatalogCode(catalog, catalogId);
      if (code) codes.add(code);
    }
  }
  return codes;
}

/** Package ids from UI selection plus packages already linked on saved lab requests. */
export function collectActivePackageIds(
  selectedPackageIds: Set<string>,
  savedPackages: Array<{ id: number }>,
): Set<string> {
  const ids = new Set<string>();
  for (const raw of selectedPackageIds) {
    const t = String(raw).trim();
    if (t) ids.add(t);
  }
  for (const p of savedPackages) {
    const n = typeof p.id === "number" ? Math.trunc(p.id) : Math.trunc(Number(String(p.id)));
    if (Number.isFinite(n) && n > 0) ids.add(String(n));
  }
  return ids;
}

export function imagingCatalogCodesCoveredByActivePackages(
  packages: LabPackageWithTests[],
  selectedPackageIds: Set<string>,
  savedPackages: Array<{ id: number }>,
  catalog: ImagingCatalogRow[],
): Set<string> {
  const activeIds = collectActivePackageIds(selectedPackageIds, savedPackages);
  return imagingCatalogCodesCoveredByPackages(packages, activeIds, catalog);
}

export type LabPackageAddConflict = {
  labTestNames: string[];
  imagingStudyNames: string[];
};

const EMPTY_REQUESTED = new Set<string>();

export function hasLabPackageAddConflicts(conflict: LabPackageAddConflict): boolean {
  return conflict.labTestNames.length > 0 || conflict.imagingStudyNames.length > 0;
}

/** Individual lab/imaging picks that a newly added package would absorb. */
export function getLabPackageAddConflicts(
  pkg: LabPackageWithTests,
  opts: {
    selectedTestIds: ReadonlySet<string>;
    testsCoveredByOtherSelectedPackages: ReadonlySet<string>;
    imagingForm: Record<string, ImagingLineSelection>;
    imagingCoveredByOtherPackages: ReadonlySet<string>;
    encounterImagingCodes: ReadonlySet<string>;
    labCatalog: LabTestCatalogItem[];
    imagingCatalog: ImagingCatalogRow[];
  },
): LabPackageAddConflict {
  const labTestNames: string[] = [];
  const imagingStudyNames: string[] = [];
  const seenLab = new Set<string>();
  const seenImaging = new Set<string>();

  for (const tid of pkg.labTestIds ?? []) {
    const id = String(tid).trim();
    if (!id || seenLab.has(id)) continue;
    if (opts.testsCoveredByOtherSelectedPackages.has(id)) continue;
    if (!isLabPackageTestSatisfiedInUI(id, opts.labCatalog, opts.selectedTestIds, EMPTY_REQUESTED)) {
      continue;
    }
    seenLab.add(id);
    const row = opts.labCatalog.find((t) => t.id === id);
    labTestNames.push(row?.name?.trim() || `Lab test ${id.slice(0, 8)}…`);
  }

  for (const catalogId of pkg.imagingCatalogIds ?? []) {
    const row = opts.imagingCatalog.find((c) => c.id === catalogId);
    const code = row?.code?.trim();
    if (!code || seenImaging.has(code)) continue;
    if (opts.encounterImagingCodes.has(code)) continue;
    if (opts.imagingCoveredByOtherPackages.has(code)) continue;
    if (!opts.imagingForm[code]?.checked) continue;
    seenImaging.add(code);
    imagingStudyNames.push(row?.name?.trim() || code);
  }

  return { labTestNames, imagingStudyNames };
}

function buildMemberMapsFromLinkRows<T extends { lab_package_id: string | number }>(
  linkRows: T[] | null | undefined,
  pickMemberId: (row: T) => string,
): Map<string, string[]> {
  const byPkg = new Map<string, string[]>();
  for (const row of linkRows ?? []) {
    const pid = String(row.lab_package_id ?? "");
    const memberId = pickMemberId(row).trim();
    if (!pid || !memberId) continue;
    const list = byPkg.get(pid) ?? [];
    list.push(memberId);
    byPkg.set(pid, list);
  }
  return byPkg;
}

function mapPackageRows(
  packagesRaw: Array<Record<string, unknown>>,
  labByPkg: Map<string, string[]>,
  imagingByPkg: Map<string, string[]>,
): LabPackageWithTests[] {
  return packagesRaw.map((r) => {
    const id = String(r.id ?? "");
    return {
      id,
      name: String(r.name ?? ""),
      description: (r.description as string | null) ?? null,
      is_active: r.is_active !== false,
      sort_order: r.sort_order == null || r.sort_order === "" ? null : Number(r.sort_order),
      package_price: numPrice(r.package_price),
      labTestIds: labByPkg.get(id) ?? [],
      imagingCatalogIds: imagingByPkg.get(id) ?? [],
    };
  });
}

/**
 * Active lab packages with member test and imaging catalog ids.
 */
export async function fetchActiveLabPackagesWithTests(): Promise<{
  packages: LabPackageWithTests[];
  error: string | null;
}> {
  const { data: pkgRows, error: pErr } = await supabase
    .from(LAB_PACKAGES_TABLE)
    .select("id, name, description, is_active, sort_order, package_price")
    .eq("is_active", true)
    .order("sort_order", { ascending: true, nullsFirst: false })
    .order("name", { ascending: true });

  if (pErr) return { packages: [], error: pErr.message };

  const packagesRaw = (pkgRows ?? []) as Array<Record<string, unknown>>;
  if (packagesRaw.length === 0) return { packages: [], error: null };

  const pkgIds = packagesRaw.map((r) => String(r.id ?? "")).filter(Boolean);
  const [labRes, imgRes] = await Promise.all([
    supabase
      .from(LAB_PACKAGE_TESTS_TABLE)
      .select("lab_package_id, lab_test_id, sort_order")
      .in("lab_package_id", pkgIds)
      .order("sort_order", { ascending: true, nullsFirst: false }),
    supabase
      .from(LAB_PACKAGE_IMAGING_TABLE)
      .select("lab_package_id, imaging_catalog_id, sort_order")
      .in("lab_package_id", pkgIds)
      .order("sort_order", { ascending: true, nullsFirst: false }),
  ]);

  if (labRes.error) return { packages: [], error: labRes.error.message };
  if (imgRes.error) return { packages: [], error: imgRes.error.message };

  const labByPkg = buildMemberMapsFromLinkRows(
    labRes.data as Array<{ lab_package_id: string | number; lab_test_id: string }>,
    (row) => String(row.lab_test_id ?? ""),
  );
  const imagingByPkg = buildMemberMapsFromLinkRows(
    imgRes.data as Array<{ lab_package_id: string | number; imaging_catalog_id: string }>,
    (row) => String(row.imaging_catalog_id ?? ""),
  );

  return { packages: mapPackageRows(packagesRaw, labByPkg, imagingByPkg), error: null };
}

/**
 * Load package header rows by id(s) — works with browser `supabase` or service-role admin client.
 */
export async function fetchLabPackageDetailsMap(
  db: SupabaseClient,
  rawIds: unknown[],
): Promise<{ byId: Map<number, LabPackageDetail>; error: string | null }> {
  const numIds = [
    ...new Set(
      rawIds
        .map((raw) => {
          if (raw == null || raw === "") return null;
          const n = typeof raw === "number" ? raw : Number(String(raw));
          return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
        })
        .filter((n): n is number => n != null),
    ),
  ];
  if (numIds.length === 0) return { byId: new Map(), error: null };

  const { data, error } = await db
    .from(LAB_PACKAGES_TABLE)
    .select("id, name, description, package_price")
    .in("id", numIds);

  if (error) return { byId: new Map(), error: error.message };

  const byId = new Map<number, LabPackageDetail>();
  for (const raw of (data ?? []) as Array<Record<string, unknown>>) {
    const idRaw = raw.id;
    const id =
      typeof idRaw === "number" ? Math.trunc(idRaw) : Math.trunc(Number(String(idRaw ?? "")));
    if (!Number.isFinite(id) || id <= 0) continue;
    byId.set(id, {
      id,
      name: String(raw.name ?? ""),
      description: raw.description != null ? String(raw.description) : null,
      package_price: numPrice(raw.package_price),
    });
  }

  return { byId, error: null };
}

/**
 * Member `lab_test_id`s per catalog package (mixed bundle + à la carte pricing on one request).
 */
export async function fetchLabPackageMemberTestIdsMap(
  db: SupabaseClient,
  packageIds: number[],
): Promise<{ byPackageId: Map<number, string[]>; error: string | null }> {
  const byPackageId = new Map<number, string[]>();
  const ids = [...new Set(packageIds.filter((n) => Number.isFinite(n) && n > 0).map((n) => Math.trunc(n)))];
  if (ids.length === 0) return { byPackageId, error: null };

  const { data, error } = await db
    .from(LAB_PACKAGE_TESTS_TABLE)
    .select("lab_package_id, lab_test_id, sort_order")
    .in("lab_package_id", ids)
    .order("sort_order", { ascending: true, nullsFirst: false });

  if (error) return { byPackageId: new Map(), error: error.message };

  for (const row of (data ?? []) as Array<{
    lab_package_id: string | number;
    lab_test_id: string;
  }>) {
    const pidRaw = row.lab_package_id;
    const pid = typeof pidRaw === "number" ? Math.trunc(pidRaw) : Math.trunc(Number(String(pidRaw ?? "")));
    const tid = String(row.lab_test_id ?? "").trim();
    if (!Number.isFinite(pid) || pid <= 0 || !tid) continue;
    const list = byPackageId.get(pid) ?? [];
    list.push(tid);
    byPackageId.set(pid, list);
  }

  return { byPackageId, error: null };
}

/** Package ids that include at least one of the given test ids (for display grouping when junction rows are missing). */
export async function fetchLabPackageIdsForTestIds(
  db: SupabaseClient,
  testIds: string[],
): Promise<{ packageIds: number[]; error: string | null }> {
  const ids = [...new Set(testIds.map((t) => String(t).trim()).filter(Boolean))];
  if (ids.length === 0) return { packageIds: [], error: null };

  const { data, error } = await db
    .from(LAB_PACKAGE_TESTS_TABLE)
    .select("lab_package_id")
    .in("lab_test_id", ids);
  if (error) return { packageIds: [], error: error.message };

  const packageIds = [
    ...new Set(
      ((data ?? []) as Array<{ lab_package_id?: string | number }>)
        .map((r) => {
          const raw = r.lab_package_id;
          const n = typeof raw === "number" ? Math.trunc(raw) : Math.trunc(Number(String(raw ?? "")));
          return Number.isFinite(n) && n > 0 ? n : null;
        })
        .filter((n): n is number => n != null),
    ),
  ];
  return { packageIds, error: null };
}

/**
 * Member `imaging_catalog_id`s per catalog package.
 */
export async function fetchLabPackageMemberImagingCatalogIdsMap(
  db: SupabaseClient,
  packageIds: number[],
): Promise<{ byPackageId: Map<number, string[]>; error: string | null }> {
  const byPackageId = new Map<number, string[]>();
  const ids = [...new Set(packageIds.filter((n) => Number.isFinite(n) && n > 0).map((n) => Math.trunc(n)))];
  if (ids.length === 0) return { byPackageId, error: null };

  const { data, error } = await db
    .from(LAB_PACKAGE_IMAGING_TABLE)
    .select("lab_package_id, imaging_catalog_id, sort_order")
    .in("lab_package_id", ids)
    .order("sort_order", { ascending: true, nullsFirst: false });

  if (error) return { byPackageId: new Map(), error: error.message };

  for (const row of (data ?? []) as Array<{
    lab_package_id: string | number;
    imaging_catalog_id: string;
  }>) {
    const pidRaw = row.lab_package_id;
    const pid = typeof pidRaw === "number" ? Math.trunc(pidRaw) : Math.trunc(Number(String(pidRaw ?? "")));
    const cid = String(row.imaging_catalog_id ?? "").trim();
    if (!Number.isFinite(pid) || pid <= 0 || !cid) continue;
    const list = byPackageId.get(pid) ?? [];
    list.push(cid);
    byPackageId.set(pid, list);
  }

  return { byPackageId, error: null };
}

/** Union of imaging catalog ids covered by the given package ids. */
export async function resolvePackageCoveredImagingCatalogIds(
  db: SupabaseClient,
  packageIds: number[],
): Promise<{ covered: Set<string>; error: string | null }> {
  const members = await fetchLabPackageMemberImagingCatalogIdsMap(db, packageIds);
  if (members.error) return { covered: new Set(), error: members.error };
  const covered = new Set<string>();
  for (const list of members.byPackageId.values()) {
    for (const cid of list) covered.add(cid);
  }
  return { covered, error: null };
}

/** Convenience using the browser / shared anon Supabase client. */
export async function fetchLabPackageDetailsByIds(rawIds: unknown[]): Promise<{
  byId: Map<number, LabPackageDetail>;
  error: string | null;
}> {
  return fetchLabPackageDetailsMap(supabase, rawIds);
}

/** Map numeric `lab_package_id` from junction rows to catalog package `id` string. */
export function catalogPackageIdForNumericId(
  packages: LabPackageWithTests[],
  numericId: number,
): string | null {
  return packages.find((p) => parseLabRequestPackageId(p.id) === numericId)?.id ?? null;
}

/** Restore catalog package ids from saved lab request junction rows. */
export function restoreLabPackageCatalogIdsFromRequests(
  packages: LabPackageWithTests[],
  requests: EncounterLabRequestSummary[],
): Set<string> {
  const seen = new Set<number>();
  const restored = new Set<string>();
  for (const req of requests) {
    for (const lp of req.lab_packages ?? []) {
      const numericId = parseLabRequestPackageId(lp.id);
      if (numericId == null || seen.has(numericId)) continue;
      seen.add(numericId);
      const catalogId = catalogPackageIdForNumericId(packages, numericId);
      if (catalogId) restored.add(catalogId);
    }
  }
  return restored;
}

/** Restore lab modal selection (tests + packages) from encounter lab requests. */
export function hydrateLabSelectionFromEncounter(
  requests: EncounterLabRequestSummary[],
  packages: LabPackageWithTests[],
  catalogTests: LabTestCatalogItem[],
): { testIds: Set<string>; packageIds: Set<string> } {
  const allTestIds: string[] = [];
  for (const req of requests) {
    for (const tid of req.labTestIds ?? []) {
      if (tid) allTestIds.push(tid);
    }
  }
  return {
    testIds: new Set(collapseComponentsToPanel(allTestIds, catalogTests)),
    packageIds: restoreLabPackageCatalogIdsFromRequests(packages, requests),
  };
}
