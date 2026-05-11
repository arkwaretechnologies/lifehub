"use client";

import {
  THERMAL_RECEIPT_FONT_FACE_CSS,
  THERMAL_RECEIPT_FONT_FAMILY,
  THERMAL_RECEIPT_HEADER_LOGO_CSS,
  resolveThermalReceiptLogoSrc,
} from "@/lib/thermalReceiptFontCss";

export type ReceptionQueueReceiptArgs = {
  patientName: string;
  destinationLabel: string;
  queueDisplay: string;
  transId: string;
  /** When set, QR encodes the queue ticket id for cashier reprint via `/api/cashier/lab-queue-ticket/reprint`. */
  queueTicketId?: string | null;
};

/**
 * Opens a print dialog with queue slip: patient, destination, queue number, trans_id, QR (UUID text).
 */
export async function openReceptionQueueReceiptPrint(args: ReceptionQueueReceiptArgs): Promise<void> {
  const QRCode = (await import("qrcode")).default;
  const qrPayload = (args.queueTicketId ?? "").trim() || args.transId.trim();
  const qrDataUrl = await QRCode.toDataURL(qrPayload, {
    width: 140,
    margin: 1,
    errorCorrectionLevel: "M",
  });

  const when = new Date().toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });

  const logoSrc = resolveThermalReceiptLogoSrc();

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <!-- Empty title so browser print header (top-right) does not show "Queue receipt" / "Queue…" -->
  <title></title>
  <style>
    ${THERMAL_RECEIPT_FONT_FACE_CSS}
    ${THERMAL_RECEIPT_HEADER_LOGO_CSS}
    @page { size: 80mm auto; margin: 4mm; }
    html, body { padding: 0; margin: 0; }
    body {
      box-sizing: border-box;
      width: 80mm;
      max-width: 80mm;
      font-family: ${THERMAL_RECEIPT_FONT_FAMILY};
      padding: 3mm 4mm;
      margin: 0 auto;
      color: #1a1a2e;
      font-size: 11px;
      line-height: 1.25;
    }
    h1 {
      font-size: 11px;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: #1f4e79;
      margin: 0 0 6px;
      text-align: center;
      font-weight: 800;
    }
    .queue {
      font-size: 1.65rem;
      font-weight: 800;
      text-align: center;
      margin: 6px 0;
      font-variant-numeric: tabular-nums;
      line-height: 1.1;
    }
    .muted { color: #666; font-size: 10px; }
    .row { margin: 4px 0; }
    .tid { font-family: ${THERMAL_RECEIPT_FONT_FAMILY}; font-size: 8px; word-break: break-all; line-height: 1.2; }
    .qr { display: block; margin: 8px auto 0; width: 120px; height: 120px; }
  </style>
</head>
<body>
  <div class="receipt-logo-wrap">
    <img class="receipt-logo" src="${escapeHtml(logoSrc)}" alt="" />
  </div>
  <h1>LifeHub — Queue receipt</h1>
  <div class="row muted">${when}</div>
  <div class="row"><strong>Patient:</strong> ${escapeHtml(args.patientName)}</div>
  <div class="row"><strong>Proceed to:</strong> ${escapeHtml(args.destinationLabel)}</div>
  <div class="queue">${escapeHtml(args.queueDisplay)}</div>
  <div class="row muted" style="text-align:center">Your queue number</div>
  <div class="row" style="margin-top:16px"><strong>Transaction ID</strong></div>
  <div class="tid">${escapeHtml(args.transId.trim())}</div>
  <img class="qr" src="${qrDataUrl}" alt="QR" />
</body>
</html>`;

  const iframe = document.createElement("iframe");
  iframe.setAttribute("title", "Queue receipt print");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "none";
  iframe.style.visibility = "hidden";
  /** Use srcdoc instead of a blob URL so the browser print footer does not show a long `blob:` page link. */
  iframe.srcdoc = html;
  document.body.appendChild(iframe);
  iframe.onload = () => {
    const win = iframe.contentWindow;
    if (win != null) {
      win.focus();
      win.print();
    }
    window.setTimeout(() => {
      iframe.remove();
    }, 120_000);
  };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Loads queue slip fields by ticket id (cashier reprint). */
export async function openCashierQueueReceiptReprintByTicketId(ticketId: string): Promise<{ ok: boolean; error?: string }> {
  const id = ticketId.trim();
  if (!id) return { ok: false, error: "Missing ticket id." };
  const res = await fetch(`/api/cashier/lab-queue-ticket/reprint?ticketId=${encodeURIComponent(id)}`, { cache: "no-store" });
  const j = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
    patientName?: string;
    queueDisplay?: string;
    transId?: string;
    destinationLabel?: string;
    queueTicketId?: string;
  };
  if (!res.ok || !j.ok || !j.patientName || !j.queueDisplay || !j.transId || !j.destinationLabel) {
    return { ok: false, error: j.error ?? "Could not load queue ticket for reprint." };
  }
  await openReceptionQueueReceiptPrint({
    patientName: j.patientName,
    destinationLabel: j.destinationLabel,
    queueDisplay: j.queueDisplay,
    transId: j.transId,
    queueTicketId: j.queueTicketId ?? id,
  });
  return { ok: true };
}

/** After lab pay, when the visit already had a reception queue no., we skip auto-printing the lab slip; offer reprint on cashier home. */
export const CASHIER_LAB_QUEUE_REPRINT_SESSION_KEY = "lifehub:cashierLabQueueReprint";

export type CashierLabQueueReprintStored = {
  ticketId: string;
  queueDisplay: string;
};

export function storeCashierLabQueueReprintOffer(payload: CashierLabQueueReprintStored): void {
  try {
    if (typeof window === "undefined") return;
    const ticketId = payload.ticketId.trim();
    if (!ticketId) return;
    window.sessionStorage.setItem(
      CASHIER_LAB_QUEUE_REPRINT_SESSION_KEY,
      JSON.stringify({
        ticketId,
        queueDisplay: (payload.queueDisplay ?? "").trim(),
      } satisfies CashierLabQueueReprintStored),
    );
  } catch {
    /* ignore quota / private mode */
  }
}

export function peekCashierLabQueueReprintOffer(): CashierLabQueueReprintStored | null {
  try {
    if (typeof window === "undefined") return null;
    const raw = window.sessionStorage.getItem(CASHIER_LAB_QUEUE_REPRINT_SESSION_KEY);
    if (!raw) return null;
    const j = JSON.parse(raw) as { ticketId?: string; queueDisplay?: string };
    const ticketId = (j.ticketId ?? "").trim();
    if (!ticketId) return null;
    return { ticketId, queueDisplay: (j.queueDisplay ?? "").trim() };
  } catch {
    return null;
  }
}

export function clearCashierLabQueueReprintOffer(): void {
  try {
    if (typeof window === "undefined") return;
    window.sessionStorage.removeItem(CASHIER_LAB_QUEUE_REPRINT_SESSION_KEY);
  } catch {
    /* ignore */
  }
}
