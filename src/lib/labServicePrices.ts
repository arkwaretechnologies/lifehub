import type { SupabaseClient } from "@supabase/supabase-js";
import { clinicDateYmd } from "@/lib/queueTicketDate";
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

/** Admin/server: load active service prices for many tests. */
export async function fetchLabServicePricesMapAdmin(
  db: SupabaseClient,
  labTestIds: string[],
): Promise<{ pricesByTestId: Map<string, number>; error: string | null }> {
  const ids = [...new Set(labTestIds.map((x) => x.trim()).filter(Boolean))];
  if (ids.length === 0) return { pricesByTestId: new Map(), error: null };

  const res = await db
    .from(LAB_SERVICE_PRICES_TABLE)
    .select("lab_test_id, price, is_active")
    .in("lab_test_id", ids);

  if (res.error) return { pricesByTestId: new Map(), error: res.error.message };

  const m = new Map<string, number>();
  for (const r of (res.data ?? []) as LabServicePriceRow[]) {
    if (!isActiveRow(r.is_active)) continue;
    const n = typeof r.price === "number" ? r.price : Number(String(r.price ?? ""));
    if (Number.isFinite(n)) m.set(r.lab_test_id, n);
  }
  return { pricesByTestId: m, error: null };
}

export function applyServicePricesToCatalogItems<T extends { id: string; price?: string | number | null }>(
  tests: T[],
  pricesByTestId: ReadonlyMap<string, number>,
): T[] {
  return tests.map((t) => {
    const svc = pricesByTestId.get(t.id);
    if (svc == null) return t;
    return { ...t, price: svc };
  });
}

export function parseLabTestPriceInput(
  raw: number | string | null | undefined,
): { ok: true; value: number | null } | { ok: false; error: string } {
  if (raw === null || raw === undefined || raw === ("" as unknown)) {
    return { ok: true, value: null };
  }
  const p = typeof raw === "number" ? raw : Number(String(raw).trim());
  if (!Number.isFinite(p) || p < 0) {
    return { ok: false, error: "Price must be a valid number ≥ 0." };
  }
  return { ok: true, value: p };
}

/** Upsert the single `lab_service_prices` row for a test (unique on `lab_test_id`). */
export async function upsertLabServicePriceForTest(
  db: SupabaseClient,
  labTestId: string,
  price: number,
): Promise<{ error: string | null }> {
  const id = labTestId.trim();
  if (!id) return { error: "Invalid lab test id." };

  const { error } = await db.from(LAB_SERVICE_PRICES_TABLE).upsert(
    {
      lab_test_id: id,
      price,
      is_active: true,
      effective_date: clinicDateYmd(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "lab_test_id" },
  );

  return { error: error?.message ?? null };
}

/** Remove service price row when settings clears price. */
export async function deleteLabServicePriceForTest(
  db: SupabaseClient,
  labTestId: string,
): Promise<{ error: string | null }> {
  const id = labTestId.trim();
  if (!id) return { error: "Invalid lab test id." };

  const { error } = await db.from(LAB_SERVICE_PRICES_TABLE).delete().eq("lab_test_id", id);
  return { error: error?.message ?? null };
}

/** Persist settings price to `lab_service_prices` (not `lab_tests.price`). */
export async function syncLabTestServicePrice(
  db: SupabaseClient,
  labTestId: string,
  price: number | null,
): Promise<{ error: string | null }> {
  if (price == null) return deleteLabServicePriceForTest(db, labTestId);
  return upsertLabServicePriceForTest(db, labTestId, price);
}

