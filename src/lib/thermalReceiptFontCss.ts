/**
 * DejaVu Sans Mono for 80mm thermal receipt print iframes.
 * @fontsource/dejavu-mono names the family "DejaVu Mono" (same typeface as DejaVu Sans Mono).
 * Pinned jsDelivr URLs so glyphs load in print preview without local font files.
 */
export const THERMAL_RECEIPT_FONT_FACE_CSS = `
@font-face {
  font-family: 'DejaVu Mono';
  font-style: normal;
  font-display: swap;
  font-weight: 400;
  src: url('https://cdn.jsdelivr.net/npm/@fontsource/dejavu-mono@5.2.5/files/dejavu-mono-latin-400-normal.woff2') format('woff2');
}
@font-face {
  font-family: 'DejaVu Mono';
  font-style: normal;
  font-display: swap;
  font-weight: 700;
  src: url('https://cdn.jsdelivr.net/npm/@fontsource/dejavu-mono@5.2.5/files/dejavu-mono-latin-700-normal.woff2') format('woff2');
}
`.trim();

/** Use after @font-face so webfont applies; fallbacks if CDN unavailable. */
export const THERMAL_RECEIPT_FONT_FAMILY =
  "'DejaVu Mono', 'DejaVu Sans Mono', 'Liberation Mono', ui-monospace, monospace";

/** Root-relative path (encoded spaces). Shared by queue + acknowledgement thermal prints. */
export const THERMAL_RECEIPT_LOGO_SRC = encodeURI("/lifehub logo/lifehub logo receipt.bmp");

/**
 * Absolute logo URL for `<img src>` inside print HTML loaded from `blob:` (acknowledgement) or
 * `about:srcdoc` (queue). Root-relative `/…` alone often fails to resolve from those document URLs.
 */
export function resolveThermalReceiptLogoSrc(): string {
  if (typeof window === "undefined") return THERMAL_RECEIPT_LOGO_SRC;
  try {
    return new URL(THERMAL_RECEIPT_LOGO_SRC, window.location.origin).href;
  } catch {
    return THERMAL_RECEIPT_LOGO_SRC;
  }
}

/** Shared rules for centered header logo on 80mm thermal print HTML. */
export const THERMAL_RECEIPT_HEADER_LOGO_CSS = `
    .receipt-logo-wrap { text-align: center; margin: 0 0 8px; }
    .receipt-logo { max-width: 52mm; max-height: 22mm; width: auto; height: auto; object-fit: contain; display: block; margin-left: auto; margin-right: auto; }
`.trim();
