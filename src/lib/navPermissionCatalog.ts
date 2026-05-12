/**
 * Assignable sidebar destinations for `public.role_pages.page_key`.
 * Only leaf keys are stored in the DB; parent rows are UI-only (bulk select).
 */

export type NavLeaf = {
  label: string;
  /** Stored in `role_pages.page_key` (varchar 80). */
  pageKey: string;
  href: string;
};

export type PermissionModule =
  | {
      kind: "leaf";
      id: string;
      sectionHeading: string;
      label: string;
      pageKey: string;
      href: string;
    }
  | {
      kind: "group";
      id: string;
      sectionHeading: string;
      label: string;
      children: NavLeaf[];
    };

/** Mirrors `Sidebar` structure; order matches nav. */
export const PERMISSION_MODULES: PermissionModule[] = [
  {
    kind: "leaf",
    id: "dashboard",
    sectionHeading: "OVERVIEW",
    label: "Dashboard",
    pageKey: "dashboard",
    href: "/dashboard",
  },
  {
    kind: "group",
    id: "patient-care",
    sectionHeading: "OVERVIEW",
    label: "Patient care",
    children: [
      { label: "Patients", pageKey: "patient", href: "/patient" },
      { label: "Appointments", pageKey: "appointments", href: "/appointments" },
    ],
  },
  {
    kind: "leaf",
    id: "reception",
    sectionHeading: "OPERATIONS",
    label: "Reception",
    pageKey: "reception",
    href: "/reception",
  },
  {
    kind: "leaf",
    id: "consultation",
    sectionHeading: "OPERATIONS",
    label: "Consultation",
    pageKey: "consultation",
    href: "/consultation",
  },
  {
    kind: "group",
    id: "laboratory",
    sectionHeading: "OPERATIONS",
    label: "Laboratory",
    children: [
      { label: "Lab Appointments", pageKey: "laboratory", href: "/laboratory" },
      { label: "Lab Results", pageKey: "laboratory/results", href: "/laboratory/results" },
    ],
  },
  {
    kind: "group",
    id: "pharmacy",
    sectionHeading: "OPERATIONS",
    label: "Pharmacy",
    children: [
      { label: "Overview", pageKey: "pharmacy", href: "/pharmacy" },
      { label: "POS", pageKey: "pharmacy/pos", href: "/pharmacy/pos" },
      { label: "Stocks", pageKey: "pharmacy/stocks", href: "/pharmacy" },
      { label: "Product management", pageKey: "pharmacy/products", href: "/pharmacy" },
      { label: "Suppliers", pageKey: "pharmacy/suppliers", href: "/pharmacy" },
    ],
  },
  {
    kind: "leaf",
    id: "cashier",
    sectionHeading: "OPERATIONS",
    label: "Cashier",
    pageKey: "cashier",
    href: "/cashier",
  },
  {
    kind: "leaf",
    id: "reports",
    sectionHeading: "MANAGEMENT",
    label: "Reports",
    pageKey: "reports",
    href: "/reports",
  },
  {
    kind: "leaf",
    id: "branches",
    sectionHeading: "MANAGEMENT",
    label: "Branches",
    pageKey: "branches",
    href: "/branches",
  },
  {
    kind: "group",
    id: "user-management",
    sectionHeading: "MANAGEMENT",
    label: "User management",
    children: [
      { label: "Users", pageKey: "user-management/users", href: "/user-management/users" },
      { label: "Roles", pageKey: "user-management/roles", href: "/user-management/roles" },
    ],
  },
  {
    kind: "leaf",
    id: "settings",
    sectionHeading: "MANAGEMENT",
    label: "Settings",
    pageKey: "settings",
    href: "/settings",
  },
];

export function leafKeysForModule(m: PermissionModule): string[] {
  if (m.kind === "leaf") return [m.pageKey];
  return m.children.map((c) => c.pageKey);
}

const _all = new Set<string>();
for (const m of PERMISSION_MODULES) {
  for (const k of leafKeysForModule(m)) _all.add(k);
}
export const ALLOWED_PAGE_KEYS: ReadonlySet<string> = _all;

/** Granular pharmacy capabilities (assignable in Roles → Menu access). */
export const PHARMACY_CAPABILITY_KEYS = [
  "pharmacy/pos",
  "pharmacy/stocks",
  "pharmacy/products",
  "pharmacy/suppliers",
] as const;

export type PharmacyCapabilityKey = (typeof PHARMACY_CAPABILITY_KEYS)[number];

/** Shown when a nested action requires a capability the role does not have. */
export const ACTION_PERMISSION_DENIED_MESSAGE = "You do not have permission to that.";

/**
 * Pre–split roles stored only `pharmacy` (no `pharmacy/pos` etc.). Those still get the whole module.
 * Once any capability key exists, `pharmacy` means **Overview** only — it must not unlock every action.
 */
export function hasLegacyPharmacyFullModuleAccess(
  pageKeys: ReadonlySet<string> | Iterable<string>,
): boolean {
  const s = pageKeys instanceof Set ? pageKeys : new Set(pageKeys);
  if (!s.has("pharmacy")) return false;
  for (const k of PHARMACY_CAPABILITY_KEYS) {
    if (s.has(k)) return false;
  }
  return true;
}

export function hasPharmacyCapability(
  pageKeys: ReadonlySet<string> | Iterable<string>,
  feature: PharmacyCapabilityKey,
): boolean {
  const s = pageKeys instanceof Set ? pageKeys : new Set(pageKeys);
  if (hasLegacyPharmacyFullModuleAccess(s)) return true;
  return s.has(feature);
}

/** `/pharmacy` hub: Overview (`pharmacy`), any capability, or legacy single-key pharmacy. */
export function canAccessPharmacyHub(pageKeys: ReadonlySet<string> | Iterable<string>): boolean {
  const s = pageKeys instanceof Set ? pageKeys : new Set(pageKeys);
  if (hasLegacyPharmacyFullModuleAccess(s)) return true;
  if (s.has("pharmacy")) return true;
  for (const k of PHARMACY_CAPABILITY_KEYS) {
    if (s.has(k)) return true;
  }
  return false;
}

/**
 * Route guard for dashboard / POS shells. When RBAC is off, callers should skip checks.
 */
export function userMayAccessPath(pathname: string, pageKeys: readonly string[]): boolean {
  const p = pathname === "/" ? "/dashboard" : pathname;
  const keys = new Set(pageKeys);

  if (p === "/pharmacy") {
    return canAccessPharmacyHub(keys);
  }
  if (p.startsWith("/pharmacy/pos")) {
    return hasPharmacyCapability(keys, "pharmacy/pos");
  }
  if (p.startsWith("/pharmacy/")) {
    return false;
  }

  const key = pageKeyForPath(pathname);
  if (key == null) return true;
  return keys.has(key);
}

export function isAllowedPageKey(key: string): boolean {
  return ALLOWED_PAGE_KEYS.has(key);
}

export function pageKeyForPath(pathname: string): string | null {
  const p = pathname === "/" ? "/dashboard" : pathname;
  if (p.startsWith("/pharmacy/pos")) return "pharmacy/pos";
  if (p === "/pharmacy") return null;
  for (const m of PERMISSION_MODULES) {
    if (m.kind === "leaf" && m.href === p) return m.pageKey;
    if (m.kind === "group") {
      const hit = m.children.find((c) => c.href === p);
      if (hit) return hit.pageKey;
    }
  }
  return null;
}

/** First sidebar href the user is allowed to open (catalog order). */
export function firstAllowedHref(pageKeys: string[]): string | null {
  const allowed = new Set(pageKeys);
  for (const m of PERMISSION_MODULES) {
    if (m.kind === "leaf" && allowed.has(m.pageKey)) return m.href;
    if (m.kind === "group") {
      for (const c of m.children) {
        if (allowed.has(c.pageKey)) return c.href;
      }
    }
  }
  return null;
}
