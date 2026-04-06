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
    kind: "leaf",
    id: "laboratory",
    sectionHeading: "OPERATIONS",
    label: "Laboratory",
    pageKey: "laboratory",
    href: "/laboratory",
  },
  {
    kind: "leaf",
    id: "pharmacy",
    sectionHeading: "OPERATIONS",
    label: "Pharmacy",
    pageKey: "pharmacy",
    href: "/pharmacy",
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

export function isAllowedPageKey(key: string): boolean {
  return ALLOWED_PAGE_KEYS.has(key);
}

export function pageKeyForPath(pathname: string): string | null {
  const p = pathname === "/" ? "/dashboard" : pathname;
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
