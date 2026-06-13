import type { LabResultImagePosition } from "@/lib/labResultsPrintLayout";
import type { PDFDocument, PDFImage, PDFPage } from "pdf-lib";

export async function embedSignatureBytes(
  doc: PDFDocument,
  bytes: Uint8Array,
  contentType?: string | null,
): Promise<PDFImage | null> {
  try {
    const ct = (contentType ?? "").toLowerCase();
    if (ct.includes("jpeg") || ct.includes("jpg")) {
      return await doc.embedJpg(bytes);
    }
    return await doc.embedPng(bytes);
  } catch {
    try {
      return await doc.embedPng(bytes);
    } catch {
      try {
        return await doc.embedJpg(bytes);
      } catch {
        return null;
      }
    }
  }
}

/** Draw image using top-left anchor (distance from top of page, PDF points). */
export function drawSignatureImageAtTop(
  page: PDFPage,
  image: PDFImage,
  x: number,
  fromTop: number,
  width: number,
  height: number,
): void {
  const { height: pageH } = page.getSize();
  page.drawImage(image, {
    x,
    y: pageH - fromTop - height,
    width,
    height,
  });
}

/** Draw image using reference coordinates scaled to the page size (like lab result templates). */
export function drawSignatureImageAtRef(
  page: PDFPage,
  image: PDFImage,
  pos: LabResultImagePosition,
  refW: number,
  refH: number,
): void {
  const { width, height } = page.getSize();
  const sx = width / refW;
  const sy = height / refH;
  const x = pos.refX * sx;
  const y = height - pos.refFromTop * sy - pos.refHeight * sy;
  page.drawImage(image, {
    x,
    y,
    width: pos.refWidth * sx,
    height: pos.refHeight * sy,
  });
}
