import { SignJWT, jwtVerify } from "jose";

const ALG = "HS256" as const;
const ISS = "lifehub-session";

/** Hard cap: session lifetime cannot exceed 7 days. */
export const SESSION_MAX_DAYS_CAP = 7;

function readJwtSecretKey(): Uint8Array {
  const raw = process.env.JWT_SECRET?.trim() ?? "";
  if (raw.length < 32) {
    throw new Error("JWT_SECRET must be set and at least 32 characters for HS256.");
  }
  return new TextEncoder().encode(raw);
}

/** Effective session duration in days: env SESSION_MAX_DAYS parsed, clamped to (0, 7]. Defaults to 7. */
export function effectiveSessionDays(): number {
  const raw = process.env.SESSION_MAX_DAYS?.trim();
  const n = raw === undefined || raw === "" ? SESSION_MAX_DAYS_CAP : Number.parseFloat(raw);
  if (!Number.isFinite(n) || n <= 0) return SESSION_MAX_DAYS_CAP;
  return Math.min(n, SESSION_MAX_DAYS_CAP);
}

export async function signSessionToken(userId: number): Promise<string> {
  const key = readJwtSecretKey();
  const days = effectiveSessionDays();
  const expSec = Math.floor(Date.now() / 1000 + days * 86_400);
  return new SignJWT({})
    .setProtectedHeader({ alg: ALG })
    .setIssuer(ISS)
    .setAudience("lifehub-browser")
    .setSubject(String(Math.trunc(userId)))
    .setIssuedAt()
    .setExpirationTime(expSec)
    .sign(key);
}

export async function verifySessionToken(token: string): Promise<{ userId: number }> {
  const key = readJwtSecretKey();
  const { payload } = await jwtVerify(token, key, {
    algorithms: [ALG],
    issuer: ISS,
    audience: "lifehub-browser",
  });
  const sub = payload.sub?.trim() ?? "";
  const id = Number.parseInt(sub, 10);
  if (!Number.isFinite(id) || id <= 0) {
    throw new Error("Invalid token subject.");
  }
  return { userId: Math.trunc(id) };
}
