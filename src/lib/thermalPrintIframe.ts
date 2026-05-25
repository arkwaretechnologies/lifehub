/**
 * Hidden iframe print helper for 80mm thermal receipts.
 * Resolves after the iframe loads and print() is invoked (not after the dialog closes).
 */
export function openThermalPrintHtml(html: string, title: string): Promise<void> {
  return new Promise((resolve) => {
    const iframe = document.createElement("iframe");
    iframe.setAttribute("title", title);
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "none";
    iframe.style.visibility = "hidden";

    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch {
        /* iframe may be detached after client navigation */
      }
      resolve();
    };

    iframe.onload = () => finish();
    iframe.srcdoc = html;
    document.body.appendChild(iframe);

    window.setTimeout(() => {
      try {
        iframe.remove();
      } catch {
        /* ignore */
      }
    }, 120_000);
  });
}

/**
 * Return to cashier home after payment + thermal print.
 * Uses full navigation (not client router.replace) so Next.js does not throw
 * "The provided callback is no longer runnable" when the encounter page unmounts mid-transition.
 */
export function scheduleCashierHomeNavigation(href: string, delayMs = 400): void {
  window.setTimeout(() => {
    window.location.assign(href);
  }, delayMs);
}
