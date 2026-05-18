/** MDC branding asset for Pharmacy POS (file at `public/mdc-logo.svg`). */
export const MDC_LOGO_SRC = "/mdc-logo.svg";

/** Absolute URL for print HTML loaded from `blob:` iframes. */
export function resolveMdcLogoSrc(): string {
  if (typeof window === "undefined") return MDC_LOGO_SRC;
  try {
    return new URL(MDC_LOGO_SRC, window.location.origin).href;
  } catch {
    return MDC_LOGO_SRC;
  }
}
