import type { SupabaseClient } from "@supabase/supabase-js";
import type { ImagingCatalogRow, ImagingLineSelection } from "@/lib/imagingCatalog";
import {
  fetchLabRequestItemsForRequestIds,
  fetchLabRequestPackageIdsByRequestIdMap,
  LAB_REQUESTS_TABLE,
  normalizeLabRequestPackageIdList,
} from "@/lib/labRequests";
import {
  fetchImagingRequestItemsForRequestIds,
  IMAGING_REQUESTS_TABLE,
} from "@/lib/imagingRequests";
import { collapseComponentsToPanel, expandPanelTestIds, type LabTestCatalogItem } from "@/lib/labTests";
import type { LabPackageWithTests } from "@/lib/labPackages";
import { parseLabRequestPackageId } from "@/lib/labRequests";

export type EncounterDiagnosticOrderState = {
  labTestIds: Set<string>;
  packageIds: Set<number>;
  imagingCatalogIds: Set<string>;
  imagingCatalogCodes: Set<string>;
};

export const EMPTY_ENCOUNTER_DIAGNOSTIC_ORDER_STATE: EncounterDiagnosticOrderState = {
  labTestIds: new Set(),
  packageIds: new Set(),
  imagingCatalogIds: new Set(),
  imagingCatalogCodes: new Set(),
};

export type FetchEncounterDiagnosticOrderStateOptions = {
  /** Lab request ids to exclude (e.g. the request being amended). */
  excludeLabRequestIds?: string[];
  /** Imaging request ids to exclude. */
  excludeImagingRequestIds?: string[];
  /** Optional catalog to resolve imaging catalog ids → codes. */
  imagingCatalog?: ImagingCatalogRow[];
};

export async function fetchEncounterDiagnosticOrderState(
  db: SupabaseClient,
  encounterId: string,
  options?: FetchEncounterDiagnosticOrderStateOptions,
): Promise<{ state: EncounterDiagnosticOrderState; error: string | null }> {
  const enc = encounterId.trim();
  if (!enc) return { state: EMPTY_ENCOUNTER_DIAGNOSTIC_ORDER_STATE, error: null };

  const excludeLab = new Set(
    (options?.excludeLabRequestIds ?? []).map((x) => String(x).trim()).filter(Boolean),
  );
  const excludeImg = new Set(
    (options?.excludeImagingRequestIds ?? []).map((x) => String(x).trim()).filter(Boolean),
  );

  const labTestIds = new Set<string>();
  const packageIds = new Set<number>();
  const imagingCatalogIds = new Set<string>();
  const imagingCatalogCodes = new Set<string>();

  const { data: reqRows, error: reqErr } = await db
    .from(LAB_REQUESTS_TABLE)
    .select("id")
    .eq("encounter_id", enc);
  if (reqErr) return { state: EMPTY_ENCOUNTER_DIAGNOSTIC_ORDER_STATE, error: reqErr.message };

  const labRequestIds = ((reqRows ?? []) as Array<{ id?: string }>)
    .map((r) => String(r.id ?? "").trim())
    .filter((id) => id && !excludeLab.has(id));

  if (labRequestIds.length > 0) {
    const itemRes = await fetchLabRequestItemsForRequestIds(db, labRequestIds);
    if (itemRes.error) return { state: EMPTY_ENCOUNTER_DIAGNOSTIC_ORDER_STATE, error: itemRes.error };
    for (const row of itemRes.items) {
      const tid = String(row.lab_test_id ?? "").trim();
      if (tid) labTestIds.add(tid);
    }
    const { map: pkgMap, error: pkgErr } = await fetchLabRequestPackageIdsByRequestIdMap(db, labRequestIds);
    if (pkgErr) return { state: EMPTY_ENCOUNTER_DIAGNOSTIC_ORDER_STATE, error: pkgErr };
    for (const list of pkgMap.values()) {
      for (const pid of list) packageIds.add(pid);
    }
  }

  const { data: imgReqRows, error: imgReqErr } = await db
    .from(IMAGING_REQUESTS_TABLE)
    .select("id")
    .eq("encounter_id", enc);
  if (imgReqErr) return { state: EMPTY_ENCOUNTER_DIAGNOSTIC_ORDER_STATE, error: imgReqErr.message };

  const imagingRequestIds = ((imgReqRows ?? []) as Array<{ id?: string }>)
    .map((r) => String(r.id ?? "").trim())
    .filter((id) => id && !excludeImg.has(id));

  if (imagingRequestIds.length > 0) {
    const { rows: imgItems, error: imgItemErr } = await fetchImagingRequestItemsForRequestIds(db, imagingRequestIds);
    if (imgItemErr) return { state: EMPTY_ENCOUNTER_DIAGNOSTIC_ORDER_STATE, error: imgItemErr };
    const catalogById = new Map(
      (options?.imagingCatalog ?? []).map((c) => [String(c.id).trim(), c.code] as const),
    );
    for (const row of imgItems) {
      const cid = String(row.imaging_catalog_id ?? "").trim();
      if (cid) imagingCatalogIds.add(cid);
      const code = String(row.study_code ?? "").trim();
      if (code) imagingCatalogCodes.add(code);
      const fromCatalog = catalogById.get(cid);
      if (fromCatalog) imagingCatalogCodes.add(fromCatalog);
    }
  }

  return {
    state: { labTestIds, packageIds, imagingCatalogIds, imagingCatalogCodes },
    error: null,
  };
}

export function filterNewLabTestIds(
  candidateIds: Iterable<string>,
  state: EncounterDiagnosticOrderState,
  catalog: LabTestCatalogItem[],
): string[] {
  const collapsed = collapseComponentsToPanel(candidateIds, catalog);
  return collapsed.filter((id) => !state.labTestIds.has(id));
}

export function findDuplicateLabTestIds(
  candidateIds: Iterable<string>,
  state: EncounterDiagnosticOrderState,
  catalog: LabTestCatalogItem[],
): string[] {
  const collapsed = collapseComponentsToPanel(candidateIds, catalog);
  return collapsed.filter((id) => state.labTestIds.has(id));
}

export function filterNewPackageIds(
  candidateIds: Iterable<number>,
  state: EncounterDiagnosticOrderState,
): number[] {
  return normalizeLabRequestPackageIdList([...candidateIds]).filter((id) => !state.packageIds.has(id));
}

function testsCoveredByPackageNums(
  packages: LabPackageWithTests[],
  packageNums: ReadonlySet<number>,
  catalog: LabTestCatalogItem[],
): Set<string> {
  const s = new Set<string>();
  for (const pkg of packages) {
    const num = parseLabRequestPackageId(pkg.id);
    if (num == null || !packageNums.has(num)) continue;
    for (const tid of pkg.labTestIds) {
      s.add(tid);
      for (const expanded of expandPanelTestIds([tid], catalog)) s.add(expanded);
    }
  }
  return s;
}

/** Build lab create payload for a new unpaid request (excludes paid-locked tests/packages). */
export function computeUnpaidLabSavePayload(
  selectedTestIds: Iterable<string>,
  selectedPackageCatalogIds: Iterable<string>,
  paidLockedTestIds: ReadonlySet<string>,
  paidLockedPackageNums: ReadonlySet<number>,
  packages: LabPackageWithTests[],
  catalog: LabTestCatalogItem[],
): { labTestIds: string[]; packageIds: number[] } {
  const packageIds = normalizeLabRequestPackageIdList(
    [...selectedPackageCatalogIds]
      .map((pid) => parseLabRequestPackageId(pid))
      .filter((n): n is number => n != null),
  ).filter((id) => !paidLockedPackageNums.has(id));

  const unpaidPkgNums = new Set(packageIds);
  const paidPkgCovered = testsCoveredByPackageNums(packages, paidLockedPackageNums, catalog);
  const unpaidPkgCovered = testsCoveredByPackageNums(packages, unpaidPkgNums, catalog);

  const collapsed = collapseComponentsToPanel(selectedTestIds, catalog);
  const labTestIds = collapsed.filter(
    (tid) =>
      !paidLockedTestIds.has(tid) && !paidPkgCovered.has(tid) && !unpaidPkgCovered.has(tid),
  );

  return { labTestIds, packageIds };
}

export function findDuplicatePackageIds(
  candidateIds: Iterable<number>,
  state: EncounterDiagnosticOrderState,
): number[] {
  return normalizeLabRequestPackageIdList([...candidateIds]).filter((id) => state.packageIds.has(id));
}

export function filterNewImagingSelection(
  selection: Record<string, ImagingLineSelection>,
  state: EncounterDiagnosticOrderState,
  catalog: ImagingCatalogRow[],
): Record<string, ImagingLineSelection> {
  const next: Record<string, ImagingLineSelection> = {};
  for (const c of catalog) {
    if (!c.code) continue;
    const sel = selection[c.code];
    if (!sel?.checked) continue;
    if (state.imagingCatalogCodes.has(c.code) || state.imagingCatalogIds.has(c.id)) continue;
    next[c.code] = sel;
  }
  return next;
}

export function findDuplicateImagingCatalogIds(
  selection: Record<string, ImagingLineSelection>,
  catalog: ImagingCatalogRow[],
  state: EncounterDiagnosticOrderState,
): string[] {
  const dup: string[] = [];
  for (const c of catalog) {
    if (!c.code) continue;
    const sel = selection[c.code];
    if (!sel?.checked) continue;
    if (state.imagingCatalogCodes.has(c.code) || state.imagingCatalogIds.has(c.id)) {
      dup.push(c.id);
    }
  }
  return dup;
}

function labTestNamesForIds(ids: string[], catalog: LabTestCatalogItem[]): string[] {
  return ids.map((id) => catalog.find((t) => t.id === id)?.name?.trim() || "Lab test").filter(Boolean);
}

function packageNamesForIds(ids: number[], packages: Array<{ id: string | number; name: string }>): string[] {
  return ids.map((pid) => {
    const hit = packages.find((p) => String(p.id) === String(pid));
    return hit?.name?.trim() || `Package #${pid}`;
  });
}

function imagingNamesForCatalogIds(ids: string[], catalog: ImagingCatalogRow[]): string[] {
  return ids.map((cid) => catalog.find((c) => c.id === cid)?.name?.trim() || "Imaging study");
}

/** Reject lab create payloads that repeat tests or packages already on the visit. */
export async function validateEncounterLabCreate(
  db: SupabaseClient,
  encounterId: string,
  labTestIds: string[],
  packageIds: number[],
  catalog: LabTestCatalogItem[],
  packageNameLookup?: Array<{ id: string | number; name: string }>,
): Promise<{ error: string | null; labTestIds: string[]; packageIds: number[] }> {
  const enc = encounterId.trim();
  if (!enc) {
    return { error: null, labTestIds, packageIds: normalizeLabRequestPackageIdList(packageIds) };
  }

  const { state, error: stateErr } = await fetchEncounterDiagnosticOrderState(db, enc);
  if (stateErr) return { error: stateErr, labTestIds: [], packageIds: [] };

  const normPkgs = normalizeLabRequestPackageIdList(packageIds);
  const dupPkgs = findDuplicatePackageIds(normPkgs, state);
  if (dupPkgs.length > 0) {
    const names = packageNamesForIds(dupPkgs, packageNameLookup ?? []);
    return {
      error: `Already ordered on this visit: ${names.join(", ")}.`,
      labTestIds: [],
      packageIds: [],
    };
  }

  const dupTests = findDuplicateLabTestIds(labTestIds, state, catalog);
  if (dupTests.length > 0) {
    const names = labTestNamesForIds(dupTests, catalog);
    return {
      error: `Already ordered on this visit: ${names.join(", ")}.`,
      labTestIds: [],
      packageIds: [],
    };
  }

  const newTests = filterNewLabTestIds(labTestIds, state, catalog);
  const newPkgs = filterNewPackageIds(normPkgs, state);
  if (newTests.length === 0 && newPkgs.length === 0) {
    return {
      error: "All selected tests and packages are already ordered on this visit.",
      labTestIds: [],
      packageIds: [],
    };
  }

  return { error: null, labTestIds: newTests, packageIds: newPkgs };
}

/** Reject imaging create when all selected studies already exist on the visit. */
export async function validateEncounterImagingCreate(
  db: SupabaseClient,
  encounterId: string,
  selection: Record<string, ImagingLineSelection>,
  catalog: ImagingCatalogRow[],
): Promise<{ error: string | null; selection: Record<string, ImagingLineSelection> }> {
  const enc = encounterId.trim();
  if (!enc) return { error: null, selection };

  const { state, error: stateErr } = await fetchEncounterDiagnosticOrderState(db, enc, { imagingCatalog: catalog });
  if (stateErr) return { error: stateErr, selection: {} };

  const dupIds = findDuplicateImagingCatalogIds(selection, catalog, state);
  if (dupIds.length > 0) {
    const checkedCount = Object.values(selection).filter((r) => r?.checked).length;
    const dupNames = imagingNamesForCatalogIds(dupIds, catalog);
    if (dupIds.length >= checkedCount) {
      return {
        error: "All selected imaging studies are already ordered on this visit.",
        selection: {},
      };
    }
    return {
      error: `Already ordered on this visit: ${dupNames.join(", ")}.`,
      selection: {},
    };
  }

  const filtered = filterNewImagingSelection(selection, state, catalog);
  if (!Object.values(filtered).some((r) => r?.checked)) {
    return {
      error: "All selected imaging studies are already ordered on this visit.",
      selection: {},
    };
  }

  return { error: null, selection: filtered };
}

/** Block amend adds that duplicate tests/packages on other lab requests for the visit. */
export async function validateEncounterLabAmendAdds(
  db: SupabaseClient,
  encounterId: string,
  labRequestId: string,
  testIdsToAdd: string[],
  packageIds: number[],
  catalog: LabTestCatalogItem[],
  packageNameLookup?: Array<{ id: string | number; name: string }>,
): Promise<{ error: string | null }> {
  const { state, error: stateErr } = await fetchEncounterDiagnosticOrderState(db, encounterId, {
    excludeLabRequestIds: [labRequestId],
  });
  if (stateErr) return { error: stateErr };

  const dupPkgs = findDuplicatePackageIds(packageIds, state);
  if (dupPkgs.length > 0) {
    return { error: `Already ordered on another request for this visit: ${packageNamesForIds(dupPkgs, packageNameLookup ?? []).join(", ")}.` };
  }

  const dupTests = findDuplicateLabTestIds(testIdsToAdd, state, catalog);
  if (dupTests.length > 0) {
    return { error: `Already ordered on another request for this visit: ${labTestNamesForIds(dupTests, catalog).join(", ")}.` };
  }

  return { error: null };
}

/** Block amend adds that duplicate imaging on other imaging requests for the visit. */
export async function validateEncounterImagingAmendAdds(
  db: SupabaseClient,
  encounterId: string,
  imagingRequestId: string,
  catalogIdsToAdd: string[],
  catalog: ImagingCatalogRow[],
): Promise<{ error: string | null }> {
  const { state, error: stateErr } = await fetchEncounterDiagnosticOrderState(db, encounterId, {
    excludeImagingRequestIds: [imagingRequestId],
    imagingCatalog: catalog,
  });
  if (stateErr) return { error: stateErr };

  const dup = catalogIdsToAdd.filter((cid) => state.imagingCatalogIds.has(cid));
  if (dup.length > 0) {
    return {
      error: `Already ordered on another imaging request for this visit: ${imagingNamesForCatalogIds(dup, catalog).join(", ")}.`,
    };
  }

  return { error: null };
}
