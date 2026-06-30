import "server-only";

import Redis from "ioredis";
import { getRedisConfig, getRedisUrl } from "@/lib/redis/config";

declare global {
  // eslint-disable-next-line no-var
  var __lifehubRedis: Redis | undefined;
}

const MAX_RECONNECT_ATTEMPTS = 20;

function retryStrategy(times: number): number | null {
  if (times > MAX_RECONNECT_ATTEMPTS) {
    console.error("[redis] max reconnect attempts reached; giving up");
    return null;
  }
  const delayMs = Math.min(times * 100, 2_000);
  return delayMs;
}

function attachClientEventHandlers(client: Redis): void {
  client.on("connect", () => {
    console.info("[redis] connected");
  });
  client.on("ready", () => {
    console.info("[redis] ready");
  });
  client.on("reconnecting", (delayMs: number) => {
    console.warn(`[redis] reconnecting in ${delayMs}ms`);
  });
  client.on("error", (err: Error) => {
    console.error("[redis] connection error:", err.message);
  });
  client.on("close", () => {
    console.warn("[redis] connection closed");
  });
}

function createTcpClient(): Redis {
  const config = getRedisConfig();
  if (config.kind !== "tcp") {
    throw new Error("createTcpClient called without TCP config");
  }

  const url = getRedisUrl();
  const client = url
    ? new Redis(url, { ...config.options, retryStrategy })
    : new Redis({ ...config.options, retryStrategy });

  attachClientEventHandlers(client);
  return client;
}

/**
 * One ioredis instance per Node process (singleton).
 * Redis is single-threaded; do not open a new client per HTTP request.
 */
export function getTcpRedis(): Redis | null {
  const config = getRedisConfig();
  if (config.kind !== "tcp") return null;

  if (!globalThis.__lifehubRedis) {
    globalThis.__lifehubRedis = createTcpClient();
  }
  return globalThis.__lifehubRedis;
}

export function isTcpRedisConfigured(): boolean {
  return getRedisConfig().kind === "tcp";
}

/** Drop a broken singleton so the next call creates a fresh client. */
export function resetTcpRedis(): void {
  const client = globalThis.__lifehubRedis;
  globalThis.__lifehubRedis = undefined;
  if (!client) return;
  try {
    client.disconnect();
  } catch {
    // ignore
  }
}

/** Gracefully close the TCP client (idempotent). */
export async function closeTcpRedis(): Promise<void> {
  const client = globalThis.__lifehubRedis;
  if (!client) return;
  globalThis.__lifehubRedis = undefined;
  try {
    await client.quit();
    console.info("[redis] connection closed gracefully");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn("[redis] error during quit:", message);
    try {
      client.disconnect();
    } catch {
      // ignore
    }
  }
}
