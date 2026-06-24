"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Divider,
  Grid,
  Stack,
  Typography,
} from "@mui/material";
import RefreshOutlinedIcon from "@mui/icons-material/RefreshOutlined";
import { authenticatedFetch } from "@/lib/authenticatedFetch";
import type { ConsultationLabReportApiKey } from "@/lib/reportsNavLeaves";
import { DatePickerField } from "@/components/DatePickerField";
import { filterToolbarButtonSx } from "@/components/fieldInputStyles";

type Props = {
  reportKey: ConsultationLabReportApiKey;
  title: string;
};

type DatePeriod = "today" | "week" | "month" | "custom";

function localYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function weekStartMonday(today: Date): Date {
  const d = new Date(today);
  d.setHours(0, 0, 0, 0);
  const dow = d.getDay();
  const offset = dow === 0 ? 6 : dow - 1;
  d.setDate(d.getDate() - offset);
  return d;
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <Card variant="outlined" sx={{ height: "100%" }}>
      <CardContent>
        <Typography variant="body2" color="text.secondary" gutterBottom>
          {label}
        </Typography>
        <Typography variant="h6" fontWeight={700}>
          {value}
        </Typography>
      </CardContent>
    </Card>
  );
}

function num(v: unknown): string {
  const n = Number(v);
  return Number.isFinite(n) ? n.toLocaleString() : "0";
}

function money(v: unknown): string {
  const n = Number(v);
  return Number.isFinite(n) ? `PHP ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "PHP 0.00";
}

export default function ConsultationLabReportPage({ reportKey, title }: Props) {
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const todayYmd = useMemo(() => localYmd(today), [today]);
  const weekStartYmd = useMemo(() => localYmd(weekStartMonday(today)), [today]);
  const monthStartYmd = useMemo(() => localYmd(new Date(today.getFullYear(), today.getMonth(), 1)), [today]);
  const [period, setPeriod] = useState<DatePeriod>("today");
  const [startDate, setStartDate] = useState(todayYmd);
  const [endDate, setEndDate] = useState(todayYmd);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (period === "today") {
      setStartDate(todayYmd);
      setEndDate(todayYmd);
    } else if (period === "week") {
      setStartDate(weekStartYmd);
      setEndDate(todayYmd);
    } else if (period === "month") {
      setStartDate(monthStartYmd);
      setEndDate(todayYmd);
    }
  }, [period, todayYmd, weekStartYmd, monthStartYmd]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const sp = new URLSearchParams({ start: startDate, end: endDate });
      const res = await authenticatedFetch(`/api/reports/consultation-lab/${reportKey}?${sp.toString()}`, {
        cache: "no-store",
      });
      const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
      if (!res.ok) {
        setError(String(json?.error ?? "Failed to load report."));
        setData(null);
        return;
      }
      setData(json ?? {});
    } catch {
      setError("Failed to load report.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [endDate, reportKey, startDate, reloadToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = (data?.rows as Array<Record<string, unknown>> | undefined) ?? [];
  const tests = (data?.tests as Array<Record<string, unknown>> | undefined) ?? [];
  const categories = (data?.categories as Array<Record<string, unknown>> | undefined) ?? [];
  const payments = (data?.paymentBreakdown as Array<Record<string, unknown>> | undefined) ?? [];

  return (
    <>
      <Typography variant="h5" sx={{ mb: 2 }}>
        {title}
      </Typography>

      <Stack
        direction={{ xs: "column", md: "row" }}
        spacing={1.5}
        alignItems={{ md: "flex-end" }}
        sx={{ mb: 2 }}
      >
        <Stack direction="row" spacing={1} flexWrap="wrap" alignItems="flex-end">
          <Button size="small" sx={filterToolbarButtonSx} variant={period === "today" ? "contained" : "outlined"} onClick={() => setPeriod("today")}>
            Today
          </Button>
          <Button size="small" sx={filterToolbarButtonSx} variant={period === "week" ? "contained" : "outlined"} onClick={() => setPeriod("week")}>
            This week
          </Button>
          <Button size="small" sx={filterToolbarButtonSx} variant={period === "month" ? "contained" : "outlined"} onClick={() => setPeriod("month")}>
            This month
          </Button>
          <Button size="small" sx={filterToolbarButtonSx} variant={period === "custom" ? "contained" : "outlined"} onClick={() => setPeriod("custom")}>
            Date range
          </Button>
        </Stack>

        {period === "custom" ? (
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} alignItems={{ sm: "flex-end" }}>
            <DatePickerField
              id={`${reportKey}-range-from`}
              label="From"
              width={{ xs: "100%", sm: 180 }}
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
            <DatePickerField
              id={`${reportKey}-range-to`}
              label="To"
              width={{ xs: "100%", sm: 180 }}
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </Stack>
        ) : null}
        <Button
          size="small"
          sx={filterToolbarButtonSx}
          variant="outlined"
          startIcon={<RefreshOutlinedIcon />}
          onClick={() => setReloadToken((v) => v + 1)}
          disabled={loading}
        >
          Refresh
        </Button>
      </Stack>

      {error ? <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert> : null}

      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
          <CircularProgress />
        </Box>
      ) : (
        <Stack spacing={2}>
          {reportKey === "physician-workload" ? (
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, md: 4 }}>
                <SummaryCard label="Total encounters" value={num(data?.totalEncounters)} />
              </Grid>
              <Grid size={{ xs: 12 }}>
                <Card variant="outlined">
                  <CardContent>
                    {rows.map((r, i) => (
                      <Box key={String(r.physicianName ?? i)}>
                        <Stack direction="row" justifyContent="space-between">
                          <Typography variant="body2">{String(r.physicianName ?? "—")}</Typography>
                          <Typography variant="body2" fontWeight={700}>
                            {num(r.totalEncounters)}
                          </Typography>
                        </Stack>
                        <Typography variant="caption" color="text.secondary">
                          Completed: {num(r.completedEncounters)} | In progress: {num(r.inProgressEncounters)}
                        </Typography>
                        {i < rows.length - 1 ? <Divider sx={{ mt: 1, mb: 1 }} /> : null}
                      </Box>
                    ))}
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
          ) : null}

          {reportKey === "lab-order-volume" ? (
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                <SummaryCard label="Total requests" value={num(data?.totalRequests)} />
              </Grid>
              <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                <SummaryCard label="Total tests ordered" value={num(data?.totalItems)} />
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <Card variant="outlined">
                  <CardContent>
                    <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1 }}>
                      By category
                    </Typography>
                    {categories.map((r, i) => (
                      <Box key={String(r.categoryName ?? i)}>
                        <Stack direction="row" justifyContent="space-between">
                          <Typography variant="body2">{String(r.categoryName ?? "—")}</Typography>
                          <Typography variant="body2" fontWeight={700}>{num(r.count)}</Typography>
                        </Stack>
                        {i < categories.length - 1 ? <Divider sx={{ mt: 1, mb: 1 }} /> : null}
                      </Box>
                    ))}
                  </CardContent>
                </Card>
              </Grid>
              <Grid size={{ xs: 12 }}>
                <Card variant="outlined">
                  <CardContent>
                    <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1 }}>
                      By test
                    </Typography>
                    {tests.map((r, i) => (
                      <Box key={String(r.testName ?? i)}>
                        <Stack direction="row" justifyContent="space-between">
                          <Typography variant="body2">{String(r.testName ?? "—")}</Typography>
                          <Typography variant="body2" fontWeight={700}>{num(r.count)}</Typography>
                        </Stack>
                        {i < tests.length - 1 ? <Divider sx={{ mt: 1, mb: 1 }} /> : null}
                      </Box>
                    ))}
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
          ) : null}

          {reportKey === "lab-turnaround-time" ? (
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, sm: 6, md: 4 }}>
                <SummaryCard label="Average turnaround (hours)" value={num(data?.avgTurnaroundHours)} />
              </Grid>
              <Grid size={{ xs: 12, sm: 6, md: 4 }}>
                <SummaryCard label="Released requests" value={num(data?.releasedCount)} />
              </Grid>
              <Grid size={{ xs: 12, sm: 6, md: 4 }}>
                <SummaryCard label="Pending requests" value={num(data?.pendingCount)} />
              </Grid>
              <Grid size={{ xs: 12 }}>
                <Card variant="outlined">
                  <CardContent>
                    {rows.map((r, i) => (
                      <Box key={String(r.requestId ?? i)}>
                        <Stack direction="row" justifyContent="space-between">
                          <Typography variant="body2">{String(r.requestId ?? "—")}</Typography>
                          <Typography variant="body2" fontWeight={700}>
                            {r.turnaroundHours == null ? "—" : `${num(r.turnaroundHours)} h`}
                          </Typography>
                        </Stack>
                        <Typography variant="caption" color="text.secondary">
                          {String(r.requestDate ?? "—")} | {String(r.status ?? "—")}
                        </Typography>
                        {i < rows.length - 1 ? <Divider sx={{ mt: 1, mb: 1 }} /> : null}
                      </Box>
                    ))}
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
          ) : null}

          {reportKey === "lab-revenue" ? (
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, sm: 6, md: 4 }}>
                <SummaryCard label="Revenue" value={money(data?.totalRevenue)} />
              </Grid>
              <Grid size={{ xs: 12, sm: 6, md: 4 }}>
                <SummaryCard label="Sales count" value={num(data?.saleCount)} />
              </Grid>
              <Grid size={{ xs: 12 }}>
                <Card variant="outlined">
                  <CardContent>
                    {payments.map((r, i) => (
                      <Box key={String(r.paymentMethod ?? i)}>
                        <Stack direction="row" justifyContent="space-between">
                          <Typography variant="body2">{String(r.paymentMethod ?? "—")}</Typography>
                          <Typography variant="body2" fontWeight={700}>
                            {money(r.amount)} ({num(r.count)})
                          </Typography>
                        </Stack>
                        {i < payments.length - 1 ? <Divider sx={{ mt: 1, mb: 1 }} /> : null}
                      </Box>
                    ))}
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
          ) : null}

          {reportKey === "outstanding-lab-orders" ? (
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, sm: 6, md: 4 }}>
                <SummaryCard label="Unpaid requests" value={num(data?.unpaidCount)} />
              </Grid>
              <Grid size={{ xs: 12, sm: 6, md: 4 }}>
                <SummaryCard label="Paid requests" value={num(data?.paidCount)} />
              </Grid>
              <Grid size={{ xs: 12 }}>
                <Card variant="outlined">
                  <CardContent>
                    {rows.map((r, i) => (
                      <Box key={String(r.requestId ?? i)}>
                        <Stack direction="row" justifyContent="space-between">
                          <Typography variant="body2">{String(r.requestId ?? "—")} - {String(r.patientName ?? "—")}</Typography>
                          <Typography variant="body2" fontWeight={700}>{String(r.status ?? "—")}</Typography>
                        </Stack>
                        <Typography variant="caption" color="text.secondary">
                          {String(r.requestDate ?? "—")} | {String(r.priority ?? "—")}
                        </Typography>
                        {i < rows.length - 1 ? <Divider sx={{ mt: 1, mb: 1 }} /> : null}
                      </Box>
                    ))}
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
          ) : null}

          {reportKey === "or-register" ? (
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, sm: 6, md: 4 }}>
                <SummaryCard label="Total amount" value={money(data?.totalAmount)} />
              </Grid>
              <Grid size={{ xs: 12, sm: 6, md: 4 }}>
                <SummaryCard label="Paid / completed count" value={num(data?.paidCount)} />
              </Grid>
              <Grid size={{ xs: 12 }}>
                <Card variant="outlined">
                  <CardContent>
                    {rows.map((r, i) => (
                      <Box key={`${String(r.orNumber ?? i)}-${i}`}>
                        <Stack direction="row" justifyContent="space-between">
                          <Typography variant="body2">{String(r.orNumber ?? "—")} ({String(r.source ?? "—")})</Typography>
                          <Typography variant="body2" fontWeight={700}>{money(r.amount)}</Typography>
                        </Stack>
                        <Typography variant="caption" color="text.secondary">
                          {String(r.date ?? "—")} | {String(r.status ?? "—")}
                        </Typography>
                        {i < rows.length - 1 ? <Divider sx={{ mt: 1, mb: 1 }} /> : null}
                      </Box>
                    ))}
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
          ) : null}
        </Stack>
      )}
    </>
  );
}
