/**
 * Resolves the app user's numeric PK from session objects returned by `authenticate_user`
 * and persisted in `lifehub_session`. Same shape as ChargesServicesPanel / TopBar expectations.
 */
export function numericIdFromUnknown(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  const n = typeof raw === "number" ? raw : Number(String(raw).trim());
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function numericSessionUserId(
  profile: { user_id?: unknown } | null | undefined,
  user: { user_id?: unknown; id?: unknown } | null | undefined,
): number | null {
  return numericIdFromUnknown(profile?.user_id ?? user?.user_id ?? user?.id);
}
