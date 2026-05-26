/** Client-safe chat attachment constants and validation (no Node-only deps). */

export const CHAT_ATTACHMENTS_BUCKET = "chat-attachments" as const;

export const MAX_CHAT_ATTACHMENT_BYTES = 10 * 1024 * 1024;

export const CHAT_ATTACHMENT_EXTENSIONS = [
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".webp",
  ".pdf",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".txt",
] as const;

export const CHAT_ATTACHMENT_ACCEPT = [
  ...CHAT_ATTACHMENT_EXTENSIONS,
  ...CHAT_ATTACHMENT_EXTENSIONS.map((e) => e.toUpperCase()),
].join(",");

const BLOCKED_EXTENSIONS = [
  ".exe",
  ".bat",
  ".cmd",
  ".com",
  ".msi",
  ".scr",
  ".ps1",
  ".vbs",
  ".js",
  ".jar",
  ".sh",
  ".dll",
] as const;

export function extensionFromFilename(name: string): string {
  const base = name.trim().toLowerCase();
  const dot = base.lastIndexOf(".");
  if (dot < 0) return "";
  return base.slice(dot);
}

const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/png": ".png",
  "image/gif": ".gif",
  "image/webp": ".webp",
  "application/pdf": ".pdf",
  "application/msword": ".doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
  "application/vnd.ms-excel": ".xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
  "text/plain": ".txt",
};

export function extensionFromMime(mime: string | null | undefined): string {
  const m = (mime ?? "").toLowerCase().split(";")[0]?.trim() ?? "";
  return MIME_TO_EXT[m] ?? "";
}

export function isAllowedChatAttachmentExtension(ext: string): boolean {
  if (!ext) return false;
  if (BLOCKED_EXTENSIONS.includes(ext as (typeof BLOCKED_EXTENSIONS)[number])) return false;
  return CHAT_ATTACHMENT_EXTENSIONS.includes(ext as (typeof CHAT_ATTACHMENT_EXTENSIONS)[number]);
}

/** Infer extension from filename, then MIME (clipboard / camera often omit extensions). */
export function resolveChatAttachmentExtension(
  name: string,
  mime?: string | null,
): string {
  const fromName = extensionFromFilename(name);
  if (isAllowedChatAttachmentExtension(fromName)) return fromName;
  return extensionFromMime(mime);
}

export function resolveChatAttachmentFilename(name: string, mime?: string | null): string {
  const ext = resolveChatAttachmentExtension(name, mime);
  if (!ext) return "";

  const trimmed = name.trim().replace(/[/\\?%*:|"<>]/g, "_");
  const fromName = extensionFromFilename(trimmed);
  if (fromName === ext && isAllowedChatAttachmentExtension(fromName)) {
    return trimmed.slice(0, 180);
  }

  const dot = trimmed.lastIndexOf(".");
  const stem = (dot > 0 ? trimmed.slice(0, dot) : trimmed).trim() || "attachment";
  return `${stem.slice(0, 160)}${ext}`;
}

export function isAllowedChatAttachmentFilename(name: string, mime?: string | null): boolean {
  return resolveChatAttachmentFilename(name, mime).length > 0;
}

export function isChatImageMime(mime: string | null | undefined): boolean {
  const m = (mime ?? "").toLowerCase();
  return m.startsWith("image/");
}

export function validateChatAttachmentFile(file: {
  name: string;
  size: number;
  type?: string;
}): string | null {
  if (!file.name.trim() && !file.type) return "File name is required.";
  if (!isAllowedChatAttachmentFilename(file.name, file.type)) {
    return `Allowed types: ${CHAT_ATTACHMENT_EXTENSIONS.join(", ")}`;
  }
  if (file.size <= 0) return "File is empty.";
  if (file.size > MAX_CHAT_ATTACHMENT_BYTES) {
    return `File must be under ${MAX_CHAT_ATTACHMENT_BYTES / (1024 * 1024)} MB.`;
  }
  return null;
}

/** Client-side: ensure File has a valid name before upload. */
export function normalizeChatAttachmentFile(file: File): File {
  const resolved = resolveChatAttachmentFilename(file.name || "attachment", file.type);
  if (!resolved || resolved === file.name) return file;
  return new File([file], resolved, { type: file.type || undefined });
}

export function sanitizeChatStorageFilename(name: string): string {
  const base = name.trim().replace(/[/\\?%*:|"<>]/g, "_");
  return base.slice(0, 180) || "attachment";
}

export function buildChatAttachmentStoragePath(
  conversationId: string,
  messageId: string,
  filename: string,
): string {
  const safe = sanitizeChatStorageFilename(filename);
  return `${conversationId}/${messageId}/${safe}`;
}
