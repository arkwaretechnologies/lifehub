"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import SmsOutlinedIcon from "@mui/icons-material/SmsOutlined";
import {
  Alert,
  alpha,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Snackbar,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from "@mui/material";
import { authenticatedFetch } from "@/lib/authenticatedFetch";
import { formatDateMMDDYYYY } from "@/lib/dateDisplay";
import { clinicDateYmd, clinicTimeZone } from "@/lib/queueTicketDate";
import type { FollowUpDayRow, FollowUpMonthDayCount } from "@/lib/receptionFollowUps";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function buildCalendarCells(firstWeekday0: number, daysInMonth: number): (number | null)[] {
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstWeekday0; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function parseYmd(ymd: string): { y: number; m: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return { y, m: mo, d };
}

function yearMonthFromYmd(ymd: string): string {
  return ymd.slice(0, 7);
}

function ymdFromParts(y: number, m: number, d: number): string {
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

function shiftYearMonth(yearMonth: string, deltaMonths: number): string {
  const [ys, ms] = yearMonth.split("-");
  const y0 = Number(ys);
  const m0 = Number(ms);
  const idx = y0 * 12 + (m0 - 1) + deltaMonths;
  const y = Math.floor(idx / 12);
  const m = (idx % 12) + 1;
  return `${y}-${pad2(m)}`;
}

function monthMeta(yearMonth: string): {
  label: string;
  firstWeekday0: number;
  daysInMonth: number;
  y: number;
  m: number;
} | null {
  const parts = /^(\d{4})-(\d{2})$/.exec(yearMonth);
  if (!parts) return null;
  const y = Number(parts[1]);
  const m = Number(parts[2]);
  if (!Number.isFinite(y) || m < 1 || m > 12) return null;
  const first = new Date(Date.UTC(y, m - 1, 1, 12, 0, 0));
  const firstWeekday0 = first.getUTCDay();
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const label = new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(first);
  return { label, firstWeekday0, daysInMonth, y, m };
}

function formatEncounterTime(t: string | null | undefined): string {
  if (t == null || String(t).trim() === "") return "";
  const s = String(t).trim();
  if (s.length >= 5 && s[2] === ":") return s.slice(0, 5);
  const m = s.match(/(\d{1,2}:\d{2})/);
  return m?.[1] ?? "";
}

export default function ReceptionFollowUpCalendar() {
  const todayYmd = useMemo(() => clinicDateYmd(new Date()), []);
  const [visibleMonth, setVisibleMonth] = useState(() => yearMonthFromYmd(todayYmd));
  const [selectedDate, setSelectedDate] = useState(todayYmd);

  const [monthDays, setMonthDays] = useState<FollowUpMonthDayCount[]>([]);
  const [monthLoading, setMonthLoading] = useState(true);
  const [monthError, setMonthError] = useState("");

  const [rows, setRows] = useState<FollowUpDayRow[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState("");

  const [smsTarget, setSmsTarget] = useState<FollowUpDayRow | null>(null);
  const [smsBusyTransId, setSmsBusyTransId] = useState<string | null>(null);
  const [toastOpen, setToastOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [toastSeverity, setToastSeverity] = useState<"success" | "error">("success");

  const meta = useMemo(() => monthMeta(visibleMonth), [visibleMonth]);
  const cells = useMemo(() => {
    if (!meta) return [];
    return buildCalendarCells(meta.firstWeekday0, meta.daysInMonth);
  }, [meta]);

  const countByDate = useMemo(() => {
    const map = new Map<string, number>();
    for (const d of monthDays) map.set(d.date, d.count);
    return map;
  }, [monthDays]);

  const loadMonth = useCallback(async (yearMonth: string) => {
    setMonthLoading(true);
    setMonthError("");
    try {
      const res = await authenticatedFetch(
        `/api/reception/follow-ups?month=${encodeURIComponent(yearMonth)}`,
        { cache: "no-store" }
      );
      const json = (await res.json().catch(() => ({}))) as {
        days?: FollowUpMonthDayCount[];
        error?: string;
      };
      if (!res.ok) {
        setMonthDays([]);
        setMonthError(json.error ?? `Failed to load month (${res.status})`);
        return;
      }
      setMonthDays(Array.isArray(json.days) ? json.days : []);
    } catch {
      setMonthDays([]);
      setMonthError("Failed to load follow-up month summary.");
    } finally {
      setMonthLoading(false);
    }
  }, []);

  const loadDay = useCallback(async (date: string) => {
    setListLoading(true);
    setListError("");
    try {
      const res = await authenticatedFetch(
        `/api/reception/follow-ups?date=${encodeURIComponent(date)}`,
        { cache: "no-store" }
      );
      const json = (await res.json().catch(() => ({}))) as {
        rows?: FollowUpDayRow[];
        error?: string;
      };
      if (!res.ok) {
        setRows([]);
        setListError(json.error ?? `Failed to load follow-ups (${res.status})`);
        return;
      }
      setRows(Array.isArray(json.rows) ? json.rows : []);
    } catch {
      setRows([]);
      setListError("Failed to load follow-up patients.");
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMonth(visibleMonth);
  }, [visibleMonth, loadMonth]);

  useEffect(() => {
    void loadDay(selectedDate);
  }, [selectedDate, loadDay]);

  const goPrevMonth = () => setVisibleMonth((m) => shiftYearMonth(m, -1));
  const goNextMonth = () => setVisibleMonth((m) => shiftYearMonth(m, 1));

  const onSelectDay = (day: number) => {
    if (!meta) return;
    const ymd = ymdFromParts(meta.y, meta.m, day);
    setSelectedDate(ymd);
  };

  const showToast = (message: string, severity: "success" | "error") => {
    setToastMessage(message);
    setToastSeverity(severity);
    setToastOpen(true);
  };

  const sendFollowUpSms = async (row: FollowUpDayRow) => {
    setSmsBusyTransId(row.transId);
    try {
      const res = await authenticatedFetch("/api/reception/follow-up-sms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ encounterId: row.transId }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        showToast(json.error ?? `Failed to send SMS (${res.status})`, "error");
        return;
      }
      showToast(`SMS sent to ${row.patientName}.`, "success");
    } catch {
      showToast("Failed to send SMS.", "error");
    } finally {
      setSmsBusyTransId(null);
      setSmsTarget(null);
    }
  };

  const selectedParsed = parseYmd(selectedDate);
  const selectedLabel = formatDateMMDDYYYY(selectedDate) || selectedDate;

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1200, mx: "auto" }}>
      <Typography variant="h5" fontWeight={800} sx={{ letterSpacing: "-0.02em", mb: 0.5 }}>
        Follow-up calendar
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Select a date to see patients scheduled for follow-up ({clinicTimeZone()}).
      </Typography>

      <Stack spacing={3}>
        <Box
          sx={{
            border: "1px solid",
            borderColor: "divider",
            borderRadius: 2,
            p: { xs: 2, md: 3 },
            bgcolor: "background.paper",
          }}
        >
          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
            <IconButton aria-label="Previous month" onClick={goPrevMonth} size="small">
              <ChevronLeftIcon />
            </IconButton>
            <Typography variant="h6" fontWeight={700}>
              {meta?.label ?? visibleMonth}
            </Typography>
            <IconButton aria-label="Next month" onClick={goNextMonth} size="small">
              <ChevronRightIcon />
            </IconButton>
          </Stack>

          {monthError ? (
            <Alert severity="error" sx={{ mb: 2 }}>
              {monthError}
            </Alert>
          ) : null}

          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: "repeat(7, 1fr)",
              gap: { xs: 0.5, md: 1 },
              position: "relative",
            }}
          >
            {WEEKDAYS.map((d) => (
              <Typography
                key={d}
                variant="caption"
                color="text.secondary"
                fontWeight={700}
                sx={{ textAlign: "center", py: 1, letterSpacing: "0.04em" }}
              >
                {d}
              </Typography>
            ))}
            {cells.map((day, idx) => {
              if (day == null) {
                return <Box key={`empty-${idx}`} sx={{ minHeight: { xs: 56, md: 88 } }} />;
              }
              const ymd = meta ? ymdFromParts(meta.y, meta.m, day) : "";
              const count = countByDate.get(ymd) ?? 0;
              const isSelected = selectedDate === ymd;
              const isToday = todayYmd === ymd;
              return (
                <Box
                  key={ymd}
                  component="button"
                  type="button"
                  onClick={() => onSelectDay(day)}
                  sx={{
                    minHeight: { xs: 56, md: 88 },
                    border: "1px solid",
                    borderColor: isSelected ? "info.main" : "divider",
                    borderRadius: 1.5,
                    bgcolor: isSelected ? alpha("#0D5BD7", 0.08) : "background.paper",
                    cursor: "pointer",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "flex-start",
                    justifyContent: "space-between",
                    p: { xs: 0.75, md: 1.25 },
                    textAlign: "left",
                    transition: "border-color 0.15s ease, background-color 0.15s ease",
                    "&:hover": {
                      borderColor: "info.main",
                      bgcolor: alpha("#0D5BD7", 0.04),
                    },
                  }}
                >
                  <Typography
                    fontWeight={isToday || isSelected ? 800 : 600}
                    sx={{
                      fontSize: { xs: 14, md: 18 },
                      color: isToday ? "info.main" : "text.primary",
                      lineHeight: 1.2,
                    }}
                  >
                    {day}
                  </Typography>
                  {count > 0 ? (
                    <Box
                      sx={{
                        mt: 0.5,
                        px: 0.75,
                        py: 0.15,
                        borderRadius: 999,
                        bgcolor: isSelected ? "info.main" : alpha("#1F4E79", 0.12),
                        color: isSelected ? "info.contrastText" : "text.secondary",
                        fontSize: 11,
                        fontWeight: 700,
                        lineHeight: 1.4,
                      }}
                    >
                      {count}
                    </Box>
                  ) : (
                    <Box sx={{ height: 18 }} />
                  )}
                </Box>
              );
            })}
            {monthLoading ? (
              <Box
                sx={{
                  position: "absolute",
                  inset: 0,
                  display: "grid",
                  placeItems: "center",
                  bgcolor: alpha("#fff", 0.55),
                  borderRadius: 1,
                }}
              >
                <CircularProgress size={28} />
              </Box>
            ) : null}
          </Box>
        </Box>

        <Box
          sx={{
            border: "1px solid",
            borderColor: "divider",
            borderRadius: 2,
            p: { xs: 2, md: 3 },
            bgcolor: "background.paper",
          }}
        >
          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
            <Box>
              <Typography variant="h6" fontWeight={700}>
                Follow-ups on {selectedLabel}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {listLoading
                  ? "Loading…"
                  : rows.length === 0
                    ? "No patients scheduled for this day."
                    : `${rows.length} patient${rows.length === 1 ? "" : "s"}`}
              </Typography>
            </Box>
            {listLoading ? <CircularProgress size={22} /> : null}
          </Stack>

          {listError ? (
            <Alert severity="error" sx={{ mb: 2 }}>
              {listError}
            </Alert>
          ) : null}

          {!listLoading && !listError && rows.length === 0 ? (
            <Typography color="text.secondary" sx={{ py: 2 }}>
              Click another date on the calendar, or check that follow-up dates were set in consultation.
            </Typography>
          ) : null}

          {rows.length > 0 ? (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700 }}>Patient</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Patient #</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Contact</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Source visit</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Queue</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Chief complaint</TableCell>
                    <TableCell sx={{ fontWeight: 700 }} align="right">
                      Actions
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rows.map((row) => {
                    const visitBits = [
                      formatDateMMDDYYYY(row.sourceEncounterDate) || row.sourceEncounterDate,
                      formatEncounterTime(row.encounterTime),
                    ]
                      .filter(Boolean)
                      .join(" · ");
                    const busy = smsBusyTransId === row.transId;
                    const noPhone = !row.contactNo;
                    return (
                      <TableRow key={row.transId} hover>
                        <TableCell sx={{ fontWeight: 600 }}>{row.patientName}</TableCell>
                        <TableCell>{row.patientId}</TableCell>
                        <TableCell>{row.contactNo || "—"}</TableCell>
                        <TableCell>{visitBits || "—"}</TableCell>
                        <TableCell>{row.queueNo || "—"}</TableCell>
                        <TableCell sx={{ maxWidth: 280 }}>
                          {row.chiefComplaint || "—"}
                        </TableCell>
                        <TableCell align="right">
                          <Tooltip
                            title={noPhone ? "Patient has no contact number" : "Send follow-up SMS"}
                          >
                            <span>
                              <Button
                                size="small"
                                variant="outlined"
                                disabled={noPhone || busy || smsBusyTransId != null}
                                startIcon={
                                  busy ? (
                                    <CircularProgress size={14} color="inherit" />
                                  ) : (
                                    <SmsOutlinedIcon fontSize="small" />
                                  )
                                }
                                onClick={() => setSmsTarget(row)}
                              >
                                SMS
                              </Button>
                            </span>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          ) : null}

          {selectedParsed == null ? (
            <Alert severity="warning" sx={{ mt: 2 }}>
              Invalid selected date.
            </Alert>
          ) : null}
        </Box>
      </Stack>

      <Dialog
        open={smsTarget != null}
        onClose={() => {
          if (smsBusyTransId == null) setSmsTarget(null);
        }}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Send follow-up SMS</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            Send a follow-up reminder to{" "}
            <strong>{smsTarget?.patientName ?? "this patient"}</strong>
            {smsTarget?.contactNo ? (
              <>
                {" "}
                at <strong>{smsTarget.contactNo}</strong>
              </>
            ) : null}
            {smsTarget?.followUpDate ? (
              <>
                {" "}
                for{" "}
                <strong>
                  {formatDateMMDDYYYY(smsTarget.followUpDate) || smsTarget.followUpDate}
                </strong>
              </>
            ) : null}
            ?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setSmsTarget(null)}
            disabled={smsBusyTransId != null}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            disabled={smsTarget == null || smsBusyTransId != null}
            onClick={() => {
              if (smsTarget) void sendFollowUpSms(smsTarget);
            }}
            startIcon={
              smsBusyTransId != null ? (
                <CircularProgress size={16} color="inherit" />
              ) : (
                <SmsOutlinedIcon />
              )
            }
          >
            Send SMS
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={toastOpen}
        autoHideDuration={4000}
        onClose={() => setToastOpen(false)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert
          onClose={() => setToastOpen(false)}
          severity={toastSeverity}
          variant="filled"
          sx={{ width: "100%" }}
        >
          {toastMessage}
        </Alert>
      </Snackbar>
    </Box>
  );
}
