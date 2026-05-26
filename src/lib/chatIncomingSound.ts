import type { ChatConversationSummary, ChatMessageWithSender } from "@/lib/chatServer";

/** Tracks seen message ids; returns true when a new incoming message appears. */
export function createChatIncomingSoundTracker(sessionUserId: number) {
  const knownIds = new Set<string>();
  let bootstrapped = false;

  function ingest(
    conversations: ChatConversationSummary[],
    messages: ChatMessageWithSender[],
  ): boolean {
    let shouldPlay = false;

    for (const c of conversations) {
      const lm = c.lastMessage;
      if (!lm) continue;
      if (knownIds.has(lm.id)) continue;
      knownIds.add(lm.id);
      if (bootstrapped && lm.senderUserId !== sessionUserId) {
        shouldPlay = true;
      }
    }

    for (const m of messages) {
      if (knownIds.has(m.id)) continue;
      knownIds.add(m.id);
      if (bootstrapped && m.sender_user_id !== sessionUserId) {
        shouldPlay = true;
      }
    }

    bootstrapped = true;
    return shouldPlay;
  }

  return { ingest, reset: () => { knownIds.clear(); bootstrapped = false; } };
}
