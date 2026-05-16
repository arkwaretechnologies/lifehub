import { NextResponse } from "next/server";
import { verifySessionToken } from "@/lib/authJwt";

export function bearerTokenFromRequest(req: Request): string | null {
  const h = req.headers.get("authorization") ?? req.headers.get("Authorization");
  if (!h) return null;
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m?.[1]?.trim() ?? null;
}

export async function getBearerSessionUserId(req: Request): Promise<number | null> {
  const token = bearerTokenFromRequest(req);
  if (!token) return null;
  try {
    const { userId } = await verifySessionToken(token);
    return userId;
  } catch {
    return null;
  }
}
