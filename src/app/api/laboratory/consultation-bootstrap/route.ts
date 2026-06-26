import { NextResponse } from "next/server";
import { getCachedLabCatalogAndPackages } from "@/lib/labCatalogCache";
import { fetchActiveLabPricesByTestIds } from "@/lib/labServicePrices";
import { fetchLabRequestsForEncounter } from "@/lib/labRequests";
import { labPackageHasMembers } from "@/lib/labPackages";
import { supabase } from "@/lib/supabaseClient";

function serializePriceMap(m: Map<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of m) out[k] = v;
  return out;
}

/**
 * One round-trip bootstrap for consultation / reception lab UI:
 * catalog sections, packages, prices, and encounter lab summary.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const encounterId = (url.searchParams.get("encounterId") ?? "").trim();
  const includePackageDetails = url.searchParams.get("fullPackages") !== "0";

  const catalogRes = await getCachedLabCatalogAndPackages();
  if (catalogRes.catalogError) {
    return NextResponse.json({ error: catalogRes.catalogError }, { status: 500 });
  }

  const allTestIds = catalogRes.sections.flatMap((s) => s.tests.map((t) => t.id));
  const [pricesRes, encRes] = await Promise.all([
    fetchActiveLabPricesByTestIds(allTestIds),
    encounterId
      ? fetchLabRequestsForEncounter(encounterId, { includePackageDetails })
      : Promise.resolve({
          requests: [],
          requestedTestIds: [],
          requestedPackageIds: [],
          storedItems: [],
          error: null,
        }),
  ]);

  if (encRes.error) {
    return NextResponse.json({ error: encRes.error }, { status: 500 });
  }

  let paidLabRequestIds: string[] = [];
  let labRequestIdsWithResults: string[] = [];
  const reqIds = encRes.requests.map((r) => r.id).filter(Boolean);
  if (reqIds.length > 0) {
    const { data: salesRows } = await supabase
      .from("lab_sales")
      .select("lab_request_id")
      .in("lab_request_id", reqIds);
    paidLabRequestIds = ((salesRows ?? []) as Array<{ lab_request_id?: string | null }>)
      .map((r) => String(r.lab_request_id ?? "").trim())
      .filter(Boolean);

    const itemIds = encRes.storedItems.map((i) => i.id).filter(Boolean);
    if (itemIds.length > 0) {
      const { data: resRows } = await supabase
        .from("lab_results")
        .select("lab_request_item_id")
        .in("lab_request_item_id", itemIds);
      const itemToReq = new Map(
        encRes.storedItems.map((i) => [i.id, i.lab_request_id] as const),
      );
      const withResults = new Set<string>();
      for (const rr of (resRows ?? []) as Array<{ lab_request_item_id?: string | null }>) {
        const rid = itemToReq.get(String(rr.lab_request_item_id ?? "").trim());
        if (rid) withResults.add(rid);
      }
      labRequestIdsWithResults = [...withResults];
    }
  }

  return NextResponse.json({
    sections: catalogRes.sections,
    packages: catalogRes.packages.filter((p) => labPackageHasMembers(p)),
    catalogFromCache: catalogRes.fromCache,
    pricesByTestId: serializePriceMap(pricesRes.pricesByTestId),
    pricesError: pricesRes.error,
    encounter: {
      requests: encRes.requests,
      requestedTestIds: encRes.requestedTestIds,
      requestedPackageIds: encRes.requestedPackageIds,
      paidLabRequestIds,
      labRequestIdsWithResults,
    },
  });
}
