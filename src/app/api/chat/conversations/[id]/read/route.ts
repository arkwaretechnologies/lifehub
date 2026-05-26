import { NextResponse } from "next/server";
import { markConversationRead } from "@/lib/chatServer";
import { resolveChatConversationAccess } from "@/lib/chatApiSession";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, context: RouteContext) {
  const { id } = await context.params;
  const conversationId = String(id ?? "").trim();
  if (!conversationId) {
    return NextResponse.json({ error: "Conversation id is required." }, { status: 400 });
  }

  const resolved = await resolveChatConversationAccess(req, conversationId);
  if (!resolved.ok) return resolved.response;

  const { error } = await markConversationRead(
    resolved.ctx.db,
    conversationId,
    resolved.ctx.session.userId,
  );

  if (error) {
    return NextResponse.json({ error }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
