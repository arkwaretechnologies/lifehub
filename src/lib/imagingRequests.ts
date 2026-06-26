import type { SupabaseClient } from "@supabase/supabase-js";
import type { ImagingResultTemplateResultLayout } from "@/lib/imagingResultTemplates";
import { parseTemplateResultLayout } from "@/lib/imagingResultTemplates";
import { resolvePackageCoveredImagingCatalogIds } from "@/lib/labPackages";
import {
  fetchEncounterDiagnosticOrderState,
  validateEncounterImagingCreate,
} from "@/lib/encounterDiagnosticOrderState";
import { supabase } from "@/lib/supabaseClient";
import {
  buildImagingRequestLinesFromCatalog,
  fetchActiveImagingCatalogForDb,
  imagingSelectionForCatalogIds,
  IMAGING_CATALOG_TABLE,
  type ImagingCatalogRow,
  type ImagingLineSelection,
} from "@/lib/imagingCatalog";

export const IMAGING_REQUESTS_TABLE = "imaging_requests" as const;
export const IMAGING_REQUEST_ITEMS_TABLE = "imaging_request_items" as const;

export type ImagingRequestItemRow = {
  id: string;
  imaging_request_id: string;
  imaging_catalog_id: string;
  study_code: string;
  study_name: string;
  view_text: string | null;
  unit_price: number;
  status: string;
  findings: string | null;
  remarks: string | null;
  performed_at?: string | null;
  updated_at?: string | null;
  results_template_code?: string | null;
  results_print_layout?: ImagingResultTemplateResultLayout | null;
  image_storage_path?: string | null;
  image_content_type?: string | null;
  image_original_filename?: string | null;
  image_uploaded_at?: string | null;
};

export function imagingItemHasPrintableResult(item: {
  findings?: string | null;
  remarks?: string | null;
}): boolean {
  return Boolean(String(item.findings ?? "").trim() || String(item.remarks ?? "").trim());
}

export type CreateImagingRequestInput = {
  encounterId: string | null;
  patientId: number | null;
  priority?: string;
  remarks?: string | null;
  /** Catalog code → selection */
  selection: Record<string, ImagingLineSelection>;
  catalog?: ImagingCatalogRow[];
  /** Package bundle ids — covered imaging catalog members are stored at unit_price 0. */
  packageIds?: number[] | null;
};

function parseImagingPackageId(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  const n = typeof raw === "number" ? raw : Number(String(raw));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.trunc(n);
}

function normalizeImagingPackageIds(raw: unknown[] | null | undefined): number[] {
  const out: number[] = [];
  const seen = new Set<number>();
  for (const rawId of raw ?? []) {
    const id = parseImagingPackageId(rawId);
    if (id == null || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

async function resolveCoveredCatalogIdsForImagingCreate(
  db: SupabaseClient | typeof supabase,
  packageIds: number[],
): Promise<{ covered: Set<string>; error: string | null }> {
  if (packageIds.length === 0) return { covered: new Set(), error: null };
  return resolvePackageCoveredImagingCatalogIds(db as SupabaseClient, packageIds);
}

function unitPriceForImagingCatalogItem(
  catalogId: string,
  defaultPrice: number,
  covered: Set<string>,
): number {
  return covered.has(catalogId) ? 0 : defaultPrice;
}

/** Zero out unpaid imaging line prices for studies covered by packages on the same visit. */
export async function syncUnpaidImagingItemsToPackageCoverage(
  db: SupabaseClient,
  encounterId: string,
  packageIds: number[],
): Promise<{ error: string | null }> {
  const enc = encounterId.trim();
  const ids = normalizeImagingPackageIds(packageIds);
  if (!enc || ids.length === 0) return { error: null };

  const { covered, error: covErr } = await resolvePackageCoveredImagingCatalogIds(db, ids);
  if (covErr) return { error: covErr };
  if (covered.size === 0) return { error: null };

  const { data: soldRows, error: soldErr } = await db
    .from("lab_sales")
    .select("imaging_request_id")
    .not("imaging_request_id", "is", null);
  if (soldErr) return { error: soldErr.message };

  const paidReqIds = new Set(
    ((soldRows ?? []) as Array<{ imaging_request_id?: string | null }>)
      .map((r) => String(r.imaging_request_id ?? "").trim())
      .filter(Boolean),
  );

  const { data: reqRows, error: reqErr } = await db
    .from(IMAGING_REQUESTS_TABLE)
    .select("id")
    .eq("encounter_id", enc);
  if (reqErr) return { error: reqErr.message };

  const unpaidReqIds = ((reqRows ?? []) as Array<{ id?: string }>)
    .map((r) => String(r.id ?? "").trim())
    .filter((id) => id && !paidReqIds.has(id));
  if (unpaidReqIds.length === 0) return { error: null };

  const { data: itemRows, error: itemErr } = await db
    .from(IMAGING_REQUEST_ITEMS_TABLE)
    .select("id, imaging_catalog_id, unit_price")
    .in("imaging_request_id", unpaidReqIds);
  if (itemErr) return { error: itemErr.message };

  for (const row of (itemRows ?? []) as Array<{
    id?: string;
    imaging_catalog_id?: string;
    unit_price?: number;
  }>) {
    const itemId = String(row.id ?? "").trim();
    const cid = String(row.imaging_catalog_id ?? "").trim();
    if (!itemId || !cid || !covered.has(cid)) continue;
    if (Number(row.unit_price) === 0) continue;
    const { error: upErr } = await db
      .from(IMAGING_REQUEST_ITEMS_TABLE)
      .update({ unit_price: 0 })
      .eq("id", itemId);
    if (upErr) return { error: upErr.message };
  }

  return { error: null };
}

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

export function imagingSelectionHasChecked(sel: Record<string, ImagingLineSelection>): boolean {
  return Object.values(sel).some((r) => r?.checked);
}

async function unpaidImagingRequestIdsForEncounter(
  db: SupabaseClient,
  encounterId: string,
): Promise<{ ids: string[]; error: string | null }> {
  const enc = encounterId.trim();
  if (!enc) return { ids: [], error: null };

  const { data: soldRows, error: soldErr } = await db
    .from("lab_sales")
    .select("imaging_request_id")
    .not("imaging_request_id", "is", null);
  if (soldErr) return { ids: [], error: soldErr.message };

  const paidReqIds = new Set(
    ((soldRows ?? []) as Array<{ imaging_request_id?: string | null }>)
      .map((r) => String(r.imaging_request_id ?? "").trim())
      .filter(Boolean),
  );

  const { data: reqRows, error: reqErr } = await db
    .from(IMAGING_REQUESTS_TABLE)
    .select("id, created_at")
    .eq("encounter_id", enc)
    .order("created_at", { ascending: false });
  if (reqErr) return { ids: [], error: reqErr.message };

  const ids = ((reqRows ?? []) as Array<{ id?: string }>)
    .map((r) => String(r.id ?? "").trim())
    .filter((id) => id && !paidReqIds.has(id));
  return { ids, error: null };
}

async function addMissingPackageImagingItemsToRequest(
  db: SupabaseClient,
  imagingRequestId: string,
  catalog: ImagingCatalogRow[],
  covered: Set<string>,
  alreadyOnEncounter?: Set<string>,
): Promise<{ error: string | null }> {
  const { data: existing, error } = await db
    .from(IMAGING_REQUEST_ITEMS_TABLE)
    .select("imaging_catalog_id")
    .eq("imaging_request_id", imagingRequestId);
  if (error) return { error: error.message };

  const have = new Set(
    ((existing ?? []) as Array<{ imaging_catalog_id?: string | null }>)
      .map((r) => String(r.imaging_catalog_id ?? "").trim())
      .filter(Boolean),
  );
  const onEncounter = alreadyOnEncounter ?? new Set<string>();

  const itemRows: Array<Record<string, unknown>> = [];
  for (const c of catalog) {
    if (!covered.has(c.id) || have.has(c.id) || onEncounter.has(c.id)) continue;
    itemRows.push({
      imaging_request_id: imagingRequestId,
      imaging_catalog_id: c.id,
      study_code: c.code,
      study_name: c.name,
      view_text: null,
      unit_price: 0,
      status: "Pending",
    });
  }

  if (itemRows.length === 0) return { error: null };
  const { error: insErr } = await db.from(IMAGING_REQUEST_ITEMS_TABLE).insert(itemRows);
  return { error: insErr?.message ?? null };
}

async function createImagingRequestWithItemsOnDb(
  db: SupabaseClient,
  input: CreateImagingRequestInput,
): Promise<{ imagingRequestId: string | null; error: string | null }> {
  if (!imagingSelectionHasChecked(input.selection)) {
    return { imagingRequestId: null, error: "Select at least one imaging study." };
  }

  const catalog =
    input.catalog ??
    (await fetchActiveImagingCatalogForDb(db)).rows;

  const enc = input.encounterId != null ? String(input.encounterId).trim() : "";
  let selection = input.selection;
  if (enc) {
    const validated = await validateEncounterImagingCreate(db, enc, selection, catalog);
    if (validated.error) return { imagingRequestId: null, error: validated.error };
    selection = validated.selection;
  }

  const lines = buildImagingRequestLinesFromCatalog(catalog, selection);
  if (lines.length === 0) {
    return { imagingRequestId: null, error: "Select at least one imaging study." };
  }

  const packageIds = normalizeImagingPackageIds(input.packageIds ?? []);
  const { covered, error: covErr } = await resolveCoveredCatalogIdsForImagingCreate(db, packageIds);
  if (covErr) return { imagingRequestId: null, error: covErr };

  if (input.encounterId != null && enc === "") {
    return { imagingRequestId: null, error: "Invalid encounter." };
  }
  if (input.encounterId == null && (input.patientId == null || !Number.isFinite(input.patientId) || input.patientId <= 0)) {
    return { imagingRequestId: null, error: "Imaging orders require a patient." };
  }

  const now = new Date();
  const { data: row, error: insErr } = await db
    .from(IMAGING_REQUESTS_TABLE)
    .insert({
      encounter_id: enc === "" ? null : enc,
      patient_id: input.patientId,
      request_date: localDateYmd(now),
      request_time: localTimeHms(now),
      priority: (input.priority ?? "Routine").trim() || "Routine",
      remarks: input.remarks?.trim() ? input.remarks.trim() : null,
      status: "Pending",
    })
    .select("id")
    .single();

  if (insErr) return { imagingRequestId: null, error: insErr.message };
  const imagingRequestId = (row as { id: string }).id;

  const itemRows: Array<Record<string, unknown>> = [];
  for (const c of catalog) {
    const sel = selection[c.code];
    if (!sel?.checked) continue;
    itemRows.push({
      imaging_request_id: imagingRequestId,
      imaging_catalog_id: c.id,
      study_code: c.code,
      study_name: c.name,
      view_text: c.requires_view_field ? (sel.view?.trim() || null) : null,
      unit_price: unitPriceForImagingCatalogItem(c.id, c.default_price, covered),
      status: "Pending",
    });
  }

  if (itemRows.length === 0) {
    await db.from(IMAGING_REQUESTS_TABLE).delete().eq("id", imagingRequestId);
    return { imagingRequestId: null, error: "No imaging studies to save." };
  }

  const { error: itemsErr } = await db.from(IMAGING_REQUEST_ITEMS_TABLE).insert(itemRows);
  if (itemsErr) {
    await db.from(IMAGING_REQUESTS_TABLE).delete().eq("id", imagingRequestId);
    return { imagingRequestId: null, error: itemsErr.message };
  }

  if (enc && packageIds.length > 0) {
    const sync = await syncUnpaidImagingItemsToPackageCoverage(db, enc, packageIds);
    if (sync.error) return { imagingRequestId: null, error: sync.error };
  }

  return { imagingRequestId, error: null };
}

/**
 * When a lab package includes imaging studies, ensure an unpaid imaging request exists on the visit.
 * Creates a new request or adds missing package members to an existing unpaid request.
 */
export async function ensureImagingRequestForLabPackages(
  db: SupabaseClient,
  input: {
    encounterId: string;
    patientId: number | null;
    packageIds: number[];
    selection?: Record<string, ImagingLineSelection>;
    remarks?: string | null;
    priority?: string;
  },
): Promise<{ imagingRequestId: string | null; error: string | null }> {
  const enc = input.encounterId.trim();
  const packageIds = normalizeImagingPackageIds(input.packageIds);
  if (!enc || packageIds.length === 0) return { imagingRequestId: null, error: null };

  const { covered, error: covErr } = await resolvePackageCoveredImagingCatalogIds(db, packageIds);
  if (covErr) return { imagingRequestId: null, error: covErr };
  if (covered.size === 0) return { imagingRequestId: null, error: null };

  const { rows: catalog, error: catErr } = await fetchActiveImagingCatalogForDb(db);
  if (catErr) return { imagingRequestId: null, error: catErr };

  const { state: encounterState, error: stateErr } = await fetchEncounterDiagnosticOrderState(db, enc, {
    imagingCatalog: catalog,
  });
  if (stateErr) return { imagingRequestId: null, error: stateErr };

  const missingCovered = new Set<string>();
  for (const cid of covered) {
    if (!encounterState.imagingCatalogIds.has(cid)) missingCovered.add(cid);
  }
  if (missingCovered.size === 0) return { imagingRequestId: null, error: null };

  const unpaid = await unpaidImagingRequestIdsForEncounter(db, enc);
  if (unpaid.error) return { imagingRequestId: null, error: unpaid.error };

  if (unpaid.ids.length > 0) {
    const imagingRequestId = unpaid.ids[0];
    const add = await addMissingPackageImagingItemsToRequest(
      db,
      imagingRequestId,
      catalog,
      missingCovered,
      encounterState.imagingCatalogIds,
    );
    if (add.error) return { imagingRequestId: null, error: add.error };
    const sync = await syncUnpaidImagingItemsToPackageCoverage(db, enc, packageIds);
    if (sync.error) return { imagingRequestId: null, error: sync.error };
    return { imagingRequestId, error: null };
  }

  const selection = imagingSelectionForCatalogIds(catalog, missingCovered, input.selection);
  if (!imagingSelectionHasChecked(selection)) {
    return { imagingRequestId: null, error: null };
  }

  return createImagingRequestWithItemsOnDb(db, {
    encounterId: enc,
    patientId: input.patientId,
    priority: input.priority,
    remarks: input.remarks ?? "Laboratory package imaging",
    selection,
    catalog,
    packageIds,
  });
}

export async function createImagingRequestWithItems(
  input: CreateImagingRequestInput,
): Promise<{ imagingRequestId: string | null; error: string | null }> {
  return createImagingRequestWithItemsOnDb(supabase, input);
}

/** Service-role create (reception / server routes). */
export async function adminCreateImagingRequestWithItems(
  admin: SupabaseClient,
  input: CreateImagingRequestInput,
): Promise<{ imagingRequestId: string | null; error: string | null }> {
  return createImagingRequestWithItemsOnDb(admin, input);
}

export type EncounterImagingRequestSummary = {
  id: string;
  encounter_id: string;
  request_date: string;
  request_time: string | null;
  priority: string;
  remarks: string | null;
  created_at: string;
};

/** Visit imaging orders with no `lab_sales.imaging_request_id` yet. */
export async function fetchImagingRequestsWithoutSaleForEncounters(
  encounterIds: string[],
): Promise<{ byEncounter: Map<string, EncounterImagingRequestSummary[]>; error: string | null }> {
  const ids = [...new Set(encounterIds.map((x) => x.trim()).filter(Boolean))];
  const byEncounter = new Map<string, EncounterImagingRequestSummary[]>();
  if (ids.length === 0) return { byEncounter, error: null };

  const { data: soldRows, error: soldErr } = await supabase
    .from("lab_sales")
    .select("imaging_request_id")
    .not("imaging_request_id", "is", null);
  if (soldErr) return { byEncounter, error: soldErr.message };

  const sold = new Set(
    ((soldRows ?? []) as Array<{ imaging_request_id?: string | null }>)
      .map((r) => String(r.imaging_request_id ?? "").trim())
      .filter(Boolean),
  );

  const { data, error } = await supabase
    .from(IMAGING_REQUESTS_TABLE)
    .select("id, encounter_id, request_date, request_time, priority, remarks, created_at")
    .in("encounter_id", ids)
    .order("created_at", { ascending: false });

  if (error) return { byEncounter, error: error.message };

  for (const raw of (data ?? []) as Array<Record<string, unknown>>) {
    const id = String(raw.id ?? "").trim();
    const enc = String(raw.encounter_id ?? "").trim();
    if (!id || !enc || sold.has(id)) continue;
    const row: EncounterImagingRequestSummary = {
      id,
      encounter_id: enc,
      request_date: String(raw.request_date ?? ""),
      request_time: raw.request_time == null ? null : String(raw.request_time),
      priority: String(raw.priority ?? "Routine"),
      remarks: raw.remarks == null ? null : String(raw.remarks),
      created_at: String(raw.created_at ?? ""),
    };
    const list = byEncounter.get(enc) ?? [];
    list.push(row);
    byEncounter.set(enc, list);
  }

  return { byEncounter, error: null };
}

export async function fetchImagingRequestItemsForRequestIdsClient(
  requestIds: string[],
): Promise<{ rows: ImagingRequestItemRow[]; error: string | null }> {
  const ids = [...new Set(requestIds.map((x) => x.trim()).filter(Boolean))];
  if (ids.length === 0) return { rows: [], error: null };

  const { data, error } = await supabase
    .from(IMAGING_REQUEST_ITEMS_TABLE)
    .select(
      "id, imaging_request_id, imaging_catalog_id, study_code, study_name, view_text, unit_price, status, findings, remarks, performed_at, updated_at, image_storage_path, image_content_type, image_original_filename, image_uploaded_at",
    )
    .in("imaging_request_id", ids);

  if (error) return { rows: [], error: error.message };
  return { rows: (data ?? []) as ImagingRequestItemRow[], error: null };
}

export async function fetchImagingRequestItemsForRequestIds(
  admin: SupabaseClient,
  requestIds: string[],
): Promise<{ rows: ImagingRequestItemRow[]; error: string | null }> {
  const ids = [...new Set(requestIds.map((x) => x.trim()).filter(Boolean))];
  if (ids.length === 0) return { rows: [], error: null };

  const { data, error } = await admin
    .from(IMAGING_REQUEST_ITEMS_TABLE)
    .select(
      "id, imaging_request_id, imaging_catalog_id, study_code, study_name, view_text, unit_price, status, findings, remarks, performed_at, updated_at, image_storage_path, image_content_type, image_original_filename, image_uploaded_at",
    )
    .in("imaging_request_id", ids);

  if (error) return { rows: [], error: error.message };
  const rows = (data ?? []) as ImagingRequestItemRow[];
  return { rows, error: null };
}

export async function enrichImagingRequestItemsWithCatalogPrint(
  admin: SupabaseClient,
  items: ImagingRequestItemRow[],
): Promise<{ items: ImagingRequestItemRow[]; error: string | null }> {
  const catalogIds = [...new Set(items.map((it) => String(it.imaging_catalog_id ?? "").trim()).filter(Boolean))];
  if (catalogIds.length === 0) return { items, error: null };

  const { data, error } = await admin
    .from(IMAGING_CATALOG_TABLE)
    .select("id, results_template_code, results_print_layout")
    .in("id", catalogIds);
  if (error) return { items, error: error.message };

  const byId = new Map<string, { results_template_code: string | null; results_print_layout: ImagingResultTemplateResultLayout | null }>();
  for (const raw of (data ?? []) as Array<Record<string, unknown>>) {
    const id = String(raw.id ?? "").trim();
    if (!id) continue;
    byId.set(id, {
      results_template_code:
        raw.results_template_code == null || String(raw.results_template_code).trim() === ""
          ? null
          : String(raw.results_template_code).trim().toUpperCase(),
      results_print_layout: parseTemplateResultLayout(raw.results_print_layout),
    });
  }

  return {
    items: items.map((it) => {
      const cat = byId.get(String(it.imaging_catalog_id ?? "").trim());
      if (!cat) return it;
      return {
        ...it,
        results_template_code: cat.results_template_code,
        results_print_layout: cat.results_print_layout,
      };
    }),
    error: null,
  };
}

/**
 * Remove unpaid imaging line items that are no longer covered by selected lab packages
 * or individually checked in the consultation imaging form.
 */
export async function pruneUnpaidEncounterImagingToSelection(
  encounterId: string,
  activeLabPackageIds: number[],
  keepIndividualCatalogIds: ReadonlySet<string>,
): Promise<{ error: string | null }> {
  const enc = encounterId.trim();
  if (!enc) return { error: null };

  const { covered, error: covErr } = await resolvePackageCoveredImagingCatalogIds(
    supabase,
    activeLabPackageIds,
  );
  if (covErr) return { error: covErr };

  const keep = new Set<string>(keepIndividualCatalogIds);
  for (const cid of covered) keep.add(cid);

  const unpaid = await unpaidImagingRequestIdsForEncounter(supabase, enc);
  if (unpaid.error) return { error: unpaid.error };
  if (unpaid.ids.length === 0) return { error: null };

  const { data: itemRows, error: itemErr } = await supabase
    .from(IMAGING_REQUEST_ITEMS_TABLE)
    .select("id, imaging_request_id, imaging_catalog_id")
    .in("imaging_request_id", unpaid.ids);
  if (itemErr) return { error: itemErr.message };

  const toDelete: string[] = [];
  for (const row of (itemRows ?? []) as Array<{
    id?: string;
    imaging_request_id?: string;
    imaging_catalog_id?: string | null;
  }>) {
    const itemId = String(row.id ?? "").trim();
    const cid = String(row.imaging_catalog_id ?? "").trim();
    if (!itemId || !cid) continue;
    if (!keep.has(cid)) toDelete.push(itemId);
  }

  if (toDelete.length > 0) {
    const { error: delErr } = await supabase
      .from(IMAGING_REQUEST_ITEMS_TABLE)
      .delete()
      .in("id", toDelete);
    if (delErr) return { error: delErr.message };
  }

  const { data: remainingRows, error: remErr } = await supabase
    .from(IMAGING_REQUEST_ITEMS_TABLE)
    .select("imaging_request_id")
    .in("imaging_request_id", unpaid.ids);
  if (remErr) return { error: remErr.message };

  const reqsWithItems = new Set(
    ((remainingRows ?? []) as Array<{ imaging_request_id?: string | null }>)
      .map((r) => String(r.imaging_request_id ?? "").trim())
      .filter(Boolean),
  );
  const emptyReqIds = unpaid.ids.filter((id) => !reqsWithItems.has(id));
  if (emptyReqIds.length > 0) {
    const { error: reqDelErr } = await supabase
      .from(IMAGING_REQUESTS_TABLE)
      .delete()
      .in("id", emptyReqIds);
    if (reqDelErr) return { error: reqDelErr.message };
  }

  return { error: null };
}

export async function deleteImagingRequestsForEncounter(
  encounterId: string,
): Promise<{ error: string | null }> {
  const id = encounterId.trim();
  if (!id) return { error: null };

  const { data: reqRows, error: reqErr } = await supabase
    .from(IMAGING_REQUESTS_TABLE)
    .select("id")
    .eq("encounter_id", id);

  if (reqErr) return { error: reqErr.message };
  const reqIds = ((reqRows ?? []) as Array<{ id: string }>).map((r) => r.id).filter(Boolean);
  if (reqIds.length === 0) return { error: null };

  const { error: itemsErr } = await supabase
    .from(IMAGING_REQUEST_ITEMS_TABLE)
    .delete()
    .in("imaging_request_id", reqIds);
  if (itemsErr) return { error: itemsErr.message };

  const { error: delErr } = await supabase.from(IMAGING_REQUESTS_TABLE).delete().in("id", reqIds);
  if (delErr) return { error: delErr.message };

  return { error: null };
}
