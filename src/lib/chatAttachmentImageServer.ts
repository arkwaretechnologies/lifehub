import "server-only";

import sharp from "sharp";
import { extensionFromFilename, isChatImageMime } from "@/lib/chatAttachmentShared";

const MAX_CHAT_IMAGE_EDGE_PX = 2048;
const JPEG_QUALITY = 88;

export type OptimizedChatImage = {
  buffer: Buffer;
  contentType: string;
  ext: string;
  fileNameStem: string;
};

const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/png": ".png",
  "image/gif": ".gif",
  "image/webp": ".webp",
};

/** Resize large photos and re-encode with high visual quality for chat. */
export async function optimizeChatImageBuffer(
  input: Buffer,
  originalName: string,
  mimeHint: string,
): Promise<OptimizedChatImage> {
  const mime = (mimeHint || "").toLowerCase();
  let ext = extensionFromFilename(originalName);
  if (!ext || !MIME_TO_EXT[mime]) {
    ext = MIME_TO_EXT[mime] ?? ".jpg";
  }

  const stem =
    originalName.trim().replace(/[/\\?%*:|"<>]/g, "_").replace(/\.[^.]+$/, "").slice(0, 120) ||
    "image";

  if (ext === ".gif") {
    return {
      buffer: input,
      contentType: "image/gif",
      ext: ".gif",
      fileNameStem: stem,
    };
  }

  let pipeline = sharp(input, { failOn: "none" }).rotate();
  const meta = await pipeline.metadata();
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;

  if (w > MAX_CHAT_IMAGE_EDGE_PX || h > MAX_CHAT_IMAGE_EDGE_PX) {
    pipeline = pipeline.resize(MAX_CHAT_IMAGE_EDGE_PX, MAX_CHAT_IMAGE_EDGE_PX, {
      fit: "inside",
      withoutEnlargement: true,
    });
  }

  if (meta.hasAlpha || ext === ".png") {
    const buffer = await pipeline.png({ compressionLevel: 8 }).toBuffer();
    return { buffer, contentType: "image/png", ext: ".png", fileNameStem: stem };
  }

  if (ext === ".webp") {
    const buffer = await pipeline.webp({ quality: 88 }).toBuffer();
    return { buffer, contentType: "image/webp", ext: ".webp", fileNameStem: stem };
  }

  const buffer = await pipeline
    .jpeg({
      quality: JPEG_QUALITY,
      mozjpeg: true,
      chromaSubsampling: "4:4:4",
    })
    .toBuffer();

  return { buffer, contentType: "image/jpeg", ext: ".jpg", fileNameStem: stem };
}

export function shouldOptimizeChatImage(mime: string, name: string): boolean {
  if (isChatImageMime(mime)) return true;
  const ext = extensionFromFilename(name);
  return [".jpg", ".jpeg", ".png", ".webp", ".gif"].includes(ext);
}
