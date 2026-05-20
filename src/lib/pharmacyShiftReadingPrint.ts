"use client";

import { resolveLifehubReceiptLogoSrc } from "@/lib/lifehubLogo";
import type { ShiftReadingSnapshot } from "@/lib/pharmacyPosDb";
import {
  THERMAL_RECEIPT_FONT_FACE_CSS,
  THERMAL_RECEIPT_FONT_FAMILY,
  THERMAL_RECEIPT_HEADER_LOGO_CSS,
} from "@/lib/thermalReceiptFontCss";

export type PharmacyShiftReadingPrintArgs = {
  readingType: "X" | "Z";
  snapshot: ShiftReadingSnapshot;
  /** Z-reading: actual cash counted at close */
  actualCash?: number | null;
  facilityName?: string;
  facilityTagline?: string;
  branchCode?: string | null;
  cashierName?: string | null;
  terminalLabel?: string;
  printedAt?: Date;
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

function formatPaymentLabel(method: string): string {
  const m = method.trim();
  if (!m) return "Other";
  const lower = m.toLowerCase();
  if (lower === "cash" || lower === "csh") return "Cash";
  if (lower === "gcash") return "GCash";
  if (lower === "debit" || lower === "debit card") return "Debit card";
  if (lower === "credit" || lower === "credit card") return "Credit card";
  return m.charAt(0).toUpperCase() + m.slice(1);
}

function formatDateTime(iso: string | undefined, fallback = "—"): string {
  if (!iso) return fallback;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return fallback;
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function row(label: string, value: string, className = "row"): string {
  return `<div class="${className}"><span class="label">${escapeHtml(label)}</span><span class="value">${value}</span></div>`;
}

function sectionTitle(title: string): string {
  return `<div class="section-title">${escapeHtml(title)}</div>`;
}

/** Opens print dialog for an 80mm thermal X/Z reading slip (LifeHub branding). */
export function openPharmacyShiftReadingPrint(args: PharmacyShiftReadingPrintArgs): void {
  const snap = args.snapshot;
  const isZ = args.readingType === "Z";
  const title = isZ ? "Z-READING" : "X-READING";
  const when = (args.printedAt ?? new Date()).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });

  const facilityName = args.facilityName?.trim() || "LifeHub Medical & Diagnostic Center";
  const tagline = args.facilityTagline?.trim() || "Pharmacy POS";
  const terminal = args.terminalLabel?.trim() || "Pharmacy POS Terminal";
  const logoSrc = resolveLifehubReceiptLogoSrc();
  const shiftRef = snap.shiftId.slice(0, 8).toUpperCase();

  const expected = snap.expectedCashDrawer ?? null;
  const actual =
    args.actualCash != null && Number.isFinite(args.actualCash) ? args.actualCash : null;
  let variance: number | null = null;
  if (expected != null && actual != null) {
    variance = Math.round((actual - expected) * 100) / 100;
  }

  const discount = snap.discountAmount ?? 0;
  const subtotal = snap.subtotal ?? snap.grossSales;
  const vatAmount = snap.vatAmount ?? 0;
  const voidCount = snap.voidTransactionCount ?? 0;
  const voidAmt = snap.voidAmount ?? 0;

  const paymentEntries = Object.entries(snap.paymentBreakdown || {}).sort(([a], [b]) => {
    const al = a.toLowerCase();
    const bl = b.toLowerCase();
    const aCash = al === "cash" || al === "csh";
    const bCash = bl === "cash" || bl === "csh";
    if (aCash && !bCash) return -1;
    if (!aCash && bCash) return 1;
    return formatPaymentLabel(a).localeCompare(formatPaymentLabel(b));
  });

  const paymentRows = paymentEntries
    .map(([method, amt]) => row(formatPaymentLabel(method), money(Number(amt) || 0)))
    .join("");

  const varianceLabel =
    variance == null ? "Over / (Short)" : variance > 0 ? "Over" : variance < 0 ? "(Short)" : "Balanced";
  const varianceDisplay =
    variance == null
      ? "—"
      : variance === 0
        ? money(0)
        : `${variance > 0 ? "+" : "−"}${money(Math.abs(variance)).slice(1)}`;

  const closedAtDisplay = isZ
    ? formatDateTime(snap.closedAt, formatDateTime(new Date().toISOString()))
    : "OPEN";

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)} · Shift ${escapeHtml(shiftRef)}</title>
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
    .report-banner {
      text-align: center;
      font-size: 12px;
      font-weight: 800;
      letter-spacing: 0.12em;
      margin: 6px 0 4px;
    }
    .report-sub {
      text-align: center;
      font-size: 9px;
      color: #444;
      margin-bottom: 4px;
    }
    .section-title {
      font-size: 9px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: #444;
      margin: 8px 0 4px;
    }
    .row {
      display: flex;
      justify-content: space-between;
      gap: 6px;
      font-size: 10px;
      line-height: 1.4;
    }
    .row .label { flex: 1; }
    .row .value { font-weight: 700; text-align: right; white-space: nowrap; }
    .row.bold .label, .row.bold .value { font-weight: 800; }
    .row.emphasis .value { font-size: 11px; }
    .footer-banner {
      text-align: center;
      font-size: 10px;
      font-weight: 800;
      letter-spacing: 0.06em;
      margin-top: 8px;
    }
    .disclaimer {
      margin-top: 8px;
      padding-top: 6px;
      border-top: 1px dashed #888;
      font-size: 8px;
      line-height: 1.35;
      text-align: center;
      color: #444;
    }
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

    <div class="report-banner">${escapeHtml(title)}</div>
    <div class="report-sub">${isZ ? "End of shift · Daily close" : "Interim report · Shift remains open"}</div>

    ${sectionTitle("Report information")}
    ${row("Report date", escapeHtml(when))}
    ${row("Terminal", escapeHtml(terminal))}
    ${args.cashierName ? row("Cashier", escapeHtml(args.cashierName)) : ""}
    ${row("Shift ref.", escapeHtml(shiftRef))}

    ${sectionTitle("Shift period")}
    ${row("Opened", escapeHtml(formatDateTime(snap.openedAt)))}
    ${row(isZ ? "Closed" : "Status", escapeHtml(closedAtDisplay))}

    <div class="rule"></div>

    ${sectionTitle("Official receipts (sales)")}
    ${row("Beginning OR", escapeHtml(snap.beginningOr ?? "—"))}
    ${row("Ending OR", escapeHtml(snap.endingOr ?? "—"))}
    ${row("No. of transactions", String(snap.transactionCount))}
    ${
      voidCount > 0
        ? `${row("Void transactions", String(voidCount))}${row("Void amount", money(voidAmt))}`
        : ""
    }

    ${sectionTitle("Sales summary")}
    ${row("Gross sales", money(snap.grossSales))}
    ${discount > 0 ? row("Less: discounts", `−${money(discount).slice(1)}`) : ""}
    ${row("Net sales (subtotal)", money(subtotal))}
    ${row("VAT amount", money(vatAmount))}
    ${row("Cash sales", money(snap.cashSales))}
    ${row("Non-cash sales", money(snap.nonCashSales))}

    ${sectionTitle("Payment breakdown")}
    ${paymentRows || row("—", "No sales")}

    <div class="rule-thick"></div>

    ${sectionTitle("Cash accountability")}
    ${row("Beginning cash", money(snap.beginningCash))}
    ${row("Expected in drawer", expected != null ? money(expected) : "—")}
    ${
      isZ
        ? `${row("Actual cash counted", actual != null ? money(actual) : "—", "row bold")}${row(varianceLabel, escapeHtml(varianceDisplay), "row emphasis")}`
        : row("Actual cash", "— (Z-reading only)")
    }

    <div class="rule"></div>

    <div class="footer-banner">${isZ ? "END OF SHIFT" : "SHIFT STILL OPEN — NOT END OF DAY"}</div>
    <div class="disclaimer">
      Internal pharmacy POS reading for shift control.<br />
      This is not a BIR-registered sales invoice / OR.
    </div>
  </div>
</body>
</html>`;

  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const iframe = document.createElement("iframe");
  iframe.setAttribute("title", `${title} print`);
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
