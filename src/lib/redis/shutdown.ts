import "server-only";

import { closeTcpRedis } from "@/lib/redis/client";

let shutdownRegistered = false;
let closing = false;

/** Close TCP Redis connections (Upstash REST needs no close). Idempotent. */
export async function closeRedisConnections(): Promise<void> {
  if (closing) return;
  closing = true;
  try {
    await closeTcpRedis();
  } finally {
    closing = false;
  }
}

/** Register process signal handlers for graceful Redis shutdown (`next start`). */
export function registerRedisShutdown(): void {
  if (shutdownRegistered) return;
  shutdownRegistered = true;

  const onShutdown = (signal: string) => {
    void (async () => {
      console.info(`[redis] received ${signal}, closing connections…`);
      await closeRedisConnections();
    })();
  };

  process.on("SIGTERM", () => onShutdown("SIGTERM"));
  process.on("SIGINT", () => onShutdown("SIGINT"));

  process.on("beforeExit", () => {
    void closeRedisConnections();
  });
}
