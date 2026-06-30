import {
  fetchActiveLabPackagesWithTests,
  labPackageHasMembers,
  type LabPackageWithTests,
} from "@/lib/labPackages";
import { fetchLabCatalogGrouped, type LabCatalogSection } from "@/lib/labTests";

const TTL_MS = 5 * 60 * 1000;

type LabCatalogCacheEntry = {
  sections: LabCatalogSection[];
  packages: LabPackageWithTests[];
  fetchedAt: number;
};

let catalogCache: LabCatalogCacheEntry | null = null;

export const LAB_CATALOG_INVALIDATED_EVENT = "lifehub:lab-catalog-invalidated";

export function invalidateLabCatalogCache(): void {
  catalogCache = null;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(LAB_CATALOG_INVALIDATED_EVENT));
  }
}

export type CachedLabCatalogResult = {
  sections: LabCatalogSection[];
  packages: LabPackageWithTests[];
  catalogError: string | null;
  packagesError: string | null;
  fromCache: boolean;
};

/** Session cache for grouped catalog + active packages (rarely changes during a shift). */
export async function getCachedLabCatalogAndPackages(): Promise<CachedLabCatalogResult> {
  if (catalogCache && Date.now() - catalogCache.fetchedAt < TTL_MS) {
    return {
      sections: catalogCache.sections,
      packages: catalogCache.packages,
      catalogError: null,
      packagesError: null,
      fromCache: true,
    };
  }

  const [cat, pkgRes] = await Promise.all([fetchLabCatalogGrouped(), fetchActiveLabPackagesWithTests()]);

  const sections = cat.error ? [] : cat.sections;
  const packages = pkgRes.error ? [] : pkgRes.packages.filter((p) => labPackageHasMembers(p));

  if (!cat.error && !pkgRes.error) {
    catalogCache = { sections, packages, fetchedAt: Date.now() };
  }

  return {
    sections,
    packages,
    catalogError: cat.error,
    packagesError: pkgRes.error,
    fromCache: false,
  };
}
