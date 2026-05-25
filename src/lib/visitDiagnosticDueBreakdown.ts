import type { DiagnosticAmendmentRow } from "@/lib/diagnosticAmendments";
import { fetchLabRequestsForEncounter } from "@/lib/labRequests";
import { fetchActiveLabPricesByTestIds } from "@/lib/labServicePrices";
import { fetchLabTestsByIds } from "@/lib/labTests";
import { IMAGING_CATALOG_TABLE } from "@/lib/imagingCatalog";
import { fetchImagingRequestItemsForRequestIdsClient } from "@/lib/imagingRequests";
import { supabase } from "@/lib/supabaseClient";

export type DiagnosticPricedItem = { name: string; price: number };

export type VisitDiagnosticDueBreakdown = {
  labPaid: DiagnosticPricedItem[];
  labDue: DiagnosticPricedItem[];
  labDueTotal: number;
  imagingPaid: DiagnosticPricedItem[];
  imagingDue: DiagnosticPricedItem[];
  imagingDueTotal: number;
  diagnosticDueTotal: number;
};

function moneyNum(v: number | string | null | undefined): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : Number(String(v));
  return Number.isFinite(n) ? n : 0;
}

function roundMoney2(n: number): number {
  return Math.round(n * 100) / 100;
}

function sumItems(items: DiagnosticPricedItem[]): number {
  return roundMoney2(items.reduce((s, it) => s + moneyNum(it.price), 0));
}

function saleLineAmount(unitPrice: unknown, quantity: unknown, discount: unknown): number {
  const qty = moneyNum(quantity as number | string) || 1;
  return roundMoney2(qty * moneyNum(unitPrice as number | string) - moneyNum(discount as number | string));
}

async function labSaleTestIdsForRequest(requestId: string): Promise<Set<string>> {
  const { data: sales } = await supabase.from("lab_sales").select("id").eq("lab_request_id", requestId);
  if (!sales?.length) return new Set();
  const saleIds = (sales as Array<{ id: string }>).map((s) => s.id).filter(Boolean);
  const { data: lines } = await supabase
    .from("lab_sale_items")
    .select("lab_test_id")
    .in("lab_sale_id", saleIds);
  const ids = new Set<string>();
  for (const r of (lines ?? []) as Array<{ lab_test_id?: string | null }>) {
    const tid = String(r.lab_test_id ?? "").trim();
    if (tid) ids.add(tid);
  }
  return ids;
}

async function labSaleLinesForRequest(requestId: string): Promise<DiagnosticPricedItem[]> {
  const { data: sales } = await supabase.from("lab_sales").select("id").eq("lab_request_id", requestId);
  if (!sales?.length) return [];
  const saleIds = (sales as Array<{ id: string }>).map((s) => s.id).filter(Boolean);
  const { data: lines } = await supabase
    .from("lab_sale_items")
    .select("lab_test_id, unit_price, quantity, discount")
    .in("lab_sale_id", saleIds);
  const rows = (lines ?? []) as Array<{
    lab_test_id?: string | null;
    unit_price?: number | string | null;
    quantity?: number | null;
    discount?: number | string | null;
  }>;
  const testIds = [...new Set(rows.map((r) => String(r.lab_test_id ?? "").trim()).filter(Boolean))];
  const tests = testIds.length > 0 ? await fetchLabTestsByIds(testIds) : { testsById: new Map(), error: null };
  const out: DiagnosticPricedItem[] = [];
  for (const r of rows) {
    const tid = String(r.lab_test_id ?? "").trim();
    if (!tid) continue;
    const name = tests.testsById.get(tid)?.name ?? `Lab test ${tid.slice(0, 8)}…`;
    out.push({ name, price: saleLineAmount(r.unit_price, r.quantity, r.discount) });
  }
  return out;
}

async function imagingSaleCatalogIdsForRequest(requestId: string): Promise<Set<string>> {
  const { data: sales } = await supabase.from("lab_sales").select("id").eq("imaging_request_id", requestId);
  if (!sales?.length) return new Set();
  const saleIds = (sales as Array<{ id: string }>).map((s) => s.id).filter(Boolean);
  const { data: lines } = await supabase
    .from("lab_sale_items")
    .select("imaging_catalog_id")
    .in("lab_sale_id", saleIds);
  const ids = new Set<string>();
  for (const r of (lines ?? []) as Array<{ imaging_catalog_id?: string | null }>) {
    const id = String(r.imaging_catalog_id ?? "").trim();
    if (id) ids.add(id);
  }
  return ids;
}

async function imagingSaleLinesForRequest(requestId: string): Promise<DiagnosticPricedItem[]> {
  const { data: sales } = await supabase.from("lab_sales").select("id").eq("imaging_request_id", requestId);
  if (!sales?.length) return [];
  const saleIds = (sales as Array<{ id: string }>).map((s) => s.id).filter(Boolean);
  const { data: lines } = await supabase
    .from("lab_sale_items")
    .select("imaging_catalog_id, unit_price, quantity, discount, notes")
    .in("lab_sale_id", saleIds);
  const rows = (lines ?? []) as Array<{
    imaging_catalog_id?: string | null;
    unit_price?: number | string | null;
    quantity?: number | null;
    discount?: number | string | null;
    notes?: string | null;
  }>;
  const itemRes = await fetchImagingRequestItemsForRequestIdsClient([requestId]);
  const namesByCatalogId = new Map<string, string>();
  for (const r of itemRes.rows) {
    const id = String(r.imaging_catalog_id ?? "").trim();
    if (!id) continue;
    const label = r.study_name?.trim() || r.study_code?.trim();
    if (label) namesByCatalogId.set(id, label);
  }
  const catalogIds = [...new Set(rows.map((r) => String(r.imaging_catalog_id ?? "").trim()).filter(Boolean))];
  if (catalogIds.length > 0) {
    const { data } = await supabase.from(IMAGING_CATALOG_TABLE).select("id, name, code").in("id", catalogIds);
    for (const raw of data ?? []) {
      const id = String((raw as { id?: string }).id ?? "").trim();
      const label =
        String((raw as { name?: string }).name ?? "").trim() ||
        String((raw as { code?: string }).code ?? "").trim();
      if (id && label && !namesByCatalogId.has(id)) namesByCatalogId.set(id, label);
    }
  }
  const out: DiagnosticPricedItem[] = [];
  for (const r of rows) {
    const cid = String(r.imaging_catalog_id ?? "").trim();
    if (!cid) continue;
    const fromNotes = String(r.notes ?? "").trim();
    const name = fromNotes || namesByCatalogId.get(cid) || "Imaging study";
    out.push({ name, price: saleLineAmount(r.unit_price, r.quantity, r.discount) });
  }
  return out;
}

function amendmentToView(row: DiagnosticAmendmentRow | undefined) {
  if (!row) return null;
  return {
    amountDelta: moneyNum(row.amount_delta),
    added: (row.summary_json?.added ?? []).map((l) => ({
      name: l.label,
      price: moneyNum(l.amount),
    })),
    removed: (row.summary_json?.removed ?? []).map((l) => ({
      name: l.label,
      price: moneyNum(l.amount),
    })),
  };
}

/** Same due logic as consultation Charges — no duplicate list + amendment double-count. */
export async function fetchVisitDiagnosticDueBreakdown(
  transId: string,
  pendingAmendments: DiagnosticAmendmentRow[] = [],
): Promise<{ breakdown: VisitDiagnosticDueBreakdown; error: string | null }> {
  const empty: VisitDiagnosticDueBreakdown = {
    labPaid: [],
    labDue: [],
    labDueTotal: 0,
    imagingPaid: [],
    imagingDue: [],
    imagingDueTotal: 0,
    diagnosticDueTotal: 0,
  };

  const labAmend = pendingAmendments.find((r) => r.lab_request_id);
  const imgAmend = pendingAmendments.find((r) => r.imaging_request_id);
  const labAmendView = amendmentToView(labAmend);
  const imgAmendView = amendmentToView(imgAmend);

  const enc = await fetchLabRequestsForEncounter(transId);
  if (enc.error) return { breakdown: empty, error: enc.error };

  const requests = [...enc.requests].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const reqIds = requests.map((r) => r.id).filter(Boolean);

  const labPaid: DiagnosticPricedItem[] = [];
  const labDueFromOrders: DiagnosticPricedItem[] = [];
  const dueTestIds = new Set<string>();

  if (reqIds.length > 0) {
    const { data: salesRows } = await supabase.from("lab_sales").select("lab_request_id").in("lab_request_id", reqIds);
    const paidReqIds = new Set(
      ((salesRows ?? []) as Array<{ lab_request_id?: string }>)
        .map((r) => String(r.lab_request_id ?? "").trim())
        .filter(Boolean),
    );

    const allTestIds = [...new Set(requests.flatMap((r) => r.labTestIds))];
    if (allTestIds.length > 0) {
      const prices = await fetchActiveLabPricesByTestIds(allTestIds);
      if (prices.error) return { breakdown: empty, error: prices.error };
      const tests = await fetchLabTestsByIds(allTestIds);
      if (tests.error) return { breakdown: empty, error: tests.error };

      for (const req of requests) {
        if (paidReqIds.has(req.id)) {
          labPaid.push(...(await labSaleLinesForRequest(req.id)));
          const saleTestIds = await labSaleTestIdsForRequest(req.id);
          for (const tid of req.labTestIds) {
            const id = String(tid).trim();
            if (!id || saleTestIds.has(id) || dueTestIds.has(id)) continue;
            dueTestIds.add(id);
            labDueFromOrders.push({
              name: tests.testsById.get(id)?.name ?? `Lab test ${id.slice(0, 8)}…`,
              price: prices.pricesByTestId.get(id) ?? 0,
            });
          }
        }
        // Unpaid orders (no lab_sales yet) are listed separately at cashier as open lab requests — not “additional due”.
      }
    }
  }

  const sortByName = (list: DiagnosticPricedItem[]) =>
    list.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));

  let labDue: DiagnosticPricedItem[] = [];
  let labDueTotal = 0;
  if (labAmendView && labAmendView.amountDelta > 0) {
    labDue = labAmendView.added.length > 0 ? labAmendView.added : sortByName([...labDueFromOrders]);
    labDueTotal = roundMoney2(labAmendView.amountDelta);
  } else if (labDueFromOrders.length > 0) {
    labDue = sortByName(labDueFromOrders);
    labDueTotal = sumItems(labDue);
  }

  const { data: imgReqRows } = await supabase
    .from("imaging_requests")
    .select("id, created_at")
    .eq("encounter_id", transId)
    .order("created_at", { ascending: true });
  const imgRequests = (imgReqRows ?? []) as Array<{ id: string }>;
  const imgReqIds = imgRequests.map((r) => r.id).filter(Boolean);

  const imagingPaid: DiagnosticPricedItem[] = [];
  const imagingDueFromOrders: DiagnosticPricedItem[] = [];

  if (imgReqIds.length > 0) {
    const { data: imgSalesRows } = await supabase
      .from("lab_sales")
      .select("imaging_request_id")
      .in("imaging_request_id", imgReqIds);
    const paidImgReqIds = new Set(
      ((imgSalesRows ?? []) as Array<{ imaging_request_id?: string }>)
        .map((r) => String(r.imaging_request_id ?? "").trim())
        .filter(Boolean),
    );
    const itemRes = await fetchImagingRequestItemsForRequestIdsClient(imgReqIds);
    if (itemRes.error) return { breakdown: empty, error: itemRes.error };

    for (const req of imgRequests) {
      const rows = itemRes.rows.filter((r) => r.imaging_request_id === req.id);
      if (paidImgReqIds.has(req.id)) {
        imagingPaid.push(...(await imagingSaleLinesForRequest(req.id)));
        const saleCatalogIds = await imagingSaleCatalogIdsForRequest(req.id);
        for (const row of rows) {
          const cid = String(row.imaging_catalog_id ?? "").trim();
          if (!cid || saleCatalogIds.has(cid)) continue;
          imagingDueFromOrders.push({
            name: row.study_name?.trim() || row.study_code?.trim() || "Imaging study",
            price: roundMoney2(moneyNum(row.unit_price)),
          });
        }
      }
      // Unpaid imaging orders are open imaging requests at cashier — not “additional due”.
    }
  }

  let imagingDue: DiagnosticPricedItem[] = [];
  let imagingDueTotal = 0;
  if (imgAmendView && imgAmendView.amountDelta > 0) {
    imagingDue = imgAmendView.added.length > 0 ? imgAmendView.added : sortByName([...imagingDueFromOrders]);
    imagingDueTotal = roundMoney2(imgAmendView.amountDelta);
  } else if (imagingDueFromOrders.length > 0) {
    imagingDue = sortByName(imagingDueFromOrders);
    imagingDueTotal = sumItems(imagingDue);
  }

  const breakdown: VisitDiagnosticDueBreakdown = {
    labPaid: sortByName(labPaid),
    labDue,
    labDueTotal,
    imagingPaid: sortByName(imagingPaid),
    imagingDue,
    imagingDueTotal,
    diagnosticDueTotal: roundMoney2(labDueTotal + imagingDueTotal),
  };

  return { breakdown, error: null };
}

export function diagnosticBreakdownToPaymentSummaryRows(
  breakdown: VisitDiagnosticDueBreakdown,
  opts?: { feeTotalDue?: number },
): Array<{ label: string; amount: number }> {
  const rows: Array<{ label: string; amount: number }> = [];
  const fee = moneyNum(opts?.feeTotalDue);
  if (fee > 0) rows.push({ label: "Consultation charges", amount: fee });
  for (const it of breakdown.labDue) {
    rows.push({ label: `${it.name} (Laboratory)`, amount: moneyNum(it.price) });
  }
  for (const it of breakdown.imagingDue) {
    rows.push({ label: `${it.name} (Imaging)`, amount: moneyNum(it.price) });
  }
  return rows;
}
