/**
 * Resolves the app user's numeric PK from session objects returned by `authenticate_user`
 * and persisted in `lifehub_session`. Same shape as ChargesServicesPanel / TopBar expectations.
 */
export function numericIdFromUnknown(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  const n = typeof raw === "number" ? raw : Number(String(raw).trim());
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
}

/** Keys seen on `authenticate_user` / RPC rows (PostgREST may omit `user_id` on `profile`). */
const USER_ID_ROW_KEYS = ["user_id", "userId", "id"] as const;

export function numericUserIdFromRecord(row: Record<string, unknown> | null | undefined): number | null {
  if (!row) return null;
  for (const key of USER_ID_ROW_KEYS) {
    if (!(key in row)) continue;
    const n = numericIdFromUnknown(row[key]);
    if (n != null) return n;
  }
  return null;
}

export function numericSessionUserId(
  profile: { user_id?: unknown; userId?: unknown; id?: unknown } | null | undefined,
  user: { user_id?: unknown; id?: unknown; userId?: unknown } | null | undefined,
): number | null {
  return (
    numericUserIdFromRecord(user as Record<string, unknown>) ??
    numericUserIdFromRecord(profile as Record<string, unknown>)
  );
}
