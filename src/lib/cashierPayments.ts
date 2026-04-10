import { supabase } from "@/lib/supabaseClient";
import { PHYSICIAN_FEE_SALES_TABLE, PHYSICIAN_FEE_STATUS_PAID } from "@/lib/physicianFeeSales";

export const LAB_SALES_TABLE = "lab_sales" as const;
export const LAB_SALE_ITEMS_TABLE = "lab_sale_items" as const;

export const LAB_SALE_STATUS_COMPLETED = "Completed" as const;

function roundMoney2(n: number): number {
  return Math.round(n * 100) / 100;
}

function localDateYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function localDateCompactYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

/** `time without time zone` for Postgres */
function localTimeHms(d: Date): string {
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  const s = String(d.getSeconds()).padStart(2, "0");
  return `${h}:${min}:${s}`;
}

function parseOrSeq(orNumber: string, expectedPrefix: string): number | null {
  const s = (orNumber ?? "").trim();
  if (!s.startsWith(expectedPrefix)) return null;
  const rest = s.slice(expectedPrefix.length); // e.g. "0001" or "0001-L2"
  const seqStr = rest.split("-")[0] ?? "";
  if (!/^\d+$/.test(seqStr)) return null;
  const n = Number.parseInt(seqStr, 10);
  return Number.isFinite(n) ? n : null;
}

async function fetchMaxOrSeqForPrefix(table: string, prefix: string): Promise<{ max: number; error: string | null }> {
  const { data, error } = await supabase
    .from(table)
    .select("or_number")
    .not("or_number", "is", null)
    .like("or_number", `${prefix}%`)
    .order("or_number", { ascending: false })
    .limit(1);

  if (error) return { max: 0, error: error.message };
  const row = (data ?? [])[0] as { or_number?: string } | undefined;
  const parsed = row?.or_number ? parseOrSeq(String(row.or_number), prefix) : null;
  return { max: parsed ?? 0, error: null };
}

/**
 * Shared OR generator across BOTH `physician_fee_sales` + `lab_sales`.
 * Format: `YYYYMMDD-####` and resets daily because we only scan today's prefix.
 */
export async function generateNextDailyOrNumber(): Promise<{ orNumber: string | null; error: string | null }> {
  const now = new Date();
  const prefix = `${localDateCompactYmd(now)}-`;

  const [physRes, labRes] = await Promise.all([
    fetchMaxOrSeqForPrefix(PHYSICIAN_FEE_SALES_TABLE, prefix),
    fetchMaxOrSeqForPrefix(LAB_SALES_TABLE, prefix),
  ]);
  if (physRes.error) return { orNumber: null, error: physRes.error };
  if (labRes.error) return { orNumber: null, error: labRes.error };

  const next = Math.max(physRes.max, labRes.max) + 1;
  const orNumber = `${prefix}${String(next).padStart(4, "0")}`;
  return { orNumber, error: null };
}

export type LabSaleItemInsertRow = {
  lab_test_id: string;
  quantity: number;
  unit_price: number;
  discount: number;
  notes: string | null;
};

export async function markPhysicianFeeSalesPaid(args: {
  sales: Array<{ id: string; subtotal: number; discountAmount: number }>;
  orNumber: string;
  paymentMethodId: number;
  amountTendered: number | null;
  changeAmount: number | null;
  discountTypeId: number | null;
}): Promise<{ error: string | null }> {
  const sales = args.sales
    .map((s) => ({
      id: String(s.id).trim(),
      subtotal: Number(s.subtotal),
      discountAmount: Number(s.discountAmount),
    }))
    .filter((s) => s.id && Number.isFinite(s.subtotal) && Number.isFinite(s.discountAmount));
  if (sales.length === 0) return { error: null };

  const baseOr = args.orNumber.trim();
  if (!baseOr) return { error: "Missing OR number." };

  // `physician_fee_sales.or_number` is unique; if multiple sale rows are being paid,
  // ensure each gets a unique OR value while keeping it human-readable.
  const updates = sales.map((s, idx) => {
    const discountAmount = Math.min(Math.max(0, roundMoney2(s.discountAmount)), roundMoney2(s.subtotal));
    const totalAmount = roundMoney2(roundMoney2(s.subtotal) - discountAmount);
    return {
      id: s.id,
    or_number: idx === 0 ? baseOr : `${baseOr}-${idx + 1}`,
    status: PHYSICIAN_FEE_STATUS_PAID,
    payment_method_id: args.paymentMethodId,
    amount_tendered: args.amountTendered,
    change_amount: args.changeAmount,
    discount_type_id: discountAmount > 0 ? args.discountTypeId : null,
    discount_amount: discountAmount,
    total_amount: totalAmount,
    updated_at: new Date().toISOString(),
    };
  });

  const res = await supabase.from(PHYSICIAN_FEE_SALES_TABLE).upsert(updates, { onConflict: "id" });
  if (res.error) return { error: res.error.message };
  return { error: null };
}

export async function createLabSaleWithItems(args: {
  labRequestId: string;
  patientId: number | null;
  /** Must be unique per row (`lab_sales.or_number` is unique). Caller supplies e.g. base OR or `BASE-L1`. */
  orNumber: string;
  paymentMethodId: number;
  amountTendered: number | null;
  changeAmount: number | null;
  discountTypeId: number | null;
  discountAmount: number;
  items: LabSaleItemInsertRow[];
  notes?: string | null;
}): Promise<{ labSaleId: string | null; error: string | null }> {
  const labRequestId = args.labRequestId.trim();
  if (!labRequestId) return { labSaleId: null, error: "Missing lab request id." };
  if (args.items.length === 0) return { labSaleId: null, error: "No lab tests found for this order." };

  const orTrimmed = args.orNumber.trim();
  if (!orTrimmed) return { labSaleId: null, error: "Missing OR number." };

  let subtotal = 0;
  for (const it of args.items) {
    const line = roundMoney2(it.quantity * it.unit_price - it.discount);
    if (line < 0) {
      return { labSaleId: null, error: "Invalid line total (discount exceeds line amount)." };
    }
    subtotal = roundMoney2(subtotal + line);
  }

  const discountAmount = Math.min(Math.max(0, roundMoney2(args.discountAmount)), roundMoney2(subtotal));
  const totalAmount = roundMoney2(roundMoney2(subtotal) - discountAmount);

  const now = new Date();
  const salePayload = {
    patient_id: args.patientId,
    lab_request_id: labRequestId,
    or_number: orTrimmed,
    sale_date: localDateYmd(now),
    sale_time: localTimeHms(now),
    subtotal,
    discount_type_id: discountAmount > 0 ? args.discountTypeId : (null as number | null),
    discount_amount: discountAmount,
    vat_exempt: false,
    vat_amount: 0,
    total_amount: totalAmount,
    amount_tendered: args.amountTendered,
    change_amount: args.changeAmount,
    payment_method_id: args.paymentMethodId,
    hmo_insurance_name: null as string | null,
    philhealth_claim_no: null as string | null,
    status: LAB_SALE_STATUS_COMPLETED,
    void_reason: null as string | null,
    served_by: null as string | null,
    notes: args.notes ?? null,
    updated_at: now.toISOString(),
  };

  const ins = await supabase.from(LAB_SALES_TABLE).insert(salePayload).select("id").single();
  if (ins.error) return { labSaleId: null, error: ins.error.message };
  const labSaleId = (ins.data as { id?: string } | null)?.id ?? null;
  if (!labSaleId) return { labSaleId: null, error: "Could not create lab sale." };

  const itemRows = args.items.map((it) => ({
    lab_sale_id: labSaleId,
    lab_test_id: it.lab_test_id,
    quantity: it.quantity,
    unit_price: it.unit_price,
    discount: it.discount,
    notes: it.notes,
  }));

  const itemsRes = await supabase.from(LAB_SALE_ITEMS_TABLE).insert(itemRows);
  if (itemsRes.error) {
    // Best-effort rollback to prevent a header with no items.
    await supabase.from(LAB_SALES_TABLE).delete().eq("id", labSaleId);
    return { labSaleId: null, error: itemsRes.error.message };
  }

  return { labSaleId, error: null };
}

