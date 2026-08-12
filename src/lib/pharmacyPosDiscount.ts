/** Cart discount rules for pharmacy POS (Philippines statutory + common retail presets). */

export type PosDiscountKind =
  | "none"
  | "sc"
  | "pwd"
  | "employee"
  | "promo"
  | "percent"
  | "fixed"
  | "db";

export type PosDiscountSelection = {
  kind: PosDiscountKind;
  label: string;
  typeCode: string | null;
  percent?: number;
  fixedAmount?: number;
  dbTypeId?: number;
};

export type PosCartLineForDiscount = {
  qty: number;
  product: {
    unit_price: number;
    vat_exempt?: boolean | null;
    vat_rate?: number | null;
  };
};

export const POS_DISCOUNT_NONE: PosDiscountSelection = {
  kind: "none",
  label: "None",
  typeCode: null,
};

/** Built-in presets shown in the discount modal (PH law + typical POS). */
export const POS_BUILTIN_DISCOUNT_PRESETS: Array<
  PosDiscountSelection & { description: string }
> = [
  {
    kind: "sc",
    label: "Senior Citizen",
    typeCode: "SC",
    description: "20% off selling price",
  },
  {
    kind: "pwd",
    label: "PWD",
    typeCode: "PWD",
    description: "20% off selling price",
  },
  {
    kind: "employee",
    label: "Employee (10%)",
    typeCode: "EMPLOYEE",
    percent: 10,
    description: "Staff discount on selling price",
  },
  {
    kind: "promo",
    label: "Promo (5%)",
    typeCode: "PROMO_5",
    percent: 5,
    description: "Short-term promotional discount",
  },
  {
    kind: "promo",
    label: "Promo (10%)",
    typeCode: "PROMO_10",
    percent: 10,
    description: "Short-term promotional discount",
  },
  {
    kind: "promo",
    label: "Promo (15%)",
    typeCode: "PROMO_15",
    percent: 15,
    description: "Short-term promotional discount",
  },
];

const SC_PWD_DISCOUNT_PCT = 20;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function pctNum(v: number | string | null | undefined): number {
  const n = typeof v === "number" ? v : Number(String(v ?? ""));
  return Number.isFinite(n) ? n : 0;
}

export function defaultVatPctForProduct(row: PosCartLineForDiscount["product"]): number {
  if (row.vat_exempt) return 0;
  return row.vat_rate != null ? Number(row.vat_rate) : 12;
}

/** VAT-inclusive shelf price → VAT portion. */
export function vatPortionFromInclusive(gross: number, vatPct: number): number {
  if (vatPct <= 0 || gross <= 0) return 0;
  return gross - gross / (1 + vatPct / 100);
}

/**
 * SC / PWD: flat 20% off the VAT-inclusive selling price (gross).
 * Payable = gross × 0.80; discount = gross − payable.
 */
export function scPwdLineDiscountAmount(lineGross: number, _vatPct?: number): number {
  if (lineGross <= 0) return 0;
  return round2(lineGross * (SC_PWD_DISCOUNT_PCT / 100));
}

export function isStatutoryScPwdCode(code: string | null | undefined): "sc" | "pwd" | null {
  if (!code) return null;
  const c = code.trim().toUpperCase();
  if (c === "SC" || c.includes("SENIOR")) return "sc";
  if (c === "PWD" || c.includes("PWD")) return "pwd";
  return null;
}

export function selectionFromDbType(row: {
  id: number;
  code: string;
  name: string;
  discount_pct: number | string | null;
}): PosDiscountSelection {
  const statutory = isStatutoryScPwdCode(row.code) ?? isStatutoryScPwdCode(row.name);
  if (statutory === "sc") {
    return { kind: "sc", label: row.name || "Senior Citizen", typeCode: row.code || "SC", dbTypeId: row.id };
  }
  if (statutory === "pwd") {
    return { kind: "pwd", label: row.name || "PWD", typeCode: row.code || "PWD", dbTypeId: row.id };
  }
  const pct = pctNum(row.discount_pct);
  return {
    kind: "db",
    label: row.name,
    typeCode: row.code || `DB_${row.id}`,
    percent: pct,
    dbTypeId: row.id,
  };
}

export function discountSelectionsEqual(a: PosDiscountSelection, b: PosDiscountSelection): boolean {
  return (
    a.kind === b.kind &&
    a.typeCode === b.typeCode &&
    (a.percent ?? 0) === (b.percent ?? 0) &&
    (a.fixedAmount ?? 0) === (b.fixedAmount ?? 0) &&
    (a.dbTypeId ?? 0) === (b.dbTypeId ?? 0)
  );
}

export function computeDiscountAmount(
  cart: PosCartLineForDiscount[],
  gross: number,
  discount: PosDiscountSelection,
): number {
  if (discount.kind === "none" || gross <= 0) return 0;

  if (discount.kind === "sc" || discount.kind === "pwd") {
    let sum = 0;
    for (const line of cart) {
      const lineGross = line.qty * line.product.unit_price;
      sum += scPwdLineDiscountAmount(lineGross, defaultVatPctForProduct(line.product));
    }
    return round2(sum);
  }

  if (discount.kind === "fixed") {
    const amt = Math.max(0, discount.fixedAmount ?? 0);
    return round2(Math.min(amt, gross));
  }

  const pct =
    discount.kind === "employee" || discount.kind === "promo" || discount.kind === "percent" || discount.kind === "db"
      ? Math.max(0, Math.min(100, discount.percent ?? 0))
      : 0;

  if (pct <= 0) return 0;
  return round2(gross * (pct / 100));
}

export function computePosCartTotals(
  cart: PosCartLineForDiscount[],
  discount: PosDiscountSelection,
): {
  gross: number;
  discountApplied: number;
  vat: number;
  subtotal: number;
  total: number;
} {
  let gross = 0;
  let vat = 0;
  for (const line of cart) {
    const lineGross = line.qty * line.product.unit_price;
    gross += lineGross;
    vat += vatPortionFromInclusive(lineGross, defaultVatPctForProduct(line.product));
  }
  gross = round2(gross);
  vat = round2(vat);

  const discountApplied = round2(Math.min(computeDiscountAmount(cart, gross, discount), gross));
  const subtotal = round2(Math.max(0, gross - discountApplied));
  const vatAdjusted = gross > 0 ? round2((subtotal / gross) * vat) : 0;

  return {
    gross,
    discountApplied,
    vat: vatAdjusted,
    subtotal,
    total: subtotal,
  };
}

export function formatPosDiscountButtonLabel(discount: PosDiscountSelection, amount: number): string {
  if (discount.kind === "none" || amount <= 0) return "Discount";
  return `${discount.label} · −₱${amount.toFixed(2)}`;
}
