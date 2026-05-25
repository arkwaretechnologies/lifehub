import type { SupabaseClient } from "@supabase/supabase-js";
import type { QueueTicketStatus } from "@/lib/queueReception";
import { loadLabTestCatalogForTestIds } from "@/lib/labRequests";
import { filterLabRequestItemsForResultEntry } from "@/lib/labTests";

function isYes(v: unknown): boolean {
  return String(v ?? "").trim().toUpperCase() === "Y";
}

export function nextLabQueueTicketStatus(
  allCollected: boolean,
  allHasResults: boolean,
): QueueTicketStatus {
  if (!allCollected) return "Called";
  if (allHasResults) return "Completed";
  return "Collected";
}

type RequestItemRow = {
  id: string;
  lab_test_id: string;
  collected_item?: string | null;
  is_billable?: boolean;
};

/** Collection + results completeness for LAB queue tickets (result-entry lines only). */
export async function computeLabRequestQueueCollectionState(
  admin: SupabaseClient,
  labRequestId: string,
): Promise<{
  error: string | null;
  anyCollected: boolean;
  allCollected: boolean;
  allHasResults: boolean;
  entryItemIds: string[];
}> {
  const { data: items, error: itemsErr } = await admin
    .from("lab_request_items")
    .select("id, lab_test_id, collected_item, is_billable")
    .eq("lab_request_id", labRequestId);
  if (itemsErr) {
    return { error: itemsErr.message, anyCollected: false, allCollected: false, allHasResults: false, entryItemIds: [] };
  }

  const rows = (items ?? []) as RequestItemRow[];
  const testIds = rows.map((r) => String(r.lab_test_id ?? "").trim()).filter(Boolean);
  const catRes = await loadLabTestCatalogForTestIds(admin, testIds);
  if (catRes.error) {
    return { error: catRes.error, anyCollected: false, allCollected: false, allHasResults: false, entryItemIds: [] };
  }

  const entryItems = filterLabRequestItemsForResultEntry(rows, catRes.catalog);
  const targets = entryItems.length > 0 ? entryItems : rows;
  const entryItemIds = targets
    .map((r) => String(r.id ?? "").trim())
    .filter((id): id is string => id !== "");

  const anyCollected = targets.some((r) => isYes(r.collected_item));
  const allCollected =
    targets.length > 0 && targets.every((r) => isYes(r.collected_item));

  let allHasResults = false;
  if (entryItemIds.length > 0) {
    const { data: resultRows, error: rErr } = await admin
      .from("lab_results")
      .select("lab_request_item_id, result_value")
      .in("lab_request_item_id", entryItemIds);
    if (rErr) {
      return { error: rErr.message, anyCollected, allCollected, allHasResults: false, entryItemIds };
    }
    const byId = new Map<string, string>();
    for (const rr of (resultRows ?? []) as Array<{
      lab_request_item_id: string;
      result_value: string | null;
    }>) {
      byId.set(rr.lab_request_item_id, String(rr.result_value ?? "").trim());
    }
    allHasResults = entryItemIds.every((id) => (byId.get(id) ?? "") !== "");
  }

  return { error: null, anyCollected, allCollected, allHasResults, entryItemIds };
}

/** Result-entry line ids on this request that are not yet marked collected. */
export async function listUncollectedEntryItemIdsForLabRequest(
  admin: SupabaseClient,
  labRequestId: string,
): Promise<{ error: string | null; ids: string[] }> {
  const reqId = labRequestId.trim();
  if (!reqId) return { error: "labRequestId is required.", ids: [] };

  const { data: items, error: itemsErr } = await admin
    .from("lab_request_items")
    .select("id, lab_test_id, collected_item, is_billable")
    .eq("lab_request_id", reqId);
  if (itemsErr) return { error: itemsErr.message, ids: [] };

  const rows = (items ?? []) as RequestItemRow[];
  const testIds = rows.map((r) => String(r.lab_test_id ?? "").trim()).filter(Boolean);
  const catRes = await loadLabTestCatalogForTestIds(admin, testIds);
  if (catRes.error) return { error: catRes.error, ids: [] };

  const entryItems = filterLabRequestItemsForResultEntry(rows, catRes.catalog);
  const targets = entryItems.length > 0 ? entryItems : rows;
  const ids = targets
    .filter((r) => !isYes(r.collected_item))
    .map((r) => String(r.id ?? "").trim())
    .filter(Boolean);
  return { error: null, ids };
}
