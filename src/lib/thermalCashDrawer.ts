"use client";

/** ESC/POS pulse drawer kick (pin 2) — typical for POS-80 / Epson thermal printers. */
export const ESC_POS_DRAWER_KICK = "\x1B\x70\x00\x19\xFA";

export function isThermalCashDrawerEnabled(): boolean {
  return process.env.NEXT_PUBLIC_THERMAL_CASH_DRAWER_DISABLED !== "1";
}

/** Hidden line sent with the receipt print job so the thermal driver can pulse the drawer. */
export function thermalCashDrawerKickPrintHtml(): string {
  return `<pre class="drawer-kick" style="font-size:1px;line-height:1px;margin:0;padding:0;height:1px;overflow:hidden;color:transparent;white-space:pre">${ESC_POS_DRAWER_KICK}</pre>`;
}
