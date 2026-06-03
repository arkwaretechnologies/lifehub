/**
 * Consultation medication picker — re-exports from {@link pharmacyPosDb} (single Supabase surface).
 */
export type { ProductCatalogRow } from "@/lib/pharmacyPosDb";
export {
  PRODUCTS_TABLE,
  fetchActiveProductsPreview,
  fetchProductsByIds,
  fetchActiveProductsCatalog,
  formatProductOptionLabel,
  formatMedicationProductOptionDescription,
  searchActiveProducts,
} from "@/lib/pharmacyPosDb";
