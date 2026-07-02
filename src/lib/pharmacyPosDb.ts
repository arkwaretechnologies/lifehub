/**
 * Single module for Pharmacy POS and consultation Rx bridge Supabase access.
 * Prefer calling functions here instead of scattering `supabase.from` across the app.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { clinicDateYmd, clinicTimeHms } from "@/lib/queueTicketDate";
import { supabase } from "@/lib/supabaseClient";

export const PRODUCTS_TABLE = "products" as const;
export const PHARMACY_SALES_TABLE = "pharmacy_sales" as const;
export const PHARMACY_SALE_ITEMS_TABLE = "pharmacy_sale_items" as const;
export const PHARMACY_POS_SHIFTS_TABLE = "pharmacy_pos_shifts" as const;
export const PHARMACY_POS_READINGS_TABLE = "pharmacy_pos_readings" as const;
export const PRESCRIPTIONS_TABLE = "prescriptions" as const;
export const PHARMACY_PRESCRIPTION_ITEMS_TABLE = "pharmacy_prescription_items" as const;
export const PHARMACY_CATEGORIES_TABLE = "pharmacy_categories" as const;
export const STOCK_TABLE = "stock" as const;
export const STOCK_MOVEMENTS_TABLE = "stock_movements" as const;
/** Manual stock-in rows from Pharmacy Stocks (with DR); not used for POS dispense. */
export const PHARMACY_STOCK_INS_TABLE = "pharmacy_stock_ins" as const;
/** Manual stock-out rows from Pharmacy Stocks. */
export const PHARMACY_STOCK_OUTS_TABLE = "pharmacy_stock_outs" as const;
export const SUPPLIERS_TABLE = "suppliers" as const;

const PRODUCT_PICKER_SELECT =
  "id, generic_name, brand_name, strength, unit_of_measure, dosage_form, description, requires_prescription, is_active" as const;

/** Extended row for POS register */
export const PRODUCT_POS_SELECT =
  "id, generic_name, brand_name, strength, unit_of_measure, dosage_form, requires_prescription, is_active, barcode, unit_price, unit_cost, vat_exempt, vat_rate, category_id" as const;

/** PostgREST: active = true or null (treat null as active, same as client filter). */
const ACTIVE_PRODUCTS_OR = "is_active.eq.true,is_active.is.null" as const;

/** Subset of `public.products` for consultation medication picker. */
export type ProductCatalogRow = {
  id: string;
  generic_name: string;
  brand_name: string | null;
  strength: string | null;
  unit_of_measure: string;
  dosage_form: string | null;
  description: string | null;
  requires_prescription: boolean | null;
  is_active: boolean | null;
};

export type ProductPosRow = ProductCatalogRow & {
  barcode: string | null;
  unit_price: number;
  unit_cost: number;
  vat_exempt: boolean | null;
  vat_rate: number | null;
  category_id: number;
};

/** Full row for Product Management admin (list / edit). */
export const PRODUCT_ADMIN_SELECT =
  "id, category_id, generic_name, brand_name, strength, dosage_form, description, unit_of_measure, unit_price, unit_cost, barcode, supplier_id, requires_prescription, reorder_level, reorder_quantity, vat_exempt, vat_rate, is_active" as const;

export type ProductAdminRow = {
  id: string;
  category_id: number;
  generic_name: string;
  brand_name: string | null;
  strength: string | null;
  dosage_form: string | null;
  description: string | null;
  unit_of_measure: string;
  unit_price: number;
  unit_cost: number;
  barcode: string | null;
  supplier_id: number | null;
  requires_prescription: boolean | null;
  reorder_level: number | null;
  reorder_quantity: number | null;
  vat_exempt: boolean | null;
  vat_rate: number | null;
  is_active: boolean | null;
};

function isActiveRow(v: boolean | null | undefined): boolean {
  return v !== false;
}

/** Generic + optional brand (no strength/form) — cart, stock errors, receipts. */
export function formatProductGenericBrandLabel(
  generic_name: string,
  brand_name: string | null | undefined,
): string {
  const g = generic_name.trim();
  const b = brand_name?.trim();
  return b ? `${g} (${b})` : g;
}

export function formatProductOptionLabel(p: ProductCatalogRow): string {
  const base = formatProductGenericBrandLabel(p.generic_name, p.brand_name);
  const extra = [p.strength, p.dosage_form].filter(Boolean).join(" · ");
  return extra ? `${base} — ${extra}` : base;
}

async function fetchProductDisplayLabel(
  productId: string,
  db: SupabaseClient = supabase,
): Promise<string> {
  const { data, error } = await db
    .from(PRODUCTS_TABLE)
    .select("generic_name, brand_name")
    .eq("id", productId.trim())
    .maybeSingle();
  if (error || !data) return "this product";
  const row = data as { generic_name: string; brand_name: string | null };
  return formatProductGenericBrandLabel(row.generic_name, row.brand_name);
}

/** Full product text for medication picker dropdown (name, strength, form, description). */
export function formatMedicationProductOptionDescription(p: ProductCatalogRow): string {
  const lines: string[] = [formatProductOptionLabel(p)];
  const desc = (p.description ?? "").trim();
  if (desc) lines.push(desc);
  return lines.join("\n");
}

function sanitizeSearchToken(raw: string): string {
  return raw
    .trim()
    .replace(/%/g, "")
    .replace(/_/g, "")
    .replace(/,/g, " ")
    .replace(/\s+/g, " ")
    .slice(0, 64);
}

/** First N active products (alphabetical) for picker defaults — avoids loading huge catalogs. */
export async function fetchActiveProductsPreview(limit = 120): Promise<{
  products: ProductCatalogRow[];
  error: string | null;
}> {
  const cap = Math.min(Math.max(1, limit), 500);
  const { data, error } = await supabase
    .from(PRODUCTS_TABLE)
    .select(PRODUCT_PICKER_SELECT)
    .or(ACTIVE_PRODUCTS_OR)
    .order("generic_name")
    .limit(cap);

  if (error) {
    return { products: [], error: error.message };
  }

  const rows = (data ?? []) as ProductCatalogRow[];
  const products = rows.filter((p) => isActiveRow(p.is_active));
  return { products, error: null };
}

/** Server-side name search for large catalogs (debounced in the UI). */
export async function searchActiveProducts(
  rawQuery: string,
  limit = 80,
): Promise<{ products: ProductCatalogRow[]; error: string | null }> {
  const safe = sanitizeSearchToken(rawQuery);
  if (safe.length === 0) {
    return { products: [], error: null };
  }

  const cap = Math.min(Math.max(1, limit), 200);
  const pattern = `%${safe}%`;

  const { data, error } = await supabase
    .from(PRODUCTS_TABLE)
    .select(PRODUCT_PICKER_SELECT)
    .or(`generic_name.ilike.${pattern},brand_name.ilike.${pattern}`)
    .or(ACTIVE_PRODUCTS_OR)
    .order("generic_name")
    .limit(cap);

  if (error) {
    return { products: [], error: error.message };
  }

  const rows = (data ?? []) as ProductCatalogRow[];
  const products = rows.filter((p) => isActiveRow(p.is_active));
  return { products, error: null };
}

/** Resolve picker rows by id (e.g. lines restored without cache). */
export async function fetchProductsByIds(ids: string[]): Promise<{
  products: ProductCatalogRow[];
  error: string | null;
}> {
  const uniq = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
  if (uniq.length === 0) {
    return { products: [], error: null };
  }

  const { data, error } = await supabase.from(PRODUCTS_TABLE).select(PRODUCT_PICKER_SELECT).in("id", uniq);

  if (error) {
    return { products: [], error: error.message };
  }

  return { products: (data ?? []) as ProductCatalogRow[], error: null };
}

/**
 * Loads all active products. Prefer {@link fetchActiveProductsPreview} + {@link searchActiveProducts} for large tables.
 */
export async function fetchActiveProductsCatalog(): Promise<{
  products: ProductCatalogRow[];
  error: string | null;
}> {
  const { data, error } = await supabase
    .from(PRODUCTS_TABLE)
    .select(PRODUCT_PICKER_SELECT)
    .or(ACTIVE_PRODUCTS_OR)
    .order("generic_name");

  if (error) {
    return { products: [], error: error.message };
  }

  const rows = (data ?? []) as ProductCatalogRow[];
  const products = rows.filter((p) => isActiveRow(p.is_active));
  return { products, error: null };
}

/** POS product search with pricing */
export async function searchPosProducts(
  rawQuery: string,
  limit = 80,
): Promise<{ products: ProductPosRow[]; error: string | null }> {
  const safe = sanitizeSearchToken(rawQuery);
  if (safe.length === 0) {
    return { products: [], error: null };
  }
  const cap = Math.min(Math.max(1, limit), 200);
  const pattern = `%${safe}%`;
  const { data, error } = await supabase
    .from(PRODUCTS_TABLE)
    .select(PRODUCT_POS_SELECT)
    .or(`generic_name.ilike.${pattern},brand_name.ilike.${pattern},barcode.ilike.${pattern}`)
    .or(ACTIVE_PRODUCTS_OR)
    .order("generic_name")
    .limit(cap);
  if (error) return { products: [], error: error.message };
  const rows = (data ?? []) as ProductPosRow[];
  return { products: rows.filter((p) => isActiveRow(p.is_active)), error: null };
}

export async function fetchProductByBarcode(
  barcode: string,
): Promise<{ product: ProductPosRow | null; error: string | null }> {
  const b = barcode.trim();
  if (!b) return { product: null, error: null };
  const { data, error } = await supabase
    .from(PRODUCTS_TABLE)
    .select(PRODUCT_POS_SELECT)
    .eq("barcode", b)
    .or(ACTIVE_PRODUCTS_OR)
    .maybeSingle();
  if (error) return { product: null, error: error.message };
  const row = data as ProductPosRow | null;
  if (!row || !isActiveRow(row.is_active)) return { product: null, error: null };
  return { product: row, error: null };
}

export async function fetchPosProductById(
  id: string,
): Promise<{ product: ProductPosRow | null; error: string | null }> {
  const { data, error } = await supabase
    .from(PRODUCTS_TABLE)
    .select(PRODUCT_POS_SELECT)
    .eq("id", id.trim())
    .maybeSingle();
  if (error) return { product: null, error: error.message };
  const row = data as ProductPosRow | null;
  if (!row || !isActiveRow(row.is_active)) return { product: null, error: null };
  return { product: row, error: null };
}

/** Sum available quantity across stock rows for a product */
export async function getProductStockOnHand(
  productId: string,
  db: SupabaseClient = supabase,
): Promise<{ qty: number; error: string | null }> {
  const { data, error } = await db
    .from(STOCK_TABLE)
    .select("quantity")
    .eq("product_id", productId);
  if (error) return { qty: 0, error: error.message };
  let sum = 0;
  for (const r of data ?? []) {
    sum += Number((r as { quantity: number }).quantity) || 0;
  }
  return { qty: sum, error: null };
}

export type PharmacyPosShiftRow = {
  id: string;
  opened_at: string;
  closed_at: string | null;
  opened_by: number | null;
  closed_by: number | null;
  beginning_cash: number;
};

export async function fetchOpenShiftForUser(userId: number | null): Promise<{
  shift: PharmacyPosShiftRow | null;
  error: string | null;
}> {
  let q = supabase
    .from(PHARMACY_POS_SHIFTS_TABLE)
    .select("id, opened_at, closed_at, opened_by, closed_by, beginning_cash")
    .is("closed_at", null)
    .order("opened_at", { ascending: false })
    .limit(1);
  if (userId != null && Number.isFinite(userId)) {
    q = q.eq("opened_by", userId);
  }
  const { data, error } = await q.maybeSingle();
  if (error) return { shift: null, error: error.message };
  return { shift: (data as PharmacyPosShiftRow) ?? null, error: null };
}

export async function openPharmacyShift(args: {
  openedBy: number | null;
  beginningCash: number;
  branchCode?: string | null;
}): Promise<{ shiftId: string | null; error: string | null }> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from(PHARMACY_POS_SHIFTS_TABLE)
    .insert({
      opened_by: args.openedBy,
      beginning_cash: args.beginningCash,
      branch_code: args.branchCode ?? null,
      opened_at: now,
      updated_at: now,
    })
    .select("id")
    .single();
  if (error) return { shiftId: null, error: error.message };
  const id = (data as { id?: string })?.id ?? null;
  return { shiftId: id, error: null };
}

export type ShiftReadingSnapshot = {
  shiftId: string;
  beginningCash: number;
  openedAt: string;
  closedAt?: string;
  grossSales: number;
  transactionCount: number;
  cashSales: number;
  nonCashSales: number;
  paymentBreakdown: Record<string, number>;
  expectedCashDrawer?: number | null;
  subtotal: number;
  vatAmount: number;
  discountAmount: number;
  beginningOr: string | null;
  endingOr: string | null;
  voidTransactionCount: number;
  voidAmount: number;
};

export async function aggregateShiftSales(shiftId: string): Promise<{
  snapshot: ShiftReadingSnapshot | null;
  error: string | null;
}> {
  const { data: shiftRow, error: shErr } = await supabase
    .from(PHARMACY_POS_SHIFTS_TABLE)
    .select("id, beginning_cash, opened_at, closed_at")
    .eq("id", shiftId)
    .maybeSingle();
  if (shErr) return { snapshot: null, error: shErr.message };
  if (!shiftRow) return { snapshot: null, error: "Shift not found." };

  const { data: sales, error: sErr } = await supabase
    .from(PHARMACY_SALES_TABLE)
    .select(
      "total_amount, payment_method, amount_tendered, change_amount, or_number, subtotal, vat_amount, discount_amount",
    )
    .eq("shift_id", shiftId)
    .eq("status", "Completed");
  if (sErr) return { snapshot: null, error: sErr.message };

  const { data: voidSales, error: voidErr } = await supabase
    .from(PHARMACY_SALES_TABLE)
    .select("total_amount")
    .eq("shift_id", shiftId)
    .eq("status", "Voided");
  if (voidErr) return { snapshot: null, error: voidErr.message };

  let gross = 0;
  let subtotal = 0;
  let vatAmount = 0;
  let discountAmount = 0;
  let cashSales = 0;
  let nonCashSales = 0;
  let txn = 0;
  const breakdown: Record<string, number> = {};
  const orNumbers: string[] = [];
  const beginning = Number((shiftRow as { beginning_cash: number }).beginning_cash) || 0;

  for (const row of sales ?? []) {
    const r = row as {
      total_amount: number | null;
      payment_method: string | null;
      amount_tendered: number | null;
      change_amount: number | null;
      or_number: string | null;
      subtotal: number | null;
      vat_amount: number | null;
      discount_amount: number | null;
    };
    const total = Number(r.total_amount) || 0;
    gross += total;
    subtotal += Number(r.subtotal) || total;
    vatAmount += Number(r.vat_amount) || 0;
    discountAmount += Number(r.discount_amount) || 0;
    txn += 1;
    const or = (r.or_number ?? "").trim();
    if (or) orNumbers.push(or);
    const pm = (r.payment_method ?? "UNKNOWN").trim() || "UNKNOWN";
    breakdown[pm] = (breakdown[pm] ?? 0) + total;
    const pmLower = pm.toLowerCase();
    if (pmLower === "cash" || pmLower === "csh") {
      cashSales += total;
    } else {
      nonCashSales += total;
    }
  }

  orNumbers.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const beginningOr = orNumbers[0] ?? null;
  const endingOr = orNumbers.length > 0 ? orNumbers[orNumbers.length - 1] : null;

  let voidAmount = 0;
  for (const row of voidSales ?? []) {
    voidAmount += Number((row as { total_amount: number | null }).total_amount) || 0;
  }
  const voidTransactionCount = voidSales?.length ?? 0;

  let cashInDrawer = beginning;
  for (const row of sales ?? []) {
    const r = row as {
      payment_method: string | null;
      amount_tendered: number | null;
      change_amount: number | null;
      total_amount: number | null;
    };
    const pm = (r.payment_method ?? "").toLowerCase();
    if (pm === "cash" || pm === "csh") {
      const tendered = Number(r.amount_tendered) || Number(r.total_amount) || 0;
      const change = Number(r.change_amount) || 0;
      cashInDrawer += tendered - change;
    }
  }

  const snapshot: ShiftReadingSnapshot = {
    shiftId,
    beginningCash: beginning,
    openedAt: (shiftRow as { opened_at: string }).opened_at,
    closedAt: (shiftRow as { closed_at: string | null }).closed_at ?? undefined,
    grossSales: gross,
    transactionCount: txn,
    cashSales,
    nonCashSales,
    paymentBreakdown: breakdown,
    expectedCashDrawer: cashInDrawer,
    subtotal,
    vatAmount,
    discountAmount,
    beginningOr,
    endingOr,
    voidTransactionCount,
    voidAmount,
  };
  return { snapshot, error: null };
}

export async function recordPosReading(args: {
  shiftId: string;
  readingType: "X" | "Z";
  createdBy: number | null;
  snapshot: ShiftReadingSnapshot;
  notes?: string | null;
}): Promise<{ error: string | null }> {
  const { error } = await supabase.from(PHARMACY_POS_READINGS_TABLE).insert({
    shift_id: args.shiftId,
    reading_type: args.readingType,
    created_by: args.createdBy,
    snapshot: args.snapshot as unknown as Record<string, unknown>,
    notes: args.notes ?? null,
  });
  return { error: error?.message ?? null };
}

/** X-reading only: save snapshot, leave shift open */
export async function recordXReadingForShift(args: {
  shiftId: string;
  createdBy: number | null;
}): Promise<{ error: string | null }> {
  const { snapshot, error } = await aggregateShiftSales(args.shiftId);
  if (error || !snapshot) return { error: error ?? "No data." };
  return recordPosReading({
    shiftId: args.shiftId,
    readingType: "X",
    createdBy: args.createdBy,
    snapshot,
  });
}

export async function closeShiftWithZ(args: {
  shiftId: string;
  closedBy: number | null;
  actualCash: number | null;
  notes?: string | null;
}): Promise<{ error: string | null }> {
  const now = new Date().toISOString();
  const { snapshot: agg, error: aggErr } = await aggregateShiftSales(args.shiftId);
  if (aggErr || !agg) return { error: aggErr ?? "Aggregate failed." };

  const expected = agg.expectedCashDrawer ?? null;
  const actual = args.actualCash;
  let variance: number | null = null;
  if (expected != null && actual != null) {
    variance = Math.round((actual - expected) * 100) / 100;
  }

  const rErr = await recordPosReading({
    shiftId: args.shiftId,
    readingType: "Z",
    createdBy: args.closedBy,
    snapshot: { ...agg, closedAt: now },
    notes: args.notes ?? null,
  });
  if (rErr.error) return rErr;

  const { error } = await supabase
    .from(PHARMACY_POS_SHIFTS_TABLE)
    .update({
      closed_at: now,
      closed_by: args.closedBy,
      expected_cash: expected,
      actual_cash: actual,
      cash_variance: variance,
      updated_at: now,
      notes: args.notes ?? null,
    })
    .eq("id", args.shiftId);
  return { error: error?.message ?? null };
}

export type CheckoutLineInput = {
  productId: string;
  quantity: number;
  unitPrice: number;
  discount?: number;
  pharmacyPrescriptionItemId?: string | null;
};

export type CompletePharmacySaleInput = {
  shiftId: string | null;
  patientId: number | null;
  prescriptionId: string | null;
  servedBy: number | null;
  paymentMethod: string;
  amountTendered: number | null;
  changeAmount: number | null;
  discountAmount: number;
  discountType: string | null;
  subtotal: number;
  vatAmount: number;
  totalAmount: number;
  orNumber: string;
  lines: CheckoutLineInput[];
  notes?: string | null;
};

export async function validateStockForCheckout(
  lines: { productId: string; quantity: number }[],
  db: SupabaseClient = supabase,
): Promise<{
  ok: boolean;
  error: string | null;
}> {
  for (const line of lines) {
    const { qty, error } = await getProductStockOnHand(line.productId, db);
    if (error) return { ok: false, error };
    if (qty + 1e-9 < line.quantity) {
      const label = await fetchProductDisplayLabel(line.productId, db);
      return {
        ok: false,
        error: `Insufficient stock for ${label} (need ${line.quantity}, have ${qty}).`,
      };
    }
  }
  return { ok: true, error: null };
}

export async function completePharmacySale(
  input: CompletePharmacySaleInput,
  db: SupabaseClient = supabase,
): Promise<{
  saleId: string | null;
  error: string | null;
}> {
  const stockCheck = await validateStockForCheckout(
    input.lines.map((l) => ({ productId: l.productId, quantity: l.quantity })),
    db,
  );
  if (!stockCheck.ok) return { saleId: null, error: stockCheck.error };

  const now = new Date();
  const saleDate = clinicDateYmd(now);
  const saleTime = clinicTimeHms(now);

  const { data: saleIns, error: saleErr } = await db
    .from(PHARMACY_SALES_TABLE)
    .insert({
      shift_id: input.shiftId,
      patient_id: input.patientId,
      prescription_id: input.prescriptionId,
      served_by: input.servedBy,
      payment_method: input.paymentMethod,
      amount_tendered: input.amountTendered,
      change_amount: input.changeAmount,
      discount_amount: input.discountAmount,
      discount_type: input.discountType,
      subtotal: input.subtotal,
      vat_amount: input.vatAmount,
      total_amount: input.totalAmount,
      or_number: input.orNumber,
      status: "Completed",
      sale_date: saleDate,
      sale_time: saleTime,
      notes: input.notes ?? null,
      updated_at: now.toISOString(),
    })
    .select("id")
    .single();

  if (saleErr) return { saleId: null, error: saleErr.message };
  const saleId = (saleIns as { id?: string })?.id ?? null;
  if (!saleId) return { saleId: null, error: "No sale id returned." };

  const itemRows = input.lines.map((line, index) => ({
    pharmacy_sale_id: saleId,
    product_id: line.productId,
    quantity: line.quantity,
    unit_price: line.unitPrice,
    discount: line.discount ?? 0,
    line_total: Math.round(line.quantity * line.unitPrice * 100) / 100 - (line.discount ?? 0),
    pharmacy_prescription_item_id: line.pharmacyPrescriptionItemId ?? null,
    linenum: index + 1,
  }));

  const { error: itemsErr } = await db.from(PHARMACY_SALE_ITEMS_TABLE).insert(itemRows);
  if (itemsErr) {
    await db.from(PHARMACY_SALES_TABLE).delete().eq("id", saleId);
    return { saleId: null, error: itemsErr.message };
  }

  for (const line of input.lines) {
    const stockResult = await decrementStockFefo(line.productId, line.quantity, saleId, db);
    if (stockResult.error) {
      await db.from(PHARMACY_SALE_ITEMS_TABLE).delete().eq("pharmacy_sale_id", saleId);
      await db.from(PHARMACY_SALES_TABLE).delete().eq("id", saleId);
      return { saleId: null, error: stockResult.error };
    }
  }

  return { saleId, error: null };
}

/** Strip characters that would widen `ilike` unintentionally. */
function sanitizeOrSearchFragment(q: string): string {
  return q.replace(/%/g, "").replace(/_/g, "").trim();
}

function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

export type PharmacySaleSearchRow = {
  id: string;
  or_number: string;
  sale_date: string;
  sale_time: string | null;
  total_amount: number | null;
  payment_method: string | null;
  status: string | null;
  shift_id: string | null;
};

/** Find completed sales by OR number (partial match). */
export async function searchCompletedPharmacySalesByOrNumber(
  orQuery: string,
  limit = 30,
  db: SupabaseClient = supabase,
): Promise<{ sales: PharmacySaleSearchRow[]; error: string | null }> {
  const q = sanitizeOrSearchFragment(orQuery);
  if (!q) return { sales: [], error: null };
  const { data, error } = await db
    .from(PHARMACY_SALES_TABLE)
    .select("id, or_number, sale_date, sale_time, total_amount, payment_method, status, shift_id")
    .eq("status", "Completed")
    .ilike("or_number", `%${q}%`)
    .order("sale_date", { ascending: false })
    .order("sale_time", { ascending: false })
    .limit(Math.min(Math.max(1, limit), 60));

  if (error) return { sales: [], error: error.message };
  const sales = (data ?? []) as PharmacySaleSearchRow[];
  return { sales, error: null };
}

export type PharmacySaleVoidLine = {
  id: string;
  linenum: number;
  product_id: string;
  quantity: number;
  unit_price: number;
  line_total: number | null;
  discount: number;
  generic_name: string;
  brand_name: string | null;
};

export type PharmacySaleVoidDetail = {
  sale: PharmacySaleSearchRow & { notes: string | null; patient_id: number | null };
  lines: PharmacySaleVoidLine[];
};

export async function fetchPharmacySaleWithItemsForVoid(
  saleId: string,
  db: SupabaseClient = supabase,
): Promise<{
  detail: PharmacySaleVoidDetail | null;
  error: string | null;
}> {
  const { data: sale, error: sErr } = await db
    .from(PHARMACY_SALES_TABLE)
    .select("id, or_number, sale_date, sale_time, total_amount, payment_method, status, shift_id, notes, patient_id")
    .eq("id", saleId)
    .maybeSingle();
  if (sErr) return { detail: null, error: sErr.message };
  if (!sale) return { detail: null, error: "Sale not found." };
  const s = sale as PharmacySaleVoidDetail["sale"];
  if ((s.status ?? "").trim() !== "Completed") {
    return { detail: null, error: "Only completed sales can be modified." };
  }

  const { data: rawItems, error: iErr } = await db
    .from(PHARMACY_SALE_ITEMS_TABLE)
    .select("id, linenum, product_id, quantity, unit_price, line_total, discount")
    .eq("pharmacy_sale_id", saleId)
    .order("linenum", { ascending: true });
  if (iErr) return { detail: null, error: iErr.message };

  const items = (rawItems ?? []) as Array<{
    id: string;
    linenum: number;
    product_id: string;
    quantity: number;
    unit_price: number;
    line_total: number | null;
    discount: number | null;
  }>;
  const productIds = [...new Set(items.map((i) => i.product_id))];
  const nameById = new Map<string, { generic_name: string; brand_name: string | null }>();
  if (productIds.length > 0) {
    const { data: prows, error: pErr } = await db
      .from(PRODUCTS_TABLE)
      .select("id, generic_name, brand_name")
      .in("id", productIds);
    if (pErr) return { detail: null, error: pErr.message };
    for (const p of (prows ?? []) as Array<{ id: string; generic_name: string; brand_name: string | null }>) {
      nameById.set(p.id, { generic_name: p.generic_name, brand_name: p.brand_name });
    }
  }

  const lines: PharmacySaleVoidLine[] = items.map((row) => {
    const nm = nameById.get(row.product_id);
    const disc = Number(row.discount) || 0;
    return {
      id: row.id,
      linenum: row.linenum,
      product_id: row.product_id,
      quantity: Math.round(Number(row.quantity)) || 0,
      unit_price: Number(row.unit_price) || 0,
      line_total: row.line_total != null ? Number(row.line_total) : null,
      discount: disc,
      generic_name: nm?.generic_name ?? "(unknown product)",
      brand_name: nm?.brand_name ?? null,
    };
  });

  return { detail: { sale: s, lines }, error: null };
}

async function restoreStockForVoidViaMovements(
  saleId: string,
  db: SupabaseClient = supabase,
): Promise<{ usedMovements: boolean; error: string | null }> {
  const saleNote = `Pharmacy sale ${saleId}`;
  const { data: byNote, error: nErr } = await db
    .from(STOCK_MOVEMENTS_TABLE)
    .select("id, stock_id, product_id, quantity")
    .eq("reference_type", "pharmacy_sale")
    .eq("notes", saleNote);
  if (nErr) return { usedMovements: false, error: nErr.message };

  const movs = (byNote ?? []) as Array<{ id: string; stock_id: string | null; product_id: string; quantity: number }>;

  const dispenseRows = movs.filter((m) => m.stock_id && Number(m.quantity) < 0);
  if (dispenseRows.length === 0) {
    return { usedMovements: false, error: null };
  }

  const now = new Date().toISOString();
  for (const m of dispenseRows) {
    const stockId = m.stock_id as string;
    const addBack = -Number(m.quantity);
    if (!Number.isFinite(addBack) || addBack <= 0) continue;

    const { data: lot, error: lErr } = await db.from(STOCK_TABLE).select("id, quantity").eq("id", stockId).maybeSingle();
    if (lErr) return { usedMovements: true, error: lErr.message };
    if (!lot) return { usedMovements: true, error: `Stock lot ${stockId.slice(0, 8)}… no longer exists — void aborted.` };

    const prev = Number((lot as { quantity: number }).quantity) || 0;
    const { error: upErr } = await db
      .from(STOCK_TABLE)
      .update({ quantity: prev + addBack, updated_at: now })
      .eq("id", stockId);
    if (upErr) return { usedMovements: true, error: upErr.message };

    const { error: movInsErr } = await db.from(STOCK_MOVEMENTS_TABLE).insert({
      product_id: m.product_id,
      quantity: addBack,
      movement_type: "VOID",
      stock_id: stockId,
      notes: `Void pharmacy sale ${saleId}`,
      reference_type: "pharmacy_sale_void",
    });
    if (movInsErr) return { usedMovements: true, error: movInsErr.message };
  }
  return { usedMovements: true, error: null };
}

async function restoreStockForVoidFallbackLots(
  saleId: string,
  db: SupabaseClient = supabase,
): Promise<{ error: string | null }> {
  const { data: items, error: iErr } = await db
    .from(PHARMACY_SALE_ITEMS_TABLE)
    .select("product_id, quantity")
    .eq("pharmacy_sale_id", saleId);
  if (iErr) return { error: iErr.message };

  const now = new Date().toISOString();
  for (const raw of items ?? []) {
    const row = raw as { product_id: string; quantity: number };
    const qty = Math.round(Number(row.quantity)) || 0;
    if (qty <= 0) continue;

    const { data: lots, error: lErr } = await db
      .from(STOCK_TABLE)
      .select("id, quantity")
      .eq("product_id", row.product_id)
      .order("expiry_date", { ascending: true, nullsFirst: false })
      .limit(1);
    if (lErr) return { error: lErr.message };
    const lot = (lots ?? [])[0] as { id: string; quantity: number } | undefined;
    if (!lot) {
      return {
        error: `No stock lot exists for a line item (product ${row.product_id.slice(0, 8)}…). Restore stock manually or contact admin.`,
      };
    }
    const prev = Number(lot.quantity) || 0;
    const { error: upErr } = await db
      .from(STOCK_TABLE)
      .update({ quantity: prev + qty, updated_at: now })
      .eq("id", lot.id);
    if (upErr) return { error: upErr.message };

    const { error: movInsErr } = await db.from(STOCK_MOVEMENTS_TABLE).insert({
      product_id: row.product_id,
      quantity: qty,
      movement_type: "VOID",
      stock_id: lot.id,
      notes: `Void pharmacy sale ${saleId} (lot fallback)`,
      reference_type: "pharmacy_sale_void",
    });
    if (movInsErr) return { error: movInsErr.message };
  }
  return { error: null };
}

/**
 * Marks a completed pharmacy sale void and puts quantity back on stock (via dispense movements, or lot fallback).
 */
export async function voidCompletedPharmacySale(
  args: {
    saleId: string;
    voidedByUserId: number | null;
    reason?: string | null;
  },
  db: SupabaseClient = supabase,
): Promise<{ error: string | null }> {
  const saleId = args.saleId.trim();
  if (!saleId) return { error: "Sale id required." };

  const { data: head, error: hErr } = await db
    .from(PHARMACY_SALES_TABLE)
    .select("id, status, notes")
    .eq("id", saleId)
    .maybeSingle();
  if (hErr) return { error: hErr.message };
  if (!head) return { error: "Sale not found." };
  if (String((head as { status: string }).status) !== "Completed") {
    return { error: "This sale is not completed (or was already voided)." };
  }

  const { usedMovements, error: movErr } = await restoreStockForVoidViaMovements(saleId, db);
  if (movErr) return { error: movErr };
  if (!usedMovements) {
    const fb = await restoreStockForVoidFallbackLots(saleId, db);
    if (fb.error) return { error: fb.error };
  }

  const prevNotes = (head as { notes: string | null }).notes;
  const stamp = new Date().toISOString();
  const who = args.voidedByUserId != null ? `user_id=${args.voidedByUserId}` : "user=unknown";
  const reason = args.reason?.trim() ? args.reason.trim() : "no reason given";
  const voidLine = `[VOID ${stamp}] ${who} · ${reason}`;
  const mergedNotes = [prevNotes?.trim() || null, voidLine].filter(Boolean).join("\n");

  const { error: uErr } = await db
    .from(PHARMACY_SALES_TABLE)
    .update({
      status: "Voided",
      notes: mergedNotes,
      updated_at: new Date().toISOString(),
    })
    .eq("id", saleId)
    .eq("status", "Completed");
  if (uErr) return { error: uErr.message };
  return { error: null };
}

type DispBucket = { stock_id: string; product_id: string; qtyOut: number };

async function loadDispenseBucketsForSale(saleId: string): Promise<{ buckets: DispBucket[]; error: string | null }> {
  const saleNote = `Pharmacy sale ${saleId}`;
  const { data: byNote, error: nErr } = await supabase
    .from(STOCK_MOVEMENTS_TABLE)
    .select("id, stock_id, product_id, quantity")
    .eq("reference_type", "pharmacy_sale")
    .eq("notes", saleNote)
    .order("id", { ascending: true });
  if (nErr) return { buckets: [], error: nErr.message };
  const rows = (byNote ?? []) as Array<{ stock_id: string | null; product_id: string; quantity: number }>;
  const buckets: DispBucket[] = [];
  for (const m of rows) {
    const q = Number(m.quantity) || 0;
    if (!m.stock_id || q >= 0) continue;
    buckets.push({ stock_id: m.stock_id, product_id: m.product_id, qtyOut: -q });
  }
  return { buckets, error: null };
}

async function addStockReturnToLot(
  productId: string,
  stockId: string,
  qty: number,
  saleId: string,
  label: string,
): Promise<{ error: string | null }> {
  if (qty <= 0) return { error: null };
  const now = new Date().toISOString();
  const { data: lot, error: lErr } = await supabase.from(STOCK_TABLE).select("id, quantity").eq("id", stockId).maybeSingle();
  if (lErr) return { error: lErr.message };
  if (!lot) return { error: "Stock lot missing during return." };
  const prev = Number((lot as { quantity: number }).quantity) || 0;
  const { error: upErr } = await supabase.from(STOCK_TABLE).update({ quantity: prev + qty, updated_at: now }).eq("id", stockId);
  if (upErr) return { error: upErr.message };
  const { error: movErr } = await supabase.from(STOCK_MOVEMENTS_TABLE).insert({
    product_id: productId,
    quantity: qty,
    movement_type: "VOID",
    stock_id: stockId,
    notes: `${label} pharmacy sale ${saleId}`,
    reference_type: "pharmacy_sale_return",
  });
  if (movErr) return { error: movErr.message };
  return { error: null };
}

async function restoreReturnQtyUsingBuckets(
  buckets: DispBucket[],
  productId: string,
  need: number,
  saleId: string,
): Promise<{ error: string | null }> {
  let left = need;
  for (const b of buckets) {
    if (b.product_id !== productId) continue;
    if (left <= 0) break;
    if (b.qtyOut <= 0) continue;
    const t = Math.min(left, b.qtyOut);
    const e = await addStockReturnToLot(productId, b.stock_id, t, saleId, "Return");
    if (e.error) return e;
    b.qtyOut -= t;
    left -= t;
  }
  if (left > 0.0001) {
    const { data: lots, error: lErr } = await supabase
      .from(STOCK_TABLE)
      .select("id, quantity")
      .eq("product_id", productId)
      .order("expiry_date", { ascending: true, nullsFirst: false })
      .limit(1);
    if (lErr) return { error: lErr.message };
    const lot = (lots ?? [])[0] as { id: string } | undefined;
    if (!lot) {
      return { error: `No stock lot for product ${productId.slice(0, 8)}… — add stock before returning this quantity.` };
    }
    return addStockReturnToLot(productId, lot.id, left, saleId, "Return (lot fallback)");
  }
  return { error: null };
}

/**
 * Partial or full return: puts quantity back on stock (reversing dispense lots when possible),
 * updates or removes `pharmacy_sale_items`, and adjusts sale totals / notes.
 * If every line is fully returned, the sale is marked **Voided** (same outcome as void).
 */
export async function processPharmacySaleReturn(args: {
  saleId: string;
  lineReturns: { itemId: string; returnQty: number }[];
  reason?: string | null;
  returnedByUserId: number | null;
}): Promise<{ error: string | null }> {
  const saleId = args.saleId.trim();
  if (!saleId) return { error: "Sale id required." };
  if (!args.lineReturns?.length) return { error: "Select at least one line to return." };

  const { data: head, error: hErr } = await supabase
    .from(PHARMACY_SALES_TABLE)
    .select("id, status, notes, subtotal, vat_amount, total_amount, discount_amount, or_number")
    .eq("id", saleId)
    .maybeSingle();
  if (hErr) return { error: hErr.message };
  if (!head) return { error: "Sale not found." };
  if (String((head as { status: string }).status) !== "Completed") {
    return { error: "Only completed sales can be returned against." };
  }

  const sale = head as {
    notes: string | null;
    subtotal: number | null;
    vat_amount: number | null;
    total_amount: number | null;
    discount_amount: number | null;
    or_number: string;
  };

  const { data: rawItems, error: iErr } = await supabase
    .from(PHARMACY_SALE_ITEMS_TABLE)
    .select("id, linenum, product_id, quantity, unit_price, line_total, discount")
    .eq("pharmacy_sale_id", saleId);
  if (iErr) return { error: iErr.message };
  const itemsById = new Map(
    (rawItems ?? []).map((r) => {
      const row = r as {
        id: string;
        linenum: number;
        product_id: string;
        quantity: number;
        unit_price: number;
        line_total: number | null;
        discount: number | null;
      };
      return [row.id, row] as const;
    }),
  );

  const normalized: { itemId: string; returnQty: number }[] = [];
  for (const lr of args.lineReturns) {
    const q = Math.round(Number(lr.returnQty));
    if (!Number.isFinite(q) || q < 1) continue;
    normalized.push({ itemId: String(lr.itemId).trim(), returnQty: q });
  }
  if (normalized.length === 0) return { error: "Each return quantity must be at least 1." };

  for (const { itemId, returnQty } of normalized) {
    const row = itemsById.get(itemId);
    if (!row) return { error: "Unknown line item." };
    const sold = Math.round(Number(row.quantity)) || 0;
    if (returnQty > sold) return { error: `Cannot return ${returnQty} — only ${sold} on that line.` };
  }

  const { buckets, error: bErr } = await loadDispenseBucketsForSale(saleId);
  if (bErr) return { error: bErr };

  const oldSub = Number(sale.subtotal) || 0;
  const oldVat = Number(sale.vat_amount) || 0;
  const disc = Number(sale.discount_amount) || 0;

  const sorted = [...normalized].sort((a, b) => {
    const ra = itemsById.get(a.itemId)!;
    const rb = itemsById.get(b.itemId)!;
    return ra.linenum - rb.linenum;
  });

  const returnQtyByProduct = new Map<string, number>();
  for (const { itemId, returnQty } of sorted) {
    const row = itemsById.get(itemId)!;
    returnQtyByProduct.set(row.product_id, (returnQtyByProduct.get(row.product_id) ?? 0) + returnQty);
  }
  for (const [pid, tot] of returnQtyByProduct) {
    const r = await restoreReturnQtyUsingBuckets(buckets, pid, tot, saleId);
    if (r.error) return { error: r.error };
  }

  for (const { itemId, returnQty } of sorted) {
    const row = itemsById.get(itemId)!;
    const origQty = Math.round(Number(row.quantity)) || 0;
    const origDisc = Number(row.discount) || 0;
    const unit = Number(row.unit_price) || 0;
    const newQty = origQty - returnQty;
    if (newQty <= 0) {
      const { error: delErr } = await supabase.from(PHARMACY_SALE_ITEMS_TABLE).delete().eq("id", itemId);
      if (delErr) return { error: delErr.message };
      itemsById.delete(itemId);
    } else {
      const newDisc = r2(origDisc * (newQty / origQty));
      const newLine = r2(newQty * unit - newDisc);
      const { error: upErr } = await supabase
        .from(PHARMACY_SALE_ITEMS_TABLE)
        .update({ quantity: newQty, discount: newDisc, line_total: newLine })
        .eq("id", itemId);
      if (upErr) return { error: upErr.message };
      row.quantity = newQty;
      row.discount = newDisc;
      row.line_total = newLine;
    }
  }

  const { data: remaining, error: remErr } = await supabase
    .from(PHARMACY_SALE_ITEMS_TABLE)
    .select("id")
    .eq("pharmacy_sale_id", saleId)
    .limit(1);
  if (remErr) return { error: remErr.message };
  if (!remaining || remaining.length === 0) {
    const stamp = new Date().toISOString();
    const who = args.returnedByUserId != null ? `user_id=${args.returnedByUserId}` : "user=unknown";
    const reason = args.reason?.trim() ? args.reason.trim() : "no reason given";
    const line = `[VOID full return ${stamp}] ${who} · ${reason}`;
    const mergedNotes = [sale.notes?.trim() || null, line].filter(Boolean).join("\n");
    const { error: uErr } = await supabase
      .from(PHARMACY_SALES_TABLE)
      .update({ status: "Voided", notes: mergedNotes, updated_at: new Date().toISOString() })
      .eq("id", saleId)
      .eq("status", "Completed");
    if (uErr) return { error: uErr.message };
    return { error: null };
  }

  const { data: sumRows, error: sErr } = await supabase
    .from(PHARMACY_SALE_ITEMS_TABLE)
    .select("line_total")
    .eq("pharmacy_sale_id", saleId);
  if (sErr) return { error: sErr.message };
  const sumLines = (sumRows ?? []).reduce((s, r) => s + (Number((r as { line_total: number }).line_total) || 0), 0);
  const newSub = Math.max(0, r2(sumLines - disc));
  const newVat = oldSub > 0.01 ? r2(oldVat * (newSub / oldSub)) : 0;
  const newTot = newSub;

  const stamp = new Date().toISOString();
  const who = args.returnedByUserId != null ? `user_id=${args.returnedByUserId}` : "user=unknown";
  const reason = args.reason?.trim() ? args.reason.trim() : "no reason given";
  const detailTxt = sorted.map((x) => `L${itemsById.get(x.itemId)!.linenum}×${x.returnQty}`).join(", ");
  const retLine = `[RETURN ${stamp}] ${who} · ${reason} · ${detailTxt}`;
  const mergedNotes = [sale.notes?.trim() || null, retLine].filter(Boolean).join("\n");

  const { error: updErr } = await supabase
    .from(PHARMACY_SALES_TABLE)
    .update({
      subtotal: newSub,
      vat_amount: newVat,
      total_amount: newTot,
      notes: mergedNotes,
      updated_at: new Date().toISOString(),
    })
    .eq("id", saleId)
    .eq("status", "Completed");
  if (updErr) return { error: updErr.message };
  return { error: null };
}

async function decrementStockFefo(
  productId: string,
  qtyNeeded: number,
  saleId: string,
  db: SupabaseClient = supabase,
): Promise<{ error: string | null }> {
  if (qtyNeeded <= 0) return { error: null };

  const { data: rows, error } = await db
    .from(STOCK_TABLE)
    .select("id, quantity, expiry_date")
    .eq("product_id", productId);

  if (error) return { error: error.message };

  let remaining = qtyNeeded;
  const stockRows = ((rows ?? []) as Array<{ id: string; quantity: number; expiry_date: string | null }>).sort(
    (a, b) => {
      if (!a.expiry_date) return 1;
      if (!b.expiry_date) return -1;
      return a.expiry_date.localeCompare(b.expiry_date);
    },
  );

  for (const row of stockRows) {
    if (remaining <= 0) break;
    const q = Number(row.quantity) || 0;
    if (q <= 0) continue;
    const take = Math.min(q, remaining);
    const newQ = q - take;
    const { error: upErr } = await db
      .from(STOCK_TABLE)
      .update({ quantity: newQ, updated_at: new Date().toISOString() })
      .eq("id", row.id);
    if (upErr) return { error: upErr.message };

    const { error: movErr } = await db.from(STOCK_MOVEMENTS_TABLE).insert({
      product_id: productId,
      quantity: -take,
      movement_type: "DISPENSE",
      stock_id: row.id,
      notes: `Pharmacy sale ${saleId}`,
      reference_type: "pharmacy_sale",
      /** `reference_id` is integer in DB; sale id is UUID — match via `notes` + `reference_type`. */
    });
    if (movErr) return { error: movErr.message };

    remaining -= take;
  }

  if (remaining > 0.0001) {
    const label = await fetchProductDisplayLabel(productId, db);
    const have = qtyNeeded - remaining;
    return {
      error: `Insufficient stock for ${label} (need ${qtyNeeded}, have ${have}).`,
    };
  }
  return { error: null };
}

export type PrescriptionCartLine = {
  pharmacy_prescription_item_id: string;
  product_id: string | null;
  generic_name: string;
  brand_name: string | null;
  strength: string | null;
  quantity_prescribed: number;
  sig: string | null;
  unit_price?: number | null;
  /** True when linked to a completed pharmacy POS sale. */
  dispensed?: boolean;
};

type PrescriptionItemRow = {
  id: string;
  product_id: string | null;
  generic_name: string;
  brand_name: string | null;
  strength: string | null;
  quantity_prescribed: number;
  sig: string | null;
};

/** Prescription item ids referenced by completed pharmacy sales (dispensed / paid at POS). */
export async function fetchDispensedPrescriptionItemIds(
  client: SupabaseClient,
  prescriptionId: string,
): Promise<{ ids: Set<string>; error: string | null }> {
  const pid = prescriptionId.trim();
  if (!pid) return { ids: new Set(), error: null };

  const { data: sales, error: sErr } = await client
    .from(PHARMACY_SALES_TABLE)
    .select("id")
    .eq("prescription_id", pid)
    .eq("status", "Completed");
  if (sErr) return { ids: new Set(), error: sErr.message };

  const saleIds = (sales ?? []).map((s) => String((s as { id?: string }).id ?? "").trim()).filter(Boolean);
  if (saleIds.length === 0) return { ids: new Set(), error: null };

  const { data: saleItems, error: iErr } = await client
    .from(PHARMACY_SALE_ITEMS_TABLE)
    .select("pharmacy_prescription_item_id")
    .in("pharmacy_sale_id", saleIds);
  if (iErr) return { ids: new Set(), error: iErr.message };

  const ids = new Set<string>();
  for (const row of saleItems ?? []) {
    const itemId = String((row as { pharmacy_prescription_item_id?: string | null }).pharmacy_prescription_item_id ?? "").trim();
    if (itemId) ids.add(itemId);
  }
  return { ids, error: null };
}

export type UpsertRxLineInput = {
  productId: string;
  quantityPrescribed: number;
  sig: string | null;
};

async function loadProductMapForRx(
  client: SupabaseClient,
  productIds: string[],
): Promise<{ map: Map<string, Record<string, unknown>>; error: string | null }> {
  if (productIds.length === 0) return { map: new Map(), error: null };
  const { data: products, error: prErr } = await client
    .from(PRODUCTS_TABLE)
    .select("id, generic_name, brand_name, strength, dosage_form")
    .in("id", productIds);
  if (prErr) return { map: new Map(), error: prErr.message };
  return {
    map: new Map((products ?? []).map((p) => [(p as { id: string }).id, p as Record<string, unknown>])),
    error: null,
  };
}

function buildPrescriptionItemInsertRow(
  prescriptionId: string,
  line: UpsertRxLineInput,
  pmap: Map<string, Record<string, unknown>>,
) {
  const p = pmap.get(line.productId);
  return {
    prescription_id: prescriptionId,
    product_id: line.productId,
    generic_name: String(p?.generic_name ?? ""),
    brand_name: (p?.brand_name as string | null) ?? null,
    strength: (p?.strength as string | null) ?? null,
    dosage_form: (p?.dosage_form as string | null) ?? null,
    quantity_prescribed: line.quantityPrescribed,
    sig: line.sig,
  };
}

export type PrescriptionCartByEncounterResult = {
  prescriptionId: string | null;
  patientId: number | null;
  patientName: string | null;
  lines: PrescriptionCartLine[];
  error: string | null;
};

/** Requires a client that can read completed pharmacy sales (service role or API route). */
export async function fetchPrescriptionCartByEncounterWithClient(
  client: SupabaseClient,
  transId: string,
): Promise<PrescriptionCartByEncounterResult> {
  const tid = transId.trim();
  if (!tid) return { prescriptionId: null, patientId: null, patientName: null, lines: [], error: null };

  const { data: presc, error: pErr } = await client
    .from(PRESCRIPTIONS_TABLE)
    .select("id, patient_id")
    .eq("encounter_id", tid)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (pErr) return { prescriptionId: null, patientId: null, patientName: null, lines: [], error: pErr.message };
  if (!presc) {
    return { prescriptionId: null, patientId: null, patientName: null, lines: [], error: null };
  }

  const prescriptionId = (presc as { id: string }).id;
  const patientId = (presc as { patient_id: number | null }).patient_id;

  let patientName: string | null = null;
  if (patientId != null) {
    const { data: pat } = await client.from("patients").select("name").eq("id", patientId).maybeSingle();
    patientName = (pat as { name: string | null } | null)?.name ?? null;
  }

  const { data: items, error: iErr } = await client
    .from(PHARMACY_PRESCRIPTION_ITEMS_TABLE)
    .select("id, product_id, generic_name, brand_name, strength, quantity_prescribed, sig")
    .eq("prescription_id", prescriptionId);

  if (iErr) return { prescriptionId, patientId, patientName, lines: [], error: iErr.message };

  const { ids: dispensedIds } = await fetchDispensedPrescriptionItemIds(client, prescriptionId);

  const lines: PrescriptionCartLine[] = [];
  for (const raw of items ?? []) {
    const row = raw as PrescriptionItemRow;
    let unit_price: number | null = null;
    if (row.product_id) {
      const { data: pr } = await client
        .from(PRODUCTS_TABLE)
        .select("unit_price")
        .eq("id", row.product_id)
        .maybeSingle();
      unit_price = (pr as { unit_price: number } | null)?.unit_price ?? null;
    }
    lines.push({
      pharmacy_prescription_item_id: row.id,
      product_id: row.product_id,
      generic_name: row.generic_name,
      brand_name: row.brand_name,
      strength: row.strength,
      quantity_prescribed: row.quantity_prescribed,
      sig: row.sig,
      unit_price,
      dispensed: dispensedIds.has(row.id),
    });
  }

  return { prescriptionId, patientId, patientName, lines, error: null };
}

/** Browser client cannot read pharmacy sales under RLS — use {@link fetchPrescriptionCartByEncounterAuth} from the app. */
export async function fetchPrescriptionCartByEncounter(
  transId: string,
): Promise<PrescriptionCartByEncounterResult> {
  return fetchPrescriptionCartByEncounterWithClient(supabase, transId);
}

export async function upsertPrescriptionForEncounterWithClient(
  client: SupabaseClient,
  args: {
    transId: string;
    patientId: number;
    physicianUserId: number | null;
    rxLines: UpsertRxLineInput[];
  },
): Promise<{ prescriptionId: string | null; error: string | null }> {
  const now = new Date().toISOString();
  const today = now.slice(0, 10);
  const rxNumber = `RX-${args.transId.slice(0, 8).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;

  const { data: existing, error: exErr } = await client
    .from(PRESCRIPTIONS_TABLE)
    .select("id")
    .eq("encounter_id", args.transId)
    .maybeSingle();
  if (exErr) return { prescriptionId: null, error: exErr.message };

  let prescriptionId: string;
  let isNewPrescription = false;
  if (existing) {
    prescriptionId = (existing as { id: string }).id;
  } else {
    isNewPrescription = true;
    const { data: ins, error: iErr } = await client
      .from(PRESCRIPTIONS_TABLE)
      .insert({
        encounter_id: args.transId,
        patient_id: args.patientId,
        physician_id: args.physicianUserId,
        prescribed_date: today,
        rx_number: rxNumber,
        status: "Pending",
        created_at: now,
        updated_at: now,
      })
      .select("id")
      .single();
    if (iErr) return { prescriptionId: null, error: iErr.message };
    prescriptionId = (ins as { id: string }).id;
  }

  const normalizedLines = args.rxLines
    .filter((l) => l && typeof l.productId === "string" && l.productId.trim() !== "")
    .map((l) => ({
      productId: l.productId.trim(),
      quantityPrescribed: Math.max(1, Math.round(Number(l.quantityPrescribed) || 0)),
      sig: typeof l.sig === "string" && l.sig.trim() ? l.sig.trim() : null,
    }));

  if (isNewPrescription) {
    const seenProductIds = new Set<string>();
    const uniqueLines = normalizedLines.filter((l) => {
      if (seenProductIds.has(l.productId)) return false;
      seenProductIds.add(l.productId);
      return true;
    });
    const productIds = [...new Set(uniqueLines.map((l) => l.productId))];
    const { map: pmap, error: prErr } = await loadProductMapForRx(client, productIds);
    if (prErr) return { prescriptionId: null, error: prErr };
    const itemRows = uniqueLines.map((line) => buildPrescriptionItemInsertRow(prescriptionId, line, pmap));
    if (itemRows.length > 0) {
      const { error: insErr } = await client.from(PHARMACY_PRESCRIPTION_ITEMS_TABLE).insert(itemRows);
      if (insErr) return { prescriptionId: null, error: insErr.message };
    }
    return { prescriptionId, error: null };
  }

  const { data: existingItems, error: itemsErr } = await client
    .from(PHARMACY_PRESCRIPTION_ITEMS_TABLE)
    .select("id, product_id, generic_name, brand_name, strength, quantity_prescribed, sig")
    .eq("prescription_id", prescriptionId);
  if (itemsErr) return { prescriptionId: null, error: itemsErr.message };

  const { ids: dispensedIds, error: dispErr } = await fetchDispensedPrescriptionItemIds(client, prescriptionId);
  if (dispErr) return { prescriptionId: null, error: dispErr };

  const existingRows = (existingItems ?? []) as PrescriptionItemRow[];
  const payloadQueue = [...normalizedLines];
  let insertedNew = false;

  for (const row of existingRows) {
    if (dispensedIds.has(row.id)) {
      // Drop payload lines for products already dispensed — otherwise they are re-inserted as duplicates.
      if (row.product_id) {
        const dupIdx = payloadQueue.findIndex((p) => p.productId === row.product_id);
        if (dupIdx >= 0) payloadQueue.splice(dupIdx, 1);
      }
      continue;
    }

    const matchIdx = row.product_id
      ? payloadQueue.findIndex((p) => p.productId === row.product_id)
      : -1;
    if (matchIdx >= 0) {
      const line = payloadQueue.splice(matchIdx, 1)[0]!;
      const { error: upErr } = await client
        .from(PHARMACY_PRESCRIPTION_ITEMS_TABLE)
        .update({
          quantity_prescribed: line.quantityPrescribed,
          sig: line.sig,
        })
        .eq("id", row.id);
      if (upErr) return { prescriptionId: null, error: upErr.message };
    } else {
      const { error: delErr } = await client.from(PHARMACY_PRESCRIPTION_ITEMS_TABLE).delete().eq("id", row.id);
      if (delErr) return { prescriptionId: null, error: delErr.message };
    }
  }

  if (payloadQueue.length > 0) {
    const occupiedProductIds = new Set(
      existingRows.map((r) => r.product_id).filter((id): id is string => typeof id === "string" && id.trim() !== ""),
    );
    const newLines = payloadQueue.filter((p) => !occupiedProductIds.has(p.productId));
    if (newLines.length > 0) {
      const productIds = [...new Set(newLines.map((l) => l.productId))];
      const { map: pmap, error: prErr } = await loadProductMapForRx(client, productIds);
      if (prErr) return { prescriptionId: null, error: prErr };
      const itemRows = newLines.map((line) => buildPrescriptionItemInsertRow(prescriptionId, line, pmap));
      const { error: insErr } = await client.from(PHARMACY_PRESCRIPTION_ITEMS_TABLE).insert(itemRows);
      if (insErr) return { prescriptionId: null, error: insErr.message };
      insertedNew = true;
    }
  }

  const headerUpdate: Record<string, unknown> = {
    patient_id: args.patientId,
    physician_id: args.physicianUserId,
    prescribed_date: today,
    updated_at: now,
  };
  if (insertedNew) headerUpdate.status = "Pending";

  const { error: uErr } = await client.from(PRESCRIPTIONS_TABLE).update(headerUpdate).eq("id", prescriptionId);
  if (uErr) return { prescriptionId: null, error: uErr.message };

  return { prescriptionId, error: null };
}

export async function upsertPrescriptionForEncounter(args: {
  transId: string;
  patientId: number;
  physicianUserId: number | null;
  rxLines: UpsertRxLineInput[];
}): Promise<{ prescriptionId: string | null; error: string | null }> {
  return upsertPrescriptionForEncounterWithClient(supabase, args);
}

export type PharmacyCategoryRow = {
  id: number;
  code: string;
  name: string;
  description: string | null;
  is_active: boolean | null;
  sort_order: number | null;
};

export async function listPharmacyCategories(): Promise<{
  rows: PharmacyCategoryRow[];
  error: string | null;
}> {
  const { data, error } = await supabase
    .from(PHARMACY_CATEGORIES_TABLE)
    .select("id, code, name, description, is_active, sort_order")
    .order("sort_order", { ascending: true, nullsFirst: false })
    .order("name", { ascending: true });
  if (error) return { rows: [], error: error.message };
  return { rows: (data ?? []) as PharmacyCategoryRow[], error: null };
}

export async function insertPharmacyCategory(row: {
  code: string;
  name: string;
  description?: string | null;
}): Promise<{ error: string | null }> {
  const { error } = await supabase.from(PHARMACY_CATEGORIES_TABLE).insert({
    code: row.code.trim(),
    name: row.name.trim(),
    description: row.description ?? null,
    is_active: true,
  });
  return { error: error?.message ?? null };
}

export async function updatePharmacyCategory(
  id: number,
  row: { code?: string; name?: string; description?: string | null; is_active?: boolean },
): Promise<{ error: string | null }> {
  const patch: Record<string, unknown> = {};
  if (row.code !== undefined) patch.code = row.code.trim();
  if (row.name !== undefined) patch.name = row.name.trim();
  if (row.description !== undefined) patch.description = row.description;
  if (row.is_active !== undefined) patch.is_active = row.is_active;
  if (Object.keys(patch).length === 0) return { error: null };
  const { error } = await supabase.from(PHARMACY_CATEGORIES_TABLE).update(patch).eq("id", id);
  return { error: error?.message ?? null };
}

/** Product rows per `category_id` — used to gate category delete in the UI. */
export async function fetchProductCountsByPharmacyCategory(): Promise<{
  countsByCategoryId: Record<number, number>;
  error: string | null;
}> {
  const { data, error } = await supabase.from(PRODUCTS_TABLE).select("category_id");
  if (error) return { countsByCategoryId: {}, error: error.message };
  const m = new Map<number, number>();
  for (const row of data ?? []) {
    const cid = (row as { category_id: number | null }).category_id;
    if (cid == null || !Number.isFinite(Number(cid))) continue;
    const id = Number(cid);
    m.set(id, (m.get(id) ?? 0) + 1);
  }
  return { countsByCategoryId: Object.fromEntries(m), error: null };
}

export async function deletePharmacyCategoryIfNoProducts(categoryId: number): Promise<{ error: string | null }> {
  const { count, error: cErr } = await supabase
    .from(PRODUCTS_TABLE)
    .select("id", { count: "exact", head: true })
    .eq("category_id", categoryId);
  if (cErr) return { error: cErr.message };
  if (count != null && count > 0) {
    return { error: `Cannot delete: ${count} product(s) still use this category.` };
  }
  const { error } = await supabase.from(PHARMACY_CATEGORIES_TABLE).delete().eq("id", categoryId);
  return { error: error?.message ?? null };
}

export type StockLotRow = {
  id: string;
  product_id: string;
  quantity: number;
  expiry_date: string | null;
  batch_no: string | null;
};

/** Lots on hand for a product (FEFO ordering). */
export async function fetchStockLotsForProduct(productId: string): Promise<{
  lots: StockLotRow[];
  error: string | null;
}> {
  const { data, error } = await supabase
    .from(STOCK_TABLE)
    .select("id, product_id, quantity, expiry_date, batch_no")
    .eq("product_id", productId.trim())
    .order("expiry_date", { ascending: true, nullsFirst: false });

  if (error) return { lots: [], error: error.message };
  const lots = (data ?? []) as StockLotRow[];
  return { lots: lots.filter((l) => Number(l.quantity) > 0), error: null };
}

/** Sum of `stock.quantity` per product (lots with positive qty only). */
export async function fetchOnHandQtyByProductIds(
  productIds: string[],
): Promise<{ qtyByProductId: Record<string, number>; error: string | null }> {
  const uniq = [...new Set(productIds.map((id) => id.trim()).filter(Boolean))];
  if (uniq.length === 0) {
    return { qtyByProductId: {}, error: null };
  }
  const { data, error } = await supabase.from(STOCK_TABLE).select("product_id, quantity").in("product_id", uniq);
  if (error) {
    return { qtyByProductId: {}, error: error.message };
  }
  const qtyByProductId: Record<string, number> = {};
  for (const row of data ?? []) {
    const pid = (row as { product_id: string }).product_id;
    const q = Number((row as { quantity: number }).quantity);
    if (!Number.isFinite(q) || q <= 0) continue;
    qtyByProductId[pid] = (qtyByProductId[pid] ?? 0) + q;
  }
  return { qtyByProductId, error: null };
}

/** Earliest non-null expiry (YYYY-MM-DD) among lots with quantity > 0 — FEFO “next to expire”. */
export function getClosestStockExpiryYmd(lots: StockLotRow[]): string | null {
  let best: string | null = null;
  for (const l of lots) {
    if (Number(l.quantity) <= 0) continue;
    const d = l.expiry_date?.trim();
    if (!d) continue;
    if (best === null || d.localeCompare(best) < 0) best = d;
  }
  return best;
}

/**
 * Receive stock: merges quantity into an existing lot with the same expiry date, or inserts a new lot.
 * Records a row in `pharmacy_stock_ins` (Delivery Receipt fields), not `stock_movements`.
 */
export async function applyPharmacyStockIn(args: {
  productId: string;
  quantity: number;
  expiryDate: string;
  batchNo?: string | null;
  unitCost?: number | null;
  /** Optional; stored on stock lot (new lots) and pharmacy_stock_ins. */
  notes?: string | null;
  performedBy?: string | null;
  drNumber?: string | null;
  drDate?: string | null;
  supplierDr?: string | null;
}): Promise<{ stockId: string | null; error: string | null }> {
  const qty = Number(args.quantity);
  if (!Number.isFinite(qty) || qty <= 0) return { stockId: null, error: "Quantity must be positive." };
  const exp = args.expiryDate.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(exp)) return { stockId: null, error: "Expiry date is required (YYYY-MM-DD)." };
  const drN = args.drNumber?.trim() || null;
  const drDRaw = args.drDate?.trim().slice(0, 10) ?? "";
  const drD = drDRaw && /^\d{4}-\d{2}-\d{2}$/.test(drDRaw) ? drDRaw : null;
  if (args.drDate?.trim() && !drD) return { stockId: null, error: "DR date must be YYYY-MM-DD when provided." };
  const sup = args.supplierDr?.trim() || null;

  const now = new Date().toISOString();
  const { data: existing, error: exErr } = await supabase
    .from(STOCK_TABLE)
    .select("id, quantity")
    .eq("product_id", args.productId.trim())
    .eq("expiry_date", exp)
    .maybeSingle();

  if (exErr) return { stockId: null, error: exErr.message };

  let stockId: string;

  if (existing) {
    stockId = (existing as { id: string }).id;
    const prev = Number((existing as { quantity: number }).quantity) || 0;
    const { error: upErr } = await supabase
      .from(STOCK_TABLE)
      .update({
        quantity: prev + qty,
        updated_at: now,
      })
      .eq("id", stockId);
    if (upErr) return { stockId: null, error: upErr.message };
  } else {
    const { data: ins, error: insErr } = await supabase
      .from(STOCK_TABLE)
      .insert({
        product_id: args.productId.trim(),
        quantity: qty,
        expiry_date: exp,
        batch_no: args.batchNo?.trim() || null,
        unit_cost: args.unitCost ?? null,
        notes: args.notes?.trim() || null,
        created_at: now,
        updated_at: now,
      })
      .select("id")
      .single();
    if (insErr) return { stockId: null, error: insErr.message };
    stockId = (ins as { id: string }).id;
  }

  // DB columns may still be NOT NULL; use "" for omitted text DR fields. dr_date stays null when omitted (run migration).
  const { error: inErr } = await supabase.from(PHARMACY_STOCK_INS_TABLE).insert({
    product_id: args.productId.trim(),
    stock_id: stockId,
    quantity: qty,
    dr_number: drN ?? "",
    dr_date: drD,
    supplier_dr: sup ?? "",
    notes: args.notes?.trim() || null,
    performed_by: args.performedBy ?? null,
  });
  if (inErr) return { stockId: null, error: inErr.message };

  return { stockId, error: null };
}

/**
 * Remove quantity from a specific lot (expiry pull / waste / correction out).
 * Records a row in `pharmacy_stock_outs`, not `stock_movements`.
 */
export async function applyPharmacyStockOut(args: {
  stockId: string;
  productId: string;
  quantity: number;
  movementType: "EXPIRY" | "STOCK_OUT";
  notes: string | null;
  performedBy?: string | null;
}): Promise<{ error: string | null }> {
  const qty = Number(args.quantity);
  if (!Number.isFinite(qty) || qty <= 0) return { error: "Quantity must be positive." };

  const { data: row, error: fErr } = await supabase
    .from(STOCK_TABLE)
    .select("id, quantity")
    .eq("id", args.stockId)
    .eq("product_id", args.productId.trim())
    .maybeSingle();

  if (fErr) return { error: fErr.message };
  if (!row) return { error: "Stock lot not found." };
  const onHand = Number((row as { quantity: number }).quantity) || 0;
  if (qty > onHand + 1e-9) return { error: `Only ${onHand} available in this lot.` };

  const now = new Date().toISOString();
  const newQ = onHand - qty;
  const { error: upErr } = await supabase
    .from(STOCK_TABLE)
    .update({ quantity: newQ, updated_at: now })
    .eq("id", args.stockId);
  if (upErr) return { error: upErr.message };

  const { error: outErr } = await supabase.from(PHARMACY_STOCK_OUTS_TABLE).insert({
    product_id: args.productId.trim(),
    stock_id: args.stockId,
    quantity: qty,
    reason_type: args.movementType,
    notes: args.notes?.trim() || null,
    performed_by: args.performedBy ?? null,
  });
  if (outErr) return { error: outErr.message };

  return { error: null };
}

const LOT_CORRECTION_NOTE_PREFIX = "Lot correction";

/** Update expiry / batch on an existing lot (not quantity). */
export async function updatePharmacyStockLotDetails(args: {
  stockId: string;
  productId: string;
  expiryDate: string | null;
  batchNo: string | null;
}): Promise<{ error: string | null }> {
  const expRaw = args.expiryDate?.trim().slice(0, 10) ?? "";
  const exp = expRaw ? expRaw : null;
  if (exp && !/^\d{4}-\d{2}-\d{2}$/.test(exp)) {
    return { error: "Expiry must be YYYY-MM-DD when provided." };
  }

  let conflictQ = supabase
    .from(STOCK_TABLE)
    .select("id")
    .eq("product_id", args.productId.trim())
    .neq("id", args.stockId);
  conflictQ = exp === null ? conflictQ.is("expiry_date", null) : conflictQ.eq("expiry_date", exp);
  const { data: conflict, error: cErr } = await conflictQ.maybeSingle();
  if (cErr) return { error: cErr.message };
  if (conflict) {
    return { error: "Another lot already uses this expiry date for this product." };
  }

  const now = new Date().toISOString();
  const { error } = await supabase
    .from(STOCK_TABLE)
    .update({
      expiry_date: exp,
      batch_no: args.batchNo?.trim() || null,
      updated_at: now,
    })
    .eq("id", args.stockId)
    .eq("product_id", args.productId.trim());
  return { error: error?.message ?? null };
}

/** Set lot quantity via stock-in / stock-out audit rows (or direct update when lot has no expiry). */
export async function correctPharmacyStockLotQuantity(args: {
  stockId: string;
  productId: string;
  newQuantity: number;
  notes: string;
  performedBy?: string | null;
}): Promise<{ error: string | null }> {
  const target = Number(args.newQuantity);
  if (!Number.isFinite(target) || target < 0) return { error: "Quantity must be zero or positive." };

  const { data: row, error: fErr } = await supabase
    .from(STOCK_TABLE)
    .select("id, product_id, quantity, expiry_date, batch_no")
    .eq("id", args.stockId)
    .eq("product_id", args.productId.trim())
    .maybeSingle();
  if (fErr) return { error: fErr.message };
  if (!row) return { error: "Stock lot not found." };

  const lot = row as StockLotRow;
  const current = Number(lot.quantity) || 0;
  const delta = target - current;
  if (Math.abs(delta) < 1e-9) return { error: null };

  const note = `${LOT_CORRECTION_NOTE_PREFIX}: ${args.notes.trim()}`;
  const exp = lot.expiry_date?.trim().slice(0, 10) ?? null;

  if (delta > 0) {
    if (exp) {
      const { error } = await applyPharmacyStockIn({
        productId: args.productId,
        quantity: delta,
        expiryDate: exp,
        batchNo: lot.batch_no,
        notes: note,
        performedBy: args.performedBy,
        drNumber: null,
        drDate: null,
        supplierDr: null,
      });
      return { error };
    }
    const now = new Date().toISOString();
    const { error: upErr } = await supabase
      .from(STOCK_TABLE)
      .update({ quantity: target, updated_at: now })
      .eq("id", args.stockId);
    if (upErr) return { error: upErr.message };
    const { error: inErr } = await supabase.from(PHARMACY_STOCK_INS_TABLE).insert({
      product_id: args.productId.trim(),
      stock_id: args.stockId,
      quantity: delta,
      dr_number: "",
      dr_date: null,
      supplier_dr: "",
      notes: note,
      performed_by: args.performedBy ?? null,
    });
    return { error: inErr?.message ?? null };
  }

  const outQty = -delta;
  if (exp) {
    const { error } = await applyPharmacyStockOut({
      stockId: args.stockId,
      productId: args.productId,
      quantity: outQty,
      movementType: "STOCK_OUT",
      notes: note,
      performedBy: args.performedBy,
    });
    return { error };
  }
  const now = new Date().toISOString();
  const { error: upErr } = await supabase
    .from(STOCK_TABLE)
    .update({ quantity: target, updated_at: now })
    .eq("id", args.stockId);
  if (upErr) return { error: upErr.message };
  const { error: outErr } = await supabase.from(PHARMACY_STOCK_OUTS_TABLE).insert({
    product_id: args.productId.trim(),
    stock_id: args.stockId,
    quantity: outQty,
    reason_type: "STOCK_OUT",
    notes: note,
    performed_by: args.performedBy ?? null,
  });
  return { error: outErr?.message ?? null };
}

/** Remove a zero-quantity lot with no POS movement history. */
export async function deletePharmacyStockLot(args: {
  stockId: string;
  productId: string;
}): Promise<{ error: string | null }> {
  const { data: row, error: fErr } = await supabase
    .from(STOCK_TABLE)
    .select("id, quantity")
    .eq("id", args.stockId)
    .eq("product_id", args.productId.trim())
    .maybeSingle();
  if (fErr) return { error: fErr.message };
  if (!row) return { error: "Stock lot not found." };
  const onHand = Number((row as { quantity: number }).quantity) || 0;
  if (onHand > 1e-9) {
    return { error: `Cannot delete: lot still has ${onHand} on hand. Set quantity to 0 first.` };
  }

  const { count, error: mErr } = await supabase
    .from(STOCK_MOVEMENTS_TABLE)
    .select("id", { count: "exact", head: true })
    .eq("stock_id", args.stockId);
  if (mErr) return { error: mErr.message };
  if (count && count > 0) {
    return {
      error: "Cannot delete: this lot was used in sales. Leave it at zero quantity instead.",
    };
  }

  const { error } = await supabase
    .from(STOCK_TABLE)
    .delete()
    .eq("id", args.stockId)
    .eq("product_id", args.productId.trim());
  return { error: error?.message ?? null };
}

export async function insertProductForPos(row: ProductAdminWriteRow): Promise<{
  productId: string | null;
  error: string | null;
}> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from(PRODUCTS_TABLE)
    .insert({
      ...productWriteToDbColumns(row),
      created_at: now,
      updated_at: now,
    })
    .select("id")
    .single();
  if (error) return { productId: null, error: error.message };
  return { productId: (data as { id: string }).id, error: null };
}

export type ProductAdminWriteRow = {
  categoryId: number;
  genericName: string;
  brandName?: string | null;
  strength?: string | null;
  dosageForm?: string | null;
  description?: string | null;
  unitOfMeasure: string;
  unitPrice: number;
  unitCost: number;
  barcode?: string | null;
  supplierId?: number | null;
  requiresPrescription?: boolean | null;
  reorderLevel?: number | null;
  reorderQuantity?: number | null;
  vatExempt?: boolean | null;
  vatRate?: number | null;
  isActive?: boolean | null;
};

function productWriteToDbColumns(row: ProductAdminWriteRow): Record<string, unknown> {
  const vatExempt = row.vatExempt ?? false;
  const vatRate =
    row.vatRate != null && Number.isFinite(row.vatRate)
      ? row.vatRate
      : vatExempt
        ? 0
        : 12;
  return {
    category_id: row.categoryId,
    generic_name: row.genericName.trim(),
    brand_name: row.brandName ?? null,
    strength: row.strength ?? null,
    dosage_form: row.dosageForm ?? null,
    description: row.description?.trim() || null,
    unit_of_measure: row.unitOfMeasure.trim(),
    unit_price: row.unitPrice,
    unit_cost: row.unitCost,
    barcode: row.barcode?.trim() || null,
    supplier_id: row.supplierId != null && Number.isFinite(row.supplierId) ? row.supplierId : null,
    requires_prescription: row.requiresPrescription ?? false,
    reorder_level: row.reorderLevel != null && Number.isFinite(row.reorderLevel) ? row.reorderLevel : null,
    reorder_quantity: row.reorderQuantity != null && Number.isFinite(row.reorderQuantity) ? row.reorderQuantity : null,
    vat_exempt: vatExempt,
    vat_rate: vatRate,
    is_active: row.isActive ?? true,
  };
}

export async function listProductsForAdmin(opts: {
  page: number;
  pageSize: number;
  includeInactive?: boolean;
}): Promise<{ rows: ProductAdminRow[]; totalCount: number; error: string | null }> {
  const pageSize = Math.min(Math.max(1, opts.pageSize), 100);
  const page = Math.max(0, opts.page);
  const from = page * pageSize;
  const to = from + pageSize - 1;

  let q = supabase.from(PRODUCTS_TABLE).select(PRODUCT_ADMIN_SELECT, { count: "exact" });
  if (!opts.includeInactive) {
    q = q.or(ACTIVE_PRODUCTS_OR);
  }
  const { data, error, count } = await q.order("generic_name", { ascending: true }).range(from, to);

  if (error) {
    return { rows: [], totalCount: 0, error: error.message };
  }
  return { rows: (data ?? []) as ProductAdminRow[], totalCount: count ?? 0, error: null };
}

export async function searchProductsForAdmin(
  rawQuery: string,
  opts?: { limit?: number; includeInactive?: boolean },
): Promise<{ rows: ProductAdminRow[]; error: string | null }> {
  const safe = sanitizeSearchToken(rawQuery);
  if (safe.length < 2) {
    return { rows: [], error: null };
  }
  const cap = Math.min(Math.max(1, opts?.limit ?? 200), 200);
  const pattern = `%${safe}%`;

  let q = supabase
    .from(PRODUCTS_TABLE)
    .select(PRODUCT_ADMIN_SELECT)
    .or(`generic_name.ilike.${pattern},brand_name.ilike.${pattern},barcode.ilike.${pattern}`);
  if (!opts?.includeInactive) {
    q = q.or(ACTIVE_PRODUCTS_OR);
  }
  const { data, error } = await q.order("generic_name", { ascending: true }).limit(cap);

  if (error) {
    return { rows: [], error: error.message };
  }
  return { rows: (data ?? []) as ProductAdminRow[], error: null };
}

export async function fetchProductForAdmin(
  id: string,
): Promise<{ product: ProductAdminRow | null; error: string | null }> {
  const trimmed = id.trim();
  if (!trimmed) return { product: null, error: null };

  const { data, error } = await supabase
    .from(PRODUCTS_TABLE)
    .select(PRODUCT_ADMIN_SELECT)
    .eq("id", trimmed)
    .maybeSingle();

  if (error) return { product: null, error: error.message };
  if (!data) return { product: null, error: null };
  return { product: data as ProductAdminRow, error: null };
}

export async function updateProductForAdmin(
  id: string,
  row: ProductAdminWriteRow,
): Promise<{ error: string | null }> {
  const trimmed = id.trim();
  if (!trimmed) return { error: "Product id is required." };

  const patch = {
    ...productWriteToDbColumns(row),
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from(PRODUCTS_TABLE).update(patch).eq("id", trimmed);
  return { error: error?.message ?? null };
}

export type ProductRemoveOutcome = "deleted" | "deactivated";

type ProductReferenceCounts = {
  saleItems: number;
  prescriptionItems: number;
  stockMovements: number;
};

async function countProductReferences(
  productId: string,
  db: SupabaseClient = supabase,
): Promise<{ counts: ProductReferenceCounts; error: string | null }> {
  const [saleRes, rxRes, movRes] = await Promise.all([
    db
      .from(PHARMACY_SALE_ITEMS_TABLE)
      .select("id", { count: "exact", head: true })
      .eq("product_id", productId),
    db
      .from(PHARMACY_PRESCRIPTION_ITEMS_TABLE)
      .select("id", { count: "exact", head: true })
      .eq("product_id", productId),
    db
      .from(STOCK_MOVEMENTS_TABLE)
      .select("id", { count: "exact", head: true })
      .eq("product_id", productId),
  ]);

  if (saleRes.error) return { counts: { saleItems: 0, prescriptionItems: 0, stockMovements: 0 }, error: saleRes.error.message };
  if (rxRes.error) return { counts: { saleItems: 0, prescriptionItems: 0, stockMovements: 0 }, error: rxRes.error.message };
  if (movRes.error) return { counts: { saleItems: 0, prescriptionItems: 0, stockMovements: 0 }, error: movRes.error.message };

  return {
    counts: {
      saleItems: saleRes.count ?? 0,
      prescriptionItems: rxRes.count ?? 0,
      stockMovements: movRes.count ?? 0,
    },
    error: null,
  };
}

function productMustDeactivate(counts: ProductReferenceCounts, stockOnHand: number): boolean {
  return (
    counts.saleItems > 0 ||
    counts.prescriptionItems > 0 ||
    counts.stockMovements > 0 ||
    stockOnHand > 1e-9
  );
}

async function deactivateProductForAdmin(
  productId: string,
  db: SupabaseClient = supabase,
): Promise<{ error: string | null }> {
  const { error } = await db
    .from(PRODUCTS_TABLE)
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("id", productId);
  return { error: error?.message ?? null };
}

/** Remove zero-qty stock lots with no movement history before hard-deleting a product. */
async function deleteOrphanZeroStockLotsForProduct(productId: string): Promise<{ error: string | null }> {
  const { data: lots, error } = await supabase
    .from(STOCK_TABLE)
    .select("id, quantity")
    .eq("product_id", productId);
  if (error) return { error: error.message };

  for (const raw of lots ?? []) {
    const lot = raw as { id: string; quantity: number };
    const onHand = Number(lot.quantity) || 0;
    if (onHand > 1e-9) continue;
    const { error: delErr } = await deletePharmacyStockLot({ stockId: lot.id, productId });
    if (delErr?.includes("used in sales")) continue;
    if (delErr) return { error: delErr };
  }
  return { error: null };
}

/**
 * Removes a duplicate product when safe (hard delete), or sets inactive when sales/stock/history exist.
 * Past sale reports keep line-item FKs and product names intact when deactivated.
 */
export async function removeProductForAdmin(
  productId: string,
  db: SupabaseClient = supabase,
): Promise<{ outcome: ProductRemoveOutcome | null; error: string | null }> {
  const trimmed = productId.trim();
  if (!trimmed) return { outcome: null, error: "Product id is required." };

  const { product, error: loadErr } = await fetchProductForAdmin(trimmed);
  if (loadErr) return { outcome: null, error: loadErr };
  if (!product) return { outcome: null, error: "Product not found." };

  const { counts, error: countErr } = await countProductReferences(trimmed, db);
  if (countErr) return { outcome: null, error: countErr };

  const { qty: stockOnHand, error: stockErr } = await getProductStockOnHand(trimmed, db);
  if (stockErr) return { outcome: null, error: stockErr };

  if (productMustDeactivate(counts, stockOnHand)) {
    const { error } = await deactivateProductForAdmin(trimmed, db);
    if (error) return { outcome: null, error };
    return { outcome: "deactivated", error: null };
  }

  const lotCleanup = await deleteOrphanZeroStockLotsForProduct(trimmed);
  if (lotCleanup.error) return { outcome: null, error: lotCleanup.error };

  const { error: delErr } = await db.from(PRODUCTS_TABLE).delete().eq("id", trimmed);
  if (!delErr) return { outcome: "deleted", error: null };

  const { error: deactivateErr } = await deactivateProductForAdmin(trimmed, db);
  if (deactivateErr) {
    return {
      outcome: null,
      error: `${delErr.message} Could not deactivate as fallback.`,
    };
  }
  return {
    outcome: "deactivated",
    error: `Product could not be permanently removed (${delErr.message}). It was deactivated instead.`,
  };
}

export type SupplierRow = {
  id: number;
  name: string;
  address: string | null;
  contact_person: string | null;
  email: string | null;
  phone: string | null;
  tin_no: string | null;
  terms_days: number | null;
  notes: string | null;
  is_active: boolean | null;
};

export async function listSuppliers(): Promise<{ rows: SupplierRow[]; error: string | null }> {
  const { data, error } = await supabase
    .from(SUPPLIERS_TABLE)
    .select("id, name, address, contact_person, email, phone, tin_no, terms_days, notes, is_active")
    .order("name", { ascending: true });
  if (error) return { rows: [], error: error.message };
  return { rows: (data ?? []) as SupplierRow[], error: null };
}

export async function insertSupplier(row: {
  name: string;
  address?: string | null;
  contactPerson?: string | null;
  email?: string | null;
  phone?: string | null;
  tinNo?: string | null;
  termsDays?: number | null;
  notes?: string | null;
}): Promise<{ id: number | null; error: string | null }> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from(SUPPLIERS_TABLE)
    .insert({
      name: row.name.trim(),
      address: row.address?.trim() || null,
      contact_person: row.contactPerson?.trim() || null,
      email: row.email?.trim() || null,
      phone: row.phone?.trim() || null,
      tin_no: row.tinNo?.trim() || null,
      terms_days: row.termsDays != null && Number.isFinite(row.termsDays) ? row.termsDays : null,
      notes: row.notes?.trim() || null,
      is_active: true,
      created_at: now,
      updated_at: now,
    })
    .select("id")
    .single();
  if (error) return { id: null, error: error.message };
  return { id: (data as { id: number }).id, error: null };
}

export async function updateSupplier(
  id: number,
  row: {
    name?: string;
    address?: string | null;
    contactPerson?: string | null;
    email?: string | null;
    phone?: string | null;
    tinNo?: string | null;
    termsDays?: number | null;
    notes?: string | null;
    isActive?: boolean | null;
  },
): Promise<{ error: string | null }> {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (row.name !== undefined) patch.name = row.name.trim();
  if (row.address !== undefined) patch.address = row.address?.trim() || null;
  if (row.contactPerson !== undefined) patch.contact_person = row.contactPerson?.trim() || null;
  if (row.email !== undefined) patch.email = row.email?.trim() || null;
  if (row.phone !== undefined) patch.phone = row.phone?.trim() || null;
  if (row.tinNo !== undefined) patch.tin_no = row.tinNo?.trim() || null;
  if (row.termsDays !== undefined) patch.terms_days = row.termsDays;
  if (row.notes !== undefined) patch.notes = row.notes?.trim() || null;
  if (row.isActive !== undefined) patch.is_active = row.isActive;
  const { error } = await supabase.from(SUPPLIERS_TABLE).update(patch).eq("id", id);
  return { error: error?.message ?? null };
}

function localDateCompactYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

function parsePharmacySaleRefSeq(saleRef: string, expectedPrefix: string): number | null {
  const s = (saleRef ?? "").trim();
  if (!s.startsWith(expectedPrefix)) return null;
  const rest = s.slice(expectedPrefix.length);
  const seqStr = rest.split("-")[0] ?? "";
  if (!/^\d+$/.test(seqStr)) return null;
  const n = Number.parseInt(seqStr, 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * Daily pharmacy sale reference for POS slips (not a BIR OR).
 * Format: `YYYYMMDD-####` (numeric, resets each calendar day).
 */
export async function generateOrNumber(db: SupabaseClient = supabase): Promise<string> {
  const now = new Date();
  const prefix = `${localDateCompactYmd(now)}-`;

  const { data, error } = await db
    .from(PHARMACY_SALES_TABLE)
    .select("or_number")
    .not("or_number", "is", null)
    .like("or_number", `${prefix}%`)
    .order("or_number", { ascending: false })
    .limit(1);

  if (error) throw new Error(error.message);

  const row = (data ?? [])[0] as { or_number?: string } | undefined;
  const parsed = row?.or_number ? parsePharmacySaleRefSeq(String(row.or_number), prefix) : null;
  const next = (parsed ?? 0) + 1;
  return `${prefix}${String(next).padStart(4, "0")}`;
}

function formatLocalYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export type PharmacyDailyStat = { date: string; total: number; count: number };

/** Aggregates completed pharmacy sales for dashboard charts (walk-in vs Rx uses prescription_id). */
export async function fetchPharmacyDashboardAnalytics(
  daysBack = 14,
  db: SupabaseClient = supabase,
): Promise<{
  daily: PharmacyDailyStat[];
  walkInRevenue: number;
  rxRevenue: number;
  totalRevenue: number;
  transactionCount: number;
  paymentBreakdown: Record<string, number>;
  error: string | null;
}> {
  const cap = Math.min(Math.max(1, daysBack), 90);
  const oldest = new Date();
  oldest.setHours(0, 0, 0, 0);
  oldest.setDate(oldest.getDate() - (cap - 1));
  const startYmd = formatLocalYmd(oldest);

  const { data, error } = await db
    .from(PHARMACY_SALES_TABLE)
    .select("sale_date, total_amount, prescription_id, payment_method")
    .eq("status", "Completed")
    .gte("sale_date", startYmd);

  if (error) {
    return {
      daily: [],
      walkInRevenue: 0,
      rxRevenue: 0,
      totalRevenue: 0,
      transactionCount: 0,
      paymentBreakdown: {},
      error: error.message,
    };
  }

  const byDay = new Map<string, { total: number; count: number }>();
  for (let i = cap - 1; i >= 0; i--) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    byDay.set(formatLocalYmd(d), { total: 0, count: 0 });
  }

  let walkInRevenue = 0;
  let rxRevenue = 0;
  let totalRevenue = 0;
  let transactionCount = 0;
  const paymentBreakdown: Record<string, number> = {};

  for (const raw of data ?? []) {
    const r = raw as {
      sale_date: string;
      total_amount: number | null;
      prescription_id: string | null;
      payment_method: string | null;
    };
    const amt = Number(r.total_amount) || 0;
    totalRevenue += amt;
    transactionCount += 1;
    if (r.prescription_id) rxRevenue += amt;
    else walkInRevenue += amt;

    const pm = (r.payment_method ?? "Other").trim() || "Other";
    paymentBreakdown[pm] = (paymentBreakdown[pm] ?? 0) + amt;

    const dayKey = (r.sale_date ?? "").slice(0, 10);
    if (byDay.has(dayKey)) {
      const cur = byDay.get(dayKey)!;
      cur.total += amt;
      cur.count += 1;
    }
  }

  const daily = [...byDay.entries()].map(([date, v]) => ({ date, total: v.total, count: v.count }));

  return {
    daily,
    walkInRevenue,
    rxRevenue,
    totalRevenue,
    transactionCount,
    paymentBreakdown,
    error: null,
  };
}
