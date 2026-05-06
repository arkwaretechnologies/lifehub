/**
 * Business calendar date (YYYY-MM-DD) for `queue_tickets.ticket_date` and `queue_sessions.session_date`.
 * Kiosk / queuing apps typically use a clinic timezone (e.g. Asia/Manila), not UTC — keep this in sync
 * with how tickets are issued. Override with `NEXT_PUBLIC_QUEUE_TICKET_TIMEZONE` (IANA, e.g. `Asia/Manila`).
 */
export function queueTicketTodayIsoDate(): string {
  const tz = process.env.NEXT_PUBLIC_QUEUE_TICKET_TIMEZONE?.trim() || "Asia/Manila";
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date());
    const y = parts.find((p) => p.type === "year")?.value ?? "";
    const m = parts.find((p) => p.type === "month")?.value ?? "";
    const d = parts.find((p) => p.type === "day")?.value ?? "";
    if (y && m && d) return `${y}-${m}-${d}`;
  } catch {
    /* fall through */
  }
  return new Date().toISOString().slice(0, 10);
}
