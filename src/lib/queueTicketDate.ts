/**
 * Clinic calendar date/time for visits, lab/imaging orders, cashier sales, and queue tickets.
 * Uses `NEXT_PUBLIC_QUEUE_TICKET_TIMEZONE` (or legacy `NEXT_PUBLIC_QUEUE_TICKET_DATE_TZ`), default Asia/Manila.
 */
export function clinicTimeZone(): string {
  return (
    process.env.NEXT_PUBLIC_QUEUE_TICKET_TIMEZONE?.trim() ||
    process.env.NEXT_PUBLIC_QUEUE_TICKET_DATE_TZ?.trim() ||
    "Asia/Manila"
  );
}

function clinicDateParts(date: Date): { y: string; m: string; d: string } | null {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: clinicTimeZone(),
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date);
    const y = parts.find((p) => p.type === "year")?.value ?? "";
    const m = parts.find((p) => p.type === "month")?.value ?? "";
    const d = parts.find((p) => p.type === "day")?.value ?? "";
    if (y && m && d) return { y, m, d };
  } catch {
    // fall through
  }
  return null;
}

/** Business calendar date (YYYY-MM-DD) in the clinic timezone. */
export function clinicDateYmd(date: Date = new Date()): string {
  const parts = clinicDateParts(date);
  if (parts) return `${parts.y}-${parts.m}-${parts.d}`;
  return date.toISOString().slice(0, 10);
}

/** Clock time (HH:mm:ss) in the clinic timezone for Postgres `time without time zone`. */
export function clinicTimeHms(date: Date = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: clinicTimeZone(),
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).formatToParts(date);
    const h = parts.find((p) => p.type === "hour")?.value ?? "00";
    const min = parts.find((p) => p.type === "minute")?.value ?? "00";
    const s = parts.find((p) => p.type === "second")?.value ?? "00";
    return `${h}:${min}:${s}`;
  } catch {
    const h = String(date.getHours()).padStart(2, "0");
    const min = String(date.getMinutes()).padStart(2, "0");
    const sec = String(date.getSeconds()).padStart(2, "0");
    return `${h}:${min}:${sec}`;
  }
}

/** Add calendar days to a clinic-local date (negative allowed). */
export function clinicAddDays(days: number, from: Date = new Date()): string {
  const base = clinicDateYmd(from);
  const [ys, ms, ds] = base.split("-");
  const y = Number(ys);
  const m = Number(ms);
  const d = Number(ds);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return base;
  const shifted = new Date(Date.UTC(y, m - 1, d + days, 12, 0, 0));
  return clinicDateYmd(shifted);
}

/** Today in clinic timezone — used for `queue_tickets.ticket_date` and session dates. */
export function queueTicketTodayIsoDate(): string {
  return clinicDateYmd(new Date());
}

/** `encounters.encounter_date` + `encounter_time` for a given instant (default: now). */
export function clinicEncounterDateTimeFields(date: Date = new Date()): {
  encounter_date: string;
  encounter_time: string;
} {
  return {
    encounter_date: clinicDateYmd(date),
    encounter_time: clinicTimeHms(date),
  };
}
