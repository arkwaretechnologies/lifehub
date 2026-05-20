import { numericUserIdFromRecord } from "@/lib/sessionUserId";

function tryParseJson(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const t = value.trim();
  if (!t.startsWith("{") && !t.startsWith("[")) return value;
  try {
    return JSON.parse(t) as unknown;
  } catch {
    return value;
  }
}

/** `authenticate_user` may return `{ user, profile }`, a flat profile row, JSON strings, or a single-element array. */
export function normalizeAuthenticateUserPayload(data: unknown): {
  user: unknown;
  profile: Record<string, unknown> | null;
} | null {
  const root = Array.isArray(data) ? data[0] : data;
  const unwrapped = tryParseJson(root);
  if (unwrapped == null || typeof unwrapped !== "object") return null;
  const o = unwrapped as Record<string, unknown>;

  let user: unknown = o.user;
  let profileRaw: unknown = o.profile;

  user = tryParseJson(user);
  profileRaw = tryParseJson(profileRaw);

  if (profileRaw != null && typeof profileRaw === "object" && !Array.isArray(profileRaw)) {
    const profile = profileRaw as Record<string, unknown>;
    const userRec =
      user != null && typeof user === "object" && !Array.isArray(user)
        ? (user as Record<string, unknown>)
        : null;
    const uid = numericUserIdFromRecord(userRec) ?? numericUserIdFromRecord(profile);
    if (uid != null) {
      return { user: user ?? { user_id: uid }, profile };
    }
  }

  const flatUid = numericUserIdFromRecord(o);
  if (flatUid != null) {
    return { user: { user_id: flatUid }, profile: o };
  }

  if (user != null && typeof user === "object" && !Array.isArray(user)) {
    const uo = user as Record<string, unknown>;
    const uid = numericUserIdFromRecord(uo);
    if (uid != null) {
      return { user, profile: (profileRaw as Record<string, unknown>) ?? null };
    }
  }

  return null;
}
