/** `public/lifehub logo/lifehub logo final.png` */
export const LIFEHUB_LOGO_SRC = "/lifehub logo/lifehub logo final.png";

/** Transparent LifeHub mark for 80mm thermal receipts (PNG). */
export const LIFEHUB_RECEIPT_LOGO_SRC = encodeURI("/lifehub logo/lifehub logo receipt.png");

/** Absolute URL for print HTML loaded from `blob:` iframes. */
export function resolveLifehubReceiptLogoSrc(): string {
  if (typeof window === "undefined") return LIFEHUB_RECEIPT_LOGO_SRC;
  try {
    return new URL(LIFEHUB_RECEIPT_LOGO_SRC, window.location.origin).href;
  } catch {
    return LIFEHUB_RECEIPT_LOGO_SRC;
  }
}
