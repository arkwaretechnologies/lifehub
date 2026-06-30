import "server-only";

import { getRedisBackendKind } from "@/lib/redis/config";
import { getTcpRedis } from "@/lib/redis/client";
import { getUpstashRedis } from "@/lib/redis/upstashAdapter";

export type RedisBackend = "tcp" | "upstash" | "none";

export function getRedisBackend(): RedisBackend {
  return getRedisBackendKind();
}

function logOpError(op: string, key: string, err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[redis] ${op} failed for key "${key}":`, message);
}

/** GET — returns string value or null. */
export async function redisGet(key: string): Promise<string | null> {
  const backend = getRedisBackend();
  if (backend === "none") return null;

  try {
    if (backend === "tcp") {
      const client = getTcpRedis();
      if (!client) return null;
      const value = await client.get(key);
      return value ?? null;
    }
    const client = getUpstashRedis();
    if (!client) return null;
    const value = await client.get<string>(key);
    return value ?? null;
  } catch (err) {
    logOpError("GET", key, err);
    return null;
  }
}

/** SET — optional TTL in seconds. Returns true on success. */
export async function redisSet(
  key: string,
  value: string,
  ttlSeconds?: number,
): Promise<boolean> {
  const backend = getRedisBackend();
  if (backend === "none") return false;

  const ttl =
    ttlSeconds != null && Number.isFinite(ttlSeconds) && ttlSeconds > 0
      ? Math.trunc(ttlSeconds)
      : undefined;

  try {
    if (backend === "tcp") {
      const client = getTcpRedis();
      if (!client) return false;
      if (ttl != null) {
        await client.set(key, value, "EX", ttl);
      } else {
        await client.set(key, value);
      }
      return true;
    }
    const client = getUpstashRedis();
    if (!client) return false;
    if (ttl != null) {
      await client.set(key, value, { ex: ttl });
    } else {
      await client.set(key, value);
    }
    return true;
  } catch (err) {
    logOpError("SET", key, err);
    return false;
  }
}

/** DEL — returns true if at least one key was removed. */
export async function redisDel(key: string): Promise<boolean> {
  const backend = getRedisBackend();
  if (backend === "none") return false;

  try {
    if (backend === "tcp") {
      const client = getTcpRedis();
      if (!client) return false;
      const n = await client.del(key);
      return n > 0;
    }
    const client = getUpstashRedis();
    if (!client) return false;
    const n = await client.del(key);
    return Number(n) > 0;
  } catch (err) {
    logOpError("DEL", key, err);
    return false;
  }
}

/** EXPIRE — set TTL on an existing key. Returns true on success. */
export async function redisExpire(key: string, seconds: number): Promise<boolean> {
  const backend = getRedisBackend();
  if (backend === "none") return false;

  const ttl = Math.max(1, Math.trunc(seconds));

  try {
    if (backend === "tcp") {
      const client = getTcpRedis();
      if (!client) return false;
      const n = await client.expire(key, ttl);
      return n === 1;
    }
    const client = getUpstashRedis();
    if (!client) return false;
    const n = await client.expire(key, ttl);
    return Number(n) === 1;
  } catch (err) {
    logOpError("EXPIRE", key, err);
    return false;
  }
}

/** INCR — returns new value or null on failure. */
export async function redisIncr(key: string): Promise<number | null> {
  const backend = getRedisBackend();
  if (backend === "none") return null;

  try {
    if (backend === "tcp") {
      const client = getTcpRedis();
      if (!client) return null;
      return await client.incr(key);
    }
    const client = getUpstashRedis();
    if (!client) return null;
    const n = await client.incr(key);
    return typeof n === "number" ? n : Number(n);
  } catch (err) {
    logOpError("INCR", key, err);
    return null;
  }
}

/** GET JSON — returns parsed value or null. */
export async function redisGetJson<T>(key: string): Promise<T | null> {
  const backend = getRedisBackend();
  if (backend === "none") return null;

  try {
    if (backend === "tcp") {
      const raw = await redisGet(key);
      if (raw == null) return null;
      return JSON.parse(raw) as T;
    }
    const client = getUpstashRedis();
    if (!client) return null;
    const value = await client.get<T>(key);
    return value ?? null;
  } catch (err) {
    logOpError("GET JSON", key, err);
    return null;
  }
}

/** SET JSON — optional TTL in seconds. */
export async function redisSetJson(
  key: string,
  value: unknown,
  ttlSeconds?: number,
): Promise<boolean> {
  const backend = getRedisBackend();
  if (backend === "none") return false;

  const ttl =
    ttlSeconds != null && Number.isFinite(ttlSeconds) && ttlSeconds > 0
      ? Math.trunc(ttlSeconds)
      : undefined;

  try {
    if (backend === "tcp") {
      const serialized = JSON.stringify(value);
      return redisSet(key, serialized, ttl);
    }
    const client = getUpstashRedis();
    if (!client) return false;
    if (ttl != null) {
      await client.set(key, value, { ex: ttl });
    } else {
      await client.set(key, value);
    }
    return true;
  } catch (err) {
    logOpError("SET JSON", key, err);
    return false;
  }
}
