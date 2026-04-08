import { supabase } from "@/lib/supabaseClient";

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
        "id, category_id, code, name, description, specimen_type, sort_order, is_active"
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

  const tests = (testsRes.data ?? []) as LabTestCatalogItem[];
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
