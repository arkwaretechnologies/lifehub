import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { CHAT_ATTACHMENTS_BUCKET, MAX_CHAT_ATTACHMENT_BYTES } from "@/lib/chatAttachmentShared";

function bucketExists(
  buckets: { id: string; name: string }[] | null | undefined,
): boolean {
  return (
    buckets?.some(
      (b) => b.id === CHAT_ATTACHMENTS_BUCKET || b.name === CHAT_ATTACHMENTS_BUCKET,
    ) ?? false
  );
}

/** Ensures the private chat attachments bucket exists (service role). */
export async function ensureChatAttachmentsBucket(
  db: SupabaseClient,
): Promise<{ ok: boolean; error: string | null }> {
  const { data: buckets, error: listErr } = await db.storage.listBuckets();
  if (listErr) {
    return { ok: false, error: listErr.message };
  }
  if (bucketExists(buckets)) {
    return { ok: true, error: null };
  }

  const { error: createErr } = await db.storage.createBucket(CHAT_ATTACHMENTS_BUCKET, {
    public: false,
    fileSizeLimit: MAX_CHAT_ATTACHMENT_BYTES,
  });

  if (createErr) {
    const msg = createErr.message.toLowerCase();
    if (msg.includes("already exists") || msg.includes("duplicate")) {
      return { ok: true, error: null };
    }
    return { ok: false, error: createErr.message };
  }

  return { ok: true, error: null };
}
