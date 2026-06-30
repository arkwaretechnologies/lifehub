import "server-only";

import { getRedisBackendKind } from "@/lib/redis/config";
import { getTcpRedis, resetTcpRedis } from "@/lib/redis/client";
import { getUpstashRedis } from "@/lib/redis/upstashAdapter";

export type RedisHealthResult = {
  ok: boolean;
  backend: "tcp" | "upstash" | "none";
  latencyMs?: number;
  error?: string;
};

async function pingTcpRedis(): Promise<string> {
  const client = getTcpRedis();
  if (!client) {
    throw new Error("TCP client unavailable");
  }
  if (client.status === "wait") {
    await client.connect();
  }
  return client.ping();
}

/** Ping the active Redis backend and measure round-trip latency. */
export async function checkRedisHealth(): Promise<RedisHealthResult> {
  const backend = getRedisBackendKind();

  if (backend === "none") {
    return {
      ok: false,
      backend: "none",
      error: "Redis not configured",
    };
  }

  const start = Date.now();

  try {
    if (backend === "tcp") {
      let pong: string;
      try {
        pong = await pingTcpRedis();
      } catch (firstErr) {
        resetTcpRedis();
        try {
          pong = await pingTcpRedis();
        } catch {
          throw firstErr;
        }
      }
      if (pong !== "PONG") {
        return {
          ok: false,
          backend: "tcp",
          latencyMs: Date.now() - start,
          error: `Unexpected PING response: ${String(pong)}`,
        };
      }
      return {
        ok: true,
        backend: "tcp",
        latencyMs: Date.now() - start,
      };
    }

    const client = getUpstashRedis();
    if (!client) {
      return {
        ok: false,
        backend: "upstash",
        error: "Upstash client unavailable",
      };
    }
    const pong = await client.ping();
    if (pong !== "PONG") {
      return {
        ok: false,
        backend: "upstash",
        latencyMs: Date.now() - start,
        error: `Unexpected PING response: ${String(pong)}`,
      };
    }
    return {
      ok: true,
      backend: "upstash",
      latencyMs: Date.now() - start,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      backend,
      latencyMs: Date.now() - start,
      error: message,
    };
  }
}
