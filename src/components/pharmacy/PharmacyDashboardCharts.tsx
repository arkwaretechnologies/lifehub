"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Card,
  CardContent,
  CircularProgress,
  Grid,
  Stack,
  Typography,
  alpha,
  useTheme,
} from "@mui/material";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import ReceiptLongOutlinedIcon from "@mui/icons-material/ReceiptLongOutlined";
import LocalPharmacyOutlinedIcon from "@mui/icons-material/LocalPharmacyOutlined";
import AssignmentOutlinedIcon from "@mui/icons-material/AssignmentOutlined";
import PaymentsOutlinedIcon from "@mui/icons-material/PaymentsOutlined";
import {
  fetchPharmacyDashboardAnalytics,
  type PharmacyDailyStat,
} from "@/lib/pharmacyPosDb";

function moneyPhp(n: number): string {
  return `₱${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function shortDate(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) return ymd;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function SalesBarChart({
  daily,
  color,
  altColor,
}: {
  daily: PharmacyDailyStat[];
  color: string;
  altColor: string;
}) {
  const max = Math.max(1, ...daily.map((d) => d.total));
  const h = 200;
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "flex-end",
        gap: 0.5,
        height: h,
        pt: 2,
        px: 0.5,
        overflowX: "auto",
        pb: 0.5,
        minHeight: h,
      }}
    >
      {daily.map((d) => {
        const pct = (d.total / max) * 100;
        const barH = Math.max(d.total > 0 ? 8 : 2, (pct / 100) * (h - 36));
        return (
          <Box
            key={d.date}
            sx={{
              flex: 1,
              minWidth: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "flex-end",
            }}
          >
            <Typography
              variant="caption"
              sx={{
                fontSize: "0.65rem",
                color: "text.secondary",
                mb: 0.25,
                fontVariantNumeric: "tabular-nums",
                opacity: d.total > 0 ? 1 : 0.35,
              }}
            >
              {d.count > 0 ? d.count : ""}
            </Typography>
            <Box
              title={`${d.date}: ${moneyPhp(d.total)} (${d.count} txns)`}
              sx={{
                width: "100%",
                maxWidth: 28,
                height: barH,
                borderRadius: 1,
                background:
                  d.total > 0
                    ? `linear-gradient(180deg, ${alpha(color, 0.95)} 0%, ${alpha(altColor, 0.75)} 100%)`
                    : alpha(color, 0.08),
                transition: "height 0.2s ease",
              }}
            />
            <Typography
              variant="caption"
              noWrap
              sx={{
                fontSize: "0.6rem",
                color: "text.secondary",
                mt: 0.5,
                transform: "rotate(-45deg)",
                transformOrigin: "top center",
                height: 28,
              }}
            >
              {shortDate(d.date)}
            </Typography>
          </Box>
        );
      })}
    </Box>
  );
}

function RevenueMixBar({
  walkIn,
  rx,
  walkColor,
  rxColor,
}: {
  walkIn: number;
  rx: number;
  walkColor: string;
  rxColor: string;
}) {
  const total = walkIn + rx;
  const wPct = total > 0 ? (walkIn / total) * 100 : 50;
  const rPct = total > 0 ? (rx / total) * 100 : 50;
  return (
    <Box>
      <Box
        sx={{
          height: 14,
          borderRadius: 999,
          overflow: "hidden",
          display: "flex",
          bgcolor: "action.hover",
        }}
      >
        <Box
          sx={{
            width: `${wPct}%`,
            bgcolor: walkColor,
            transition: "width 0.3s ease",
          }}
        />
        <Box
          sx={{
            width: `${rPct}%`,
            bgcolor: rxColor,
            transition: "width 0.3s ease",
          }}
        />
      </Box>
      <Stack direction="row" spacing={2} sx={{ mt: 1.5 }} flexWrap="wrap">
        <Stack direction="row" alignItems="center" spacing={0.75}>
          <Box sx={{ width: 10, height: 10, borderRadius: 0.5, bgcolor: walkColor }} />
          <Typography variant="body2">
            Walk-in <strong>{total > 0 ? `${wPct.toFixed(0)}%` : "—"}</strong>
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {moneyPhp(walkIn)}
          </Typography>
        </Stack>
        <Stack direction="row" alignItems="center" spacing={0.75}>
          <Box sx={{ width: 10, height: 10, borderRadius: 0.5, bgcolor: rxColor }} />
          <Typography variant="body2">
            With Rx <strong>{total > 0 ? `${rPct.toFixed(0)}%` : "—"}</strong>
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {moneyPhp(rx)}
          </Typography>
        </Stack>
      </Stack>
    </Box>
  );
}

function PaymentMethodBars({
  breakdown,
  color,
}: {
  breakdown: Record<string, number>;
  color: string;
}) {
  const entries = Object.entries(breakdown).sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...entries.map(([, v]) => v));
  if (entries.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        No payment data in this period.
      </Typography>
    );
  }
  return (
    <Stack spacing={1.25}>
      {entries.map(([label, amt]) => (
        <Box key={label}>
          <Stack direction="row" justifyContent="space-between" alignItems="baseline">
            <Typography variant="body2" fontWeight={600}>
              {label}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ fontVariantNumeric: "tabular-nums" }}>
              {moneyPhp(amt)}
            </Typography>
          </Stack>
          <Box sx={{ height: 6, borderRadius: 999, bgcolor: "action.hover", mt: 0.5, overflow: "hidden" }}>
            <Box
              sx={{
                height: "100%",
                width: `${(amt / max) * 100}%`,
                borderRadius: 999,
                bgcolor: alpha(color, 0.85),
                transition: "width 0.25s ease",
              }}
            />
          </Box>
        </Box>
      ))}
    </Stack>
  );
}

export default function PharmacyDashboardCharts() {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  const info = theme.palette.info.main;
  const secondary = theme.palette.secondary.main;

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [daily, setDaily] = useState<PharmacyDailyStat[]>([]);
  const [walkIn, setWalkIn] = useState(0);
  const [rx, setRx] = useState(0);
  const [totalRev, setTotalRev] = useState(0);
  const [txnCount, setTxnCount] = useState(0);
  const [payments, setPayments] = useState<Record<string, number>>({});

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      const r = await fetchPharmacyDashboardAnalytics(14);
      if (cancelled) return;
      if (r.error) setErr(r.error);
      else {
        setErr(null);
        setDaily(r.daily);
        setWalkIn(r.walkInRevenue);
        setRx(r.rxRevenue);
        setTotalRev(r.totalRevenue);
        setTxnCount(r.transactionCount);
        setPayments(r.paymentBreakdown);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const avgTicket = useMemo(
    () => (txnCount > 0 ? totalRev / txnCount : 0),
    [txnCount, totalRev],
  );

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Stack spacing={2.5}>
      {err && (
        <Alert severity="warning">
          Could not load pharmacy analytics: {err}. Check RLS policies on <code>pharmacy_sales</code>.
        </Alert>
      )}

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card
            elevation={0}
            sx={{
              height: "100%",
              border: "1px solid",
              borderColor: "divider",
              borderRadius: 2,
              background: `linear-gradient(135deg, ${alpha(primary, 0.08)} 0%, ${alpha(primary, 0.02)} 100%)`,
            }}
          >
            <CardContent sx={{ p: 2.5 }}>
              <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                <Box
                  sx={{
                    p: 1,
                    borderRadius: 2,
                    bgcolor: alpha(primary, 0.15),
                    color: primary,
                  }}
                >
                  <TrendingUpIcon />
                </Box>
              </Stack>
              <Typography variant="h5" fontWeight={800} sx={{ mt: 1.5, fontVariantNumeric: "tabular-nums" }}>
                {moneyPhp(totalRev)}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Revenue (14 days)
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card
            elevation={0}
            sx={{
              height: "100%",
              border: "1px solid",
              borderColor: "divider",
              borderRadius: 2,
              background: `linear-gradient(135deg, ${alpha(info, 0.1)} 0%, ${alpha(info, 0.02)} 100%)`,
            }}
          >
            <CardContent sx={{ p: 2.5 }}>
              <Box
                sx={{
                  p: 1,
                  borderRadius: 2,
                  bgcolor: alpha(info, 0.15),
                  color: info,
                  width: "fit-content",
                }}
              >
                <ReceiptLongOutlinedIcon />
              </Box>
              <Typography variant="h5" fontWeight={800} sx={{ mt: 1.5, fontVariantNumeric: "tabular-nums" }}>
                {txnCount}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Completed sales
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card
            elevation={0}
            sx={{
              height: "100%",
              border: "1px solid",
              borderColor: "divider",
              borderRadius: 2,
              background: `linear-gradient(135deg, ${alpha(secondary, 0.1)} 0%, ${alpha(secondary, 0.02)} 100%)`,
            }}
          >
            <CardContent sx={{ p: 2.5 }}>
              <Box
                sx={{
                  p: 1,
                  borderRadius: 2,
                  bgcolor: alpha(secondary, 0.15),
                  color: secondary,
                  width: "fit-content",
                }}
              >
                <LocalPharmacyOutlinedIcon />
              </Box>
              <Typography variant="h5" fontWeight={800} sx={{ mt: 1.5, fontVariantNumeric: "tabular-nums" }}>
                {moneyPhp(avgTicket)}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Avg. ticket
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card
            elevation={0}
            sx={{
              height: "100%",
              border: "1px solid",
              borderColor: "divider",
              borderRadius: 2,
              bgcolor: "background.paper",
            }}
          >
            <CardContent sx={{ p: 2.5 }}>
              <Box
                sx={{
                  p: 1,
                  borderRadius: 2,
                  bgcolor: alpha(theme.palette.warning.main, 0.12),
                  color: "warning.dark",
                  width: "fit-content",
                }}
              >
                <AssignmentOutlinedIcon />
              </Box>
              <Typography variant="h5" fontWeight={800} sx={{ mt: 1.5, fontVariantNumeric: "tabular-nums" }}>
                {walkIn + rx > 0 ? `${((rx / (walkIn + rx)) * 100).toFixed(0)}%` : "—"}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Share from prescriptions
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, lg: 8 }}>
          <Card
            elevation={0}
            sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2, height: "100%" }}
          >
            <CardContent sx={{ p: 3 }}>
              <Typography variant="subtitle1" fontWeight={700} gutterBottom>
                Daily sales
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                Completed pharmacy revenue by day (bar height). Small number = transaction count.
              </Typography>
              <SalesBarChart daily={daily} color={primary} altColor={info} />
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, lg: 4 }}>
          <Stack spacing={2} sx={{ height: "100%" }}>
            <Card elevation={0} sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2, flex: 1 }}>
              <CardContent sx={{ p: 3 }}>
                <Typography variant="subtitle1" fontWeight={700} gutterBottom>
                  Walk-in vs prescription
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Revenue split for the last 14 days (linked Rx vs OTC walk-in).
                </Typography>
                <RevenueMixBar walkIn={walkIn} rx={rx} walkColor={primary} rxColor={info} />
              </CardContent>
            </Card>
            <Card elevation={0} sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2, flex: 1 }}>
              <CardContent sx={{ p: 3 }}>
                <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                  <PaymentsOutlinedIcon color="primary" fontSize="small" />
                  <Typography variant="subtitle1" fontWeight={700}>
                    Payment methods
                  </Typography>
                </Stack>
                <PaymentMethodBars breakdown={payments} color={primary} />
              </CardContent>
            </Card>
          </Stack>
        </Grid>
      </Grid>
    </Stack>
  );
}
