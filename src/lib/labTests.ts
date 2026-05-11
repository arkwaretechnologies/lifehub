import { supabase } from "@/lib/supabaseClient";
import { fetchActiveLabPricesByTestIds } from "@/lib/labServicePrices";

export const LAB_TESTS_TABLE = "lab_tests" as const;
export const LAB_CATEGORIES_TABLE = "lab_categories" as const;

export type LabCategoryRow = {
  id: number | string;
  code: string;
  name: string;
  description: string | null;
  sort_order: number | null;
  is_active: boolean | null;
};

export type LabTestCatalogItem = {
  id: string;
  category_id: number | string;
  code: string;
  name: string;
  description: string | null;
  specimen_type: string | null;
  unit: string | null;
  reference_range: string | null;
  turnaround_hours: number | null;
  price: string | number | null;
  requires_fasting: boolean | null;
  sort_order: number | null;
  is_active: boolean | null;
};

export type LabCatalogSection = {
  category: LabCategoryRow;
  tests: LabTestCatalogItem[];
};

export async function fetchLabTestsByIds(ids: string[]): Promise<{
  testsById: Map<string, { id: string; name: string }>;
  error: string | null;
}> {
  const unique = [...new Set(ids.map((x) => x.trim()).filter(Boolean))];
  if (unique.length === 0) return { testsById: new Map(), error: null };

  const res = await supabase.from(LAB_TESTS_TABLE).select("id, name").in("id", unique);
  if (res.error) return { testsById: new Map(), error: res.error.message };
  const rows = (res.data ?? []) as Array<{ id: string; name: string }>;
  const m = new Map<string, { id: string; name: string }>();
  for (const r of rows) m.set(r.id, { id: r.id, name: r.name });
  return { testsById: m, error: null };
}

const LAB_TEST_PRICE_COLUMNS = ["price", "unit_price", "selling_price", "amount", "rate"] as const;

/** Fill `m` from `lab_tests` price-like columns for ids that are still <= 0. */
async function mergeLabTestsTableColumnPrices(ids: string[], m: Map<string, number>): Promise<void> {
  for (const col of LAB_TEST_PRICE_COLUMNS) {
    const remaining = ids.filter((id) => (m.get(id) ?? 0) <= 0);
    if (remaining.length === 0) break;
    const res = await supabase.from(LAB_TESTS_TABLE).select(`id, ${col}`).in("id", remaining);
    if (res.error) continue;
    const rows = (res.data ?? []) as Array<{ id: string } & Record<string, unknown>>;
    for (const r of rows) {
      const raw = (r as Record<string, unknown>)[col];
      const n = typeof raw === "number" ? raw : Number(String(raw ?? ""));
      const v = Number.isFinite(n) ? n : 0;
      if (v > 0 && (m.get(r.id) ?? 0) <= 0) m.set(r.id, v);
    }
  }
}

/**
 * Unit prices for lab tests: same source as consultation (`lab_service_prices` via
 * `fetchActiveLabPricesByTestIds`), then optional fallback to price-like columns on `lab_tests`.
 */
export async function fetchLabTestUnitPricesByIds(ids: string[]): Promise<{
  unitPriceById: Map<string, number>;
  error: string | null;
}> {
  const unique = [...new Set(ids.map((x) => x.trim()).filter(Boolean))];
  if (unique.length === 0) return { unitPriceById: new Map(), error: null };

  const m = new Map<string, number>();
  for (const id of unique) m.set(id, 0);

  const svc = await fetchActiveLabPricesByTestIds(unique);
  if (!svc.error) {
    for (const id of unique) {
      const p = svc.pricesByTestId.get(id);
      if (p != null && Number.isFinite(p) && p > 0) m.set(id, p);
    }
  }

  await mergeLabTestsTableColumnPrices(unique, m);

  const unresolved = unique.filter((id) => (m.get(id) ?? 0) <= 0);
  if (unresolved.length === 0) return { unitPriceById: m, error: null };

  return {
    unitPriceById: m,
    error:
      svc.error ??
      "Some lab tests have no active price. Add rows to lab_service_prices (same as consultation) or a price column on lab_tests.",
  };
}

/**
 * Checkout (cashier / lab sale lines): **`lab_tests` list/catalog price first**, then active
 * `lab_service_prices` for gaps. Consultation bundles may advertise a `lab_packages.package_price`, but each
 * saved `lab_request_item` is billed at its test’s catalog fee unless the catalog column is unset.
 */
export async function fetchLabTestCheckoutPricesByIds(ids: string[]): Promise<{
  unitPriceById: Map<string, number>;
  error: string | null;
}> {
  const unique = [...new Set(ids.map((x) => x.trim()).filter(Boolean))];
  if (unique.length === 0) return { unitPriceById: new Map(), error: null };

  const m = new Map<string, number>();
  for (const id of unique) m.set(id, 0);

  await mergeLabTestsTableColumnPrices(unique, m);

  const missing = unique.filter((id) => (m.get(id) ?? 0) <= 0);
  let svcErr: string | null = null;
  if (missing.length > 0) {
    const svc = await fetchActiveLabPricesByTestIds(missing);
    svcErr = svc.error;
    if (!svc.error) {
      for (const id of missing) {
        const p = svc.pricesByTestId.get(id);
        if (p != null && Number.isFinite(p) && p > 0) m.set(id, p);
      }
    }
  }

  const unresolved = unique.filter((id) => (m.get(id) ?? 0) <= 0);
  if (unresolved.length === 0) return { unitPriceById: m, error: null };

  return {
    unitPriceById: m,
    error:
      svcErr ??
      "Some lab tests have no catalog or service price. Set `lab_tests.price` or an active `lab_service_prices` row.",
  };
}

function idStr(v: string | number | undefined | null): string {
  if (v === undefined || v === null) return "";
  return String(v);
}

function isActiveRow(v: boolean | null | undefined): boolean {
  return v !== false;
}

function sortCategories(a: LabCategoryRow, b: LabCategoryRow): number {
  const sa = a.sort_order ?? 0;
  const sb = b.sort_order ?? 0;
  if (sa !== sb) return sa - sb;
  return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
}

function sortTests(a: LabTestCatalogItem, b: LabTestCatalogItem): number {
  const sa = a.sort_order ?? 0;
  const sb = b.sort_order ?? 0;
  if (sa !== sb) return sa - sb;
  return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
}

/**
 * Active categories (sort_order, name) with their active tests.
 * Tests under inactive or unknown categories are listed under "Other".
 */
export async function fetchLabCatalogGrouped(): Promise<{
  sections: LabCatalogSection[];
  error: string | null;
}> {
  const [catsRes, testsRes] = await Promise.all([
    supabase
      .from(LAB_CATEGORIES_TABLE)
      .select("id, code, name, description, sort_order, is_active")
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
    supabase
      .from(LAB_TESTS_TABLE)
      .select(
        "id, category_id, code, name, description, specimen_type, unit, reference_range, turnaround_hours, price, requires_fasting, sort_order, is_active",
      )
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
  ]);

  if (catsRes.error) {
    return { sections: [], error: catsRes.error.message };
  }
  if (testsRes.error) {
    return { sections: [], error: testsRes.error.message };
  }

  const categories = (catsRes.data ?? []) as LabCategoryRow[];
  const activeCategories = categories.filter((c) => isActiveRow(c.is_active)).sort(sortCategories);
  const activeCatIdSet = new Set(activeCategories.map((c) => idStr(c.id)));

  const rawTests = (testsRes.data ?? []) as Record<string, unknown>[];
  const tests: LabTestCatalogItem[] = rawTests.map((raw) => ({
    id: String(raw.id ?? ""),
    category_id: raw.category_id as number | string,
    code: String(raw.code ?? ""),
    name: String(raw.name ?? ""),
    description: (raw.description as string | null) ?? null,
    specimen_type: (raw.specimen_type as string | null) ?? null,
    unit: (raw.unit as string | null) ?? null,
    reference_range: (raw.reference_range as string | null) ?? null,
    turnaround_hours: (() => {
      if (raw.turnaround_hours == null || raw.turnaround_hours === "") return null;
      const n = Number(raw.turnaround_hours);
      return Number.isFinite(n) ? Math.trunc(n) : null;
    })(),
    price: (raw.price as string | number | null) ?? null,
    requires_fasting: (raw.requires_fasting as boolean | null) ?? null,
    sort_order:
      raw.sort_order == null || raw.sort_order === ""
        ? null
        : Number(raw.sort_order),
    is_active: (raw.is_active as boolean | null) ?? null,
  }));
  const activeTests = tests.filter((t) => isActiveRow(t.is_active));

  const byCat = new Map<string, LabTestCatalogItem[]>();
  for (const t of activeTests) {
    const k = idStr(t.category_id);
    if (!k) continue;
    const list = byCat.get(k) ?? [];
    list.push(t);
    byCat.set(k, list);
  }
  for (const [, list] of byCat) {
    list.sort(sortTests);
  }

  const sections: LabCatalogSection[] = activeCategories.map((category) => ({
    category,
    tests: [...(byCat.get(idStr(category.id)) ?? [])],
  }));

  const orphanTests = activeTests
    .filter((t) => !activeCatIdSet.has(idStr(t.category_id)))
    .sort(sortTests);

  if (orphanTests.length > 0) {
    sections.push({
      category: {
        id: "orphan",
        code: "OTHER",
        name: "Other",
        description: null,
        sort_order: 9999,
        is_active: true,
      },
      tests: orphanTests,
    });
  }

  return { sections, error: null };
}

/** Alias for older code / generic rows; same shape as catalog items. */
export type LabTestRow = LabTestCatalogItem;

export function labTestRowLabel(row: Pick<LabTestCatalogItem, "id" | "name" | "code">): string {
  const n = row.name?.trim();
  if (n) return n;
  const c = row.code?.trim();
  if (c) return c;
  return row.id ? `Test #${row.id}` : "—";
}
