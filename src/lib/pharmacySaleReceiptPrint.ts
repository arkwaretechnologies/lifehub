"use client";

import { resolveLifehubReceiptLogoSrc } from "@/lib/lifehubLogo";
import {
  THERMAL_RECEIPT_FONT_FACE_CSS,
  THERMAL_RECEIPT_FONT_FAMILY,
  THERMAL_RECEIPT_HEADER_LOGO_CSS,
} from "@/lib/thermalReceiptFontCss";

export type PharmacySaleReceiptLine = {
  name: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
};

export type PharmacySaleReceiptArgs = {
  orNumber: string;
  facilityName?: string;
  facilityTagline?: string;
  branchCode?: string | null;
  cashierName?: string | null;
  patientName?: string | null;
  paymentMethod: string;
  lines: PharmacySaleReceiptLine[];
  itemsGross: number;
  discountLabel?: string | null;
  discountAmount: number;
  vatAmount: number;
  totalAmount: number;
  amountTendered?: number | null;
  changeAmount?: number | null;
  soldAt?: Date;
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function money(n: number): string {
  const safe = Number.isFinite(n) ? n : 0;
  return `₱${safe.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function wrapItemName(name: string, maxLen = 32): string {
  const t = name.trim() || "Item";
  if (t.length <= maxLen) return t;
  return `${t.slice(0, maxLen - 1)}…`;
}

function formatProductLineLabel(generic: string, brand: string | null): string {
  const g = generic.trim();
  const b = brand?.trim();
  return b ? `${g} (${b})` : g;
}

/** Build display name for a POS cart line (exported for checkout snapshot). */
export function pharmacyReceiptLineFromCart(product: {
  generic_name: string;
  brand_name: string | null;
  unit_price: number;
}, qty: number): PharmacySaleReceiptLine {
  return {
    name: formatProductLineLabel(product.generic_name, product.brand_name),
    qty,
    unitPrice: product.unit_price,
    lineTotal: Math.round(qty * product.unit_price * 100) / 100,
  };
}

/**
 * Opens print dialog for an 80mm thermal pharmacy sale slip (LifeHub branding).
 */
export function openPharmacySaleReceiptPrint(args: PharmacySaleReceiptArgs): void {
  const when = (args.soldAt ?? new Date()).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });

  const facilityName = args.facilityName?.trim() || "LifeHub Medical & Diagnostic Center";
  const tagline = args.facilityTagline?.trim() || "Pharmacy";
  const logoSrc = resolveLifehubReceiptLogoSrc();
  const orNumber = args.orNumber.trim();
  const method = args.paymentMethod.trim() || "—";
  const isCash = method.toLowerCase() === "cash";

  const lineRows = args.lines
    .map((line) => {
      const name = escapeHtml(wrapItemName(line.name, 36));
      const qty = Number.isFinite(line.qty) ? line.qty : 0;
      const unit = Number.isFinite(line.unitPrice) ? line.unitPrice : 0;
      const total = Number.isFinite(line.lineTotal) ? line.lineTotal : qty * unit;
      return `
        <div class="item">
          <div class="item-name">${name}</div>
          <div class="item-row">
            <span>${qty} × ${money(unit)}</span>
            <span class="item-amt">${money(total)}</span>
          </div>
        </div>`;
    })
    .join("");

  const itemsCount = args.lines.reduce((s, l) => s + (Number.isFinite(l.qty) ? l.qty : 0), 0);

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Pharmacy sale ${escapeHtml(orNumber)}</title>
  <style>
    ${THERMAL_RECEIPT_FONT_FACE_CSS}
    @page { size: 80mm auto; margin: 0; }
    html, body { padding: 0; margin: 0; }
    body {
      width: 80mm;
      font-family: ${THERMAL_RECEIPT_FONT_FAMILY};
      color: #111;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    ${THERMAL_RECEIPT_HEADER_LOGO_CSS}
    .paper { padding: 5mm 4mm 6mm; box-sizing: border-box; }
    .center { text-align: center; }
    .title { font-weight: 800; font-size: 13px; letter-spacing: 0.02em; line-height: 1.2; }
    .sub { font-size: 10px; line-height: 1.3; color: #333; }
    .muted { color: #555; }
    .rule { border-top: 1px dashed #666; margin: 6px 0; }
    .rule-thick { border-top: 2px solid #111; margin: 8px 0 6px; }
    .kv { font-size: 10px; line-height: 1.35; margin: 2px 0; }
    .row { display: flex; justify-content: space-between; gap: 6px; font-size: 10px; line-height: 1.35; }
    .row .label { flex: 1; }
    .row .value { font-weight: 700; text-align: right; white-space: nowrap; }
    .row.total .label, .row.total .value { font-size: 12px; font-weight: 800; }
    .items-head {
      display: flex;
      justify-content: space-between;
      font-size: 9px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: #444;
      margin-bottom: 4px;
    }
    .item { margin-bottom: 6px; }
    .item-name { font-size: 10px; font-weight: 700; line-height: 1.25; word-break: break-word; }
    .item-row {
      display: flex;
      justify-content: space-between;
      font-size: 10px;
      margin-top: 1px;
    }
    .item-amt { font-weight: 700; }
    .or-box {
      text-align: center;
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.06em;
      margin: 4px 0;
    }
    .disclaimer {
      margin-top: 10px;
      padding-top: 6px;
      border-top: 1px dashed #888;
      font-size: 9px;
      line-height: 1.35;
      text-align: center;
      color: #333;
      font-weight: 700;
    }
    .thanks { font-size: 10px; text-align: center; margin-top: 6px; color: #444; }
  </style>
</head>
<body>
  <div class="paper">
    <div class="receipt-logo-wrap">
      <img class="receipt-logo" src="${escapeHtml(logoSrc)}" alt="LifeHub" />
    </div>
    <div class="center title">${escapeHtml(facilityName)}</div>
    <div class="center sub">${escapeHtml(tagline)}</div>
    ${args.branchCode ? `<div class="center sub muted">Branch: ${escapeHtml(String(args.branchCode))}</div>` : ""}

    <div class="rule"></div>

    <div class="or-box">Sale # ${escapeHtml(orNumber)}</div>
    <div class="center sub muted">${escapeHtml(when)}</div>
    ${args.cashierName ? `<div class="kv"><strong>Cashier:</strong> ${escapeHtml(args.cashierName)}</div>` : ""}
    ${args.patientName ? `<div class="kv"><strong>Patient:</strong> ${escapeHtml(args.patientName)}</div>` : ""}
    <div class="kv"><strong>Payment:</strong> ${escapeHtml(method)}</div>

    <div class="rule"></div>

    <div class="items-head">
      <span>Item (${itemsCount})</span>
      <span>Amount</span>
    </div>
    ${lineRows || '<div class="sub muted">No line items</div>'}

    <div class="rule"></div>

    <div class="row"><span class="label">Subtotal (items)</span><span class="value">${money(args.itemsGross)}</span></div>
    ${
      args.discountAmount > 0
        ? `<div class="row"><span class="label">Discount${args.discountLabel ? ` (${escapeHtml(args.discountLabel)})` : ""}</span><span class="value">−${money(args.discountAmount)}</span></div>`
        : ""
    }
    <div class="row"><span class="label">VAT (est.)</span><span class="value">${money(args.vatAmount)}</span></div>
    <div class="rule-thick"></div>
    <div class="row total"><span class="label">TOTAL DUE</span><span class="value">${money(args.totalAmount)}</span></div>
    ${
      isCash && args.amountTendered != null
        ? `<div class="row"><span class="label">Cash received</span><span class="value">${money(args.amountTendered)}</span></div>`
        : ""
    }
    ${
      isCash && args.changeAmount != null && args.changeAmount > 0
        ? `<div class="row"><span class="label">Change</span><span class="value">${money(args.changeAmount)}</span></div>`
        : ""
    }

    <div class="thanks">Thank you — get well soon!</div>
    <div class="disclaimer">
      THIS IS NOT AN OFFICIAL RECEIPT.<br />
      For BIR-registered invoice / OR, request at the pharmacy counter.
    </div>
  </div>
</body>
</html>`;

  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const iframe = document.createElement("iframe");
  iframe.setAttribute("title", "Pharmacy sale receipt print");
  iframe.style.cssText =
    "position:fixed;right:0;bottom:0;width:0;height:0;border:none;visibility:hidden;";
  iframe.src = url;
  document.body.appendChild(iframe);
  iframe.onload = () => {
    const win = iframe.contentWindow;
    if (win != null) {
      win.focus();
      win.print();
    }
    window.setTimeout(() => {
      URL.revokeObjectURL(url);
      iframe.remove();
    }, 120_000);
  };
}
