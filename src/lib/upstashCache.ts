import { Redis } from "@upstash/redis";

function redisFromEnv(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim() ?? "";
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim() ?? "";
  if (!url || !token) return null;
  return new Redis({ url, token });
}

export async function readUpstashJson<T>(key: string): Promise<T | null> {
  const redis = redisFromEnv();
  if (!redis) return null;
  try {
    const value = await redis.get<T>(key);
    return value ?? null;
  } catch {
    return null;
  }
}

export async function writeUpstashJson(
  key: string,
  value: unknown,
  ttlSeconds: number,
): Promise<void> {
  const redis = redisFromEnv();
  if (!redis) return;
  try {
    await redis.set(key, value, { ex: Math.max(1, Math.trunc(ttlSeconds)) });
  } catch {
    // best-effort cache write
  }
}
