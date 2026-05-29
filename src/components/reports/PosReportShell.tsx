"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import RefreshOutlinedIcon from "@mui/icons-material/RefreshOutlined";
import { authenticatedFetch } from "@/lib/authenticatedFetch";
import {
  DEFAULT_REPORT_PAGE_SIZE,
  defaultDateRange,
  type ReportPaginationMeta,
} from "@/lib/posReports";
import type { PosReportApiKey } from "@/lib/reportsNavLeaves";

export type PosReportControls = {
  reload: () => void;
  pagination: ReportPaginationMeta | null;
  setPage: (page: number) => void;
  setPageSize: (pageSize: number) => void;
};

export type PosReportShellProps = {
  title: string;
  reportKey: PosReportApiKey;
  /** Reports that do not use a date range (e.g. on-hand inventory). */
  dateRangeDisabled?: boolean;
  /** Initial date range length in days (1 = today only). Default 14. */
  defaultDaysBack?: number;
  extraControls?: ReactNode;
  extraParams?: Record<string, string>;
  children: (data: unknown, controls: PosReportControls) => ReactNode;
};

export function moneyPhp(n: number): string {
  return `₱${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function PosReportShell({
  title,
  reportKey,
  dateRangeDisabled = false,
  defaultDaysBack = 14,
  extraControls,
  extraParams,
  children,
}: PosReportShellProps) {
  const initial = useMemo(() => defaultDateRange(defaultDaysBack), [defaultDaysBack]);
  const [startDate, setStartDate] = useState(initial.startDate);
  const [endDate, setEndDate] = useState(initial.endDate);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(DEFAULT_REPORT_PAGE_SIZE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState<unknown>(null);
  const [pagination, setPagination] = useState<ReportPaginationMeta | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const extraParamsKey = useMemo(() => JSON.stringify(extraParams ?? {}), [extraParams]);

  useEffect(() => {
    setPage(0);
  }, [startDate, endDate, extraParamsKey, reportKey]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));
      if (!dateRangeDisabled) {
        params.set("start", startDate);
        params.set("end", endDate);
      }
      if (extraParams) {
        for (const [k, v] of Object.entries(extraParams)) {
          params.set(k, v);
        }
      }
      const qs = params.toString();
      const res = await authenticatedFetch(`/api/reports/pos/${reportKey}?${qs}`);
      const json = (await res.json()) as { error?: string; pagination?: ReportPaginationMeta | null };
      if (!res.ok) {
        setError(json.error ?? "Failed to load report.");
        setData(null);
        setPagination(null);
        return;
      }
      setData(json);
      setPagination(json.pagination ?? null);
    } catch {
      setError("Failed to load report.");
      setData(null);
      setPagination(null);
    } finally {
      setLoading(false);
    }
  }, [reportKey, startDate, endDate, dateRangeDisabled, extraParamsKey, page, pageSize, reloadToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const reload = () => setReloadToken((t) => t + 1);

  const controls: PosReportControls = {
    reload,
    pagination,
    setPage,
    setPageSize,
  };

  return (
    <>
      <Typography variant="h5" sx={{ mb: 2 }}>
        {title}
      </Typography>

      <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems={{ sm: "center" }} sx={{ mb: 3 }}>
        {!dateRangeDisabled ? (
          <>
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
          </>
        ) : null}
        {extraControls}
        <Button variant="outlined" startIcon={<RefreshOutlinedIcon />} onClick={reload} disabled={loading}>
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
      ) : (
        children(data, controls)
      )}
    </>
  );
}
