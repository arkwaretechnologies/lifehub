import type { SupabaseClient } from "@supabase/supabase-js";

export const CHAT_CONVERSATION_TYPE_BRANCH = "branch" as const;
export const CHAT_CONVERSATION_TYPE_DIRECT = "direct" as const;

/** Used when users have no branch_code — one org-wide team channel for everyone. */
export const GLOBAL_TEAM_BRANCH_CODE = "__all__" as const;

export type ChatConversationType =
  | typeof CHAT_CONVERSATION_TYPE_BRANCH
  | typeof CHAT_CONVERSATION_TYPE_DIRECT;

export type ChatConversationRow = {
  id: string;
  type: ChatConversationType;
  branch_code: string | null;
  user_id_low: number | null;
  user_id_high: number | null;
  created_at: string;
};

export type ChatMessageRow = {
  id: string;
  conversation_id: string;
  sender_user_id: number;
  body: string | null;
  attachment_storage_path: string | null;
  attachment_file_name: string | null;
  attachment_mime_type: string | null;
  attachment_size_bytes: number | null;
  created_at: string;
};

export type ChatConversationReadRow = {
  conversation_id: string;
  user_id: number;
  last_read_at: string;
};

export type ChatUserRow = {
  user_id: number;
  fullname: string | null;
  username: string | null;
  role: string | null;
  branch_code: string | null;
};

export type ChatMessageWithSender = ChatMessageRow & {
  sender_fullname: string | null;
  sender_username: string | null;
  readReceipt: ChatReadReceipt;
};

export type ChatReadReceipt =
  | { kind: "direct"; status: "sent" | "read" }
  | { kind: "branch"; readByCount: number };

export type ChatConversationSummary = {
  id: string;
  type: ChatConversationType;
  displayName: string;
  branchCode: string | null;
  otherUserId: number | null;
  unreadCount: number;
  lastMessage: {
    id: string;
    body: string | null;
    attachmentFileName: string | null;
    senderUserId: number;
    createdAt: string;
  } | null;
};

export type ChatSessionUser = {
  userId: number;
  branchCode: string | null;
  fullname: string | null;
};

function normalizeBranchCode(code: string | null | undefined): string | null {
  const t = String(code ?? "").trim();
  return t || null;
}

export function isGlobalTeamBranchCode(code: string | null | undefined): boolean {
  return normalizeBranchCode(code) === GLOBAL_TEAM_BRANCH_CODE;
}

/** Team channel key: user's branch when set, otherwise org-wide fallback. */
export function getTeamBranchCode(session: ChatSessionUser): string {
  return session.branchCode ?? GLOBAL_TEAM_BRANCH_CODE;
}

export function formatTeamChannelDisplayName(branchCode: string | null | undefined): string {
  if (!branchCode || isGlobalTeamBranchCode(branchCode)) {
    return "Team · Everyone";
  }
  return `Team · ${branchCode}`;
}

function canDirectMessageUsers(
  self: ChatSessionUser,
  other: ChatSessionUser,
): { ok: boolean; error?: string } {
  if (!self.branchCode || !other.branchCode) {
    return { ok: true };
  }
  if (self.branchCode !== other.branchCode) {
    return {
      ok: false,
      error: "Direct messages are limited to colleagues in your branch.",
    };
  }
  return { ok: true };
}

function directPair(userId: number, otherUserId: number): { low: number; high: number } {
  const a = Math.min(userId, otherUserId);
  const b = Math.max(userId, otherUserId);
  return { low: a, high: b };
}

export async function fetchChatSessionUser(
  db: SupabaseClient,
  userId: number,
): Promise<ChatSessionUser | null> {
  const { data, error } = await db
    .from("users")
    .select("user_id, branch_code, fullname")
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) return null;
  const row = data as { user_id: number; branch_code?: string | null; fullname?: string | null };
  return {
    userId: row.user_id,
    branchCode: normalizeBranchCode(row.branch_code),
    fullname: row.fullname ?? null,
  };
}

export async function getOrCreateBranchConversation(
  db: SupabaseClient,
  branchCode: string,
): Promise<ChatConversationRow | null> {
  const code = normalizeBranchCode(branchCode);
  if (!code) return null;

  const { data: existing, error: findErr } = await db
    .from("chat_conversations")
    .select("*")
    .eq("type", CHAT_CONVERSATION_TYPE_BRANCH)
    .eq("branch_code", code)
    .maybeSingle();

  if (findErr) return null;
  if (existing) return existing as ChatConversationRow;

  const { data: created, error: createErr } = await db
    .from("chat_conversations")
    .insert({
      type: CHAT_CONVERSATION_TYPE_BRANCH,
      branch_code: code,
    })
    .select("*")
    .single();

  if (createErr) {
    const { data: retry } = await db
      .from("chat_conversations")
      .select("*")
      .eq("type", CHAT_CONVERSATION_TYPE_BRANCH)
      .eq("branch_code", code)
      .maybeSingle();
    return (retry as ChatConversationRow | null) ?? null;
  }

  return created as ChatConversationRow;
}

export async function getOrCreateDirectConversation(
  db: SupabaseClient,
  userId: number,
  otherUserId: number,
): Promise<{ conversation: ChatConversationRow | null; error: string | null }> {
  if (userId === otherUserId) {
    return { conversation: null, error: "Cannot message yourself." };
  }

  const [self, other] = await Promise.all([
    fetchChatSessionUser(db, userId),
    fetchChatSessionUser(db, otherUserId),
  ]);

  if (!self || !other) {
    return { conversation: null, error: "User not found." };
  }
  const dmCheck = canDirectMessageUsers(self, other);
  if (!dmCheck.ok) {
    return { conversation: null, error: dmCheck.error ?? "Cannot message this user." };
  }

  const { low, high } = directPair(userId, otherUserId);

  const { data: existing, error: findErr } = await db
    .from("chat_conversations")
    .select("*")
    .eq("type", CHAT_CONVERSATION_TYPE_DIRECT)
    .eq("user_id_low", low)
    .eq("user_id_high", high)
    .maybeSingle();

  if (findErr) return { conversation: null, error: findErr.message };
  if (existing) return { conversation: existing as ChatConversationRow, error: null };

  const { data: created, error: createErr } = await db
    .from("chat_conversations")
    .insert({
      type: CHAT_CONVERSATION_TYPE_DIRECT,
      user_id_low: low,
      user_id_high: high,
    })
    .select("*")
    .single();

  if (createErr) {
    const { data: retry } = await db
      .from("chat_conversations")
      .select("*")
      .eq("type", CHAT_CONVERSATION_TYPE_DIRECT)
      .eq("user_id_low", low)
      .eq("user_id_high", high)
      .maybeSingle();
    if (retry) return { conversation: retry as ChatConversationRow, error: null };
    return { conversation: null, error: createErr.message };
  }

  return { conversation: created as ChatConversationRow, error: null };
}

export function isUserInDirectConversation(conv: ChatConversationRow, userId: number): boolean {
  if (conv.type !== CHAT_CONVERSATION_TYPE_DIRECT) return false;
  return conv.user_id_low === userId || conv.user_id_high === userId;
}

export async function assertConversationAccess(
  db: SupabaseClient,
  conversationId: string,
  session: ChatSessionUser,
): Promise<{ conversation: ChatConversationRow | null; error: string | null }> {
  const { data, error } = await db
    .from("chat_conversations")
    .select("*")
    .eq("id", conversationId)
    .maybeSingle();

  if (error) return { conversation: null, error: error.message };
  if (!data) return { conversation: null, error: "Conversation not found." };

  const conv = data as ChatConversationRow;

  if (conv.type === CHAT_CONVERSATION_TYPE_BRANCH) {
    if (conv.branch_code !== getTeamBranchCode(session)) {
      return { conversation: null, error: "Access denied." };
    }
    return { conversation: conv, error: null };
  }

  if (!isUserInDirectConversation(conv, session.userId)) {
    return { conversation: null, error: "Access denied." };
  }

  return { conversation: conv, error: null };
}

async function fetchLastReadAt(
  db: SupabaseClient,
  conversationId: string,
  userId: number,
): Promise<string | null> {
  const { data } = await db
    .from("chat_conversation_reads")
    .select("last_read_at")
    .eq("conversation_id", conversationId)
    .eq("user_id", userId)
    .maybeSingle();

  return (data as { last_read_at?: string } | null)?.last_read_at ?? null;
}

export async function countUnreadInConversation(
  db: SupabaseClient,
  conversationId: string,
  userId: number,
): Promise<number> {
  const lastRead = await fetchLastReadAt(db, conversationId, userId);

  let query = db
    .from("chat_messages")
    .select("id", { count: "exact", head: true })
    .eq("conversation_id", conversationId)
    .neq("sender_user_id", userId);

  if (lastRead) {
    query = query.gt("created_at", lastRead);
  }

  const { count, error } = await query;
  if (error) return 0;
  return count ?? 0;
}

async function fetchUserDisplayName(db: SupabaseClient, userId: number): Promise<string> {
  const { data } = await db
    .from("users")
    .select("fullname, username")
    .eq("user_id", userId)
    .maybeSingle();
  const row = data as { fullname?: string | null; username?: string | null } | null;
  const name = String(row?.fullname ?? row?.username ?? "").trim();
  return name || `User ${userId}`;
}

async function summarizeConversation(
  db: SupabaseClient,
  conv: ChatConversationRow,
  session: ChatSessionUser,
): Promise<ChatConversationSummary> {
  let displayName = "Team";
  let otherUserId: number | null = null;

  if (conv.type === CHAT_CONVERSATION_TYPE_DIRECT) {
    otherUserId =
      conv.user_id_low === session.userId ? conv.user_id_high : conv.user_id_low;
    if (otherUserId != null) {
      displayName = await fetchUserDisplayName(db, otherUserId);
    } else {
      displayName = "Direct message";
    }
  } else if (conv.branch_code) {
    displayName = formatTeamChannelDisplayName(conv.branch_code);
  }

  const { data: lastMsg } = await db
    .from("chat_messages")
    .select("id, body, attachment_file_name, sender_user_id, created_at")
    .eq("conversation_id", conv.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const unreadCount = await countUnreadInConversation(db, conv.id, session.userId);

  const msg = lastMsg as
    | {
        id: string;
        body: string | null;
        attachment_file_name: string | null;
        sender_user_id: number;
        created_at: string;
      }
    | null;

  return {
    id: conv.id,
    type: conv.type,
    displayName,
    branchCode: conv.branch_code,
    otherUserId,
    unreadCount,
    lastMessage: msg
      ? {
          id: msg.id,
          body: msg.body,
          attachmentFileName: msg.attachment_file_name,
          senderUserId: msg.sender_user_id,
          createdAt: msg.created_at,
        }
      : null,
  };
}

export async function listConversationsForUser(
  db: SupabaseClient,
  session: ChatSessionUser,
): Promise<{ conversations: ChatConversationSummary[]; totalUnread: number; error: string | null }> {
  const teamBranchCode = getTeamBranchCode(session);
  const branchConv = await getOrCreateBranchConversation(db, teamBranchCode);
  if (!branchConv) {
    return { conversations: [], totalUnread: 0, error: "Failed to load team channel." };
  }

  const { data: directRows, error: directErr } = await db
    .from("chat_conversations")
    .select("*")
    .eq("type", CHAT_CONVERSATION_TYPE_DIRECT)
    .or(`user_id_low.eq.${session.userId},user_id_high.eq.${session.userId}`);

  if (directErr) {
    return { conversations: [], totalUnread: 0, error: directErr.message };
  }

  const all = [branchConv, ...((directRows ?? []) as ChatConversationRow[])];
  const summaries = await Promise.all(all.map((c) => summarizeConversation(db, c, session)));

  summaries.sort((a, b) => {
    if (a.type === CHAT_CONVERSATION_TYPE_BRANCH) return -1;
    if (b.type === CHAT_CONVERSATION_TYPE_BRANCH) return 1;
    const at = a.lastMessage?.createdAt ?? "";
    const bt = b.lastMessage?.createdAt ?? "";
    return bt.localeCompare(at);
  });

  const totalUnread = summaries.reduce((n, s) => n + s.unreadCount, 0);
  return { conversations: summaries, totalUnread, error: null };
}

export async function markConversationRead(
  db: SupabaseClient,
  conversationId: string,
  userId: number,
): Promise<{ error: string | null }> {
  const now = new Date().toISOString();
  const { error } = await db.from("chat_conversation_reads").upsert(
    {
      conversation_id: conversationId,
      user_id: userId,
      last_read_at: now,
    },
    { onConflict: "conversation_id,user_id" },
  );

  return { error: error?.message ?? null };
}

export async function listTeamChannelMemberUserIds(
  db: SupabaseClient,
  branchCode: string,
): Promise<number[]> {
  if (isGlobalTeamBranchCode(branchCode)) {
    const { data, error } = await db.from("users").select("user_id");
    if (error) return [];
    return (data ?? []).map((r) => (r as { user_id: number }).user_id);
  }

  const { data, error } = await db
    .from("users")
    .select("user_id")
    .eq("branch_code", branchCode);

  if (error) return [];
  return (data ?? []).map((r) => (r as { user_id: number }).user_id);
}

export async function getReadReceiptForMessage(
  db: SupabaseClient,
  conv: ChatConversationRow,
  message: ChatMessageRow,
  sessionUserId: number,
): Promise<ChatReadReceipt | null> {
  if (message.sender_user_id !== sessionUserId) return null;

  if (conv.type === CHAT_CONVERSATION_TYPE_DIRECT) {
    const otherId =
      conv.user_id_low === sessionUserId ? conv.user_id_high : conv.user_id_low;
    if (otherId == null) return { kind: "direct", status: "sent" };
    const lastRead = await fetchLastReadAt(db, conv.id, otherId);
    const read =
      lastRead != null && new Date(lastRead).getTime() >= new Date(message.created_at).getTime();
    return { kind: "direct", status: read ? "read" : "sent" };
  }

  if (!conv.branch_code) return { kind: "branch", readByCount: 0 };

  const branchUserIds = await listTeamChannelMemberUserIds(db, conv.branch_code);
  const others = branchUserIds.filter((id) => id !== sessionUserId);
  if (others.length === 0) return { kind: "branch", readByCount: 0 };

  const { data: reads } = await db
    .from("chat_conversation_reads")
    .select("user_id, last_read_at")
    .eq("conversation_id", conv.id)
    .in("user_id", others);

  const msgTime = new Date(message.created_at).getTime();
  let readByCount = 0;
  for (const row of reads ?? []) {
    const r = row as { user_id: number; last_read_at: string };
    if (new Date(r.last_read_at).getTime() >= msgTime) readByCount += 1;
  }

  return { kind: "branch", readByCount };
}

export async function fetchMessagesForConversation(
  db: SupabaseClient,
  conv: ChatConversationRow,
  sessionUserId: number,
  options: { limit?: number; before?: string | null },
): Promise<{ messages: ChatMessageWithSender[]; error: string | null }> {
  const limit = Math.min(50, Math.max(1, options.limit ?? 40));

  let query = db
    .from("chat_messages")
    .select("*")
    .eq("conversation_id", conv.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (options.before) {
    const { data: cursor } = await db
      .from("chat_messages")
      .select("created_at")
      .eq("id", options.before)
      .maybeSingle();
    const createdAt = (cursor as { created_at?: string } | null)?.created_at;
    if (createdAt) {
      query = query.lt("created_at", createdAt);
    }
  }

  const { data, error } = await query;
  if (error) return { messages: [], error: error.message };

  const rows = (data ?? []) as ChatMessageRow[];
  const senderIds = [...new Set(rows.map((m) => m.sender_user_id))];

  const nameById = new Map<number, { fullname: string | null; username: string | null }>();
  if (senderIds.length > 0) {
    const { data: users } = await db
      .from("users")
      .select("user_id, fullname, username")
      .in("user_id", senderIds);
    for (const u of users ?? []) {
      const row = u as { user_id: number; fullname: string | null; username: string | null };
      nameById.set(row.user_id, { fullname: row.fullname, username: row.username });
    }
  }

  const withSender: ChatMessageWithSender[] = [];
  for (const m of rows) {
    const names = nameById.get(m.sender_user_id);
    const readReceipt =
      (await getReadReceiptForMessage(db, conv, m, sessionUserId)) ?? {
        kind: "branch" as const,
        readByCount: 0,
      };
    withSender.push({
      ...m,
      sender_fullname: names?.fullname ?? null,
      sender_username: names?.username ?? null,
      readReceipt,
    });
  }

  withSender.reverse();
  return { messages: withSender, error: null };
}

export async function insertChatMessage(
  db: SupabaseClient,
  args: {
    id?: string;
    conversationId: string;
    senderUserId: number;
    body: string | null;
    attachment?: {
      storagePath: string;
      fileName: string;
      mimeType: string;
      sizeBytes: number;
    } | null;
  },
): Promise<{ message: ChatMessageRow | null; error: string | null }> {
  const bodyTrimmed = args.body?.trim() ?? "";
  const hasBody = bodyTrimmed.length > 0;
  const hasAttachment = Boolean(args.attachment?.storagePath);

  if (!hasBody && !hasAttachment) {
    return { message: null, error: "Message cannot be empty." };
  }

  const row: Record<string, unknown> = {
    conversation_id: args.conversationId,
    sender_user_id: args.senderUserId,
    body: hasBody ? bodyTrimmed : null,
    attachment_storage_path: args.attachment?.storagePath ?? null,
    attachment_file_name: args.attachment?.fileName ?? null,
    attachment_mime_type: args.attachment?.mimeType ?? null,
    attachment_size_bytes: args.attachment?.sizeBytes ?? null,
  };
  if (args.id) row.id = args.id;

  const { data, error } = await db.from("chat_messages").insert(row).select("*").single();

  if (error) return { message: null, error: error.message };
  return { message: data as ChatMessageRow, error: null };
}

export async function listChatUsersInBranch(
  db: SupabaseClient,
  session: ChatSessionUser,
): Promise<{ users: ChatUserRow[]; error: string | null }> {
  let query = db
    .from("users")
    .select("user_id, fullname, username, role, branch_code")
    .neq("user_id", session.userId)
    .order("fullname", { ascending: true });

  if (session.branchCode) {
    query = query.eq("branch_code", session.branchCode);
  }

  const { data, error } = await query;

  if (error) return { users: [], error: error.message };
  return { users: (data ?? []) as ChatUserRow[], error: null };
}

export async function fetchMessageById(
  db: SupabaseClient,
  messageId: string,
): Promise<ChatMessageRow | null> {
  const { data, error } = await db
    .from("chat_messages")
    .select("*")
    .eq("id", messageId)
    .maybeSingle();

  if (error || !data) return null;
  return data as ChatMessageRow;
}

export function displayNameForUser(row: ChatUserRow): string {
  const name = String(row.fullname ?? row.username ?? "").trim();
  return name || `User ${row.user_id}`;
}
