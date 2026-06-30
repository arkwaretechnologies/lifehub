import type { RedisOptions } from "ioredis";

export type RedisBackendKind = "tcp" | "upstash" | "none";

export type TcpRedisConfig = {
  kind: "tcp";
  options: RedisOptions;
};

export type UpstashRedisConfig = {
  kind: "upstash";
  url: string;
  token: string;
};

export type NoneRedisConfig = {
  kind: "none";
};

export type RedisConfig = TcpRedisConfig | UpstashRedisConfig | NoneRedisConfig;

function envInt(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function envBool(name: string, fallback = false): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) return fallback;
  return raw === "1" || raw === "true" || raw === "yes";
}

function tcpUsesTls(url?: string): boolean {
  const u = url?.trim() ?? "";
  // `rediss://` always implies TLS; `redis://` is plain TCP unless the host/port pair is TLS-only.
  if (u.startsWith("rediss://")) return true;
  if (u.startsWith("redis://")) return false;
  return envBool("REDIS_TLS", false);
}

/** Redis Cloud and similar hosts need TLS SNI (`servername`) when using `rediss://`. */
export function normalizeRedisConnectionUrl(url: string): string {
  return url.trim();
}

function tlsOptionsForUrl(url: string): { servername: string } | Record<string, never> {
  if (!tcpUsesTls(url)) return {};
  try {
    const normalized = normalizeRedisConnectionUrl(url);
    const hostname = new URL(normalized).hostname.trim();
    if (hostname) return { servername: hostname };
  } catch {
    // fall through
  }
  return {};
}

function sharedTcpOptions(): RedisOptions {
  return {
    lazyConnect: true,
    enableReadyCheck: true,
    maxRetriesPerRequest: envInt("REDIS_MAX_RETRIES_PER_REQUEST", 3),
    connectTimeout: envInt("REDIS_CONNECT_TIMEOUT_MS", 10_000),
    commandTimeout: envInt("REDIS_COMMAND_TIMEOUT_MS", 5_000),
    family: 0,
  };
}

function buildTcpOptionsFromUrl(url: string): RedisOptions {
  const useTls = tcpUsesTls(url);
  return {
    ...sharedTcpOptions(),
    ...(useTls ? { tls: tlsOptionsForUrl(url) } : {}),
  };
}

function buildTcpOptionsFromHost(): RedisOptions {
  const host = process.env.REDIS_HOST?.trim() ?? "";
  const port = envInt("REDIS_PORT", 6379);
  const username = process.env.REDIS_USERNAME?.trim() || undefined;
  const password = process.env.REDIS_PASSWORD?.trim() || undefined;
  const db = envInt("REDIS_DB", 0);
  const useTls = envBool("REDIS_TLS", false);

  return {
    host,
    port,
    username,
    password,
    db,
    ...sharedTcpOptions(),
    ...(useTls ? { tls: host ? { servername: host } : {} } : {}),
  };
}

function parseRedisConfig(): RedisConfig {
  const redisUrl = process.env.REDIS_URL?.trim() ?? "";
  const redisHost = process.env.REDIS_HOST?.trim() ?? "";

  if (redisUrl) {
    return {
      kind: "tcp",
      options: {
        ...buildTcpOptionsFromUrl(redisUrl),
        // ioredis accepts a connection string as the first constructor arg; options merge below.
      },
    };
  }

  if (redisHost) {
    return {
      kind: "tcp",
      options: buildTcpOptionsFromHost(),
    };
  }

  const upstashUrl = process.env.UPSTASH_REDIS_REST_URL?.trim() ?? "";
  const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN?.trim() ?? "";
  if (upstashUrl && upstashToken) {
    return { kind: "upstash", url: upstashUrl, token: upstashToken };
  }

  return { kind: "none" };
}

let cachedConfig: RedisConfig | undefined;

/** Parsed Redis configuration (cached after first read). */
export function getRedisConfig(): RedisConfig {
  if (!cachedConfig) {
    cachedConfig = parseRedisConfig();
  }
  return cachedConfig;
}

/** Connection URL when `REDIS_URL` is set (used by TCP client constructor). */
export function getRedisUrl(): string | null {
  const url = process.env.REDIS_URL?.trim() ?? "";
  if (!url) return null;
  return normalizeRedisConnectionUrl(url);
}

/** Active backend kind derived from env (TCP takes priority over Upstash). */
export function getRedisBackendKind(): RedisBackendKind {
  return getRedisConfig().kind;
}

/** Whether report endpoints should read/write Redis cache (default: on when Redis is configured). */
export function isReportCacheEnabled(): boolean {
  const raw = process.env.REDIS_REPORT_CACHE_ENABLED?.trim().toLowerCase();
  if (!raw) return getRedisBackendKind() !== "none";
  return raw === "1" || raw === "true" || raw === "yes";
}

/** TTL for report cache entries in seconds (default 180). */
export function reportCacheTtlSeconds(): number {
  return Math.max(1, envInt("REDIS_REPORT_CACHE_TTL_SECONDS", 180));
}
