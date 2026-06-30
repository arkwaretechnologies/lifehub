import "server-only";

/**
 * Unified Redis module (server-only).
 *
 * Backend priority: TCP (ioredis) when REDIS_URL or REDIS_HOST is set,
 * else Upstash REST when UPSTASH_REDIS_REST_* is set, else disabled.
 *
 * @example
 * ```ts
 * import { redisSet, redisGet, redisDel, redisExpire, redisIncr } from "@/lib/redis";
 *
 * await redisSet("session:abc", "token-value", 60);
 * const value = await redisGet("session:abc");
 * await redisDel("session:abc");
 * await redisExpire("session:abc", 120);
 * const views = await redisIncr("page:home:views");
 * ```
 *
 * Do not import this module from Client Components.
 */

export { getRedisConfig, getRedisBackendKind, getRedisUrl, isReportCacheEnabled, reportCacheTtlSeconds } from "@/lib/redis/config";
export type { RedisConfig, RedisBackendKind } from "@/lib/redis/config";

export { getTcpRedis, isTcpRedisConfigured, closeTcpRedis } from "@/lib/redis/client";
export { getUpstashRedis, isUpstashRedisConfigured } from "@/lib/redis/upstashAdapter";

export {
  getRedisBackend,
  redisGet,
  redisSet,
  redisDel,
  redisExpire,
  redisIncr,
  redisGetJson,
  redisSetJson,
} from "@/lib/redis/operations";
export type { RedisBackend } from "@/lib/redis/operations";

export { checkRedisHealth } from "@/lib/redis/health";
export type { RedisHealthResult } from "@/lib/redis/health";

export { closeRedisConnections, registerRedisShutdown } from "@/lib/redis/shutdown";
