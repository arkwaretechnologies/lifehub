import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifySessionToken } from "@/lib/authJwt";

const SENSITIVE_LOGIN_PARAM_KEYS = new Set(["password", "input_password", "pwd", "pass"]);
const USERNAME_LOGIN_PARAM_KEYS = new Set(["username", "identifier"]);

function loginUrlHadSensitiveParams(url: URL): boolean {
  for (const key of url.searchParams.keys()) {
    if (SENSITIVE_LOGIN_PARAM_KEYS.has(key.toLowerCase())) return true;
  }
  return false;
}

function sanitizeLoginUrl(url: URL): URL {
  const cleaned = new URL(url.toString());
  let hadSensitive = false;

  for (const key of [...cleaned.searchParams.keys()]) {
    if (SENSITIVE_LOGIN_PARAM_KEYS.has(key.toLowerCase())) {
      cleaned.searchParams.delete(key);
      hadSensitive = true;
    }
  }

  if (hadSensitive) {
    for (const key of [...cleaned.searchParams.keys()]) {
      if (USERNAME_LOGIN_PARAM_KEYS.has(key.toLowerCase())) {
        cleaned.searchParams.delete(key);
      }
    }
  }

  return cleaned;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === "/login") {
    if (loginUrlHadSensitiveParams(request.nextUrl)) {
      const cleaned = sanitizeLoginUrl(request.nextUrl);
      return NextResponse.redirect(cleaned, 307);
    }
    return NextResponse.next();
  }

  if (!pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  // Login only — no Bearer required (rate limits applied inside route handler).
  if (pathname === "/api/auth/login") {
    return NextResponse.next();
  }

  const authHeader =
    request.headers.get("authorization") ?? request.headers.get("Authorization") ?? "";
  const m = authHeader.match(/^Bearer\s+(.+)$/i);
  const token = m?.[1]?.trim();
  if (!token) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    await verifySessionToken(token);
  } catch {
    return NextResponse.json({ error: "Invalid or expired session." }, { status: 401 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/:path*", "/login"],
};
