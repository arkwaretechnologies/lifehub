import { authenticatedFetch } from "@/lib/authenticatedFetch";
import type { CacheInvalidationScope } from "@/lib/cacheInvalidationTypes";
import { invalidateLabCatalogCache, LAB_CATALOG_INVALIDATED_EVENT } from "@/lib/labCatalogCache";

/** Fire-and-forget cache invalidation from the browser (also clears local lab catalog cache). */
export function invalidateCachesClient(scopes: CacheInvalidationScope[] = ["report"]): void {
  if (typeof window === "undefined") return;

  if (scopes.includes("lab-catalog")) {
    invalidateLabCatalogCache();
  }

  void authenticatedFetch("/api/cache/invalidate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scopes }),
  }).catch(() => {
    // best-effort
  });
}

export { LAB_CATALOG_INVALIDATED_EVENT };
