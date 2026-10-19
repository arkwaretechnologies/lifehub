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

/** `null` / `undefined` = inherit cart-wide default; explicit `POS_DISCOUNT_NONE` opts out. */
export type PosCartLineForDiscountWithOverride = PosCartLineForDiscount & {
  lineDiscount?: PosDiscountSelection | null;
};

export const POS_SALE_DISCOUNT_TYPE_MIXED = "MIXED";

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

function lineGross(line: PosCartLineForDiscount): number {
  return round2(line.qty * line.product.unit_price);
}

export function effectiveLineDiscount(
  line: PosCartLineForDiscountWithOverride,
  cartDefault: PosDiscountSelection,
): PosDiscountSelection {
  return line.lineDiscount ?? cartDefault;
}

/** Discount peso amount for one cart line (respects per-line override vs cart default). */
export function computeLineDiscountAmountForCart(
  line: PosCartLineForDiscountWithOverride,
  cartDefault: PosDiscountSelection,
  cart: PosCartLineForDiscountWithOverride[],
): number {
  const g = lineGross(line);
  if (g <= 0) return 0;

  if (line.lineDiscount != null) {
    if (line.lineDiscount.kind === "fixed") {
      return round2(Math.min(Math.max(0, line.lineDiscount.fixedAmount ?? 0), g));
    }
    return round2(Math.min(computeDiscountAmount([line], g, line.lineDiscount), g));
  }

  if (cartDefault.kind === "none") return 0;

  if (cartDefault.kind === "fixed") {
    const inheriting = cart.filter((l) => l.lineDiscount == null);
    const inheritingGross = round2(inheriting.reduce((sum, l) => sum + lineGross(l), 0));
    if (inheritingGross <= 0) return 0;
    const totalFixed = round2(Math.min(Math.max(0, cartDefault.fixedAmount ?? 0), inheritingGross));
    return round2(totalFixed * (g / inheritingGross));
  }

  return round2(Math.min(computeDiscountAmount([line], g, cartDefault), g));
}

export function resolveSaleHeaderDiscountType(
  cart: PosCartLineForDiscountWithOverride[],
  cartDefault: PosDiscountSelection,
): string | null {
  const codes = new Set<string>();
  for (const line of cart) {
    const amt = computeLineDiscountAmountForCart(line, cartDefault, cart);
    if (amt <= 0) continue;
    const eff = effectiveLineDiscount(line, cartDefault);
    const code = (eff.typeCode ?? eff.kind).trim();
    if (code) codes.add(code.toUpperCase());
  }
  if (codes.size === 0) return null;
  if (codes.size === 1) return [...codes][0]!;
  return POS_SALE_DISCOUNT_TYPE_MIXED;
}

export function resolveSaleHeaderDiscountLabel(
  cart: PosCartLineForDiscountWithOverride[],
  cartDefault: PosDiscountSelection,
  discountApplied: number,
): string | null {
  if (discountApplied <= 0) return null;
  const type = resolveSaleHeaderDiscountType(cart, cartDefault);
  if (type === POS_SALE_DISCOUNT_TYPE_MIXED) return "Mixed discounts";
  if (!type) return null;
  for (const line of cart) {
    const eff = effectiveLineDiscount(line, cartDefault);
    if ((eff.typeCode ?? "").toUpperCase() === type || eff.kind.toUpperCase() === type) {
      return eff.label;
    }
  }
  return type;
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
  cart: PosCartLineForDiscountWithOverride[],
  cartDefault: PosDiscountSelection,
): {
  gross: number;
  discountApplied: number;
  vat: number;
  subtotal: number;
  total: number;
} {
  let gross = 0;
  let vat = 0;
  let discountApplied = 0;
  for (const line of cart) {
    const g = lineGross(line);
    gross += g;
    vat += vatPortionFromInclusive(g, defaultVatPctForProduct(line.product));
    discountApplied += computeLineDiscountAmountForCart(line, cartDefault, cart);
  }
  gross = round2(gross);
  vat = round2(vat);
  discountApplied = round2(Math.min(discountApplied, gross));

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
