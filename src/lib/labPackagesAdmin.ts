import type { SupabaseClient } from "@supabase/supabase-js";
import {
  LAB_PACKAGES_TABLE,
  LAB_PACKAGE_IMAGING_TABLE,
  LAB_PACKAGE_TESTS_TABLE,
  type LabPackageWithTests,
} from "@/lib/labPackages";

function numPrice(v: unknown): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : Number(String(v));
  return Number.isFinite(n) ? n : 0;
}

/** Load all packages with lab test and imaging members (settings admin API). */
export async function loadPackagesWithMembersAdmin(
  db: SupabaseClient,
): Promise<{ packages: LabPackageWithTests[]; error: string | null }> {
  const { data: pkgRows, error: pErr } = await db
    .from(LAB_PACKAGES_TABLE)
    .select("id, name, description, is_active, sort_order, package_price")
    .order("sort_order", { ascending: true, nullsFirst: false })
    .order("name", { ascending: true });

  if (pErr) return { packages: [], error: pErr.message };

  const packagesRaw = (pkgRows ?? []) as Array<Record<string, unknown>>;
  if (packagesRaw.length === 0) return { packages: [], error: null };

  const pkgIds = packagesRaw.map((r) => String(r.id ?? "")).filter(Boolean);
  const [labRes, imgRes] = await Promise.all([
    db
      .from(LAB_PACKAGE_TESTS_TABLE)
      .select("lab_package_id, lab_test_id, sort_order")
      .in("lab_package_id", pkgIds)
      .order("sort_order", { ascending: true, nullsFirst: false }),
    db
      .from(LAB_PACKAGE_IMAGING_TABLE)
      .select("lab_package_id, imaging_catalog_id, sort_order")
      .in("lab_package_id", pkgIds)
      .order("sort_order", { ascending: true, nullsFirst: false }),
  ]);

  if (labRes.error) return { packages: [], error: labRes.error.message };
  if (imgRes.error) return { packages: [], error: imgRes.error.message };

  const labByPkg = new Map<string, string[]>();
  for (const row of (labRes.data ?? []) as Array<{ lab_package_id: string | number; lab_test_id: string }>) {
    const pid = String(row.lab_package_id ?? "");
    const tid = String(row.lab_test_id ?? "").trim();
    if (!pid || !tid) continue;
    const list = labByPkg.get(pid) ?? [];
    list.push(tid);
    labByPkg.set(pid, list);
  }

  const imagingByPkg = new Map<string, string[]>();
  for (const row of (imgRes.data ?? []) as Array<{
    lab_package_id: string | number;
    imaging_catalog_id: string;
  }>) {
    const pid = String(row.lab_package_id ?? "");
    const cid = String(row.imaging_catalog_id ?? "").trim();
    if (!pid || !cid) continue;
    const list = imagingByPkg.get(pid) ?? [];
    list.push(cid);
    imagingByPkg.set(pid, list);
  }

  const packages: LabPackageWithTests[] = packagesRaw.map((r) => {
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

  return { packages, error: null };
}

export async function loadOnePackageAdmin(
  db: SupabaseClient,
  packageId: number,
): Promise<{ package: LabPackageWithTests | null; error: string | null }> {
  const { packages, error } = await loadPackagesWithMembersAdmin(db);
  if (error) return { package: null, error };
  const pkg = packages.find((p) => p.id === String(packageId)) ?? null;
  return { package: pkg, error: null };
}

export async function replacePackageImagingLinks(
  db: SupabaseClient,
  packageId: number,
  imagingCatalogIds: string[],
): Promise<{ error: string | null }> {
  const { error: delErr } = await db.from(LAB_PACKAGE_IMAGING_TABLE).delete().eq("lab_package_id", packageId);
  if (delErr) return { error: delErr.message };

  if (imagingCatalogIds.length === 0) return { error: null };

  const linkRows = imagingCatalogIds.map((imaging_catalog_id, idx) => ({
    lab_package_id: packageId,
    imaging_catalog_id,
    sort_order: idx,
  }));
  const { error: insErr } = await db.from(LAB_PACKAGE_IMAGING_TABLE).insert(linkRows);
  if (insErr) return { error: insErr.message };
  return { error: null };
}
