import { supabase } from "@/lib/supabaseClient";

export const PRODUCTS_TABLE = "products" as const;

const PRODUCT_PICKER_SELECT =
  "id, generic_name, brand_name, strength, unit_of_measure, dosage_form, requires_prescription, is_active" as const;

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

function isActiveRow(v: boolean | null | undefined): boolean {
  return v !== false;
}

export function formatProductOptionLabel(p: ProductCatalogRow): string {
  const base = p.brand_name
    ? `${p.generic_name} (${p.brand_name})`
    : p.generic_name;
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
