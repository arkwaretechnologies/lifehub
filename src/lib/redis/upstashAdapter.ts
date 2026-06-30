import { Redis } from "@upstash/redis";
import { getRedisConfig } from "@/lib/redis/config";

declare global {
  // eslint-disable-next-line no-var
  var __lifehubUpstashRedis: Redis | undefined;
}

/** Singleton Upstash REST client (HTTP; no TCP pooling or quit needed). */
export function getUpstashRedis(): Redis | null {
  const config = getRedisConfig();
  if (config.kind !== "upstash") return null;

  if (!globalThis.__lifehubUpstashRedis) {
    globalThis.__lifehubUpstashRedis = new Redis({
      url: config.url,
      token: config.token,
    });
  }
  return globalThis.__lifehubUpstashRedis;
}

export function isUpstashRedisConfigured(): boolean {
  return getRedisConfig().kind === "upstash";
}
