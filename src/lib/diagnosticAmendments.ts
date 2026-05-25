import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildLabRequestItemRows,
  collapseComponentsToPanel,
  getPanelIdsForComponent,
  labTestRowLabel,
  type LabTestCatalogItem,
} from "@/lib/labTests";
import { fetchLabServicePricesMapAdmin } from "@/lib/labServicePrices";
import {
  fetchLabRequestItemsForRequestIds,
  fetchLabRequestPackageIdsByRequestIdMap,
  LAB_REQUEST_ITEMS_TABLE,
  LAB_REQUEST_PACKAGES_TABLE,
  LAB_REQUESTS_TABLE,
  loadLabTestCatalogForTestIds,
  normalizeLabRequestPackageIdList,
  type LabRequestItemStoredRow,
} from "@/lib/labRequests";
import type { ImagingCatalogRow, ImagingLineSelection } from "@/lib/imagingCatalog";
import {
  fetchImagingRequestItemsForRequestIds,
  IMAGING_REQUEST_ITEMS_TABLE,
  IMAGING_REQUESTS_TABLE,
} from "@/lib/imagingRequests";

export const DIAGNOSTIC_ORDER_AMENDMENTS_TABLE = "diagnostic_order_amendments" as const;

export type AmendmentSummaryJson = {
  added: Array<{ label: string; amount: number; lab_test_id?: string; imaging_catalog_id?: string }>;
  removed: Array<{ label: string; amount: number; lab_test_id?: string; imaging_catalog_id?: string }>;
  warnings?: string[];
};

export type DiagnosticAmendmentRow = {
  id: string;
  encounter_id: string;
  lab_request_id: string | null;
  imaging_request_id: string | null;
  status: "pending" | "settled";
  amount_delta: number;
  summary_json: AmendmentSummaryJson;
  settled_lab_sale_id: string | null;
  created_at: string;
  settled_at: string | null;
};

function roundMoney2(n: number): number {
  return Math.round(n * 100) / 100;
}

function moneyNum(v: unknown): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : Number(String(v));
  return Number.isFinite(n) ? n : 0;
}

function billableTestIdsFromItems(items: LabRequestItemStoredRow[]): Set<string> {
  return new Set(items.filter((i) => i.is_billable).map((i) => i.lab_test_id));
}

function testIdSetFromDesiredRows(rows: { lab_test_id: string }[]): Set<string> {
  return new Set(rows.map((r) => r.lab_test_id));
}

export async function fetchPendingDiagnosticAmendmentsForEncounter(
  db: SupabaseClient,
  encounterId: string,
): Promise<{ rows: DiagnosticAmendmentRow[]; error: string | null }> {
  const enc = encounterId.trim();
  if (!enc) return { rows: [], error: null };

  const { data, error } = await db
    .from(DIAGNOSTIC_ORDER_AMENDMENTS_TABLE)
    .select(
      "id, encounter_id, lab_request_id, imaging_request_id, status, amount_delta, summary_json, settled_lab_sale_id, created_at, settled_at",
    )
    .eq("encounter_id", enc)
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  if (error) {
    if (/diagnostic_order_amendments/i.test(error.message) && /does not exist|relation/i.test(error.message)) {
      return { rows: [], error: null };
    }
    return { rows: [], error: error.message };
  }
  return { rows: (data ?? []) as DiagnosticAmendmentRow[], error: null };
}

/** @deprecated Use {@link fetchPendingDiagnosticAmendmentsForEncounter}. */
export async function fetchPendingDiagnosticAmendmentForEncounter(
  db: SupabaseClient,
  encounterId: string,
): Promise<{ row: DiagnosticAmendmentRow | null; error: string | null }> {
  const { rows, error } = await fetchPendingDiagnosticAmendmentsForEncounter(db, encounterId);
  if (error) return { row: null, error };
  return { row: rows[0] ?? null, error: null };
}

async function fetchPendingAmendmentForRequest(
  db: SupabaseClient,
  encounterId: string,
  opts: { labRequestId?: string | null; imagingRequestId?: string | null },
): Promise<{ row: DiagnosticAmendmentRow | null; error: string | null }> {
  const labId = (opts.labRequestId ?? "").trim();
  const imgId = (opts.imagingRequestId ?? "").trim();
  const { rows, error } = await fetchPendingDiagnosticAmendmentsForEncounter(db, encounterId);
  if (error) return { row: null, error };
  if (labId) {
    return { row: rows.find((r) => (r.lab_request_id ?? "").trim() === labId) ?? null, error: null };
  }
  if (imgId) {
    return { row: rows.find((r) => (r.imaging_request_id ?? "").trim() === imgId) ?? null, error: null };
  }
  return { row: null, error: null };
}

async function upsertPendingDiagnosticAmendment(
  db: SupabaseClient,
  input: {
    encounterId: string;
    labRequestId?: string | null;
    imagingRequestId?: string | null;
    amountDelta: number;
    summary: AmendmentSummaryJson;
  },
): Promise<{ amendmentId: string | null; error: string | null }> {
  const enc = input.encounterId.trim();
  const now = new Date().toISOString();
  const status = input.amountDelta === 0 ? "settled" : "pending";
  const payload = {
    status,
    amount_delta: input.amountDelta,
    summary_json: input.summary,
    settled_at: status === "settled" ? now : null,
  };

  const { row: existing, error: findErr } = await fetchPendingAmendmentForRequest(db, enc, {
    labRequestId: input.labRequestId,
    imagingRequestId: input.imagingRequestId,
  });
  if (findErr) return { amendmentId: null, error: findErr };

  if (existing) {
    const { data, error } = await db
      .from(DIAGNOSTIC_ORDER_AMENDMENTS_TABLE)
      .update(payload)
      .eq("id", existing.id)
      .select("id")
      .single();
    if (error) return { amendmentId: null, error: error.message };
    return { amendmentId: (data as { id: string }).id, error: null };
  }

  const { data, error } = await db
    .from(DIAGNOSTIC_ORDER_AMENDMENTS_TABLE)
    .insert({
      encounter_id: enc,
      lab_request_id: input.labRequestId ?? null,
      imaging_request_id: input.imagingRequestId ?? null,
      ...payload,
    })
    .select("id")
    .single();
  if (error) return { amendmentId: null, error: error.message };
  return { amendmentId: (data as { id: string }).id, error: null };
}

/** Cashier delta vs what was paid on the original sale (supports multiple edits before settlement). */
async function computeLabAmendmentBillingAgainstPaidSale(
  db: SupabaseClient,
  labRequestId: string,
  desiredTestIds: string[],
  catalog: LabTestCatalogItem[],
): Promise<{ amountDelta: number; summary: AmendmentSummaryJson; error: string | null }> {
  const reqId = labRequestId.trim();
  const salePrices = await fetchLabSalePricesByTestId(db, reqId);
  const baselineBillable = new Set(collapseComponentsToPanel([...salePrices.keys()], catalog));
  const desiredBillable = new Set(collapseComponentsToPanel(desiredTestIds, catalog));

  const removedBillable = [...baselineBillable].filter((id) => !desiredBillable.has(id));
  const addedBillable = [...desiredBillable].filter((id) => !baselineBillable.has(id));

  const priceRes = await fetchLabServicePricesMapAdmin(db, [...removedBillable, ...addedBillable]);
  if (priceRes.error) return { amountDelta: 0, summary: { added: [], removed: [] }, error: priceRes.error };

  const names = await loadTestNames(db, [...removedBillable, ...addedBillable]);
  const labelFor = (testId: string) => resolveLabTestDisplayName(testId, names, catalog);

  const removed: AmendmentSummaryJson["removed"] = [];
  let removedTotal = 0;
  for (const tid of removedBillable) {
    const amt = roundMoney2(salePrices.get(tid) ?? priceRes.pricesByTestId.get(tid) ?? 0);
    removedTotal = roundMoney2(removedTotal + amt);
    removed.push({ label: labelFor(tid), amount: amt, lab_test_id: tid });
  }

  const added: AmendmentSummaryJson["added"] = [];
  let addedTotal = 0;
  for (const tid of addedBillable) {
    const amt = roundMoney2(priceRes.pricesByTestId.get(tid) ?? 0);
    addedTotal = roundMoney2(addedTotal + amt);
    added.push({ label: labelFor(tid), amount: amt, lab_test_id: tid });
  }

  return {
    amountDelta: roundMoney2(addedTotal - removedTotal),
    summary: { added, removed },
    error: null,
  };
}

async function computeImagingAmendmentBillingAgainstPaidSale(
  db: SupabaseClient,
  imagingRequestId: string,
  catalog: ImagingCatalogRow[],
  selection: Record<string, ImagingLineSelection>,
): Promise<{ amountDelta: number; summary: AmendmentSummaryJson; error: string | null }> {
  const reqId = imagingRequestId.trim();
  const desiredLines = desiredImagingLinesFromSelection(catalog, selection);
  const desiredCatalogIds = new Set(desiredLines.map((l) => l.imaging_catalog_id));
  const salePrices = await fetchImagingSalePricesByCatalogId(db, reqId);
  const baselineCatalogIds = new Set(salePrices.keys());

  const removed: AmendmentSummaryJson["removed"] = [];
  let removedTotal = 0;
  for (const cid of baselineCatalogIds) {
    if (desiredCatalogIds.has(cid)) continue;
    const row = catalog.find((c) => c.id === cid);
    const amt = roundMoney2(salePrices.get(cid) ?? row?.default_price ?? 0);
    removedTotal = roundMoney2(removedTotal + amt);
    removed.push({
      label: row?.name ?? cid,
      amount: amt,
      imaging_catalog_id: cid,
    });
  }

  const added: AmendmentSummaryJson["added"] = [];
  let addedTotal = 0;
  for (const line of desiredLines) {
    if (baselineCatalogIds.has(line.imaging_catalog_id)) continue;
    const amt = roundMoney2(line.unit_price);
    addedTotal = roundMoney2(addedTotal + amt);
    added.push({
      label: line.study_name,
      amount: amt,
      imaging_catalog_id: line.imaging_catalog_id,
    });
  }

  return {
    amountDelta: roundMoney2(addedTotal - removedTotal),
    summary: { added, removed },
    error: null,
  };
}

async function fetchLabSalePricesByTestId(
  db: SupabaseClient,
  labRequestId: string,
): Promise<Map<string, number>> {
  const { data: sales, error: sErr } = await db
    .from("lab_sales")
    .select("id")
    .eq("lab_request_id", labRequestId);
  if (sErr || !sales?.length) return new Map();

  const saleIds = (sales as Array<{ id: string }>).map((s) => s.id).filter(Boolean);
  const { data: lines, error: lErr } = await db
    .from("lab_sale_items")
    .select("lab_test_id, unit_price, quantity, discount")
    .in("lab_sale_id", saleIds);
  if (lErr) return new Map();

  const m = new Map<string, number>();
  for (const row of (lines ?? []) as Array<{
    lab_test_id?: string | null;
    unit_price?: number | string | null;
    quantity?: number | null;
    discount?: number | string | null;
  }>) {
    const tid = String(row.lab_test_id ?? "").trim();
    if (!tid) continue;
    const qty = moneyNum(row.quantity) || 1;
    const line = roundMoney2(qty * moneyNum(row.unit_price) - moneyNum(row.discount));
    m.set(tid, line);
  }
  return m;
}

async function fetchImagingSalePricesByCatalogId(
  db: SupabaseClient,
  imagingRequestId: string,
): Promise<Map<string, number>> {
  const { data: sales, error: sErr } = await db
    .from("lab_sales")
    .select("id")
    .eq("imaging_request_id", imagingRequestId);
  if (sErr || !sales?.length) return new Map();

  const saleIds = (sales as Array<{ id: string }>).map((s) => s.id).filter(Boolean);
  const { data: lines, error: lErr } = await db
    .from("lab_sale_items")
    .select("imaging_catalog_id, unit_price, quantity, discount")
    .in("lab_sale_id", saleIds);
  if (lErr) return new Map();

  const m = new Map<string, number>();
  for (const row of (lines ?? []) as Array<{
    imaging_catalog_id?: string | null;
    unit_price?: number | string | null;
    quantity?: number | null;
    discount?: number | string | null;
  }>) {
    const cid = String(row.imaging_catalog_id ?? "").trim();
    if (!cid) continue;
    const qty = moneyNum(row.quantity) || 1;
    const line = roundMoney2(qty * moneyNum(row.unit_price) - moneyNum(row.discount));
    m.set(cid, line);
  }
  return m;
}

async function loadTestNames(db: SupabaseClient, testIds: string[]): Promise<Map<string, string>> {
  const ids = [...new Set(testIds.filter(Boolean))];
  if (ids.length === 0) return new Map();
  const { data } = await db.from("lab_tests").select("id, name").in("id", ids);
  const m = new Map<string, string>();
  for (const r of (data ?? []) as Array<{ id: string; name: string | null }>) {
    m.set(r.id, String(r.name ?? r.id).trim());
  }
  return m;
}

function resolveLabTestDisplayName(
  testId: string,
  names: Map<string, string>,
  catalog: LabTestCatalogItem[],
): string {
  const id = testId.trim();
  const fromDb = names.get(id)?.trim();
  if (fromDb && fromDb !== id) return fromDb;
  const fromCatalog = catalog.find((t) => t.id === id);
  if (fromCatalog) return labTestRowLabel(fromCatalog);
  return fromDb || id;
}

/** Billable panel/standalone rows the user is removing (not every expanded component line). */
function removedPanelIdsForItem(
  item: LabRequestItemStoredRow,
  removedBillable: readonly string[],
  catalog: LabTestCatalogItem[],
): string[] {
  const tid = item.lab_test_id.trim();
  if (item.is_billable && removedBillable.includes(tid)) return [tid];
  return getPanelIdsForComponent(catalog, tid).filter((pid) => removedBillable.includes(pid));
}

function formatGroupedLabAmendmentWarning(
  panelTestId: string,
  detailLabels: Set<string>,
  labelFor: (testId: string) => string,
  kind: "collected" | "results",
): string {
  const panel = labelFor(panelTestId);
  const suffix = kind === "collected" ? "specimen already collected" : "lab results already entered";
  const details = [...detailLabels]
    .filter((d) => d && d !== panel)
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  if (details.length === 0) return `${panel}: ${suffix}`;
  return `${panel}: ${suffix} (${details.join(", ")})`;
}

export type LabAmendmentPlan = {
  amountDelta: number;
  summary: AmendmentSummaryJson;
  desiredRows: ReturnType<typeof buildLabRequestItemRows>;
  toRemoveItems: LabRequestItemStoredRow[];
  toAddRows: ReturnType<typeof buildLabRequestItemRows>;
  warnings: string[];
};

export async function computeLabAmendmentPlan(
  db: SupabaseClient,
  labRequestId: string,
  desiredTestIds: string[],
  packageIds: number[],
  catalog: LabTestCatalogItem[],
): Promise<{ plan: LabAmendmentPlan | null; error: string | null }> {
  const reqId = labRequestId.trim();
  const desiredRows = buildLabRequestItemRows(desiredTestIds, catalog);
  const desiredTestIdSet = testIdSetFromDesiredRows(desiredRows);

  const { items: currentItems, error: iErr } = await fetchLabRequestItemsForRequestIds(db, [reqId]);
  if (iErr) return { plan: null, error: iErr };

  const currentBillable = billableTestIdsFromItems(currentItems);
  const desiredBillable = new Set(collapseComponentsToPanel(desiredTestIds, catalog));

  const removedBillable = [...currentBillable].filter((id) => !desiredBillable.has(id));
  const addedBillable = [...desiredBillable].filter((id) => !currentBillable.has(id));

  const salePrices = await fetchLabSalePricesByTestId(db, reqId);
  const priceRes = await fetchLabServicePricesMapAdmin(
    db,
    [...removedBillable, ...addedBillable],
  );
  if (priceRes.error) return { plan: null, error: priceRes.error };

  const toRemoveItems = currentItems.filter((i) => !desiredTestIdSet.has(i.lab_test_id));
  const currentTestIdSet = testIdSetFromDesiredRows(currentItems);
  const toAddRows = desiredRows.filter((r) => !currentTestIdSet.has(r.lab_test_id));

  const nameIds = [
    ...removedBillable,
    ...addedBillable,
    ...toRemoveItems.map((i) => i.lab_test_id),
    ...toAddRows.map((r) => r.lab_test_id),
  ];
  const names = await loadTestNames(db, nameIds);
  const labelFor = (testId: string) => resolveLabTestDisplayName(testId, names, catalog);

  const removed: AmendmentSummaryJson["removed"] = [];
  let removedTotal = 0;
  for (const tid of removedBillable) {
    const amt = roundMoney2(salePrices.get(tid) ?? priceRes.pricesByTestId.get(tid) ?? 0);
    removedTotal = roundMoney2(removedTotal + amt);
    removed.push({ label: labelFor(tid), amount: amt, lab_test_id: tid });
  }

  const added: AmendmentSummaryJson["added"] = [];
  let addedTotal = 0;
  for (const tid of addedBillable) {
    const amt = roundMoney2(priceRes.pricesByTestId.get(tid) ?? 0);
    addedTotal = roundMoney2(addedTotal + amt);
    added.push({ label: labelFor(tid), amount: amt, lab_test_id: tid });
  }

  const amountDelta = roundMoney2(addedTotal - removedTotal);

  const warnings: string[] = [];
  const removeIds = new Set(toRemoveItems.map((i) => i.id));
  if (removeIds.size > 0) {
    const { data: resRows } = await db
      .from("lab_results")
      .select("lab_request_item_id")
      .in("lab_request_item_id", [...removeIds]);
    const resulted = new Set(
      ((resRows ?? []) as Array<{ lab_request_item_id?: string }>).map((r) =>
        String(r.lab_request_item_id ?? "").trim(),
      ),
    );
    const collectedByPanel = new Map<string, Set<string>>();
    const resultsByPanel = new Map<string, Set<string>>();

    for (const item of toRemoveItems) {
      const lineLabel = labelFor(item.lab_test_id);
      const panelIds = removedPanelIdsForItem(item, removedBillable, catalog);
      const groupIds = panelIds.length > 0 ? panelIds : item.is_billable ? [item.lab_test_id] : [];

      if (item.collected_item === "Y") {
        if (groupIds.length === 0) {
          const k = item.lab_test_id;
          const set = collectedByPanel.get(k) ?? new Set();
          set.add(lineLabel);
          collectedByPanel.set(k, set);
        } else {
          for (const pid of groupIds) {
            const set = collectedByPanel.get(pid) ?? new Set();
            set.add(lineLabel);
            collectedByPanel.set(pid, set);
          }
        }
      }
      if (resulted.has(item.id)) {
        if (groupIds.length === 0) {
          const k = item.lab_test_id;
          const set = resultsByPanel.get(k) ?? new Set();
          set.add(lineLabel);
          resultsByPanel.set(k, set);
        } else {
          for (const pid of groupIds) {
            const set = resultsByPanel.get(pid) ?? new Set();
            set.add(lineLabel);
            resultsByPanel.set(pid, set);
          }
        }
      }
    }

    for (const [panelId, details] of collectedByPanel) {
      warnings.push(formatGroupedLabAmendmentWarning(panelId, details, labelFor, "collected"));
    }
    for (const [panelId, details] of resultsByPanel) {
      warnings.push(formatGroupedLabAmendmentWarning(panelId, details, labelFor, "results"));
    }
  }

  void packageIds;

  return {
    plan: {
      amountDelta,
      summary: { added, removed, warnings },
      desiredRows,
      toRemoveItems,
      toAddRows,
      warnings,
    },
    error: null,
  };
}

export async function applyLabAmendment(
  db: SupabaseClient,
  input: {
    encounterId: string;
    labRequestId: string;
    desiredTestIds: string[];
    packageIds: number[];
    catalog: LabTestCatalogItem[];
    itemPriority?: string | null;
    acknowledgedWarnings?: boolean;
  },
): Promise<{
  amendmentId: string | null;
  amountDelta: number;
  warnings: string[];
  error: string | null;
}> {
  const enc = input.encounterId.trim();
  const reqId = input.labRequestId.trim();
  if (!enc || !reqId) return { amendmentId: null, amountDelta: 0, warnings: [], error: "Invalid encounter or lab request." };

  const { data: sale } = await db.from("lab_sales").select("id").eq("lab_request_id", reqId).limit(1).maybeSingle();
  if (!sale) {
    return { amendmentId: null, amountDelta: 0, warnings: [], error: "This lab order has not been paid yet. Use the catalog to add tests." };
  }

  const { data: hdr } = await db
    .from(LAB_REQUESTS_TABLE)
    .select("encounter_id")
    .eq("id", reqId)
    .maybeSingle();
  if (!hdr || String((hdr as { encounter_id?: string }).encounter_id ?? "").trim() !== enc) {
    return { amendmentId: null, amountDelta: 0, warnings: [], error: "Lab request does not belong to this visit." };
  }

  const { plan, error: pErr } = await computeLabAmendmentPlan(
    db,
    reqId,
    input.desiredTestIds,
    input.packageIds,
    input.catalog,
  );
  if (pErr || !plan) return { amendmentId: null, amountDelta: 0, warnings: [], error: pErr ?? "Could not compute amendment." };

  if (plan.warnings.length > 0 && !input.acknowledgedWarnings) {
    return {
      amendmentId: null,
      amountDelta: plan.amountDelta,
      warnings: plan.warnings,
      error: "CONFIRM_WARNINGS",
    };
  }

  if (
    plan.toRemoveItems.length === 0 &&
    plan.toAddRows.length === 0 &&
    plan.amountDelta === 0
  ) {
    return { amendmentId: null, amountDelta: 0, warnings: [], error: "No changes to save." };
  }

  const removeItemIds = plan.toRemoveItems.map((i) => i.id).filter(Boolean);
  if (removeItemIds.length > 0) {
    const { error: delResErr } = await db.from("lab_results").delete().in("lab_request_item_id", removeItemIds);
    if (delResErr) return { amendmentId: null, amountDelta: 0, warnings: [], error: delResErr.message };

    const { error: delItemErr } = await db.from(LAB_REQUEST_ITEMS_TABLE).delete().in("id", removeItemIds);
    if (delItemErr) return { amendmentId: null, amountDelta: 0, warnings: [], error: delItemErr.message };
  }

  if (plan.toAddRows.length > 0) {
    const priority = input.itemPriority ?? null;
    const inserts = plan.toAddRows.map((row) => ({
      lab_request_id: reqId,
      lab_test_id: row.lab_test_id,
      notes: null as string | null,
      priority,
      is_billable: row.is_billable,
    }));
    const { error: insErr } = await db.from(LAB_REQUEST_ITEMS_TABLE).insert(inserts);
    if (insErr) return { amendmentId: null, amountDelta: 0, warnings: [], error: insErr.message };
  }

  const pkgIds = normalizeLabRequestPackageIdList(input.packageIds);
  await db.from(LAB_REQUEST_PACKAGES_TABLE).delete().eq("lab_request_id", reqId);
  if (pkgIds.length > 0) {
    const pkgRows = pkgIds.map((lab_package_id, sort_order) => ({
      lab_request_id: reqId,
      lab_package_id,
      sort_order,
    }));
    const { error: pkgErr } = await db.from(LAB_REQUEST_PACKAGES_TABLE).insert(pkgRows);
    if (pkgErr) return { amendmentId: null, amountDelta: 0, warnings: [], error: pkgErr.message };
  }

  const billing = await computeLabAmendmentBillingAgainstPaidSale(
    db,
    reqId,
    input.desiredTestIds,
    input.catalog,
  );
  if (billing.error) return { amendmentId: null, amountDelta: 0, warnings: [], error: billing.error };

  const amendRes = await upsertPendingDiagnosticAmendment(db, {
    encounterId: enc,
    labRequestId: reqId,
    amountDelta: billing.amountDelta,
    summary: { ...billing.summary, warnings: plan.warnings },
  });
  if (amendRes.error) return { amendmentId: null, amountDelta: 0, warnings: [], error: amendRes.error };

  return {
    amendmentId: amendRes.amendmentId,
    amountDelta: billing.amountDelta,
    warnings: plan.warnings,
    error: null,
  };
}

export type ImagingAmendmentPlan = {
  amountDelta: number;
  summary: AmendmentSummaryJson;
  toRemove: Array<{ id: string; imaging_catalog_id: string; study_name: string }>;
  toAdd: Array<{
    imaging_catalog_id: string;
    study_code: string;
    study_name: string;
    view_text: string | null;
    unit_price: number;
  }>;
  warnings: string[];
};

function desiredImagingLinesFromSelection(
  catalog: ImagingCatalogRow[],
  selection: Record<string, ImagingLineSelection>,
): ImagingAmendmentPlan["toAdd"] {
  const out: ImagingAmendmentPlan["toAdd"] = [];
  for (const c of catalog) {
    const sel = selection[c.code];
    if (!sel?.checked) continue;
    out.push({
      imaging_catalog_id: c.id,
      study_code: c.code,
      study_name: c.name,
      view_text: c.requires_view_field ? (sel.view?.trim() || null) : null,
      unit_price: roundMoney2(c.default_price),
    });
  }
  return out;
}

export async function computeImagingAmendmentPlan(
  db: SupabaseClient,
  imagingRequestId: string,
  catalog: ImagingCatalogRow[],
  selection: Record<string, ImagingLineSelection>,
): Promise<{ plan: ImagingAmendmentPlan | null; error: string | null }> {
  const reqId = imagingRequestId.trim();
  const desiredLines = desiredImagingLinesFromSelection(catalog, selection);
  const desiredCatalogIds = new Set(desiredLines.map((l) => l.imaging_catalog_id));

  const { rows: current, error: cErr } = await fetchImagingRequestItemsForRequestIds(db, [reqId]);
  if (cErr) return { plan: null, error: cErr };

  const currentByCatalog = new Map(current.map((r) => [r.imaging_catalog_id, r]));
  const salePrices = await fetchImagingSalePricesByCatalogId(db, reqId);

  const removed: AmendmentSummaryJson["removed"] = [];
  let removedTotal = 0;
  const toRemove: ImagingAmendmentPlan["toRemove"] = [];
  for (const row of current) {
    if (desiredCatalogIds.has(row.imaging_catalog_id)) continue;
    const amt = roundMoney2(salePrices.get(row.imaging_catalog_id) ?? moneyNum(row.unit_price));
    removedTotal = roundMoney2(removedTotal + amt);
    removed.push({
      label: row.study_name,
      amount: amt,
      imaging_catalog_id: row.imaging_catalog_id,
    });
    toRemove.push({
      id: row.id,
      imaging_catalog_id: row.imaging_catalog_id,
      study_name: row.study_name,
    });
  }

  const added: AmendmentSummaryJson["added"] = [];
  let addedTotal = 0;
  const toAdd: ImagingAmendmentPlan["toAdd"] = [];
  for (const line of desiredLines) {
    if (currentByCatalog.has(line.imaging_catalog_id)) continue;
    const amt = roundMoney2(line.unit_price);
    addedTotal = roundMoney2(addedTotal + amt);
    added.push({
      label: line.study_name,
      amount: amt,
      imaging_catalog_id: line.imaging_catalog_id,
    });
    toAdd.push(line);
  }

  const warnings: string[] = [];
  for (const row of toRemove) {
    const full = current.find((r) => r.id === row.id);
    if (!full) continue;
    const captured =
      Boolean(full.image_storage_path?.trim()) ||
      (full.status ?? "").toLowerCase() === "completed" ||
      (full.status ?? "").toLowerCase() === "captured";
    if (captured) warnings.push(`${row.study_name}: imaging already captured`);
    if ((full.findings ?? "").trim()) warnings.push(`${row.study_name}: findings already entered`);
  }

  return {
    plan: {
      amountDelta: roundMoney2(addedTotal - removedTotal),
      summary: { added, removed, warnings },
      toRemove,
      toAdd,
      warnings,
    },
    error: null,
  };
}

export async function applyImagingAmendment(
  db: SupabaseClient,
  input: {
    encounterId: string;
    imagingRequestId: string;
    catalog: ImagingCatalogRow[];
    selection: Record<string, ImagingLineSelection>;
    acknowledgedWarnings?: boolean;
  },
): Promise<{
  amendmentId: string | null;
  amountDelta: number;
  warnings: string[];
  error: string | null;
}> {
  const enc = input.encounterId.trim();
  const reqId = input.imagingRequestId.trim();
  if (!enc || !reqId) return { amendmentId: null, amountDelta: 0, warnings: [], error: "Invalid encounter or imaging request." };

  const { data: sale } = await db
    .from("lab_sales")
    .select("id")
    .eq("imaging_request_id", reqId)
    .limit(1)
    .maybeSingle();
  if (!sale) {
    return {
      amendmentId: null,
      amountDelta: 0,
      warnings: [],
      error: "This imaging order has not been paid yet. Use the imaging catalog to add studies.",
    };
  }

  const { data: hdr } = await db
    .from(IMAGING_REQUESTS_TABLE)
    .select("encounter_id")
    .eq("id", reqId)
    .maybeSingle();
  if (!hdr || String((hdr as { encounter_id?: string }).encounter_id ?? "").trim() !== enc) {
    return { amendmentId: null, amountDelta: 0, warnings: [], error: "Imaging request does not belong to this visit." };
  }

  const { plan, error: pErr } = await computeImagingAmendmentPlan(db, reqId, input.catalog, input.selection);
  if (pErr || !plan) return { amendmentId: null, amountDelta: 0, warnings: [], error: pErr ?? "Could not compute amendment." };

  if (plan.warnings.length > 0 && !input.acknowledgedWarnings) {
    return {
      amendmentId: null,
      amountDelta: plan.amountDelta,
      warnings: plan.warnings,
      error: "CONFIRM_WARNINGS",
    };
  }

  if (plan.toRemove.length === 0 && plan.toAdd.length === 0 && plan.amountDelta === 0) {
    return { amendmentId: null, amountDelta: 0, warnings: [], error: "No changes to save." };
  }

  if (plan.toRemove.length > 0) {
    const ids = plan.toRemove.map((r) => r.id);
    const { error: delErr } = await db.from(IMAGING_REQUEST_ITEMS_TABLE).delete().in("id", ids);
    if (delErr) return { amendmentId: null, amountDelta: 0, warnings: [], error: delErr.message };
  }

  if (plan.toAdd.length > 0) {
    const inserts = plan.toAdd.map((row) => ({
      imaging_request_id: reqId,
      imaging_catalog_id: row.imaging_catalog_id,
      study_code: row.study_code,
      study_name: row.study_name,
      view_text: row.view_text,
      unit_price: row.unit_price,
      status: "Pending",
    }));
    const { error: insErr } = await db.from(IMAGING_REQUEST_ITEMS_TABLE).insert(inserts);
    if (insErr) return { amendmentId: null, amountDelta: 0, warnings: [], error: insErr.message };
  }

  const billing = await computeImagingAmendmentBillingAgainstPaidSale(
    db,
    reqId,
    input.catalog,
    input.selection,
  );
  if (billing.error) return { amendmentId: null, amountDelta: 0, warnings: [], error: billing.error };

  const amendRes = await upsertPendingDiagnosticAmendment(db, {
    encounterId: enc,
    imagingRequestId: reqId,
    amountDelta: billing.amountDelta,
    summary: { ...billing.summary, warnings: plan.warnings },
  });
  if (amendRes.error) return { amendmentId: null, amountDelta: 0, warnings: [], error: amendRes.error };

  return {
    amendmentId: amendRes.amendmentId,
    amountDelta: billing.amountDelta,
    warnings: plan.warnings,
    error: null,
  };
}

export async function fetchPaidLabRequestIdForEncounter(
  db: SupabaseClient,
  encounterId: string,
): Promise<{ labRequestId: string | null; error: string | null }> {
  const enc = encounterId.trim();
  if (!enc) return { labRequestId: null, error: null };

  const { data: reqs, error: rErr } = await db
    .from(LAB_REQUESTS_TABLE)
    .select("id")
    .eq("encounter_id", enc)
    .order("created_at", { ascending: false });
  if (rErr) return { labRequestId: null, error: rErr.message };

  const reqIds = ((reqs ?? []) as Array<{ id: string }>).map((r) => r.id).filter(Boolean);
  if (reqIds.length === 0) return { labRequestId: null, error: null };

  const { data: sales } = await db.from("lab_sales").select("lab_request_id").in("lab_request_id", reqIds);
  const paid = new Set(
    ((sales ?? []) as Array<{ lab_request_id?: string }>)
      .map((s) => String(s.lab_request_id ?? "").trim())
      .filter(Boolean),
  );
  for (const id of reqIds) {
    if (paid.has(id)) return { labRequestId: id, error: null };
  }
  return { labRequestId: null, error: null };
}

export async function fetchPaidImagingRequestIdForEncounter(
  db: SupabaseClient,
  encounterId: string,
): Promise<{ imagingRequestId: string | null; error: string | null }> {
  const enc = encounterId.trim();
  if (!enc) return { imagingRequestId: null, error: null };

  const { data: reqs, error: rErr } = await db
    .from(IMAGING_REQUESTS_TABLE)
    .select("id")
    .eq("encounter_id", enc)
    .order("created_at", { ascending: false });
  if (rErr) return { imagingRequestId: null, error: rErr.message };

  const reqIds = ((reqs ?? []) as Array<{ id: string }>).map((r) => r.id).filter(Boolean);
  if (reqIds.length === 0) return { imagingRequestId: null, error: null };

  const { data: sales } = await db
    .from("lab_sales")
    .select("imaging_request_id")
    .in("imaging_request_id", reqIds);
  const paid = new Set(
    ((sales ?? []) as Array<{ imaging_request_id?: string }>)
      .map((s) => String(s.imaging_request_id ?? "").trim())
      .filter(Boolean),
  );
  for (const id of reqIds) {
    if (paid.has(id)) return { imagingRequestId: id, error: null };
  }
  return { imagingRequestId: null, error: null };
}

/** Load billable+component test ids currently on a lab request for amend UI pre-check. */
export async function loadLabTestIdsForAmendUi(
  db: SupabaseClient,
  labRequestId: string,
): Promise<{ testIds: string[]; packageIds: number[]; error: string | null }> {
  const { items, error } = await fetchLabRequestItemsForRequestIds(db, [labRequestId]);
  if (error) return { testIds: [], packageIds: [], error };

  const { map, error: pErr } = await fetchLabRequestPackageIdsByRequestIdMap(db, [labRequestId]);
  if (pErr) return { testIds: [], packageIds: [], error: pErr };

  const catRes = await loadLabTestCatalogForTestIds(
    db,
    items.map((i) => i.lab_test_id),
  );
  if (catRes.error) return { testIds: [], packageIds: [], error: catRes.error };

  const selected = collapseComponentsToPanel(
    items.filter((i) => i.is_billable).map((i) => i.lab_test_id),
    catRes.catalog,
  );

  return {
    testIds: selected,
    packageIds: map.get(labRequestId) ?? [],
    error: null,
  };
}

export async function loadImagingSelectionForAmendUi(
  db: SupabaseClient,
  imagingRequestId: string,
  catalog: ImagingCatalogRow[],
): Promise<{ selection: Record<string, ImagingLineSelection>; error: string | null }> {
  const { rows, error } = await fetchImagingRequestItemsForRequestIds(db, [imagingRequestId]);
  if (error) return { selection: {}, error };

  const byCode = new Map(catalog.map((c) => [c.id, c.code]));
  const selection: Record<string, ImagingLineSelection> = {};
  for (const c of catalog) {
    selection[c.code] = { checked: false, view: "" };
  }
  for (const row of rows) {
    const code = byCode.get(row.imaging_catalog_id);
    if (!code) continue;
    selection[code] = {
      checked: true,
      view: row.view_text ?? "",
    };
  }
  return { selection, error: null };
}

export function buildAmendmentSaleItemsFromSummary(
  summary: AmendmentSummaryJson,
  kind: "added" | "removed",
): Array<{
  lab_test_id?: string | null;
  imaging_catalog_id?: string | null;
  quantity: number;
  unit_price: number;
  discount: number;
  notes: string | null;
}> {
  const lines = kind === "added" ? summary.added : summary.removed;
  return lines.map((line) => ({
    lab_test_id: line.lab_test_id ?? null,
    imaging_catalog_id: line.imaging_catalog_id ?? null,
    quantity: 1,
    unit_price: roundMoney2(line.amount),
    discount: 0,
    notes: line.label,
  }));
}

export async function markAmendmentSettled(
  db: SupabaseClient,
  amendmentId: string,
  settledLabSaleId: string | null,
): Promise<{ error: string | null }> {
  const { error } = await db
    .from(DIAGNOSTIC_ORDER_AMENDMENTS_TABLE)
    .update({
      status: "settled",
      settled_lab_sale_id: settledLabSaleId,
      settled_at: new Date().toISOString(),
    })
    .eq("id", amendmentId)
    .eq("status", "pending");

  if (error) return { error: error.message };
  return { error: null };
}

/** Pending amendment balance per encounter `trans_id` (service role). */
export async function fetchPendingDiagnosticAmendmentDueByEncounter(
  db: SupabaseClient,
): Promise<{ ids: Set<string>; amountDueByEncounterId: Map<string, number>; error: string | null }> {
  const out = new Set<string>();
  const amountDueByEncounterId = new Map<string, number>();
  const pageSize = 1000;
  let from = 0;
  for (;;) {
    const { data, error } = await db
      .from(DIAGNOSTIC_ORDER_AMENDMENTS_TABLE)
      .select("encounter_id, amount_delta")
      .eq("status", "pending")
      .range(from, from + pageSize - 1);

    if (error) {
      if (/diagnostic_order_amendments/i.test(error.message) && /does not exist|relation/i.test(error.message)) {
        return { ids: out, amountDueByEncounterId, error: null };
      }
      return { ids: new Set(), amountDueByEncounterId: new Map(), error: error.message };
    }

    const rows = (data ?? []) as Array<{ encounter_id?: string | null; amount_delta?: number | string | null }>;
    for (const r of rows) {
      const enc = String(r.encounter_id ?? "").trim();
      if (!enc) continue;
      const key = enc.toLowerCase();
      out.add(key);
      const delta = moneyNum(r.amount_delta);
      if (delta > 0) {
        amountDueByEncounterId.set(key, roundMoney2((amountDueByEncounterId.get(key) ?? 0) + delta));
      }
    }
    if (rows.length < pageSize) break;
    from += pageSize;
  }
  return { ids: out, amountDueByEncounterId, error: null };
}

/** All visit `trans_id`s with at least one pending diagnostic amendment (service role). */
export async function fetchEncounterIdsWithPendingDiagnosticAmendments(
  db: SupabaseClient,
): Promise<{ ids: Set<string>; error: string | null }> {
  const { ids, error } = await fetchPendingDiagnosticAmendmentDueByEncounter(db);
  return { ids, error };
}

/** Items on a paid lab request that are not on the original sale (cashier collectable). */
async function labAddedDueFromRequestVsSale(
  db: SupabaseClient,
  labRequestId: string,
  catalog: LabTestCatalogItem[],
): Promise<{ amountDelta: number; summary: AmendmentSummaryJson; error: string | null }> {
  const reqId = labRequestId.trim();
  const { items, error: itemsErr } = await fetchLabRequestItemsForRequestIds(db, [reqId]);
  if (itemsErr) return { amountDelta: 0, summary: { added: [], removed: [] }, error: itemsErr };

  const salePrices = await fetchLabSalePricesByTestId(db, reqId);
  const billableOnRequest = collapseComponentsToPanel(
    items.filter((i) => i.is_billable).map((i) => i.lab_test_id),
    catalog,
  );
  const priceRes = await fetchLabServicePricesMapAdmin(db, [...billableOnRequest]);
  if (priceRes.error) return { amountDelta: 0, summary: { added: [], removed: [] }, error: priceRes.error };

  const names = await loadTestNames(db, [...billableOnRequest]);
  const labelFor = (testId: string) => resolveLabTestDisplayName(testId, names, catalog);

  const added: AmendmentSummaryJson["added"] = [];
  let total = 0;
  for (const tid of billableOnRequest) {
    if (salePrices.has(tid)) continue;
    const amt = roundMoney2(priceRes.pricesByTestId.get(tid) ?? 0);
    if (amt <= 0) continue;
    total = roundMoney2(total + amt);
    added.push({ label: labelFor(tid), amount: amt, lab_test_id: tid });
  }
  return { amountDelta: total, summary: { added, removed: [] }, error: null };
}

/** Items on a paid imaging request that are not on the original sale (cashier collectable). */
async function imagingAddedDueFromRequestVsSale(
  db: SupabaseClient,
  imagingRequestId: string,
): Promise<{ amountDelta: number; summary: AmendmentSummaryJson; error: string | null }> {
  const reqId = imagingRequestId.trim();
  const { rows, error: itemsErr } = await fetchImagingRequestItemsForRequestIds(db, [reqId]);
  if (itemsErr) return { amountDelta: 0, summary: { added: [], removed: [] }, error: itemsErr };

  const salePrices = await fetchImagingSalePricesByCatalogId(db, reqId);
  const added: AmendmentSummaryJson["added"] = [];
  let total = 0;
  for (const row of rows) {
    const cid = String(row.imaging_catalog_id ?? "").trim();
    if (!cid || salePrices.has(cid)) continue;
    const amt = roundMoney2(moneyNum(row.unit_price));
    if (amt <= 0) continue;
    total = roundMoney2(total + amt);
    added.push({
      label: row.study_name?.trim() || row.study_code?.trim() || "Imaging study",
      amount: amt,
      imaging_catalog_id: cid,
    });
  }
  return { amountDelta: total, summary: { added, removed: [] }, error: null };
}

/**
 * Reconcile pending amendment rows from current paid lab/imaging orders (service role).
 * Use after consultation save when order lines changed but amendment rows are missing.
 */
export async function syncPendingDiagnosticAmendmentsForEncounter(
  db: SupabaseClient,
  encounterId: string,
  input: { labCatalog: LabTestCatalogItem[]; imagingCatalog: ImagingCatalogRow[] },
): Promise<{ synced: number; error: string | null }> {
  const enc = encounterId.trim();
  if (!enc) return { synced: 0, error: null };

  let synced = 0;

  const { data: labReqs, error: labReqErr } = await db
    .from(LAB_REQUESTS_TABLE)
    .select("id")
    .eq("encounter_id", enc);
  if (labReqErr) return { synced: 0, error: labReqErr.message };

  for (const raw of (labReqs ?? []) as Array<{ id?: string }>) {
    const reqId = String(raw.id ?? "").trim();
    if (!reqId) continue;
    const { data: sale } = await db.from("lab_sales").select("id").eq("lab_request_id", reqId).limit(1).maybeSingle();
    if (!sale) continue;

    const { items, error: itemsErr } = await fetchLabRequestItemsForRequestIds(db, [reqId]);
    if (itemsErr) return { synced, error: itemsErr };
    const desiredTestIds = collapseComponentsToPanel(
      items.filter((i) => i.is_billable).map((i) => i.lab_test_id),
      input.labCatalog,
    );
    const billing = await computeLabAmendmentBillingAgainstPaidSale(db, reqId, desiredTestIds, input.labCatalog);
    if (billing.error) return { synced, error: billing.error };

    let amountDelta = billing.amountDelta;
    let summary = billing.summary;
    if (amountDelta <= 0) {
      const fallback = await labAddedDueFromRequestVsSale(db, reqId, input.labCatalog);
      if (fallback.error) return { synced, error: fallback.error };
      if (fallback.amountDelta > 0) {
        amountDelta = fallback.amountDelta;
        summary = fallback.summary;
      }
    }

    const amendRes = await upsertPendingDiagnosticAmendment(db, {
      encounterId: enc,
      labRequestId: reqId,
      amountDelta,
      summary,
    });
    if (amendRes.error) return { synced, error: amendRes.error };
    synced += 1;
  }

  const { data: imgReqs, error: imgReqErr } = await db
    .from(IMAGING_REQUESTS_TABLE)
    .select("id")
    .eq("encounter_id", enc);
  if (imgReqErr) return { synced, error: imgReqErr.message };

  for (const raw of (imgReqs ?? []) as Array<{ id?: string }>) {
    const reqId = String(raw.id ?? "").trim();
    if (!reqId) continue;
    const { data: sale } = await db
      .from("lab_sales")
      .select("id")
      .eq("imaging_request_id", reqId)
      .limit(1)
      .maybeSingle();
    if (!sale) continue;

    const { selection, error: selErr } = await loadImagingSelectionForAmendUi(db, reqId, input.imagingCatalog);
    if (selErr) return { synced, error: selErr };

    const billing = await computeImagingAmendmentBillingAgainstPaidSale(
      db,
      reqId,
      input.imagingCatalog,
      selection,
    );
    if (billing.error) return { synced, error: billing.error };

    let amountDelta = billing.amountDelta;
    let summary = billing.summary;
    if (amountDelta <= 0) {
      const fallback = await imagingAddedDueFromRequestVsSale(db, reqId);
      if (fallback.error) return { synced, error: fallback.error };
      if (fallback.amountDelta > 0) {
        amountDelta = fallback.amountDelta;
        summary = fallback.summary;
      }
    }

    const amendRes = await upsertPendingDiagnosticAmendment(db, {
      encounterId: enc,
      imagingRequestId: reqId,
      amountDelta,
      summary,
    });
    if (amendRes.error) return { synced, error: amendRes.error };
    synced += 1;
  }

  return { synced, error: null };
}

export async function fetchAmendmentById(
  db: SupabaseClient,
  amendmentId: string,
): Promise<{ row: DiagnosticAmendmentRow | null; error: string | null }> {
  const id = amendmentId.trim();
  if (!id) return { row: null, error: "Missing amendment id." };

  const { data, error } = await db
    .from(DIAGNOSTIC_ORDER_AMENDMENTS_TABLE)
    .select(
      "id, encounter_id, lab_request_id, imaging_request_id, status, amount_delta, summary_json, settled_lab_sale_id, created_at, settled_at",
    )
    .eq("id", id)
    .maybeSingle();

  if (error) return { row: null, error: error.message };
  if (!data) return { row: null, error: "Amendment not found." };
  return { row: data as DiagnosticAmendmentRow, error: null };
}
