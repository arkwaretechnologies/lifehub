import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";

export const LAB_PACKAGES_TABLE = "lab_packages" as const;
export const LAB_PACKAGE_TESTS_TABLE = "lab_package_tests" as const;

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

/**
 * Active lab packages with member test ids (for consultation “select package → check all tests”).
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
  const { data: linkRows, error: lErr } = await supabase
    .from(LAB_PACKAGE_TESTS_TABLE)
    .select("lab_package_id, lab_test_id, sort_order")
    .in("lab_package_id", pkgIds)
    .order("sort_order", { ascending: true, nullsFirst: false });

  if (lErr) return { packages: [], error: lErr.message };

  const byPkg = new Map<string, string[]>();
  for (const row of (linkRows ?? []) as Array<{ lab_package_id: string | number; lab_test_id: string }>) {
    const pid = String(row.lab_package_id ?? "");
    const tid = String(row.lab_test_id ?? "").trim();
    if (!pid || !tid) continue;
    const list = byPkg.get(pid) ?? [];
    list.push(tid);
    byPkg.set(pid, list);
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
      labTestIds: byPkg.get(id) ?? [],
    };
  });

  return { packages, error: null };
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

/** Convenience using the browser / shared anon Supabase client. */
export async function fetchLabPackageDetailsByIds(rawIds: unknown[]): Promise<{
  byId: Map<number, LabPackageDetail>;
  error: string | null;
}> {
  return fetchLabPackageDetailsMap(supabase, rawIds);
}
