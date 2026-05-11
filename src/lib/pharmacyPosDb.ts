/**
 * Single module for Pharmacy POS and consultation Rx bridge Supabase access.
 * Prefer calling functions here instead of scattering `supabase.from` across the app.
 */
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
  "id, generic_name, brand_name, strength, unit_of_measure, dosage_form, requires_prescription, is_active" as const;

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

function isActiveRow(v: boolean | null | undefined): boolean {
  return v !== false;
}

export function formatProductOptionLabel(p: ProductCatalogRow): string {
  const base = p.brand_name ? `${p.generic_name} (${p.brand_name})` : p.generic_name;
  const extra = [p.strength, p.dosage_form].filter(Boolean).join(" · ");
  return extra ? `${base} — ${extra}` : base;
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
export async function getProductStockOnHand(productId: string): Promise<{ qty: number; error: string | null }> {
  const { data, error } = await supabase
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
    .select("total_amount, payment_method, amount_tendered, change_amount")
    .eq("shift_id", shiftId)
    .eq("status", "Completed");
  if (sErr) return { snapshot: null, error: sErr.message };

  let gross = 0;
  let cashSales = 0;
  let nonCashSales = 0;
  let txn = 0;
  const breakdown: Record<string, number> = {};
  const beginning = Number((shiftRow as { beginning_cash: number }).beginning_cash) || 0;

  for (const row of sales ?? []) {
    const r = row as {
      total_amount: number | null;
      payment_method: string | null;
      amount_tendered: number | null;
      change_amount: number | null;
    };
    const total = Number(r.total_amount) || 0;
    gross += total;
    txn += 1;
    const pm = (r.payment_method ?? "UNKNOWN").trim() || "UNKNOWN";
    breakdown[pm] = (breakdown[pm] ?? 0) + total;
    const pmLower = pm.toLowerCase();
    if (pmLower === "cash" || pmLower === "csh") {
      cashSales += total;
    } else {
      nonCashSales += total;
    }
  }

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

export async function validateStockForCheckout(lines: { productId: string; quantity: number }[]): Promise<{
  ok: boolean;
  error: string | null;
}> {
  for (const line of lines) {
    const { qty, error } = await getProductStockOnHand(line.productId);
    if (error) return { ok: false, error };
    if (qty + 1e-9 < line.quantity) {
      return {
        ok: false,
        error: `Insufficient stock for a product (need ${line.quantity}, have ${qty}).`,
      };
    }
  }
  return { ok: true, error: null };
}

export async function completePharmacySale(input: CompletePharmacySaleInput): Promise<{
  saleId: string | null;
  error: string | null;
}> {
  const stockCheck = await validateStockForCheckout(
    input.lines.map((l) => ({ productId: l.productId, quantity: l.quantity })),
  );
  if (!stockCheck.ok) return { saleId: null, error: stockCheck.error };

  const now = new Date();
  const saleDate = now.toISOString().slice(0, 10);
  const saleTime = now.toTimeString().slice(0, 8);

  const { data: saleIns, error: saleErr } = await supabase
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

  const { error: itemsErr } = await supabase.from(PHARMACY_SALE_ITEMS_TABLE).insert(itemRows);
  if (itemsErr) {
    await supabase.from(PHARMACY_SALES_TABLE).delete().eq("id", saleId);
    return { saleId: null, error: itemsErr.message };
  }

  for (const line of input.lines) {
    const stockResult = await decrementStockFefo(line.productId, line.quantity, saleId);
    if (stockResult.error) {
      await supabase.from(PHARMACY_SALE_ITEMS_TABLE).delete().eq("pharmacy_sale_id", saleId);
      await supabase.from(PHARMACY_SALES_TABLE).delete().eq("id", saleId);
      return { saleId: null, error: stockResult.error };
    }
  }

  return { saleId, error: null };
}

async function decrementStockFefo(
  productId: string,
  qtyNeeded: number,
  saleId: string,
): Promise<{ error: string | null }> {
  if (qtyNeeded <= 0) return { error: null };

  const { data: rows, error } = await supabase
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
    const { error: upErr } = await supabase
      .from(STOCK_TABLE)
      .update({ quantity: newQ, updated_at: new Date().toISOString() })
      .eq("id", row.id);
    if (upErr) return { error: upErr.message };

    const { error: movErr } = await supabase.from(STOCK_MOVEMENTS_TABLE).insert({
      product_id: productId,
      quantity: -take,
      movement_type: "DISPENSE",
      stock_id: row.id,
      notes: `Pharmacy sale ${saleId}`,
      reference_type: "pharmacy_sale",
      reference_id: null,
    });
    if (movErr) return { error: movErr.message };

    remaining -= take;
  }

  if (remaining > 0.0001) {
    return { error: `Insufficient stock for product (short by ${remaining}).` };
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
};

export async function fetchPrescriptionCartByEncounter(transId: string): Promise<{
  prescriptionId: string | null;
  patientId: number | null;
  patientName: string | null;
  lines: PrescriptionCartLine[];
  error: string | null;
}> {
  const tid = transId.trim();
  if (!tid) return { prescriptionId: null, patientId: null, patientName: null, lines: [], error: null };

  const { data: presc, error: pErr } = await supabase
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
    const { data: pat } = await supabase.from("patients").select("name").eq("id", patientId).maybeSingle();
    patientName = (pat as { name: string | null } | null)?.name ?? null;
  }

  const { data: items, error: iErr } = await supabase
    .from(PHARMACY_PRESCRIPTION_ITEMS_TABLE)
    .select("id, product_id, generic_name, brand_name, strength, quantity_prescribed, sig")
    .eq("prescription_id", prescriptionId);

  if (iErr) return { prescriptionId, patientId, patientName, lines: [], error: iErr.message };

  const lines: PrescriptionCartLine[] = [];
  for (const raw of items ?? []) {
    const row = raw as {
      id: string;
      product_id: string | null;
      generic_name: string;
      brand_name: string | null;
      strength: string | null;
      quantity_prescribed: number;
      sig: string | null;
    };
    let unit_price: number | null = null;
    if (row.product_id) {
      const { data: pr } = await supabase
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
    });
  }

  return { prescriptionId, patientId, patientName, lines, error: null };
}

export type UpsertRxLineInput = {
  productId: string;
  quantityPrescribed: number;
  sig: string | null;
};

export async function upsertPrescriptionForEncounter(args: {
  transId: string;
  patientId: number;
  physicianUserId: number | null;
  rxLines: UpsertRxLineInput[];
}): Promise<{ prescriptionId: string | null; error: string | null }> {
  const now = new Date().toISOString();
  const today = now.slice(0, 10);
  const rxNumber = `RX-${args.transId.slice(0, 8).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;

  const { data: existing, error: exErr } = await supabase
    .from(PRESCRIPTIONS_TABLE)
    .select("id")
    .eq("encounter_id", args.transId)
    .maybeSingle();
  if (exErr) return { prescriptionId: null, error: exErr.message };

  let prescriptionId: string;
  if (existing) {
    prescriptionId = (existing as { id: string }).id;
    const { error: uErr } = await supabase
      .from(PRESCRIPTIONS_TABLE)
      .update({
        patient_id: args.patientId,
        physician_id: args.physicianUserId,
        prescribed_date: today,
        updated_at: now,
        status: "Active",
      })
      .eq("id", prescriptionId);
    if (uErr) return { prescriptionId: null, error: uErr.message };
  } else {
    const { data: ins, error: iErr } = await supabase
      .from(PRESCRIPTIONS_TABLE)
      .insert({
        encounter_id: args.transId,
        patient_id: args.patientId,
        physician_id: args.physicianUserId,
        prescribed_date: today,
        rx_number: rxNumber,
        status: "Active",
        created_at: now,
        updated_at: now,
      })
      .select("id")
      .single();
    if (iErr) return { prescriptionId: null, error: iErr.message };
    prescriptionId = (ins as { id: string }).id;
  }

  const { error: delErr } = await supabase
    .from(PHARMACY_PRESCRIPTION_ITEMS_TABLE)
    .delete()
    .eq("prescription_id", prescriptionId);
  if (delErr) return { prescriptionId: null, error: delErr.message };

  const productIds = args.rxLines.map((l) => l.productId).filter(Boolean);
  const { data: products, error: prErr } = await supabase
    .from(PRODUCTS_TABLE)
    .select("id, generic_name, brand_name, strength, dosage_form")
    .in("id", productIds);
  if (prErr) return { prescriptionId: null, error: prErr.message };
  const pmap = new Map((products ?? []).map((p) => [(p as { id: string }).id, p as Record<string, unknown>]));

  const itemRows = args.rxLines.map((line) => {
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
  });

  if (itemRows.length > 0) {
    const { error: insErr } = await supabase.from(PHARMACY_PRESCRIPTION_ITEMS_TABLE).insert(itemRows);
    if (insErr) return { prescriptionId: null, error: insErr.message };
  }

  return { prescriptionId, error: null };
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
  drNumber: string;
  drDate: string;
  supplierDr: string;
}): Promise<{ stockId: string | null; error: string | null }> {
  const qty = Number(args.quantity);
  if (!Number.isFinite(qty) || qty <= 0) return { stockId: null, error: "Quantity must be positive." };
  const exp = args.expiryDate.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(exp)) return { stockId: null, error: "Expiry date is required (YYYY-MM-DD)." };
  const drN = args.drNumber.trim();
  const drD = args.drDate.trim().slice(0, 10);
  const sup = args.supplierDr.trim();
  if (!drN) return { stockId: null, error: "DR number is required." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(drD)) return { stockId: null, error: "DR date is required (YYYY-MM-DD)." };
  if (!sup) return { stockId: null, error: "Supplier (on DR) is required." };

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

  const { error: inErr } = await supabase.from(PHARMACY_STOCK_INS_TABLE).insert({
    product_id: args.productId.trim(),
    stock_id: stockId,
    quantity: qty,
    dr_number: drN,
    dr_date: drD,
    supplier_dr: sup,
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

export async function insertProductForPos(row: {
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
}): Promise<{ productId: string | null; error: string | null }> {
  const now = new Date().toISOString();
  const vatExempt = row.vatExempt ?? false;
  const vatRate =
    row.vatRate != null && Number.isFinite(row.vatRate)
      ? row.vatRate
      : vatExempt
        ? 0
        : 12;
  const { data, error } = await supabase
    .from(PRODUCTS_TABLE)
    .insert({
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
      created_at: now,
      updated_at: now,
    })
    .select("id")
    .single();
  if (error) return { productId: null, error: error.message };
  return { productId: (data as { id: string }).id, error: null };
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

export async function generateOrNumber(): Promise<string> {
  return `PH-${Date.now().toString(36).toUpperCase()}`;
}

function formatLocalYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export type PharmacyDailyStat = { date: string; total: number; count: number };

/** Aggregates completed pharmacy sales for dashboard charts (walk-in vs Rx uses prescription_id). */
export async function fetchPharmacyDashboardAnalytics(daysBack = 14): Promise<{
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

  const { data, error } = await supabase
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
