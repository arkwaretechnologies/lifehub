import { NextResponse } from "next/server";
import { invalidateCaches, type CacheInvalidationScope } from "@/lib/cacheInvalidation";
import { getBearerSessionUserId } from "@/lib/requireSession";

function parseScopes(raw: unknown): CacheInvalidationScope[] {
  if (!Array.isArray(raw)) return ["report"];
  const allowed = new Set<CacheInvalidationScope>(["report", "lab-catalog"]);
  const scopes = raw
    .map((s) => String(s).trim())
    .filter((s): s is CacheInvalidationScope => allowed.has(s as CacheInvalidationScope));
  return scopes.length > 0 ? scopes : ["report"];
}

export async function POST(req: Request) {
  const sessionUserId = await getBearerSessionUserId(req);
  if (sessionUserId == null) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { scopes?: unknown };
  const scopes = parseScopes(body.scopes);

  try {
    await invalidateCaches(scopes);
    return NextResponse.json({ ok: true, scopes });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Cache invalidation failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
