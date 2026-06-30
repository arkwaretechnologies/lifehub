import "server-only";

import { invalidateEncounterSummaryReportCache } from "@/lib/reportCacheInvalidation";
import { invalidateLabCatalogCache } from "@/lib/labCatalogCache";
import type { CacheInvalidationScope } from "@/lib/cacheInvalidationTypes";

export type { CacheInvalidationScope } from "@/lib/cacheInvalidationTypes";

/** Invalidate encounter-summary Redis cache (server). */
export async function invalidateReportCache(): Promise<void> {
  await invalidateEncounterSummaryReportCache();
}

/** Invalidate in-process lab catalog cache (server or client bundle). */
export function invalidateLabCatalogCacheServer(): void {
  invalidateLabCatalogCache();
}

export async function invalidateCaches(scopes: CacheInvalidationScope[]): Promise<void> {
  const unique = [...new Set(scopes)];
  const tasks: Promise<void>[] = [];
  if (unique.includes("report")) {
    tasks.push(invalidateReportCache());
  }
  if (unique.includes("lab-catalog")) {
    tasks.push(Promise.resolve().then(() => invalidateLabCatalogCacheServer()));
  }
  await Promise.all(tasks);
}

/** After laboratory catalog settings change (tests, packages, categories). */
export async function afterLaboratoryCatalogSettingsMutation(): Promise<void> {
  await invalidateCaches(["lab-catalog"]);
}

/** After visit data that affects encounter-summary report aggregates. */
export async function afterEncounterReportDataMutation(): Promise<void> {
  await invalidateCaches(["report"]);
}
