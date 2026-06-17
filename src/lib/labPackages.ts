import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";
import type { ImagingCatalogRow, ImagingLineSelection } from "@/lib/imagingCatalog";

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
    const row = catalog.find((c) => c.id === catalogId);
    if (!row?.code) continue;
    next[row.code] = { ...(next[row.code] ?? { checked: false, view: "" }), checked };
  }
  return next;
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
    if (!selectedPackageIds.has(pkg.id)) continue;
    next = applyPackageImagingSelection(pkg.imagingCatalogIds ?? [], catalog, next, true);
  }
  return next;
}

export function imagingCatalogCodesCoveredByPackages(
  packages: LabPackageWithTests[],
  selectedPackageIds: Set<string>,
  catalog: ImagingCatalogRow[],
): Set<string> {
  const codes = new Set<string>();
  for (const pkg of packages) {
    if (!selectedPackageIds.has(pkg.id)) continue;
    for (const catalogId of pkg.imagingCatalogIds ?? []) {
      const row = catalog.find((c) => c.id === catalogId);
      if (row?.code) codes.add(row.code);
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
