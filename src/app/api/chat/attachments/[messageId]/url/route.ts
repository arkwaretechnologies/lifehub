import { NextResponse } from "next/server";
import { CHAT_ATTACHMENTS_BUCKET } from "@/lib/chatAttachmentShared";
import { assertConversationAccess, fetchMessageById } from "@/lib/chatServer";
import { resolveChatApiSession } from "@/lib/chatApiSession";

type RouteContext = { params: Promise<{ messageId: string }> };

const SIGNED_URL_TTL_SEC = 3600;

export async function GET(req: Request, context: RouteContext) {
  const { messageId: rawId } = await context.params;
  const messageId = String(rawId ?? "").trim();
  if (!messageId) {
    return NextResponse.json({ error: "Message id is required." }, { status: 400 });
  }

  const resolved = await resolveChatApiSession(req);
  if (!resolved.ok) return resolved.response;

  const { db, session } = resolved.ctx;
  const message = await fetchMessageById(db, messageId);
  if (!message?.attachment_storage_path) {
    return NextResponse.json({ error: "Attachment not found." }, { status: 404 });
  }

  const { conversation, error } = await assertConversationAccess(
    db,
    message.conversation_id,
    session,
  );
  if (error || !conversation) {
    return NextResponse.json({ error: error ?? "Access denied." }, { status: 403 });
  }

  const { data, error: signErr } = await db.storage
    .from(CHAT_ATTACHMENTS_BUCKET)
    .createSignedUrl(message.attachment_storage_path, SIGNED_URL_TTL_SEC);

  if (signErr || !data?.signedUrl) {
    return NextResponse.json({ error: signErr?.message ?? "Failed to sign URL." }, { status: 500 });
  }

  return NextResponse.json({
    url: data.signedUrl,
    fileName: message.attachment_file_name,
    mimeType: message.attachment_mime_type,
  });
}
