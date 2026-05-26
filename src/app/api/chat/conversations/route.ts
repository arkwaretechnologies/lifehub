import { NextResponse } from "next/server";
import { listConversationsForUser } from "@/lib/chatServer";
import { resolveChatApiSession } from "@/lib/chatApiSession";

export async function GET(req: Request) {
  const resolved = await resolveChatApiSession(req);
  if (!resolved.ok) return resolved.response;

  const { db, session } = resolved.ctx;

  const { conversations, totalUnread, error } = await listConversationsForUser(db, session);
  if (error) {
    return NextResponse.json({ error }, { status: 500 });
  }

  return NextResponse.json({ conversations, totalUnread });
}
