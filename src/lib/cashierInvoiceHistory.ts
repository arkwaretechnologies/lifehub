import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";
import { LAB_SALES_TABLE, LAB_SALE_ITEMS_TABLE, LAB_SALE_STATUS_REFUNDED } from "@/lib/cashierPayments";
import {
  PHYSICIAN_FEE_SALES_TABLE,
  PHYSICIAN_FEE_SALE_ITEMS_TABLE,
  PHYSICIAN_FEE_STATUS_PAID,
} from "@/lib/physicianFeeSales";
import { LAB_TESTS_TABLE } from "@/lib/labTests";
import { IMAGING_CATALOG_TABLE } from "@/lib/imagingCatalog";
import { PHYSICIAN_SERVICES_TABLE } from "@/lib/physicianServices";
import { PAYMENT_METHODS_TABLE } from "@/lib/paymentMethods";

const PATIENTS_TABLE = "patients" as const;

function num(v: unknown): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : Number(String(v));
  return Number.isFinite(n) ? n : 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** OR numbers look like `YYYYMMDD-####` with optional suffix `-L2`, `-I1`, `-2`, `-A1`, `-R`. */
export function baseOrOf(orNumber: string): string {
  const parts = String(orNumber ?? "").trim().split("-");
  if (parts.length >= 2) return `${parts[0]}-${parts[1]}`;
  return String(orNumber ?? "").trim();
}

function dateCompact(dateYmd: string): string {
  return String(dateYmd ?? "").trim().replace(/-/g, "");
}

function isRefundedStatus(status: string | null | undefined): boolean {
  return String(status ?? "").trim().toLowerCase() === LAB_SALE_STATUS_REFUNDED.toLowerCase();
}

type LabSaleHeaderRow = {
  id: string;
  or_number: string | null;
  sale_date: string | null;
  sale_time: string | null;
  total_amount: number | string | null;
  subtotal: number | string | null;
  discount_amount: number | string | null;
  amount_tendered: number | string | null;
  change_amount: number | string | null;
  payment_method_id: number | null;
  patient_id: number | null;
  lab_request_id: string | null;
  imaging_request_id: string | null;
  status: string | null;
};

type PhysicianSaleHeaderRow = {
  id: string;
  or_number: string | null;
  total_amount: number | string | null;
  subtotal: number | string | null;
  discount_amount: number | string | null;
  amount_tendered: number | string | null;
  change_amount: number | string | null;
  payment_method_id: number | null;
  patient_id: number | null;
  encounter_id: string | null;
  created_at: string | null;
  status: string | null;
};

const LAB_SALE_HEADER_SELECT =
  "id, or_number, sale_date, sale_time, total_amount, subtotal, discount_amount, amount_tendered, change_amount, payment_method_id, patient_id, lab_request_id, imaging_request_id, status";
const PHYSICIAN_SALE_HEADER_SELECT =
  "id, or_number, total_amount, subtotal, discount_amount, amount_tendered, change_amount, payment_method_id, patient_id, encounter_id, created_at, status";

export type CashierInvoiceSummary = {
  baseOr: string;
  saleDate: string | null;
  saleTime: string | null;
  patientId: number | null;
  patientName: string | null;
  totalAmount: number;
  paymentMethodLabel: string | null;
  status: string;
};

async function resolvePaymentMethodNames(
  db: SupabaseClient,
  ids: number[],
): Promise<Map<number, string>> {
  const uniq = [...new Set(ids.filter((n) => Number.isFinite(n) && n > 0))];
  const byId = new Map<number, string>();
  if (uniq.length === 0) return byId;
  const { data } = await db.from(PAYMENT_METHODS_TABLE).select("id, name").in("id", uniq);
  for (const r of (data ?? []) as Array<{ id: number; name: string | null }>) {
    byId.set(r.id, (r.name ?? "").trim());
  }
  return byId;
}

async function resolvePatientNames(
  db: SupabaseClient,
  ids: number[],
): Promise<Map<number, string>> {
  const uniq = [...new Set(ids.filter((n) => Number.isFinite(n) && n > 0))];
  const byId = new Map<number, string>();
  if (uniq.length === 0) return byId;
  const { data } = await db.from(PATIENTS_TABLE).select("id, name").in("id", uniq);
  for (const r of (data ?? []) as Array<{ id: number; name: string | null }>) {
    byId.set(r.id, (r.name ?? "").trim());
  }
  return byId;
}

/** Group lab + physician sale headers into one summary per base OR. */
async function summarizeHeaders(
  db: SupabaseClient,
  labRows: LabSaleHeaderRow[],
  physRows: PhysicianSaleHeaderRow[],
): Promise<CashierInvoiceSummary[]> {
  type Acc = {
    baseOr: string;
    saleDate: string | null;
    saleTime: string | null;
    patientId: number | null;
    total: number;
    paymentMethodId: number | null;
    hasRefund: boolean;
  };
  const byBase = new Map<string, Acc>();

  const ensure = (baseOr: string): Acc => {
    let a = byBase.get(baseOr);
    if (!a) {
      a = {
        baseOr,
        saleDate: null,
        saleTime: null,
        patientId: null,
        total: 0,
        paymentMethodId: null,
        hasRefund: false,
      };
      byBase.set(baseOr, a);
    }
    return a;
  };

  for (const r of labRows) {
    const base = baseOrOf(r.or_number ?? "");
    if (!base) continue;
    const a = ensure(base);
    if (isRefundedStatus(r.status)) {
      a.hasRefund = true;
      a.total = round2(a.total - num(r.total_amount));
    } else {
      a.total = round2(a.total + num(r.total_amount));
    }
    if (a.saleDate == null && r.sale_date) a.saleDate = r.sale_date;
    if (a.saleTime == null && r.sale_time) a.saleTime = r.sale_time;
    if (a.patientId == null && r.patient_id != null) a.patientId = r.patient_id;
    if (a.paymentMethodId == null && r.payment_method_id != null) a.paymentMethodId = r.payment_method_id;
  }

  for (const r of physRows) {
    const base = baseOrOf(r.or_number ?? "");
    if (!base) continue;
    const a = ensure(base);
    a.total = round2(a.total + num(r.total_amount));
    if (a.saleDate == null && r.created_at) a.saleDate = r.created_at.slice(0, 10);
    if (a.saleTime == null && r.created_at && r.created_at.length >= 19) {
      a.saleTime = r.created_at.slice(11, 19);
    }
    if (a.patientId == null && r.patient_id != null) a.patientId = r.patient_id;
    if (a.paymentMethodId == null && r.payment_method_id != null) a.paymentMethodId = r.payment_method_id;
  }

  const accs = [...byBase.values()];
  const methodNames = await resolvePaymentMethodNames(
    db,
    accs.map((a) => a.paymentMethodId ?? 0),
  );
  const patientNames = await resolvePatientNames(
    db,
    accs.map((a) => a.patientId ?? 0),
  );

  const summaries: CashierInvoiceSummary[] = accs.map((a) => ({
    baseOr: a.baseOr,
    saleDate: a.saleDate,
    saleTime: a.saleTime,
    patientId: a.patientId,
    patientName: a.patientId != null ? patientNames.get(a.patientId) ?? null : null,
    totalAmount: a.total,
    paymentMethodLabel:
      a.paymentMethodId != null ? methodNames.get(a.paymentMethodId) ?? `Method #${a.paymentMethodId}` : null,
    status: a.hasRefund ? "Paid (with refund)" : "Paid",
  }));

  summaries.sort((x, y) => {
    const t = (y.saleTime ?? "").localeCompare(x.saleTime ?? "");
    if (t !== 0) return t;
    return y.baseOr.localeCompare(x.baseOr);
  });
  return summaries;
}

/** All invoices (grouped by base OR) for a clinic date (YYYY-MM-DD). */
export async function listCashierInvoicesForDate(
  dateYmd: string,
  db: SupabaseClient = supabase,
): Promise<{ invoices: CashierInvoiceSummary[]; error: string | null }> {
  const d = (dateYmd ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return { invoices: [], error: "Invalid date." };
  const prefix = `${dateCompact(d)}-`;

  const [labRes, physRes] = await Promise.all([
    db.from(LAB_SALES_TABLE).select(LAB_SALE_HEADER_SELECT).like("or_number", `${prefix}%`).limit(2000),
    db.from(PHYSICIAN_FEE_SALES_TABLE).select(PHYSICIAN_SALE_HEADER_SELECT).like("or_number", `${prefix}%`).limit(2000),
  ]);
  if (labRes.error) return { invoices: [], error: labRes.error.message };
  if (physRes.error) return { invoices: [], error: physRes.error.message };

  const invoices = await summarizeHeaders(
    db,
    (labRes.data ?? []) as LabSaleHeaderRow[],
    (physRes.data ?? []) as PhysicianSaleHeaderRow[],
  );
  return { invoices, error: null };
}

/** Search invoices by OR number fragment or patient name across all dates. */
export async function searchCashierInvoicesByOrOrPatient(
  query: string,
  db: SupabaseClient = supabase,
): Promise<{ invoices: CashierInvoiceSummary[]; error: string | null }> {
  const q = (query ?? "").trim().replace(/%/g, "").replace(/_/g, "");
  if (!q) return { invoices: [], error: null };

  const patRes = await db.from(PATIENTS_TABLE).select("id").ilike("name", `%${q}%`).limit(50);
  if (patRes.error) return { invoices: [], error: patRes.error.message };
  const patientIds = ((patRes.data ?? []) as Array<{ id: number }>).map((r) => r.id);

  const labByOr = db
    .from(LAB_SALES_TABLE)
    .select(LAB_SALE_HEADER_SELECT)
    .ilike("or_number", `%${q}%`)
    .limit(200);
  const physByOr = db
    .from(PHYSICIAN_FEE_SALES_TABLE)
    .select(PHYSICIAN_SALE_HEADER_SELECT)
    .ilike("or_number", `%${q}%`)
    .limit(200);

  const labByPatient =
    patientIds.length > 0
      ? db.from(LAB_SALES_TABLE).select(LAB_SALE_HEADER_SELECT).in("patient_id", patientIds).limit(200)
      : Promise.resolve({ data: [], error: null } as { data: LabSaleHeaderRow[]; error: null });
  const physByPatient =
    patientIds.length > 0
      ? db
          .from(PHYSICIAN_FEE_SALES_TABLE)
          .select(PHYSICIAN_SALE_HEADER_SELECT)
          .in("patient_id", patientIds)
          .not("or_number", "is", null)
          .limit(200)
      : Promise.resolve({ data: [], error: null } as { data: PhysicianSaleHeaderRow[]; error: null });

  const [labOrRes, physOrRes, labPatRes, physPatRes] = await Promise.all([
    labByOr,
    physByOr,
    labByPatient,
    physByPatient,
  ]);
  for (const r of [labOrRes, physOrRes, labPatRes, physPatRes]) {
    if (r.error) return { invoices: [], error: r.error.message };
  }

  const labMap = new Map<string, LabSaleHeaderRow>();
  for (const r of [...((labOrRes.data ?? []) as LabSaleHeaderRow[]), ...((labPatRes.data ?? []) as LabSaleHeaderRow[])]) {
    labMap.set(r.id, r);
  }
  const physMap = new Map<string, PhysicianSaleHeaderRow>();
  for (const r of [
    ...((physOrRes.data ?? []) as PhysicianSaleHeaderRow[]),
    ...((physPatRes.data ?? []) as PhysicianSaleHeaderRow[]),
  ]) {
    physMap.set(r.id, r);
  }

  const invoices = await summarizeHeaders(db, [...labMap.values()], [...physMap.values()]);
  return { invoices, error: null };
}

export type CashierInvoiceReprintData = {
  baseOr: string;
  saleDate: string | null;
  saleTime: string | null;
  patientName: string | null;
  patientAddress: string | null;
  transId: string | null;
  paymentMethodLabel: string | null;
  paymentLines: Array<{ label: string; amount: number }>;
  subtotal: number;
  discountAmount: number;
  totalDue: number;
  amountTendered: number | null;
  changeAmount: number | null;
};

/** Reconstruct an itemized receipt for reprint from all rows sharing a base OR. */
export async function fetchCashierInvoiceForReprint(
  baseOr: string,
  db: SupabaseClient = supabase,
): Promise<{ data: CashierInvoiceReprintData | null; error: string | null }> {
  const base = baseOrOf(baseOr);
  if (!base) return { data: null, error: "Missing OR number." };

  const orFilter = `or_number.eq.${base},or_number.like.${base}-%`;

  const [labRes, physRes] = await Promise.all([
    db.from(LAB_SALES_TABLE).select(LAB_SALE_HEADER_SELECT).or(orFilter),
    db.from(PHYSICIAN_FEE_SALES_TABLE).select(PHYSICIAN_SALE_HEADER_SELECT).or(orFilter),
  ]);
  if (labRes.error) return { data: null, error: labRes.error.message };
  if (physRes.error) return { data: null, error: physRes.error.message };

  const labRows = ((labRes.data ?? []) as LabSaleHeaderRow[]).filter((r) => !isRefundedStatus(r.status));
  const physRows = ((physRes.data ?? []) as PhysicianSaleHeaderRow[]).filter(
    (r) => String(r.status ?? "").trim().toLowerCase() === PHYSICIAN_FEE_STATUS_PAID.toLowerCase(),
  );

  if (labRows.length === 0 && physRows.length === 0) {
    return { data: null, error: "Invoice not found." };
  }

  const paymentLines: Array<{ label: string; amount: number }> = [];

  // Lab / imaging line items.
  const labSaleIds = labRows.map((r) => r.id);
  if (labSaleIds.length > 0) {
    const { data: itemData, error: itemErr } = await db
      .from(LAB_SALE_ITEMS_TABLE)
      .select("lab_sale_id, lab_test_id, imaging_catalog_id, quantity, unit_price, discount")
      .in("lab_sale_id", labSaleIds);
    if (itemErr) return { data: null, error: itemErr.message };
    const items = (itemData ?? []) as Array<{
      lab_sale_id: string;
      lab_test_id: string | null;
      imaging_catalog_id: string | null;
      quantity: number | string;
      unit_price: number | string;
      discount: number | string;
    }>;

    const labTestIds = [...new Set(items.map((i) => i.lab_test_id).filter((x): x is string => Boolean(x)))];
    const imagingIds = [...new Set(items.map((i) => i.imaging_catalog_id).filter((x): x is string => Boolean(x)))];
    const labNames = new Map<string, string>();
    const imgNames = new Map<string, string>();
    if (labTestIds.length > 0) {
      const { data } = await db.from(LAB_TESTS_TABLE).select("id, name").in("id", labTestIds);
      for (const r of (data ?? []) as Array<{ id: string; name: string | null }>) {
        labNames.set(r.id, (r.name ?? "").trim());
      }
    }
    if (imagingIds.length > 0) {
      const { data } = await db.from(IMAGING_CATALOG_TABLE).select("id, name").in("id", imagingIds);
      for (const r of (data ?? []) as Array<{ id: string; name: string | null }>) {
        imgNames.set(r.id, (r.name ?? "").trim());
      }
    }

    for (const it of items) {
      const amount = round2(num(it.quantity) * num(it.unit_price) - num(it.discount));
      if (it.lab_test_id) {
        const name = labNames.get(it.lab_test_id) || "Laboratory test";
        paymentLines.push({ label: `${name} (Laboratory)`, amount });
      } else if (it.imaging_catalog_id) {
        const name = imgNames.get(it.imaging_catalog_id) || "Imaging study";
        paymentLines.push({ label: `${name} (Imaging)`, amount });
      }
    }
  }

  // Physician fee line items.
  const physSaleIds = physRows.map((r) => r.id);
  if (physSaleIds.length > 0) {
    const { data: itemData, error: itemErr } = await db
      .from(PHYSICIAN_FEE_SALE_ITEMS_TABLE)
      .select("physician_fee_sale_id, physician_service_id, quantity, unit_fee, discount")
      .in("physician_fee_sale_id", physSaleIds);
    if (itemErr) return { data: null, error: itemErr.message };
    const items = (itemData ?? []) as Array<{
      physician_fee_sale_id: string;
      physician_service_id: number;
      quantity: number | string;
      unit_fee: number | string;
      discount: number | string;
    }>;
    const svcIds = [...new Set(items.map((i) => i.physician_service_id).filter((n) => Number.isFinite(n)))];
    const svcNames = new Map<number, string>();
    if (svcIds.length > 0) {
      const { data } = await db.from(PHYSICIAN_SERVICES_TABLE).select("id, name").in("id", svcIds);
      for (const r of (data ?? []) as Array<{ id: number; name: string | null }>) {
        svcNames.set(r.id, (r.name ?? "").trim());
      }
    }
    if (items.length > 0) {
      for (const it of items) {
        const amount = round2(num(it.quantity) * num(it.unit_fee) - num(it.discount));
        const name = svcNames.get(it.physician_service_id) || "Consultation charge";
        paymentLines.push({ label: name, amount });
      }
    } else {
      // Fallback: no itemized fee lines stored, use the sale total.
      const total = physRows.reduce((s, r) => round2(s + num(r.total_amount)), 0);
      if (total > 0) paymentLines.push({ label: "Consultation charges", amount: total });
    }
  }

  const subtotal = round2(
    labRows.reduce((s, r) => s + num(r.subtotal), 0) + physRows.reduce((s, r) => s + num(r.subtotal), 0),
  );
  const discountAmount = round2(
    labRows.reduce((s, r) => s + num(r.discount_amount), 0) +
      physRows.reduce((s, r) => s + num(r.discount_amount), 0),
  );
  const totalDue = round2(
    labRows.reduce((s, r) => s + num(r.total_amount), 0) + physRows.reduce((s, r) => s + num(r.total_amount), 0),
  );

  // Cash tendered/change is recorded on the first collecting row.
  let amountTendered: number | null = null;
  let changeAmount: number | null = null;
  for (const r of [...labRows, ...physRows]) {
    if (r.amount_tendered != null) {
      amountTendered = num(r.amount_tendered);
      changeAmount = r.change_amount != null ? num(r.change_amount) : null;
      break;
    }
  }

  const firstLab = labRows[0] ?? null;
  const firstPhys = physRows[0] ?? null;
  const paymentMethodId = firstLab?.payment_method_id ?? firstPhys?.payment_method_id ?? null;
  const methodNames = paymentMethodId != null ? await resolvePaymentMethodNames(db, [paymentMethodId]) : new Map();
  const paymentMethodLabel =
    paymentMethodId != null ? methodNames.get(paymentMethodId) ?? `Method #${paymentMethodId}` : null;

  const patientId = firstLab?.patient_id ?? firstPhys?.patient_id ?? null;
  let patientName: string | null = null;
  let patientAddress: string | null = null;
  if (patientId != null) {
    const { data } = await db.from(PATIENTS_TABLE).select("name, address").eq("id", patientId).maybeSingle();
    const row = data as { name: string | null; address: string | null } | null;
    patientName = (row?.name ?? "").trim() || null;
    patientAddress = (row?.address ?? "").trim() || null;
  }

  const transId =
    firstPhys?.encounter_id ?? firstLab?.lab_request_id ?? firstLab?.imaging_request_id ?? null;

  const saleDate = firstLab?.sale_date ?? (firstPhys?.created_at ? firstPhys.created_at.slice(0, 10) : null);
  const saleTime =
    firstLab?.sale_time ??
    (firstPhys?.created_at && firstPhys.created_at.length >= 19 ? firstPhys.created_at.slice(11, 19) : null);

  return {
    data: {
      baseOr: base,
      saleDate,
      saleTime,
      patientName,
      patientAddress,
      transId,
      paymentMethodLabel,
      paymentLines,
      subtotal,
      discountAmount,
      totalDue,
      amountTendered,
      changeAmount,
    },
    error: null,
  };
}
