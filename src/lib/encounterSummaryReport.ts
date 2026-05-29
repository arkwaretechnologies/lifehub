export type EncounterSummaryPeriod = "today" | "week" | "month" | "custom";

export type EncounterSummaryStatusRow = {
  label: string;
  count: number;
};

export type EncounterSummaryDepartmentRow = {
  label: string;
  count: number;
};

export type EncounterSummaryRange = {
  startDate: string;
  endDate: string;
};

export type EncounterSummaryResponse = {
  period: EncounterSummaryPeriod;
  range: EncounterSummaryRange;
  totalEncounters: number;
  uniquePatients: number;
  statusBreakdown: EncounterSummaryStatusRow[];
  departmentBreakdown: EncounterSummaryDepartmentRow[];
  error: string | null;
  cacheHit?: boolean;
};

function localYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseYmd(raw: string | null | undefined): string | null {
  const s = String(raw ?? "").trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return s;
}

function weekStartMonday(today: Date): Date {
  const d = new Date(today);
  d.setHours(0, 0, 0, 0);
  const dow = d.getDay();
  const offset = dow === 0 ? 6 : dow - 1;
  d.setDate(d.getDate() - offset);
  return d;
}

export function resolveEncounterSummaryRange(
  periodRaw: string | null | undefined,
  startRaw: string | null | undefined,
  endRaw: string | null | undefined,
): { period: EncounterSummaryPeriod; range: EncounterSummaryRange; error: string | null } {
  const raw = String(periodRaw ?? "").trim().toLowerCase();
  const period: EncounterSummaryPeriod =
    raw === "today" || raw === "week" || raw === "month" || raw === "custom" ? raw : "today";

  const now = new Date();
  now.setHours(0, 0, 0, 0);

  if (period === "today") {
    const ymd = localYmd(now);
    return { period, range: { startDate: ymd, endDate: ymd }, error: null };
  }

  if (period === "week") {
    const start = weekStartMonday(now);
    return { period, range: { startDate: localYmd(start), endDate: localYmd(now) }, error: null };
  }

  if (period === "month") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return { period, range: { startDate: localYmd(start), endDate: localYmd(now) }, error: null };
  }

  const start = parseYmd(startRaw);
  const end = parseYmd(endRaw);
  if (!start || !end) {
    const ymd = localYmd(now);
    return {
      period,
      range: { startDate: ymd, endDate: ymd },
      error: "Custom range requires valid start and end dates (yyyy-mm-dd).",
    };
  }
  if (start > end) {
    return {
      period,
      range: { startDate: start, endDate: end },
      error: "Start date must be on or before end date.",
    };
  }

  return { period, range: { startDate: start, endDate: end }, error: null };
}

export function encounterSummaryCacheKey(
  period: EncounterSummaryPeriod,
  range: EncounterSummaryRange,
): string {
  return `report:encounter-summary:v1:${period}:${range.startDate}:${range.endDate}`;
}
