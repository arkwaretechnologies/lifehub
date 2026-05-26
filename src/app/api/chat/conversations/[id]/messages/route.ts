import { NextResponse } from "next/server";
import {
  buildChatAttachmentStoragePath,
  CHAT_ATTACHMENTS_BUCKET,
  MAX_CHAT_ATTACHMENT_BYTES,
  resolveChatAttachmentFilename,
  validateChatAttachmentFile,
} from "@/lib/chatAttachmentShared";
import {
  optimizeChatImageBuffer,
  shouldOptimizeChatImage,
} from "@/lib/chatAttachmentImageServer";
import { ensureChatAttachmentsBucket } from "@/lib/chatAttachmentStorageServer";
import {
  fetchMessagesForConversation,
  insertChatMessage,
} from "@/lib/chatServer";
import { resolveChatConversationAccess } from "@/lib/chatApiSession";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(req: Request, context: RouteContext) {
  const { id } = await context.params;
  const conversationId = String(id ?? "").trim();
  if (!conversationId) {
    return NextResponse.json({ error: "Conversation id is required." }, { status: 400 });
  }

  const resolved = await resolveChatConversationAccess(req, conversationId);
  if (!resolved.ok) return resolved.response;

  const url = new URL(req.url);
  const limit = Number.parseInt(url.searchParams.get("limit") ?? "40", 10);
  const before = url.searchParams.get("before");

  const { messages, error } = await fetchMessagesForConversation(
    resolved.ctx.db,
    resolved.conversation!,
    resolved.ctx.session.userId,
    { limit, before },
  );

  if (error) {
    return NextResponse.json({ error }, { status: 500 });
  }

  return NextResponse.json({ messages });
}

export async function POST(req: Request, context: RouteContext) {
  const { id } = await context.params;
  const conversationId = String(id ?? "").trim();
  if (!conversationId) {
    return NextResponse.json({ error: "Conversation id is required." }, { status: 400 });
  }

  const resolved = await resolveChatConversationAccess(req, conversationId);
  if (!resolved.ok) return resolved.response;

  const { db, session } = resolved.ctx;
  const contentType = req.headers.get("content-type") ?? "";

  let bodyText: string | null = null;
  let file: File | null = null;

  if (contentType.includes("multipart/form-data")) {
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return NextResponse.json({ error: "Invalid upload form data." }, { status: 400 });
    }
    const rawBody = form.get("body");
    bodyText = rawBody != null ? String(rawBody) : null;
    const f = form.get("file");
    if (f instanceof File && f.size > 0) file = f;
  } else {
    let json: { body?: string };
    try {
      json = (await req.json()) as { body?: string };
    } catch {
      return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }
    bodyText = json.body ?? null;
  }

  const messageId = crypto.randomUUID();
  let attachment: {
    storagePath: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
  } | null = null;

  if (file) {
    const validationError = validateChatAttachmentFile({
      name: file.name,
      size: file.size,
      type: file.type,
    });
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const resolvedName =
      resolveChatAttachmentFilename(file.name, file.type) || file.name || "attachment";
    let uploadName = resolvedName;
    let contentType = file.type || "application/octet-stream";
    let buffer = Buffer.from(await file.arrayBuffer());

    if (shouldOptimizeChatImage(file.type, resolvedName)) {
      try {
        const optimized = await optimizeChatImageBuffer(buffer, resolvedName, file.type);
        buffer = Buffer.from(optimized.buffer);
        contentType = optimized.contentType;
        uploadName = `${optimized.fileNameStem}${optimized.ext}`;
      } catch {
        return NextResponse.json({ error: "Could not process image. Try another file." }, { status: 400 });
      }
    }

    if (buffer.length > MAX_CHAT_ATTACHMENT_BYTES) {
      return NextResponse.json(
        { error: `File must be under ${MAX_CHAT_ATTACHMENT_BYTES / (1024 * 1024)} MB after processing.` },
        { status: 400 },
      );
    }

    const storagePath = buildChatAttachmentStoragePath(conversationId, messageId, uploadName);

    const bucket = await ensureChatAttachmentsBucket(db);
    if (!bucket.ok) {
      return NextResponse.json(
        {
          error:
            bucket.error ??
            `Could not create storage bucket "${CHAT_ATTACHMENTS_BUCKET}". Check Supabase Storage permissions for the service role.`,
        },
        { status: 500 },
      );
    }

    const { error: uploadErr } = await db.storage
      .from(CHAT_ATTACHMENTS_BUCKET)
      .upload(storagePath, buffer, {
        contentType,
        upsert: false,
      });

    if (uploadErr) {
      const msg = uploadErr.message.toLowerCase();
      const bucketHint =
        msg.includes("bucket") || msg.includes("not found")
          ? ` Create the "${CHAT_ATTACHMENTS_BUCKET}" bucket in Supabase Storage (private).`
          : "";
      return NextResponse.json(
        { error: `Upload failed: ${uploadErr.message}.${bucketHint}` },
        { status: 500 },
      );
    }

    attachment = {
      storagePath,
      fileName: uploadName,
      mimeType: contentType,
      sizeBytes: buffer.length,
    };
  }

  const { message, error } = await insertChatMessage(db, {
    id: attachment ? messageId : undefined,
    conversationId,
    senderUserId: session.userId,
    body: bodyText,
    attachment,
  });

  if (error || !message) {
    if (attachment?.storagePath) {
      await db.storage.from(CHAT_ATTACHMENTS_BUCKET).remove([attachment.storagePath]);
    }
    return NextResponse.json({ error: error ?? "Failed to send message." }, { status: 400 });
  }

  return NextResponse.json({ message });
}
