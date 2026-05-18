import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";
import { fetchActiveLabPricesByTestIds } from "@/lib/labServicePrices";
import {
  attachPanelLinksToCatalogItems,
  fetchPanelLinksForPanelIds,
  LAB_TEST_PANEL_LINKS_TABLE,
} from "@/lib/labTestPanelLinks";

export const LAB_TESTS_TABLE = "lab_tests" as const;
export const LAB_CATEGORIES_TABLE = "lab_categories" as const;
export { LAB_TEST_PANEL_LINKS_TABLE };

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
  /**
   * Blank results PDF stem: `templates/Lab Results/LIFEHUB-MEDICAL-Results-<CODE>.pdf`
   * (e.g. BLOODCHEM3, HEMA, URINALYSIS, ART).
   */
  results_template_code: string | null;
  /** PDF overlay position(s) for lab result printing (jsonb). */
  results_print_layout?: unknown | null;
  turnaround_hours: number | null;
  price: string | number | null;
  requires_fasting: boolean | null;
  sort_order: number | null;
  is_active: boolean | null;
  /** When false, row is a results-form line only (not shown in catalog ordering UIs). */
  is_orderable?: boolean | null;
  /** When non-orderable: orderable panel tests in the same category (from lab_test_panel_links). */
  panel_lab_test_ids?: string[];
};

export const URINALYSIS_PANEL_CODE = "UA_PANEL" as const;

export const LAB_TEST_CATALOG_SELECT =
  "id, category_id, code, name, description, specimen_type, unit, reference_range, results_template_code, results_print_layout, turnaround_hours, price, requires_fasting, sort_order, is_active, is_orderable";

/** Catalog select without `is_orderable` when that migration is not applied yet. */
export const LAB_TEST_CATALOG_SELECT_LEGACY =
  "id, category_id, code, name, description, specimen_type, unit, reference_range, results_template_code, results_print_layout, turnaround_hours, price, requires_fasting, sort_order, is_active";

export function isMissingDbColumnError(message: string | undefined, column: string): boolean {
  return Boolean(message && new RegExp(column.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(message));
}

/** Load lab_tests rows; retries without `is_orderable` when the column is missing. */
export async function fetchLabTestCatalogRows(
  db: SupabaseClient,
  options?: { testIds?: string[]; ordered?: boolean },
): Promise<{ rows: Record<string, unknown>[]; error: string | null }> {
  const run = (select: string) => {
    let q = db.from(LAB_TESTS_TABLE).select(select);
    const ids = options?.testIds?.map((x) => String(x).trim()).filter(Boolean) ?? [];
    if (ids.length > 0) q = q.in("id", ids);
    if (options?.ordered) {
      q = q.order("sort_order", { ascending: true }).order("name", { ascending: true });
    }
    return q;
  };

  const first = await run(LAB_TEST_CATALOG_SELECT);
  if (!first.error) {
    return { rows: (first.data ?? []) as unknown as Record<string, unknown>[], error: null };
  }

  if (isMissingDbColumnError(first.error.message, "is_orderable")) {
    const retry = await run(LAB_TEST_CATALOG_SELECT_LEGACY);
    if (retry.error) return { rows: [], error: retry.error.message };
    return { rows: (retry.data ?? []) as unknown as Record<string, unknown>[], error: null };
  }

  return { rows: [], error: first.error.message };
}

export function mapLabTestCatalogItem(raw: Record<string, unknown>): LabTestCatalogItem {
  return {
    id: String(raw.id ?? ""),
    category_id: raw.category_id as number | string,
    code: String(raw.code ?? ""),
    name: String(raw.name ?? ""),
    description: (raw.description as string | null) ?? null,
    specimen_type: (raw.specimen_type as string | null) ?? null,
    unit: (raw.unit as string | null) ?? null,
    reference_range: (raw.reference_range as string | null) ?? null,
    results_template_code: (raw.results_template_code as string | null) ?? null,
    results_print_layout: raw.results_print_layout ?? null,
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
    is_orderable: raw.is_orderable === false ? false : true,
    panel_lab_test_ids: [],
  };
}

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
    fetchLabTestCatalogRows(supabase, { ordered: true }),
  ]);

  if (catsRes.error) {
    return { sections: [], error: catsRes.error.message };
  }
  if (testsRes.error) {
    return { sections: [], error: testsRes.error };
  }

  const categories = (catsRes.data ?? []) as LabCategoryRow[];
  const activeCategories = categories.filter((c) => isActiveRow(c.is_active)).sort(sortCategories);
  const activeCatIdSet = new Set(activeCategories.map((c) => idStr(c.id)));

  const rawTests = testsRes.rows;
  const tests: LabTestCatalogItem[] = rawTests.map((raw) => mapLabTestCatalogItem(raw));
  let activeTests = tests.filter((t) => isActiveRow(t.is_active));

  const attached = await attachPanelLinksToCatalogItems(supabase, activeTests);
  if (!attached.error) activeTests = attached.tests;

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

/** Label for package picker / transfer lists: `Category Name - Lab test name`. */
export function labTestCategoryPickerLabel(
  test: Pick<LabTestCatalogItem, "name" | "category_id">,
  categoryNameById: ReadonlyMap<string, string>,
): string {
  const name = test.name?.trim() || "—";
  const cat = categoryNameById.get(String(test.category_id))?.trim();
  return cat ? `${cat} - ${name}` : name;
}

export function isNonOrderableResultLine(
  test: Pick<LabTestCatalogItem, "is_orderable">,
): boolean {
  return test.is_orderable === false;
}

/** @deprecated Use {@link isNonOrderableResultLine}. */
export function isUrinalysisResultLine(
  test: Pick<LabTestCatalogItem, "code" | "is_orderable">,
): boolean {
  return isNonOrderableResultLine(test);
}

export function filterOrderableLabTests(tests: LabTestCatalogItem[]): LabTestCatalogItem[] {
  return tests.filter((t) => t.is_orderable !== false);
}

export function componentHasPanelLink(
  test: Pick<LabTestCatalogItem, "panel_lab_test_ids">,
  panelId: string,
): boolean {
  const pid = String(panelId).trim();
  return (test.panel_lab_test_ids ?? []).some((id) => String(id).trim() === pid);
}

export function getComponentTestIds(
  catalog: LabTestCatalogItem[],
  panelId: string,
): string[] {
  const pid = String(panelId).trim();
  if (!pid) return [];
  return catalog.filter((t) => componentHasPanelLink(t, pid)).map((t) => t.id);
}

export function getPanelIdsForComponent(
  catalog: LabTestCatalogItem[],
  componentId: string,
): string[] {
  const cid = String(componentId).trim();
  const row = catalog.find((t) => t.id === cid);
  return row?.panel_lab_test_ids ?? [];
}

export function getPanelTestIds(catalog: LabTestCatalogItem[]): string[] {
  const panelIds = new Set<string>();
  for (const t of catalog) {
    for (const pid of t.panel_lab_test_ids ?? []) {
      const id = String(pid).trim();
      if (id) panelIds.add(id);
    }
    if (testHasPanelComponents(catalog, t.id)) {
      panelIds.add(t.id);
    }
  }
  return [...panelIds];
}

export function getPanelTest(
  catalog: LabTestCatalogItem[],
  panelId: string,
): LabTestCatalogItem | null {
  const pid = String(panelId).trim();
  return catalog.find((t) => t.id === pid) ?? null;
}

export function testHasPanelComponents(
  catalog: LabTestCatalogItem[],
  panelId: string,
): boolean {
  return getComponentTestIds(catalog, panelId).length > 0;
}

/**
 * True when this request line should appear on Lab Results for data entry.
 * Hides orderable panel shells (e.g. URINALYSIS). Shows panel component rows and standalone
 * orderable tests (e.g. Total Cholesterol). Hybrid tests (orderable + linked to panels) show
 * on both billable standalone rows and non-billable component rows when both are ordered.
 */
export function isLabResultEntryItem(
  test: Pick<LabTestCatalogItem, "id" | "is_orderable">,
  catalog: LabTestCatalogItem[],
): boolean {
  const isOrderablePanelShell =
    test.is_orderable !== false && testHasPanelComponents(catalog, test.id);
  if (isOrderablePanelShell) return false;
  return true;
}

/** Filter request items to result-entry lines using catalog panel links. */
export function filterLabRequestItemsForResultEntry<T extends { lab_test_id: string; is_billable?: boolean }>(
  items: T[],
  catalog: LabTestCatalogItem[],
): T[] {
  if (items.length === 0) return [];
  const byId = new Map(catalog.map((t) => [t.id, t]));

  const primary = items.filter((item) => {
    const test = byId.get(item.lab_test_id);
    if (!test) return item.is_billable === false;
    return isLabResultEntryItem(test, catalog);
  });
  if (primary.length > 0) return primary;

  // Legacy: pre-migration orders with only expanded component rows (all non-orderable).
  return items.filter((item) => {
    const test = byId.get(item.lab_test_id);
    if (!test) return item.is_billable === false;
    return test.is_orderable === false && isLabResultEntryItem(test, catalog);
  });
}

/**
 * Consultation UI: whether an orderable panel checkbox should appear checked.
 * Uses the panel test id in selection (not shared component ids) so multiple panels
 * that share the same result lines stay independent.
 */
export function isPanelLabTestSelectedInUI(
  panelTestId: string,
  catalog: LabTestCatalogItem[],
  selectedIds: ReadonlySet<string>,
  requestedIds?: ReadonlySet<string>,
): boolean {
  const pid = String(panelTestId).trim();
  if (!pid) return false;
  if (selectedIds.has(pid)) return true;

  const components = getComponentTestIds(catalog, pid);
  if (components.length === 0) return selectedIds.has(pid);

  if (requestedIds && components.every((cid) => requestedIds.has(cid))) return true;

  return false;
}

/** Toggle panel selection; stores panel id only (components expand on submit). */
export function applyPanelLabTestToggle(
  panelTestId: string,
  catalog: LabTestCatalogItem[],
  selectedIds: ReadonlySet<string>,
): Set<string> {
  const pid = String(panelTestId).trim();
  const next = new Set(selectedIds);
  const components = getComponentTestIds(catalog, pid);
  const isOn = isPanelLabTestSelectedInUI(pid, catalog, selectedIds);

  if (isOn) {
    next.delete(pid);
    for (const cid of components) next.delete(cid);
  } else {
    next.add(pid);
    for (const cid of components) next.delete(cid);
  }
  return next;
}

export function isLabPackageTestSatisfiedInUI(
  testId: string,
  catalog: LabTestCatalogItem[],
  selectedIds: ReadonlySet<string>,
  requestedIds: ReadonlySet<string>,
): boolean {
  const id = String(testId).trim();
  if (!id) return false;
  if (testHasPanelComponents(catalog, id)) {
    return isPanelLabTestSelectedInUI(id, catalog, selectedIds, requestedIds);
  }
  return selectedIds.has(id) || requestedIds.has(id);
}

export type LabRequestItemInsertRow = {
  lab_test_id: string;
  is_billable: boolean;
};

/**
 * Build rows for `lab_request_items`: one billable row per panel/standalone test,
 * plus non-billable rows for each panel component (lab results entry).
 */
export function buildLabRequestItemRows(
  selectedTestIds: Iterable<string>,
  catalog: LabTestCatalogItem[],
): LabRequestItemInsertRow[] {
  const billableIds = collapseComponentsToPanel(selectedTestIds, catalog);
  const rows: LabRequestItemInsertRow[] = [];
  const resultLineIds = new Set<string>();

  for (const testId of billableIds) {
    if (testHasPanelComponents(catalog, testId)) {
      rows.push({ lab_test_id: testId, is_billable: true });
      for (const cid of getComponentTestIds(catalog, testId)) {
        if (resultLineIds.has(cid)) continue;
        resultLineIds.add(cid);
        rows.push({ lab_test_id: cid, is_billable: false });
      }
      continue;
    }
    rows.push({ lab_test_id: testId, is_billable: true });
  }

  return rows;
}

/** Expand panel ids to all linked component ids for lab_request_items / selection state. */
export function expandPanelTestIds(
  testIds: Iterable<string>,
  catalog: LabTestCatalogItem[],
): string[] {
  const out = new Set<string>();
  for (const rawId of testIds) {
    const id = String(rawId).trim();
    if (!id) continue;
    const components = getComponentTestIds(catalog, id);
    if (components.length > 0) {
      for (const c of components) out.add(c);
      continue;
    }
    out.add(id);
  }
  return [...out];
}

/** @deprecated Use {@link expandPanelTestIds}. */
export const expandUrinalysisPanelTestIds = expandPanelTestIds;

/** Persist panel id on packages instead of individual component ids. */
export function collapseComponentsToPanel(
  testIds: Iterable<string>,
  catalog: LabTestCatalogItem[],
): string[] {
  const ids = [...new Set([...testIds].map((x) => String(x).trim()).filter(Boolean))];
  const panelIds = getPanelTestIds(catalog);
  if (panelIds.length === 0) return ids;

  const result = new Set(ids);
  for (const panelId of panelIds) {
    const componentIds = getComponentTestIds(catalog, panelId);
    if (componentIds.length === 0) continue;
    const componentSet = new Set(componentIds);
    const touches =
      result.has(panelId) || componentIds.some((cid) => result.has(cid));
    if (!touches) continue;
    for (const cid of componentIds) result.delete(cid);
    result.delete(panelId);
    result.add(panelId);
  }
  return [...result];
}

/** @deprecated Use {@link collapseComponentsToPanel}. */
export const collapseUrinalysisComponentsToPanel = collapseComponentsToPanel;

/** @deprecated Use {@link getPanelTest} with {@link URINALYSIS_PANEL_CODE}. */
export function getUrinalysisPanelTest(tests: LabTestCatalogItem[]): LabTestCatalogItem | null {
  return tests.find((t) => String(t.code ?? "").toUpperCase() === URINALYSIS_PANEL_CODE) ?? null;
}

/** @deprecated Use {@link getComponentTestIds} with panel id. */
export function getUrinalysisComponentTests(tests: LabTestCatalogItem[]): LabTestCatalogItem[] {
  const panel = getUrinalysisPanelTest(tests);
  if (!panel) return tests.filter(isNonOrderableResultLine);
  return tests.filter((t) => componentHasPanelLink(t, panel.id));
}

export function testsForLabOrderSection(
  _category: Pick<LabCategoryRow, "code">,
  tests: LabTestCatalogItem[],
): LabTestCatalogItem[] {
  return filterOrderableLabTests(tests);
}

export type LabTestOrderablePanelInput = {
  is_orderable?: boolean;
  panel_lab_test_ids?: string[] | null;
  category_id?: number | string;
};

export type ValidateLabTestOrderablePanelResult =
  | { ok: true; is_orderable: boolean; panel_lab_test_ids: string[] }
  | { ok: false; error: string };

function normalizePanelIdList(raw: string[] | null | undefined): string[] {
  return [...new Set((raw ?? []).map((x) => String(x).trim()).filter(Boolean))];
}

function validatePanelLabTestTargets(
  panelIds: string[],
  input: LabTestOrderablePanelInput,
  opts: { testId?: string; panelTargets?: LabTestCatalogItem[] },
): { ok: true } | { ok: false; error: string } {
  const testId = opts.testId?.trim() ?? "";
  const targets = opts.panelTargets ?? [];
  if (targets.length !== panelIds.length) {
    return { ok: false, error: "One or more selected panel tests do not exist." };
  }

  const catId = input.category_id ?? targets[0]?.category_id;
  for (const target of targets) {
    if (testId && target.id === testId) {
      return { ok: false, error: "A test cannot be ordered under itself." };
    }
    if (target.is_orderable === false) {
      return { ok: false, error: "Panel tests must be orderable." };
    }
    if (String(target.category_id) !== String(catId)) {
      return {
        ok: false,
        error: "All panel tests must be in the same category as this test.",
      };
    }
  }

  return { ok: true };
}

/** Validate orderable / panel fields for create or update. */
export function validateLabTestOrderablePanel(
  input: LabTestOrderablePanelInput,
  opts: {
    testId?: string;
    panelTargets?: LabTestCatalogItem[];
    componentCount?: number;
  } = {},
): ValidateLabTestOrderablePanelResult {
  const is_orderable = input.is_orderable !== false;
  const panelIds = normalizePanelIdList(input.panel_lab_test_ids);

  if (!is_orderable) {
    if (panelIds.length === 0) {
      return {
        ok: false,
        error: "Non-orderable tests must select at least one orderable panel in the same category.",
      };
    }
    const panelCheck = validatePanelLabTestTargets(panelIds, input, opts);
    if (!panelCheck.ok) return panelCheck;
    if ((opts.componentCount ?? 0) > 0) {
      return {
        ok: false,
        error:
          "Cannot mark as non-orderable: other tests use this test as their panel. Reassign them first.",
      };
    }
    return { ok: true, is_orderable: false, panel_lab_test_ids: panelIds };
  }

  if (panelIds.length === 0) {
    return { ok: true, is_orderable: true, panel_lab_test_ids: [] };
  }

  const panelCheck = validatePanelLabTestTargets(panelIds, input, opts);
  if (!panelCheck.ok) return panelCheck;
  return { ok: true, is_orderable: true, panel_lab_test_ids: panelIds };
}

/** Collapse component ids to panel ids when saving package membership (server). */
export async function normalizePackageLabTestIdsForStorage(
  db: SupabaseClient,
  testIds: string[],
): Promise<{ testIds: string[]; error: string | null }> {
  const unique = [...new Set(testIds.map((x) => String(x).trim()).filter(Boolean))];
  if (unique.length === 0) return { testIds: [], error: null };

  const fetched = await fetchLabTestCatalogRows(db, { testIds: unique });
  if (fetched.error) return { testIds: [], error: fetched.error };

  let catalog = fetched.rows.map((raw) => mapLabTestCatalogItem(raw));
  const known = new Set(catalog.map((t) => t.id));
  const missing = unique.filter((id) => !known.has(id));
  if (missing.length > 0) {
    const panelIds = getPanelTestIds(catalog);
    const related = [...new Set([...missing, ...panelIds])];
    const extraFetch = await fetchLabTestCatalogRows(db, {
      testIds: related.length > 0 ? related : missing,
    });
    if (extraFetch.error) return { testIds: [], error: extraFetch.error };
    for (const raw of extraFetch.rows) {
      const item = mapLabTestCatalogItem(raw);
      if (!known.has(item.id)) {
        catalog.push(item);
        known.add(item.id);
      }
    }
    const stillMissing = unique.filter((id) => !known.has(id));
    if (stillMissing.length > 0) {
      const { links, error: linkErr } = await fetchPanelLinksForPanelIds(db, stillMissing);
      if (linkErr) return { testIds: [], error: linkErr };
      if (links.length > 0) {
        const componentIds = [...new Set(links.map((l) => l.component_lab_test_id))];
        const componentFetch = await fetchLabTestCatalogRows(db, { testIds: componentIds });
        if (componentFetch.error) return { testIds: [], error: componentFetch.error };
        for (const raw of componentFetch.rows) {
          const item = mapLabTestCatalogItem(raw);
          if (!known.has(item.id)) {
            catalog.push(item);
            known.add(item.id);
          }
        }
      }
    }
  }

  const unknown = unique.filter((id) => !known.has(id));
  if (unknown.length > 0) {
    return {
      testIds: [],
      error: `Unknown lab test id(s): ${unknown.slice(0, 3).join(", ")}${unknown.length > 3 ? "…" : ""}`,
    };
  }

  const attached = await attachPanelLinksToCatalogItems(db, catalog);
  if (attached.error) return { testIds: [], error: attached.error };
  catalog = attached.tests;

  return { testIds: collapseComponentsToPanel(unique, catalog), error: null };
}

/**
 * Repo-relative directory for blank laboratory result PDFs (project root = Next.js `process.cwd()` on server).
 * @see {@link labResultsTemplatePdfFileName}
 */
export const LAB_RESULTS_TEMPLATES_RELATIVE_DIR = "templates/Lab Results" as const;

/** e.g. `LIFEHUB-MEDICAL-Results-BLOODCHEM3.pdf` */
export function labResultsTemplatePdfFileName(resultsTemplateCode: string): string {
  const c = String(resultsTemplateCode ?? "").trim();
  if (!c) return "";
  return `LIFEHUB-MEDICAL-Results-${c.toUpperCase()}.pdf`;
}

/** Path from repo root using forward slashes, for server `path.join(process.cwd(), ...)`. */
export function labResultsTemplatePdfRelativePath(resultsTemplateCode: string): string {
  const name = labResultsTemplatePdfFileName(resultsTemplateCode);
  if (!name) return "";
  return `${LAB_RESULTS_TEMPLATES_RELATIVE_DIR}/${name}`;
}

/** Order of blood chemistry result forms (LIFEHUB-MEDICAL-Results-BLOODCHEM*.pdf). */
export const LAB_RESULTS_BLOODCHEM_TEMPLATE_ORDER = [
  "BLOODCHEM1",
  "BLOODCHEM2",
  "BLOODCHEM3",
  "BLOODCHEM4",
  "BLOODCHEM5",
  "BLOODCHEM6",
  "BLOODCHEM7",
  "BLOODCHEM8",
  "BLOODCHEM9",
  "BLOODCHEM10",
  "BLOODCHEM11",
] as const;

/** Fixed merge/print order for lab result PDF templates (must match on-disk stems). */
export const LAB_RESULTS_PRINT_TEMPLATE_CODES_ORDER: readonly string[] = [
  "HEMA",
  ...LAB_RESULTS_BLOODCHEM_TEMPLATE_ORDER,
  "URINALYSIS",
  "ART",
];

const LAB_RESULTS_PRINT_ALLOWLIST = new Set(LAB_RESULTS_PRINT_TEMPLATE_CODES_ORDER);

/** True when `code` maps to `LIFEHUB-MEDICAL-Results-<code>.pdf` under {@link LAB_RESULTS_TEMPLATES_RELATIVE_DIR}. */
export function isAllowedLabResultsTemplateCode(code: string): boolean {
  const c = String(code ?? "").trim().toUpperCase();
  return c !== "" && LAB_RESULTS_PRINT_ALLOWLIST.has(c);
}

/** Split comma-separated `results_template_code`; keep only allowlisted stems, preserve order. */
/** Normalize a single template code for storage; null when empty. */
export function normalizeResultsTemplateCodeForStorage(
  raw: string | null | undefined,
): string | null {
  const c = String(raw ?? "").trim().toUpperCase();
  return c === "" ? null : c;
}

export function splitAllowlistedResultsTemplateCodes(csv: string | null | undefined): string[] {
  const out: string[] = [];
  for (const part of String(csv ?? "").split(",")) {
    const c = part.trim().toUpperCase();
    if (c && isAllowedLabResultsTemplateCode(c)) out.push(c);
  }
  return out;
}

/** Deduplicates and sorts template codes for merged printing (unknown codes sort after known, alphabetically). */
export function sortResultsTemplateCodes(codes: Iterable<string>): string[] {
  const uniq = [
    ...new Set(
      [...codes]
        .map((c) => String(c ?? "").trim().toUpperCase())
        .filter((c) => c !== ""),
    ),
  ];
  const idx = new Map(LAB_RESULTS_PRINT_TEMPLATE_CODES_ORDER.map((c, i) => [c, i]));
  uniq.sort((a, b) => {
    const ia = idx.has(a) ? (idx.get(a) as number) : 1000;
    const ib = idx.has(b) ? (idx.get(b) as number) : 1000;
    if (ia !== ib) return ia - ib;
    return a.localeCompare(b, undefined, { sensitivity: "base" });
  });
  return uniq;
}

/**
 * When `lab_tests.results_template_code` is null in the DB, infer the blank PDF stem from stable
 * `lab_tests.code`. Keys mirror `supabase/migrations/20260510140000_lab_catalog_results_templates.sql`.
 */
const LAB_RESULTS_TEMPLATE_CODE_BY_TEST_CODE: Record<string, string> = {
  HEMA_HGB: "HEMA",
  HEMA_HCT: "HEMA",
  HEMA_RBC: "HEMA",
  HEMA_WBC: "HEMA",
  HEMA_PLT: "HEMA",
  HEMA_MCV: "HEMA",
  HEMA_MCH: "HEMA",
  HEMA_MCHC: "HEMA",
  HEMA_RDW: "HEMA",
  HEMA_NEUT: "HEMA",
  HEMA_LYMPH: "HEMA",
  HEMA_MONO: "HEMA",
  HEMA_EOS: "HEMA",
  HEMA_BASO: "HEMA",
  ART_PH_ART: "ART",
  ART_PH_VEN: "ART",
  ART_PAO2: "ART",
  ART_PACO2: "ART",
  ART_HCO3_ACT: "ART",
  ART_HCO3_STD: "ART",
  ART_SAO2: "ART",
  ART_BASE_EXCESS: "ART",
  ART_PO2_FIO2: "ART",
  CHEM_FBS: "BLOODCHEM1",
  CHEM_2HRPP: "BLOODCHEM1",
  CHEM_RBS: "BLOODCHEM1",
  CHEM_HBA1C: "BLOODCHEM1",
  CHEM_FASTING_INSULIN: "BLOODCHEM1",
  CHEM_BUN: "BLOODCHEM2",
  CHEM_SERUM_UREA: "BLOODCHEM2",
  CHEM_CREATININE: "BLOODCHEM2",
  CHEM_UA: "BLOODCHEM2",
  CHEM_TC: "BLOODCHEM3",
  CHEM_HDL: "BLOODCHEM3",
  CHEM_LDL: "BLOODCHEM3",
  CHEM_VLDL: "BLOODCHEM3",
  CHEM_TG: "BLOODCHEM3",
  CHEM_AST: "BLOODCHEM4",
  CHEM_ALT: "BLOODCHEM4",
  CHEM_ALP: "BLOODCHEM4",
  CHEM_GGT: "BLOODCHEM4",
  CHEM_LDH: "BLOODCHEM4",
  CHEM_TBIL: "BLOODCHEM4",
  CHEM_DBIL: "BLOODCHEM4",
  CHEM_IBIL: "BLOODCHEM4",
  CHEM_AMYLASE: "BLOODCHEM4",
  CHEM_LIPASE: "BLOODCHEM4",
  CHEM_CK: "BLOODCHEM5",
  CHEM_CKMB: "BLOODCHEM5",
  CHEM_TROP_I: "BLOODCHEM5",
  CHEM_HSCRP: "BLOODCHEM5",
  CHEM_NA: "BLOODCHEM6",
  CHEM_K: "BLOODCHEM6",
  CHEM_CL: "BLOODCHEM6",
  CHEM_CA: "BLOODCHEM6",
  CHEM_CA_ION: "BLOODCHEM6",
  CHEM_PHOS: "BLOODCHEM6",
  CHEM_MG: "BLOODCHEM6",
  CHEM_FE: "BLOODCHEM7",
  CHEM_TIBC: "BLOODCHEM7",
  CHEM_TSAT: "BLOODCHEM7",
  CHEM_FERRITIN: "BLOODCHEM7",
  CHEM_TSH: "BLOODCHEM8",
  CHEM_FT4: "BLOODCHEM8",
  CHEM_FT3: "BLOODCHEM8",
  CHEM_TT4: "BLOODCHEM8",
  CHEM_TT3: "BLOODCHEM8",
  CHEM_PT: "BLOODCHEM9",
  CHEM_INR: "BLOODCHEM9",
  CHEM_APTT: "BLOODCHEM9",
  CHEM_BT: "BLOODCHEM9",
  CHEM_PROLACTIN: "BLOODCHEM10",
  CHEM_FSH: "BLOODCHEM10",
  CHEM_LH: "BLOODCHEM10",
  CHEM_E2: "BLOODCHEM10",
  CHEM_PROG: "BLOODCHEM10",
  CHEM_TESTO: "BLOODCHEM10",
  CHEM_CORTISOL: "BLOODCHEM10",
  CHEM_PSA: "BLOODCHEM10",
  CHEM_BHCG: "BLOODCHEM10",
  CHEM_AFP: "BLOODCHEM11",
  CHEM_CEA: "BLOODCHEM11",
  CHEM_CA199: "BLOODCHEM11",
  CHEM_CA125: "BLOODCHEM11",
  CHEM_CA153: "BLOODCHEM11",
  UA_COLOR: "URINALYSIS",
  UA_CLARITY: "URINALYSIS",
  UA_SG: "URINALYSIS",
  UA_PH: "URINALYSIS",
  UA_PROTEIN: "URINALYSIS",
  UA_GLUCOSE: "URINALYSIS",
  UA_BLOOD: "URINALYSIS",
  UA_KETONE: "URINALYSIS",
  UA_NITRITE: "URINALYSIS",
  UA_BILI: "URINALYSIS",
  UA_URO: "URINALYSIS",
  UA_LEU: "URINALYSIS",
  UA_WBC: "URINALYSIS",
  UA_RBC: "URINALYSIS",
  UA_EPITH: "URINALYSIS",
  UA_CASTS: "URINALYSIS",
  UA_BACTERIA: "URINALYSIS",
  UA_COMMENT: "URINALYSIS",
};

/** Printable `results_template_code` from catalog `lab_tests.code` when the DB column is unset. */
export function labResultsTemplateCodeFromCatalogTestCode(testCode: string | null | undefined): string | null {
  const c = String(testCode ?? "").trim().toUpperCase();
  if (!c) return null;
  const tpl = LAB_RESULTS_TEMPLATE_CODE_BY_TEST_CODE[c];
  return tpl != null && tpl !== "" ? tpl : null;
}

export const LAB_RESULTS_BLOODCHEM_HEADINGS: Record<string, string> = {
  BLOODCHEM1: "Panel 1 — Glucose & diabetes",
  BLOODCHEM2: "Panel 2 — Renal function",
  BLOODCHEM3: "Panel 3 — Lipid profile",
  BLOODCHEM4: "Panel 4 — Liver / enzymes",
  BLOODCHEM5: "Panel 5 — Cardiac markers",
  BLOODCHEM6: "Panel 6 — Electrolytes",
  BLOODCHEM7: "Panel 7 — Iron studies",
  BLOODCHEM8: "Panel 8 — Thyroid function",
  BLOODCHEM9: "Panel 9 — Coagulation",
  BLOODCHEM10: "Panel 10 — Hormones",
  BLOODCHEM11: "Panel 11 — Tumor markers",
};

function sortTestsCatalog(a: LabTestCatalogItem, b: LabTestCatalogItem): number {
  const sa = a.sort_order ?? 0;
  const sb = b.sort_order ?? 0;
  if (sa !== sb) return sa - sb;
  return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
}

/** Subsections for Clinical Chemistry (CHEM) modal — one block per BLOODCHEM results PDF. */
export function groupLabTestsByBloodChemTemplate(tests: LabTestCatalogItem[]): {
  heading: string;
  tests: LabTestCatalogItem[];
}[] {
  const withTpl = tests.filter((t) => (t.results_template_code ?? "").trim() !== "");
  const withoutTpl = tests
    .filter((t) => !(t.results_template_code ?? "").trim())
    .sort(sortTestsCatalog);

  const byTpl = new Map<string, LabTestCatalogItem[]>();
  for (const t of withTpl) {
    const k = (t.results_template_code ?? "").split(",")[0]?.trim() ?? "";
    const list = byTpl.get(k) ?? [];
    list.push(t);
    byTpl.set(k, list);
  }
  for (const [, list] of byTpl) list.sort(sortTestsCatalog);

  const out: { heading: string; tests: LabTestCatalogItem[] }[] = [];
  for (const code of LAB_RESULTS_BLOODCHEM_TEMPLATE_ORDER) {
    const arr = byTpl.get(code);
    if (arr?.length) {
      out.push({ heading: LAB_RESULTS_BLOODCHEM_HEADINGS[code] ?? code, tests: arr });
      byTpl.delete(code);
    }
  }
  for (const k of [...byTpl.keys()].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))) {
    const arr = byTpl.get(k);
    if (arr?.length) out.push({ heading: LAB_RESULTS_BLOODCHEM_HEADINGS[k] ?? k, tests: arr });
  }
  if (withoutTpl.length) out.push({ heading: "", tests: withoutTpl });
  return out.length > 0 ? out : [{ heading: "", tests: [...tests].sort(sortTestsCatalog) }];
}
