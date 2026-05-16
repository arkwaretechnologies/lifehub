/** Browser session blob stored under this key (must match AuthProvider). */
export const LIFEHUB_SESSION_STORAGE_KEY = "lifehub_session";

export function readLifehubSessionToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(LIFEHUB_SESSION_STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as { token?: unknown };
    return typeof data.token === "string" && data.token.length > 0 ? data.token : null;
  } catch {
    return null;
  }
}
