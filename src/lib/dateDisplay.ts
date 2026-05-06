/**
 * User-facing dates as mm-dd-yyyy. Storage and HTML `type="date"` inputs stay yyyy-mm-dd.
 */

function parseIsoDatePart(s: string): { y: number; m: number; d: number } | null {
  const t = s.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return null;
  const [ys, ms, ds] = t.split("-");
  const y = Number(ys);
  const m = Number(ms);
  const d = Number(ds);
  if (!Number.isFinite(y) || m < 1 || m > 12 || d < 1 || d > 31) return null;
  return { y, m, d };
}

/** Render a date string (typically yyyy-mm-dd from the DB) as mm-dd-yyyy. */
export function formatDateMMDDYYYY(value: string | null | undefined): string {
  if (value == null || String(value).trim() === "") return "";
  const p = parseIsoDatePart(String(value));
  if (!p) return "";
  const mm = String(p.m).padStart(2, "0");
  const dd = String(p.d).padStart(2, "0");
  return `${mm}-${dd}-${p.y}`;
}

/** Leading yyyy-mm-dd for HTML `type="date"` and API date fields. */
export function isoDateFromUnknown(value: string | null | undefined): string {
  if (value == null || String(value).trim() === "") return "";
  const s = String(value).trim();
  return s.length >= 10 ? s.slice(0, 10) : s;
}

/** Lab request clock time (`HH:mm` if parseable); otherwise em dash when empty. */
export function formatLabTime(value: string | null | undefined): string {
  if (value == null || String(value).trim() === "") return "—";
  const s = String(value);
  if (s.length >= 5 && s[4] === ":") return s.slice(0, 5);
  const m = s.match(/(\d{1,2}:\d{2})/);
  return m?.[1] ?? "—";
}
