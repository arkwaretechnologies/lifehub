import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  assertConversationAccess,
  fetchChatSessionUser,
  type ChatSessionUser,
} from "@/lib/chatServer";
import { getBearerSessionUserId } from "@/lib/requireSession";
import { supabaseAdminClient } from "@/lib/supabaseAdminClient";

export type ChatApiContext = {
  db: SupabaseClient;
  session: ChatSessionUser;
};

export async function resolveChatApiSession(
  req: Request,
): Promise<
  | { ok: true; ctx: ChatApiContext }
  | { ok: false; response: NextResponse }
> {
  const db = supabaseAdminClient();
  if (!db) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." },
        { status: 500 },
      ),
    };
  }

  const userId = await getBearerSessionUserId(req);
  if (userId == null) {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized." }, { status: 401 }) };
  }

  const session = await fetchChatSessionUser(db, userId);
  if (!session) {
    return { ok: false, response: NextResponse.json({ error: "User not found." }, { status: 404 }) };
  }

  return { ok: true, ctx: { db, session } };
}

export async function resolveChatConversationAccess(
  req: Request,
  conversationId: string,
): Promise<
  | { ok: true; ctx: ChatApiContext; conversation: Awaited<ReturnType<typeof assertConversationAccess>>["conversation"] }
  | { ok: false; response: NextResponse }
> {
  const base = await resolveChatApiSession(req);
  if (!base.ok) return base;

  const { conversation, error } = await assertConversationAccess(
    base.ctx.db,
    conversationId,
    base.ctx.session,
  );

  if (error || !conversation) {
    return {
      ok: false,
      response: NextResponse.json({ error: error ?? "Conversation not found." }, { status: 403 }),
    };
  }

  return { ok: true, ctx: base.ctx, conversation };
}
