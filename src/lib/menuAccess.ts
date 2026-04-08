export type MenuAccessState = {
  /** When true, sidebar only shows items whose `pageKey` is in `pageKeys`. */
  rbac: boolean;
  pageKeys: string[];
};

export const defaultMenuAccess: MenuAccessState = { rbac: false, pageKeys: [] };

export async function fetchMenuAccessForRole(roleName: string): Promise<MenuAccessState> {
  const trimmed = roleName.trim();
  if (!trimmed) return defaultMenuAccess;
  try {
    const res = await fetch(
      `/api/role-menu-access?roleName=${encodeURIComponent(trimmed)}`,
      { cache: "no-store" },
    );
    const json = (await res.json().catch(() => null)) as
      | { rbac?: boolean; pageKeys?: string[]; error?: string }
      | null;
    if (!res.ok || !json || json.error) {
      return defaultMenuAccess;
    }
    if (json.rbac === true) {
      return { rbac: true, pageKeys: Array.isArray(json.pageKeys) ? json.pageKeys : [] };
    }
    return defaultMenuAccess;
  } catch {
    return defaultMenuAccess;
  }
}
