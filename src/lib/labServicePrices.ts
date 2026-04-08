import { supabase } from "@/lib/supabaseClient";

export const LAB_SERVICE_PRICES_TABLE = "lab_service_prices" as const;

export type LabServicePriceRow = {
  lab_test_id: string;
  price: number | string;
  is_active: boolean | null;
  effective_date: string;
};

function isActiveRow(v: boolean | null | undefined): boolean {
  return v !== false;
}

export async function fetchActiveLabPricesByTestIds(
  labTestIds: string[],
): Promise<{ pricesByTestId: Map<string, number>; error: string | null }> {
  const ids = [...new Set(labTestIds.map((x) => x.trim()).filter(Boolean))];
  if (ids.length === 0) return { pricesByTestId: new Map(), error: null };

  const res = await supabase
    .from(LAB_SERVICE_PRICES_TABLE)
    .select("lab_test_id, price, is_active, effective_date")
    .in("lab_test_id", ids);

  if (res.error) return { pricesByTestId: new Map(), error: res.error.message };

  const rows = (res.data ?? []) as LabServicePriceRow[];
  const m = new Map<string, number>();
  for (const r of rows) {
    if (!isActiveRow(r.is_active)) continue;
    const n = typeof r.price === "number" ? r.price : Number(String(r.price ?? ""));
    m.set(r.lab_test_id, Number.isFinite(n) ? n : 0);
  }
  return { pricesByTestId: m, error: null };
}

