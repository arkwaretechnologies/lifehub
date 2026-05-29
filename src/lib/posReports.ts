/**
 * POS report queries for /reports/pos/* pages.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  PHARMACY_CATEGORIES_TABLE,
  PHARMACY_POS_READINGS_TABLE,
  PHARMACY_POS_SHIFTS_TABLE,
  PHARMACY_SALE_ITEMS_TABLE,
  PHARMACY_SALES_TABLE,
  PRODUCTS_TABLE,
  STOCK_TABLE,
  type ShiftReadingSnapshot,
} from "@/lib/pharmacyPosDb";
import { supabase } from "@/lib/supabaseClient";

export type DateRange = { startDate: string; endDate: string };

export const REPORT_PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
export const DEFAULT_REPORT_PAGE_SIZE = 25;

export type ReportPaginationMeta = {
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
};

export function parseReportPagination(
  pageRaw: string | null | undefined,
  pageSizeRaw: string | null | undefined,
): { page: number; pageSize: number } {
  const page = Math.max(0, Number.parseInt(pageRaw ?? "0", 10) || 0);
  const parsedSize = Number.parseInt(pageSizeRaw ?? String(DEFAULT_REPORT_PAGE_SIZE), 10);
  const pageSize = (REPORT_PAGE_SIZE_OPTIONS as readonly number[]).includes(parsedSize)
    ? parsedSize
    : DEFAULT_REPORT_PAGE_SIZE;
  return { page, pageSize };
}

export function paginateReportRows<T>(
  rows: T[],
  page: number,
  pageSize: number,
): { rows: T[]; pagination: ReportPaginationMeta } {
  const totalCount = rows.length;
  const totalPages = totalCount === 0 ? 0 : Math.ceil(totalCount / pageSize);
  const safePage = totalPages === 0 ? 0 : Math.min(page, totalPages - 1);
  const start = safePage * pageSize;
  return {
    rows: rows.slice(start, start + pageSize),
    pagination: {
      page: safePage,
      pageSize,
      totalCount,
      totalPages,
    },
  };
}

function formatLocalYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function defaultDateRange(daysBack = 14): DateRange {
  const end = new Date();
  end.setHours(0, 0, 0, 0);
  const start = new Date(end);
  start.setDate(start.getDate() - (daysBack - 1));
  return { startDate: formatLocalYmd(start), endDate: formatLocalYmd(end) };
}

export function parseDateRange(
  startRaw: string | null | undefined,
  endRaw: string | null | undefined,
  daysBack = 14,
): DateRange {
  const fallback = defaultDateRange(daysBack);
  const endDate =
    endRaw && /^\d{4}-\d{2}-\d{2}$/.test(endRaw.slice(0, 10))
      ? endRaw.slice(0, 10)
      : fallback.endDate;
  const startDate =
    startRaw && /^\d{4}-\d{2}-\d{2}$/.test(startRaw.slice(0, 10))
      ? startRaw.slice(0, 10)
      : fallback.startDate;
  if (startDate > endDate) return fallback;
  return { startDate, endDate };
}

export type DailySalesRow = { date: string; total: number; count: number };

export async function fetchDailySalesSummaryReport(
  range: DateRange,
  db: SupabaseClient = supabase,
): Promise<{
  daily: DailySalesRow[];
  totalRevenue: number;
  transactionCount: number;
  error: string | null;
}> {
  const { data, error } = await db
    .from(PHARMACY_SALES_TABLE)
    .select("sale_date, total_amount")
    .eq("status", "Completed")
    .gte("sale_date", range.startDate)
    .lte("sale_date", range.endDate);

  if (error) {
    return { daily: [], totalRevenue: 0, transactionCount: 0, error: error.message };
  }

  const byDay = new Map<string, { total: number; count: number }>();
  const start = new Date(`${range.startDate}T00:00:00`);
  const end = new Date(`${range.endDate}T00:00:00`);
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    byDay.set(formatLocalYmd(d), { total: 0, count: 0 });
  }

  let totalRevenue = 0;
  let transactionCount = 0;
  for (const raw of data ?? []) {
    const r = raw as { sale_date: string; total_amount: number | null };
    const amt = Number(r.total_amount) || 0;
    totalRevenue += amt;
    transactionCount += 1;
    const dayKey = (r.sale_date ?? "").slice(0, 10);
    if (byDay.has(dayKey)) {
      const cur = byDay.get(dayKey)!;
      cur.total += amt;
      cur.count += 1;
    }
  }

  const daily = [...byDay.entries()].map(([date, v]) => ({ date, total: v.total, count: v.count }));
  return { daily, totalRevenue, transactionCount, error: null };
}

export type SalesByProductRow = {
  productId: string;
  productLabel: string;
  quantitySold: number;
  revenue: number;
};

export async function fetchSalesByProductReport(
  range: DateRange,
  db: SupabaseClient = supabase,
): Promise<{ rows: SalesByProductRow[]; error: string | null }> {
  const { data: sales, error: sErr } = await db
    .from(PHARMACY_SALES_TABLE)
    .select("id")
    .eq("status", "Completed")
    .gte("sale_date", range.startDate)
    .lte("sale_date", range.endDate);
  if (sErr) return { rows: [], error: sErr.message };

  const saleIds = (sales ?? []).map((s) => (s as { id: string }).id);
  if (saleIds.length === 0) return { rows: [], error: null };

  const { data: items, error: iErr } = await db
    .from(PHARMACY_SALE_ITEMS_TABLE)
    .select("product_id, quantity, line_total")
    .in("pharmacy_sale_id", saleIds);
  if (iErr) return { rows: [], error: iErr.message };

  const agg = new Map<string, { qty: number; revenue: number }>();
  for (const raw of items ?? []) {
    const r = raw as { product_id: string; quantity: number; line_total: number | null };
    const pid = r.product_id;
    const cur = agg.get(pid) ?? { qty: 0, revenue: 0 };
    cur.qty += Math.round(Number(r.quantity)) || 0;
    cur.revenue += Number(r.line_total) || 0;
    agg.set(pid, cur);
  }

  const productIds = [...agg.keys()];
  if (productIds.length === 0) return { rows: [], error: null };

  const { data: products, error: pErr } = await db
    .from(PRODUCTS_TABLE)
    .select("id, generic_name, brand_name, strength, unit_of_measure")
    .in("id", productIds);
  if (pErr) return { rows: [], error: pErr.message };

  const labelById = new Map<string, string>();
  for (const p of products ?? []) {
    const row = p as {
      id: string;
      generic_name: string;
      brand_name: string | null;
      strength: string | null;
      unit_of_measure: string | null;
    };
    const parts = [row.generic_name, row.brand_name, row.strength, row.unit_of_measure].filter(Boolean);
    labelById.set(row.id, parts.join(" · "));
  }

  const rows: SalesByProductRow[] = [...agg.entries()]
    .map(([productId, v]) => ({
      productId,
      productLabel: labelById.get(productId) ?? productId,
      quantitySold: v.qty,
      revenue: Math.round(v.revenue * 100) / 100,
    }))
    .sort((a, b) => b.revenue - a.revenue);

  return { rows, error: null };
}

export type WalkInDailyRow = {
  date: string;
  walkInRevenue: number;
  walkInCount: number;
  rxRevenue: number;
  rxCount: number;
};

export async function fetchWalkInVsPrescriptionReport(
  range: DateRange,
  db: SupabaseClient = supabase,
): Promise<{
  walkInRevenue: number;
  walkInCount: number;
  rxRevenue: number;
  rxCount: number;
  totalRevenue: number;
  daily: WalkInDailyRow[];
  error: string | null;
}> {
  const { data, error } = await db
    .from(PHARMACY_SALES_TABLE)
    .select("sale_date, total_amount, prescription_id")
    .eq("status", "Completed")
    .gte("sale_date", range.startDate)
    .lte("sale_date", range.endDate);

  if (error) {
    return {
      walkInRevenue: 0,
      walkInCount: 0,
      rxRevenue: 0,
      rxCount: 0,
      totalRevenue: 0,
      daily: [],
      error: error.message,
    };
  }

  const byDay = new Map<string, { walkInRevenue: number; walkInCount: number; rxRevenue: number; rxCount: number }>();
  const start = new Date(`${range.startDate}T00:00:00`);
  const end = new Date(`${range.endDate}T00:00:00`);
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    byDay.set(formatLocalYmd(d), { walkInRevenue: 0, walkInCount: 0, rxRevenue: 0, rxCount: 0 });
  }

  let walkInRevenue = 0;
  let walkInCount = 0;
  let rxRevenue = 0;
  let rxCount = 0;
  for (const raw of data ?? []) {
    const r = raw as {
      sale_date: string;
      total_amount: number | null;
      prescription_id: string | null;
    };
    const amt = Number(r.total_amount) || 0;
    const dayKey = (r.sale_date ?? "").slice(0, 10);
    const day = byDay.get(dayKey);
    if (r.prescription_id) {
      rxRevenue += amt;
      rxCount += 1;
      if (day) {
        day.rxRevenue += amt;
        day.rxCount += 1;
      }
    } else {
      walkInRevenue += amt;
      walkInCount += 1;
      if (day) {
        day.walkInRevenue += amt;
        day.walkInCount += 1;
      }
    }
  }

  const daily: WalkInDailyRow[] = [...byDay.entries()].map(([date, v]) => ({ date, ...v }));
  return {
    walkInRevenue,
    walkInCount,
    rxRevenue,
    rxCount,
    totalRevenue: walkInRevenue + rxRevenue,
    daily,
    error: null,
  };
}

export type PaymentMethodRow = {
  paymentMethod: string;
  amount: number;
  transactionCount: number;
  percent: number;
};

export async function fetchPaymentMethodBreakdownReport(
  range: DateRange,
  db: SupabaseClient = supabase,
): Promise<{ rows: PaymentMethodRow[]; total: number; error: string | null }> {
  const { data, error } = await db
    .from(PHARMACY_SALES_TABLE)
    .select("total_amount, payment_method")
    .eq("status", "Completed")
    .gte("sale_date", range.startDate)
    .lte("sale_date", range.endDate);

  if (error) return { rows: [], total: 0, error: error.message };

  const agg = new Map<string, { amount: number; count: number }>();
  let total = 0;
  for (const raw of data ?? []) {
    const r = raw as { total_amount: number | null; payment_method: string | null };
    const amt = Number(r.total_amount) || 0;
    total += amt;
    const pm = (r.payment_method ?? "Other").trim() || "Other";
    const cur = agg.get(pm) ?? { amount: 0, count: 0 };
    cur.amount += amt;
    cur.count += 1;
    agg.set(pm, cur);
  }

  const rows: PaymentMethodRow[] = [...agg.entries()]
    .map(([paymentMethod, v]) => ({
      paymentMethod,
      amount: Math.round(v.amount * 100) / 100,
      transactionCount: v.count,
      percent: total > 0 ? Math.round((v.amount / total) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.amount - a.amount);

  return { rows, total: Math.round(total * 100) / 100, error: null };
}

export type VoidedReturnedRow = {
  id: string;
  orNumber: string;
  saleDate: string;
  totalAmount: number;
  status: string;
  kind: "Void" | "Full return" | "Partial return";
  notes: string | null;
};

function classifySaleKind(status: string, notes: string | null): VoidedReturnedRow["kind"] {
  const n = notes ?? "";
  if (status === "Voided") {
    if (n.includes("[VOID full return")) return "Full return";
    return "Void";
  }
  if (n.includes("[RETURN")) return "Partial return";
  return "Void";
}

export async function fetchVoidedReturnedSalesReport(
  range: DateRange,
  db: SupabaseClient = supabase,
): Promise<{ rows: VoidedReturnedRow[]; error: string | null }> {
  const { data: voided, error: vErr } = await db
    .from(PHARMACY_SALES_TABLE)
    .select("id, or_number, sale_date, total_amount, status, notes")
    .eq("status", "Voided")
    .gte("sale_date", range.startDate)
    .lte("sale_date", range.endDate)
    .order("sale_date", { ascending: false });

  if (vErr) return { rows: [], error: vErr.message };

  const { data: partial, error: pErr } = await db
    .from(PHARMACY_SALES_TABLE)
    .select("id, or_number, sale_date, total_amount, status, notes")
    .eq("status", "Completed")
    .gte("sale_date", range.startDate)
    .lte("sale_date", range.endDate)
    .like("notes", "%[RETURN%");

  if (pErr) return { rows: [], error: pErr.message };

  const rows: VoidedReturnedRow[] = [];
  for (const raw of [...(voided ?? []), ...(partial ?? [])]) {
    const r = raw as {
      id: string;
      or_number: string;
      sale_date: string;
      total_amount: number | null;
      status: string;
      notes: string | null;
    };
    rows.push({
      id: r.id,
      orNumber: r.or_number ?? "—",
      saleDate: (r.sale_date ?? "").slice(0, 10),
      totalAmount: Number(r.total_amount) || 0,
      status: r.status,
      kind: classifySaleKind(r.status, r.notes),
      notes: r.notes,
    });
  }

  rows.sort((a, b) => b.saleDate.localeCompare(a.saleDate));
  return { rows, error: null };
}

export type ShiftReadingRow = {
  id: string;
  readingType: "X" | "Z";
  createdAt: string;
  shiftId: string;
  openedAt: string | null;
  closedAt: string | null;
  grossSales: number;
  transactionCount: number;
  notes: string | null;
};

export async function fetchShiftReadingsReport(
  range: DateRange,
  db: SupabaseClient = supabase,
): Promise<{ rows: ShiftReadingRow[]; error: string | null }> {
  const rangeStartIso = `${range.startDate}T00:00:00.000Z`;
  const end = new Date(`${range.endDate}T00:00:00`);
  end.setDate(end.getDate() + 1);
  const rangeEndIso = end.toISOString();

  const { data, error } = await db
    .from(PHARMACY_POS_READINGS_TABLE)
    .select("id, shift_id, reading_type, snapshot, notes, created_at")
    .gte("created_at", rangeStartIso)
    .lt("created_at", rangeEndIso)
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) return { rows: [], error: error.message };

  const shiftIds = [...new Set((data ?? []).map((r) => (r as { shift_id: string }).shift_id))];
  const shiftMeta = new Map<string, { opened_at: string; closed_at: string | null }>();
  if (shiftIds.length > 0) {
    const { data: shifts } = await db
      .from(PHARMACY_POS_SHIFTS_TABLE)
      .select("id, opened_at, closed_at")
      .in("id", shiftIds);
    for (const s of shifts ?? []) {
      const row = s as { id: string; opened_at: string; closed_at: string | null };
      shiftMeta.set(row.id, { opened_at: row.opened_at, closed_at: row.closed_at });
    }
  }

  const rows: ShiftReadingRow[] = (data ?? []).map((raw) => {
    const r = raw as {
      id: string;
      shift_id: string;
      reading_type: string;
      snapshot: ShiftReadingSnapshot | Record<string, unknown> | null;
      notes: string | null;
      created_at: string;
    };
    const snap = r.snapshot as ShiftReadingSnapshot | null;
    const meta = shiftMeta.get(r.shift_id);
    return {
      id: r.id,
      readingType: r.reading_type === "Z" ? "Z" : "X",
      createdAt: r.created_at,
      shiftId: r.shift_id,
      openedAt: meta?.opened_at ?? snap?.openedAt ?? null,
      closedAt: meta?.closed_at ?? snap?.closedAt ?? null,
      grossSales: Number(snap?.grossSales) || 0,
      transactionCount: Number(snap?.transactionCount) || 0,
      notes: r.notes,
    };
  });

  return { rows, error: null };
}

export type LowStockExpiryRow = {
  productId: string;
  productLabel: string;
  onHand: number;
  reorderLevel: number | null;
  isLowStock: boolean;
  nearestExpiry: string | null;
  daysUntilExpiry: number | null;
};

export async function fetchLowStockExpiryReport(
  expiryWithinDays = 90,
  db: SupabaseClient = supabase,
): Promise<{ rows: LowStockExpiryRow[]; error: string | null }> {
  const { data: products, error: pErr } = await db
    .from(PRODUCTS_TABLE)
    .select("id, generic_name, brand_name, strength, unit_of_measure, reorder_level, is_active")
    .eq("is_active", true);
  if (pErr) return { rows: [], error: pErr.message };

  const productIds = (products ?? []).map((p) => (p as { id: string }).id);
  if (productIds.length === 0) return { rows: [], error: null };

  const { data: stockRows, error: sErr } = await db
    .from(STOCK_TABLE)
    .select("product_id, quantity, expiry_date")
    .in("product_id", productIds);
  if (sErr) return { rows: [], error: sErr.message };

  const onHandByProduct = new Map<string, number>();
  const nearestExpiryByProduct = new Map<string, string>();
  for (const raw of stockRows ?? []) {
    const r = raw as { product_id: string; quantity: number; expiry_date: string | null };
    const q = Number(r.quantity) || 0;
    if (q <= 0) continue;
    onHandByProduct.set(r.product_id, (onHandByProduct.get(r.product_id) ?? 0) + q);
    const exp = r.expiry_date?.trim().slice(0, 10);
    if (exp) {
      const prev = nearestExpiryByProduct.get(r.product_id);
      if (!prev || exp < prev) nearestExpiryByProduct.set(r.product_id, exp);
    }
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() + expiryWithinDays);

  const rows: LowStockExpiryRow[] = [];
  for (const raw of products ?? []) {
    const p = raw as {
      id: string;
      generic_name: string;
      brand_name: string | null;
      strength: string | null;
      unit_of_measure: string | null;
      reorder_level: number | null;
    };
    const onHand = onHandByProduct.get(p.id) ?? 0;
    const reorderLevel = p.reorder_level != null ? Number(p.reorder_level) : null;
    const isLowStock = reorderLevel != null && onHand <= reorderLevel;
    const nearestExpiry = nearestExpiryByProduct.get(p.id) ?? null;

    let daysUntilExpiry: number | null = null;
    let expiringSoon = false;
    if (nearestExpiry) {
      const expDate = new Date(`${nearestExpiry}T00:00:00`);
      daysUntilExpiry = Math.round((expDate.getTime() - today.getTime()) / 86400000);
      expiringSoon = expDate <= cutoff;
    }

    if (!isLowStock && !expiringSoon) continue;

    const parts = [p.generic_name, p.brand_name, p.strength, p.unit_of_measure].filter(Boolean);
    rows.push({
      productId: p.id,
      productLabel: parts.join(" · "),
      onHand,
      reorderLevel,
      isLowStock,
      nearestExpiry,
      daysUntilExpiry,
    });
  }

  rows.sort((a, b) => {
    if (a.isLowStock !== b.isLowStock) return a.isLowStock ? -1 : 1;
    const da = a.daysUntilExpiry ?? 9999;
    const dbDays = b.daysUntilExpiry ?? 9999;
    return da - dbDays;
  });

  return { rows, error: null };
}

export type OnHandItemRow = {
  productId: string;
  productLabel: string;
  categoryName: string | null;
  onHand: number;
  unitPrice: number;
  estimatedValue: number;
};

export async function fetchOnHandItemsReport(
  showZeroStock = false,
  db: SupabaseClient = supabase,
): Promise<{ rows: OnHandItemRow[]; grandTotal: number; error: string | null }> {
  const { data: products, error: pErr } = await db
    .from(PRODUCTS_TABLE)
    .select(
      "id, generic_name, brand_name, strength, unit_of_measure, unit_price, category_id, is_active",
    )
    .eq("is_active", true)
    .order("generic_name");
  if (pErr) return { rows: [], grandTotal: 0, error: pErr.message };

  const productIds = (products ?? []).map((p) => (p as { id: string }).id);
  const onHandByProduct = new Map<string, number>();
  if (productIds.length > 0) {
    const { data: stockRows, error: sErr } = await db
      .from(STOCK_TABLE)
      .select("product_id, quantity")
      .in("product_id", productIds);
    if (sErr) return { rows: [], grandTotal: 0, error: sErr.message };
    for (const raw of stockRows ?? []) {
      const r = raw as { product_id: string; quantity: number };
      const q = Number(r.quantity) || 0;
      if (q <= 0) continue;
      onHandByProduct.set(r.product_id, (onHandByProduct.get(r.product_id) ?? 0) + q);
    }
  }

  const categoryIds = [
    ...new Set(
      (products ?? [])
        .map((p) => (p as { category_id: number | null }).category_id)
        .filter((id): id is number => id != null),
    ),
  ];
  const categoryNameById = new Map<number, string>();
  if (categoryIds.length > 0) {
    const { data: cats } = await db
      .from(PHARMACY_CATEGORIES_TABLE)
      .select("id, name")
      .in("id", categoryIds);
    for (const c of cats ?? []) {
      const row = c as { id: number; name: string };
      categoryNameById.set(row.id, row.name);
    }
  }

  const rows: OnHandItemRow[] = [];
  let grandTotal = 0;
  for (const raw of products ?? []) {
    const p = raw as {
      id: string;
      generic_name: string;
      brand_name: string | null;
      strength: string | null;
      unit_of_measure: string | null;
      unit_price: number | null;
      category_id: number | null;
    };
    const onHand = onHandByProduct.get(p.id) ?? 0;
    if (!showZeroStock && onHand <= 0) continue;
    const unitPrice = Number(p.unit_price) || 0;
    const estimatedValue = Math.round(onHand * unitPrice * 100) / 100;
    grandTotal += estimatedValue;
    const parts = [p.generic_name, p.brand_name, p.strength, p.unit_of_measure].filter(Boolean);
    rows.push({
      productId: p.id,
      productLabel: parts.join(" · "),
      categoryName: p.category_id != null ? categoryNameById.get(p.category_id) ?? null : null,
      onHand,
      unitPrice,
      estimatedValue,
    });
  }

  grandTotal = Math.round(grandTotal * 100) / 100;
  rows.sort((a, b) => b.estimatedValue - a.estimatedValue);
  return { rows, grandTotal, error: null };
}
