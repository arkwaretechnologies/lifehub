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
  TextField,
  Typography,
} from "@mui/material";
import RefreshOutlinedIcon from "@mui/icons-material/RefreshOutlined";
import { authenticatedFetch } from "@/lib/authenticatedFetch";
import type {
  EncounterSummaryDepartmentRow,
  EncounterSummaryPeriod,
  EncounterSummaryRange,
  EncounterSummaryStatusRow,
} from "@/lib/encounterSummaryReport";

type EncounterSummaryApi = {
  period: EncounterSummaryPeriod;
  range: EncounterSummaryRange;
  totalEncounters: number;
  uniquePatients: number;
  statusBreakdown: EncounterSummaryStatusRow[];
  departmentBreakdown: EncounterSummaryDepartmentRow[];
  cacheHit?: boolean;
  error?: string | null;
};

function localYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatYmdToUs(ymd: string): string {
  const t = String(ymd ?? "").trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return "—";
  const [y, m, d] = t.split("-");
  return `${m}/${d}/${y}`;
}

const PERIOD_OPTIONS: Array<{ id: EncounterSummaryPeriod; label: string }> = [
  { id: "today", label: "Today" },
  { id: "week", label: "This week" },
  { id: "month", label: "This month" },
  { id: "custom", label: "Date range" },
];

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

export default function EncounterSummaryReportPage() {
  const today = useMemo(() => localYmd(new Date()), []);
  const [period, setPeriod] = useState<EncounterSummaryPeriod>("today");
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState<EncounterSummaryApi | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const sp = new URLSearchParams();
      sp.set("period", period);
      if (period === "custom") {
        sp.set("start", startDate);
        sp.set("end", endDate);
      }
      const res = await authenticatedFetch(`/api/reports/consultation-lab/encounter-summary?${sp.toString()}`, {
        cache: "no-store",
      });
      const json = (await res.json().catch(() => null)) as EncounterSummaryApi | { error?: string } | null;
      if (!res.ok) {
        setError((json as { error?: string } | null)?.error ?? "Failed to load encounter summary.");
        setData(null);
        return;
      }
      setData(json as EncounterSummaryApi);
    } catch {
      setError("Failed to load encounter summary.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [period, startDate, endDate, reloadToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const statusRows = data?.statusBreakdown ?? [];
  const deptRows = data?.departmentBreakdown ?? [];
  const formattedDateRange = data
    ? `${formatYmdToUs(data.range.startDate)} - ${formatYmdToUs(data.range.endDate)}`
    : "—";

  return (
    <>
      <Typography variant="h5" sx={{ mb: 2 }}>
        Encounter Summary
      </Typography>

      <Stack direction={{ xs: "column", md: "row" }} spacing={2} alignItems={{ md: "center" }} sx={{ mb: 3 }}>
        <Stack direction="row" spacing={1} flexWrap="wrap">
          {PERIOD_OPTIONS.map((opt) => (
            <Button
              key={opt.id}
              size="small"
              variant={period === opt.id ? "contained" : "outlined"}
              onClick={() => setPeriod(opt.id)}
            >
              {opt.label}
            </Button>
          ))}
        </Stack>

        {period === "custom" ? (
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
            <TextField
              label="From"
              type="date"
              size="small"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              label="To"
              type="date"
              size="small"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              InputLabelProps={{ shrink: true }}
            />
          </Stack>
        ) : null}

        <Button
          size="small"
          variant="outlined"
          startIcon={<RefreshOutlinedIcon />}
          onClick={() => setReloadToken((t) => t + 1)}
          disabled={loading}
        >
          Refresh
        </Button>
      </Stack>

      {error ? (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      ) : null}

      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
          <CircularProgress />
        </Box>
      ) : data ? (
        <Stack spacing={2}>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 6, md: 4 }}>
              <SummaryCard label="Total encounters" value={String(data.totalEncounters)} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 4 }}>
              <SummaryCard label="Unique patients" value={String(data.uniquePatients)} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 4 }}>
              <SummaryCard label="Date range" value={formattedDateRange} />
            </Grid>
          </Grid>

          <Grid container spacing={2}>
            <Grid size={{ xs: 12, md: 6 }}>
              <Card variant="outlined">
                <CardContent>
                  <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1.5 }}>
                    Status Breakdown
                  </Typography>
                  <Stack spacing={1}>
                    {statusRows.length === 0 ? (
                      <Typography variant="body2" color="text.secondary">
                        No encounters in this period.
                      </Typography>
                    ) : (
                      statusRows.map((r) => (
                        <Stack key={r.label} direction="row" justifyContent="space-between">
                          <Typography variant="body2">{r.label}</Typography>
                          <Typography variant="body2" fontWeight={700}>
                            {r.count}
                          </Typography>
                        </Stack>
                      ))
                    )}
                  </Stack>
                </CardContent>
              </Card>
            </Grid>

            <Grid size={{ xs: 12, md: 6 }}>
              <Card variant="outlined">
                <CardContent>
                  <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1.5 }}>
                    Department / Service Breakdown
                  </Typography>
                  <Stack spacing={1}>
                    {deptRows.map((r, i) => (
                      <Box key={r.label}>
                        <Stack direction="row" justifyContent="space-between">
                          <Typography variant="body2">{r.label}</Typography>
                          <Typography variant="body2" fontWeight={700}>
                            {r.count}
                          </Typography>
                        </Stack>
                        {i < deptRows.length - 1 ? <Divider sx={{ mt: 1 }} /> : null}
                      </Box>
                    ))}
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </Stack>
      ) : null}
    </>
  );
}
