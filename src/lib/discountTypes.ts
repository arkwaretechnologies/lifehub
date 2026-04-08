import { supabase } from "@/lib/supabaseClient";

export const DISCOUNT_TYPES_TABLE = "discount_types" as const;

export type DiscountTypeRow = {
  id: number;
  code: string;
  name: string;
  discount_pct: number | string | null;
  is_active: boolean | null;
};

function isActiveRow(v: boolean | null | undefined): boolean {
  return v !== false;
}

function pctNum(v: number | string | null | undefined): number {
  const n = typeof v === "number" ? v : Number(String(v ?? ""));
  return Number.isFinite(n) ? n : 0;
}

export async function fetchActiveDiscountTypes(): Promise<{
  discounts: DiscountTypeRow[];
  error: string | null;
}> {
  const res = await supabase
    .from(DISCOUNT_TYPES_TABLE)
    .select("id, code, name, discount_pct, is_active")
    .order("name", { ascending: true });

  if (res.error) return { discounts: [], error: res.error.message };
  const rows = (res.data ?? []) as DiscountTypeRow[];
  const active = rows.filter((r) => isActiveRow(r.is_active));

  // Sort by name, then by pct (stable UI)
  active.sort((a, b) => {
    const n = (a.name ?? "").localeCompare(b.name ?? "", undefined, { sensitivity: "base" });
    if (n !== 0) return n;
    return pctNum(a.discount_pct) - pctNum(b.discount_pct);
  });

  return { discounts: active, error: null };
}

