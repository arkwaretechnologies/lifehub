import { NextResponse } from "next/server";
import { checkRedisHealth } from "@/lib/redis";

export async function GET() {
  const health = await checkRedisHealth();

  if (health.backend === "none") {
    return NextResponse.json(health, { status: 200 });
  }

  if (!health.ok) {
    return NextResponse.json(health, { status: 503 });
  }

  return NextResponse.json(health, { status: 200 });
}
