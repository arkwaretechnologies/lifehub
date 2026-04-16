"use client";

export type ReceptionQueueReceiptArgs = {
  patientName: string;
  destinationLabel: string;
  queueDisplay: string;
  transId: string;
};

/**
 * Opens a print dialog with queue slip: patient, destination, queue number, trans_id, QR (UUID text).
 */
export async function openReceptionQueueReceiptPrint(args: ReceptionQueueReceiptArgs): Promise<void> {
  const QRCode = (await import("qrcode")).default;
  const qrDataUrl = await QRCode.toDataURL(args.transId.trim(), {
    width: 200,
    margin: 1,
    errorCorrectionLevel: "M",
  });

  const when = new Date().toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Queue receipt</title>
  <style>
    body { font-family: system-ui, Segoe UI, Roboto, sans-serif; padding: 24px; max-width: 400px; margin: 0 auto; color: #1a1a2e; }
    h1 { font-size: 1rem; letter-spacing: 0.08em; text-transform: uppercase; color: #1f4e79; margin: 0 0 16px; text-align: center; }
    .queue { font-size: 2rem; font-weight: 800; text-align: center; margin: 12px 0; font-variant-numeric: tabular-nums; }
    .muted { color: #666; font-size: 0.85rem; }
    .row { margin: 8px 0; }
    .tid { font-family: ui-monospace, monospace; font-size: 0.75rem; word-break: break-all; }
    .qr { display: block; margin: 20px auto 0; width: 200px; height: 200px; }
  </style>
</head>
<body>
  <h1>LifeHub — Queue receipt</h1>
  <div class="row muted">${when}</div>
  <div class="row"><strong>Patient:</strong> ${escapeHtml(args.patientName)}</div>
  <div class="row"><strong>Proceed to:</strong> ${escapeHtml(args.destinationLabel)}</div>
  <div class="queue">${escapeHtml(args.queueDisplay)}</div>
  <div class="row muted" style="text-align:center">Your queue number</div>
  <div class="row" style="margin-top:16px"><strong>Transaction ID</strong></div>
  <div class="tid">${escapeHtml(args.transId.trim())}</div>
  <img class="qr" src="${qrDataUrl}" alt="QR" />
  <script>window.onload = function () { window.print(); };</script>
</body>
</html>`;

  const w = window.open("", "_blank", "noopener,noreferrer,width=420,height=640");
  if (!w) return;
  w.document.write(html);
  w.document.close();
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
