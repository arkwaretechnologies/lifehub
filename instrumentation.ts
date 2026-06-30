export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { registerRedisShutdown } = await import("@/lib/redis/shutdown");
    registerRedisShutdown();
  }
}
