import { NextResponse } from "next/server";
import { displayNameForUser, listChatUsersInBranch } from "@/lib/chatServer";
import { resolveChatApiSession } from "@/lib/chatApiSession";

export async function GET(req: Request) {
  const resolved = await resolveChatApiSession(req);
  if (!resolved.ok) return resolved.response;

  const { db, session } = resolved.ctx;

  const { users, error } = await listChatUsersInBranch(db, session);
  if (error) {
    return NextResponse.json({ error }, { status: 500 });
  }

  return NextResponse.json({
    users: users.map((u) => ({
      ...u,
      displayName: displayNameForUser(u),
    })),
  });
}
