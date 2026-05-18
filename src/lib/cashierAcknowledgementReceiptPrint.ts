"use client";

import {
  THERMAL_RECEIPT_FONT_FACE_CSS,
  THERMAL_RECEIPT_FONT_FAMILY,
  THERMAL_RECEIPT_HEADER_LOGO_CSS,
  resolveThermalReceiptLogoSrc,
} from "@/lib/thermalReceiptFontCss";
import { openThermalPrintHtml } from "@/lib/thermalPrintIframe";

export type CashierAcknowledgementPaymentLine = {
  label: string;
  amount: number;
};

export type CashierAcknowledgementReceiptArgs = {
  facilityName: string;
  facilityAddressLines: string[];
  facilityContactLine?: string;
  facilityEmailLine?: string;

  customerName: string;
  customerAddress: string;

  transId?: string;
  orNumber?: string;
  paymentMethodLabel?: string;
  /** Line items for this payment (e.g. consultation + lab, or per-test rows). */
  paymentLines?: CashierAcknowledgementPaymentLine[];

  subtotal?: number;
  discountAmount?: number;
  totalDue?: number;
  amountTendered?: number | null;
  changeAmount?: number | null;
};

/**
 * Opens a print dialog for an 80mm acknowledgement receipt after payment.
 * Uses a simple fixed-width layout suitable for thermal printers.
 */
export async function openCashierAcknowledgementReceiptPrint(args: CashierAcknowledgementReceiptArgs): Promise<void> {
  const when = new Date().toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });

  const money = (n: number | null | undefined): string => {
    const v = typeof n === "number" ? n : Number(String(n ?? ""));
    const safe = Number.isFinite(v) ? v : 0;
    return safe.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const facilityAddress = (args.facilityAddressLines ?? []).map((x) => String(x ?? "").trim()).filter(Boolean);
  const customerName = String(args.customerName ?? "").trim() || "Customer";
  const customerAddress = String(args.customerAddress ?? "").trim() || "—";
  const transId = String(args.transId ?? "").trim();
  const orNumber = String(args.orNumber ?? "").trim();
  const method = String(args.paymentMethodLabel ?? "").trim();

  const subtotal = typeof args.subtotal === "number" && Number.isFinite(args.subtotal) ? args.subtotal : null;
  const discount = typeof args.discountAmount === "number" && Number.isFinite(args.discountAmount) ? args.discountAmount : null;
  const totalDue = typeof args.totalDue === "number" && Number.isFinite(args.totalDue) ? args.totalDue : null;

  const tendered =
    args.amountTendered == null || !Number.isFinite(Number(args.amountTendered)) ? null : Number(args.amountTendered);
  const change =
    args.changeAmount == null || !Number.isFinite(Number(args.changeAmount)) ? null : Number(args.changeAmount);

  const logoSrc = resolveThermalReceiptLogoSrc();

  const paymentLines = (args.paymentLines ?? []).filter((l) => String(l.label ?? "").trim() !== "");
  const paymentLinesHtml =
    paymentLines.length > 0
      ? `<div class="kv" style="margin-top:4px"><strong>Payment details</strong></div>${paymentLines
          .map(
            (l) =>
              `<div class="row"><div class="label">${escapeHtml(String(l.label).trim())}</div><div class="value">${money(l.amount)}</div></div>`,
          )
          .join("")}`
      : "";

  let transIdQrDataUrl = "";
  if (transId) {
    const QRCode = (await import("qrcode")).default;
    transIdQrDataUrl = await QRCode.toDataURL(transId, {
      width: 180,
      margin: 1,
      errorCorrectionLevel: "M",
      color: { dark: "#000000", light: "#FFFFFF" },
    });
  }

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Acknowledgement Receipt</title>
  <style>
    ${THERMAL_RECEIPT_FONT_FACE_CSS}
    @page { size: 80mm auto; margin: 0; }
    html, body { padding: 0; margin: 0; }
    body {
      width: 80mm;
      font-family: ${THERMAL_RECEIPT_FONT_FAMILY};
      color: #111;
    }
    ${THERMAL_RECEIPT_HEADER_LOGO_CSS}
    .paper { padding: 6mm 5mm; }
    .center { text-align: center; }
    .title { font-weight: 800; font-size: 14px; letter-spacing: 0.02em; }
    .sub { font-size: 11px; line-height: 1.25; }
    .muted { color: #444; }
    .rule { border-top: 1px dashed #666; margin: 8px 0; }
    .row { display: flex; justify-content: space-between; gap: 8px; }
    .label { font-size: 11px; color: #222; }
    .value { font-size: 11px; font-weight: 700; text-align: right; }
    .kv { font-size: 11px; line-height: 1.25; }
    .mono { font-family: ${THERMAL_RECEIPT_FONT_FAMILY}; }
    .foot { margin-top: 10px; font-size: 10px; color: #444; text-align: center; }
    .qr { width: 120px; height: 120px; display: block; margin: 8px auto 0; }
  </style>
</head>
<body>
  <div class="paper">
    <div class="receipt-logo-wrap">
      <img class="receipt-logo" src="${escapeHtml(logoSrc)}" alt="" />
    </div>
    <div class="center title">${escapeHtml(args.facilityName)}</div>
    ${facilityAddress.map((l) => `<div class="center sub">${escapeHtml(l)}</div>`).join("")}
    ${args.facilityContactLine ? `<div class="center sub muted">${escapeHtml(args.facilityContactLine)}</div>` : ""}
    ${args.facilityEmailLine ? `<div class="center sub muted">${escapeHtml(args.facilityEmailLine)}</div>` : ""}

    <div class="rule"></div>

    <div class="kv"><strong>Customer Name:</strong> ${escapeHtml(customerName)}</div>
    <div class="kv"><strong>Address:</strong> ${escapeHtml(customerAddress)}</div>

    <div class="rule"></div>

    <div class="kv muted">${escapeHtml(when)}</div>
    ${orNumber ? `<div class="kv"><strong>Receipt No.:</strong> <span class="mono">${escapeHtml(orNumber)}</span></div>` : ""}
    ${method ? `<div class="kv"><strong>Payment Method:</strong> ${escapeHtml(method)}</div>` : ""}

    ${paymentLinesHtml ? `<div class="rule"></div>${paymentLinesHtml}` : ""}

    ${(subtotal != null || discount != null || totalDue != null) ? `<div class="rule"></div>` : ""}

    ${subtotal != null ? `<div class="row"><div class="label">Subtotal</div><div class="value">${money(subtotal)}</div></div>` : ""}
    ${discount != null && discount > 0 ? `<div class="row"><div class="label">Discount</div><div class="value">-${money(discount)}</div></div>` : ""}
    ${totalDue != null ? `<div class="row"><div class="label"><strong>Grand total</strong></div><div class="value"><strong>${money(totalDue)}</strong></div></div>` : ""}
    ${tendered != null ? `<div class="row"><div class="label">Amount tendered</div><div class="value">${money(tendered)}</div></div>` : ""}
    ${change != null ? `<div class="row"><div class="label">Change</div><div class="value">${money(change)}</div></div>` : ""}

    <div class="rule"></div>
    ${transIdQrDataUrl ? `<div class="center" style="margin-top:6px"><img class="qr" src="${transIdQrDataUrl}" alt="" /></div>` : ""}
    <div class="foot">Acknowledgement Receipt</div>
  </div>
</body>
</html>`;

  await openThermalPrintHtml(html, "Acknowledgement Receipt print");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

