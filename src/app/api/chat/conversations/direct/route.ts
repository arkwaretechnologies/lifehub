import { NextResponse } from "next/server";
import { getOrCreateDirectConversation } from "@/lib/chatServer";
import { resolveChatApiSession } from "@/lib/chatApiSession";

export async function POST(req: Request) {
  const resolved = await resolveChatApiSession(req);
  if (!resolved.ok) return resolved.response;

  const { db, session } = resolved.ctx;

  let body: { otherUserId?: number };
  try {
    body = (await req.json()) as { otherUserId?: number };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const otherUserId = Number(body.otherUserId);
  if (!Number.isFinite(otherUserId) || otherUserId <= 0) {
    return NextResponse.json({ error: "otherUserId is required." }, { status: 400 });
  }

  const { conversation, error } = await getOrCreateDirectConversation(db, session.userId, otherUserId);
  if (error || !conversation) {
    return NextResponse.json({ error: error ?? "Failed to open conversation." }, { status: 400 });
  }

  return NextResponse.json({ conversation });
}
