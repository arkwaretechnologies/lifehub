import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { signSessionToken } from "@/lib/authJwt";
import { allowRateLimit, clientIpFromRequest } from "@/lib/loginRateLimit";
import { getMenuAccessForRoleName } from "@/lib/roleMenuAccessServer";
import { numericSessionUserId, numericUserIdFromRecord } from "@/lib/sessionUserId";

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

type LoginBody = {
  identifier?: string;
  input_password?: string;
};

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

/**
 * `authenticate_user` may return `{ user, profile }`, a flat profile row, JSON strings, or a single-element array.
 */
function normalizeAuthenticateUserPayload(data: unknown): {
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
    const userRec = user != null && typeof user === "object" && !Array.isArray(user) ? (user as Record<string, unknown>) : null;
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

/** Prefetch / probes often hit GET; POST is required for login. */
export function GET() {
  return NextResponse.json(
    { error: "Use POST with JSON body: { identifier, input_password }." },
    { status: 405, headers: { Allow: "POST, OPTIONS" } },
  );
}

export async function POST(req: Request) {
  let body: LoginBody;
  try {
    body = (await req.json()) as LoginBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const identifier = typeof body.identifier === "string" ? body.identifier.trim() : "";
  const input_password = typeof body.input_password === "string" ? body.input_password : "";
  if (!identifier || !input_password) {
    return NextResponse.json({ error: "identifier and input_password are required." }, { status: 400 });
  }

  const ip = clientIpFromRequest(req);
  const idLower = identifier.toLowerCase();
  if (
    !allowRateLimit(`login:ip:${ip}`, 80) ||
    !allowRateLimit(`login:user:${ip}:${idLower}`, 25)
  ) {
    return NextResponse.json({ error: "Too many login attempts. Try again later." }, { status: 429 });
  }

  const admin = adminClient();
  if (!admin) {
    return NextResponse.json({ error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." }, { status: 500 });
  }

  const { data, error: rpcError } = await admin.rpc("authenticate_user", {
    identifier,
    input_password,
  });

  if (rpcError) {
    return NextResponse.json({ error: rpcError.message || "Authentication failed." }, { status: 401 });
  }
  if (data == null) {
    return NextResponse.json({ error: "Invalid username or password." }, { status: 401 });
  }

  const normalized = normalizeAuthenticateUserPayload(data);
  if (!normalized?.profile) {
    return NextResponse.json(
      {
        error: "Invalid authentication response.",
        hint:
          process.env.NODE_ENV === "development"
            ? "Expected authenticate_user to return { user, profile }, a profile row with user_id, or equivalent JSON."
            : undefined,
      },
      { status: 500 },
    );
  }

  const profile = normalized.profile as Record<string, unknown>;
  const userObj = normalized.user as Record<string, unknown> | undefined;
  const userId = numericSessionUserId(profile, userObj);
  if (userId == null) {
    return NextResponse.json({ error: "Invalid authentication response (missing user_id)." }, { status: 500 });
  }

  /** App code expects `profile.user_id` (see UserProfile / pharmacy / consultation). */
  const profileOut = { ...profile, user_id: userId } as { user_id: number; role?: string | null };

  const row = {
    user: (normalized.user as { user_id?: unknown }) ?? { user_id: userId },
    profile: profileOut,
  };

  let signed: string;
  try {
    signed = await signSessionToken(userId);
  } catch (e) {
    let msg = e instanceof Error ? e.message : "JWT signing failed.";
    if (process.env.NODE_ENV === "production" && /jwt_secret/i.test(msg)) {
      msg = "Server configuration error.";
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const role = profileOut.role != null ? String(profileOut.role) : "";
  const menuAccess = role ? await getMenuAccessForRoleName(admin, role) : { rbac: false, pageKeys: [] as string[] };

  const user = row.user ?? { user_id: userId };

  return NextResponse.json({
    token: signed,
    user,
    profile: profileOut as unknown,
    menuAccess,
  });
}
