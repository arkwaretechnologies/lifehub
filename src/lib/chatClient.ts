import { supabase } from "@/lib/supabaseClient";
import { authenticatedFetch } from "@/lib/authenticatedFetch";
import { normalizeChatAttachmentFile } from "@/lib/chatAttachmentShared";
import type {
  ChatConversationRow,
  ChatConversationSummary,
  ChatMessageWithSender,
  ChatUserRow,
} from "@/lib/chatServer";

export type { ChatConversationSummary, ChatMessageWithSender, ChatUserRow };

export type ChatUserOption = ChatUserRow & { displayName: string };

const POLL_MS = 5000;

export { POLL_MS as CHAT_POLL_MS };

export async function fetchChatConversations(): Promise<{
  conversations: ChatConversationSummary[];
  totalUnread: number;
  error: string | null;
}> {
  const res = await authenticatedFetch("/api/chat/conversations", { cache: "no-store" });
  const json = (await res.json().catch(() => null)) as
    | {
        conversations?: ChatConversationSummary[];
        totalUnread?: number;
        error?: string;
      }
    | null;

  if (!res.ok || !json) {
    return {
      conversations: [],
      totalUnread: 0,
      error: json?.error ?? "Failed to load conversations.",
    };
  }

  return {
    conversations: json.conversations ?? [],
    totalUnread: json.totalUnread ?? 0,
    error: null,
  };
}

export async function fetchChatMessages(
  conversationId: string,
  options?: { before?: string; limit?: number },
): Promise<{ messages: ChatMessageWithSender[]; error: string | null }> {
  const params = new URLSearchParams();
  if (options?.before) params.set("before", options.before);
  if (options?.limit) params.set("limit", String(options.limit));

  const qs = params.toString();
  const url = `/api/chat/conversations/${encodeURIComponent(conversationId)}/messages${qs ? `?${qs}` : ""}`;

  const res = await authenticatedFetch(url, { cache: "no-store" });
  const json = (await res.json().catch(() => null)) as
    | { messages?: ChatMessageWithSender[]; error?: string }
    | null;

  if (!res.ok || !json) {
    return { messages: [], error: json?.error ?? "Failed to load messages." };
  }

  return { messages: json.messages ?? [], error: null };
}

export async function sendChatMessageApi(args: {
  conversationId: string;
  body?: string;
  file?: File | null;
}): Promise<{ error: string | null }> {
  const hasFile = args.file && args.file.size > 0;
  const bodyTrimmed = args.body?.trim() ?? "";

  if (!hasFile && !bodyTrimmed) {
    return { error: "Message cannot be empty." };
  }

  let res: Response;
  if (hasFile) {
    const file = normalizeChatAttachmentFile(args.file!);
    const form = new FormData();
    if (bodyTrimmed) form.set("body", bodyTrimmed);
    form.set("file", file);
    res = await authenticatedFetch(
      `/api/chat/conversations/${encodeURIComponent(args.conversationId)}/messages`,
      { method: "POST", body: form },
    );
  } else {
    res = await authenticatedFetch(
      `/api/chat/conversations/${encodeURIComponent(args.conversationId)}/messages`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: bodyTrimmed }),
      },
    );
  }

  const json = (await res.json().catch(() => null)) as { error?: string } | null;
  if (!res.ok) {
    return { error: json?.error ?? "Failed to send message." };
  }
  return { error: null };
}

export async function markChatConversationRead(
  conversationId: string,
): Promise<{ error: string | null }> {
  const res = await authenticatedFetch(
    `/api/chat/conversations/${encodeURIComponent(conversationId)}/read`,
    { method: "PATCH" },
  );
  if (!res.ok) {
    const json = (await res.json().catch(() => null)) as { error?: string } | null;
    return { error: json?.error ?? "Failed to mark as read." };
  }
  return { error: null };
}

export async function openDirectChatApi(
  otherUserId: number,
): Promise<{ conversation: ChatConversationRow | null; error: string | null }> {
  const res = await authenticatedFetch("/api/chat/conversations/direct", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ otherUserId }),
  });
  const json = (await res.json().catch(() => null)) as
    | { conversation?: ChatConversationRow; error?: string }
    | null;

  if (!res.ok || !json?.conversation) {
    return { conversation: null, error: json?.error ?? "Failed to open conversation." };
  }
  return { conversation: json.conversation, error: null };
}

export async function fetchChatUsers(): Promise<{
  users: ChatUserOption[];
  error: string | null;
}> {
  const res = await authenticatedFetch("/api/chat/users", { cache: "no-store" });
  const json = (await res.json().catch(() => null)) as
    | { users?: ChatUserOption[]; error?: string }
    | null;

  if (!res.ok || !json) {
    return { users: [], error: json?.error ?? "Failed to load users." };
  }
  return { users: json.users ?? [], error: null };
}

export async function fetchChatAttachmentUrl(
  messageId: string,
): Promise<{ url: string | null; fileName: string | null; mimeType: string | null; error: string | null }> {
  const res = await authenticatedFetch(
    `/api/chat/attachments/${encodeURIComponent(messageId)}/url`,
    { cache: "no-store" },
  );
  const json = (await res.json().catch(() => null)) as
    | { url?: string; fileName?: string | null; mimeType?: string | null; error?: string }
    | null;

  if (!res.ok || !json?.url) {
    return { url: null, fileName: null, mimeType: null, error: json?.error ?? "Failed to load attachment." };
  }

  return {
    url: json.url,
    fileName: json.fileName ?? null,
    mimeType: json.mimeType ?? null,
    error: null,
  };
}

/** Realtime updates for chat (best-effort; UI also polls). */
export function subscribeChatMessages(onEvent: () => void): () => void {
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  const notify = () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      onEvent();
    }, 300);
  };

  const channel = supabase
    .channel("chat_messages_global")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "chat_messages" },
      () => notify(),
    )
    .subscribe();

  return () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    void supabase.removeChannel(channel);
  };
}
