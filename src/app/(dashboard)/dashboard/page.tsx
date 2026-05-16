"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Grid,
  Card,
  CardContent,
  Typography,
  Box,
  alpha,
  useTheme,
  Avatar,
  Divider,
  Stack,
  Chip,
  CircularProgress,
  Alert,
} from "@mui/material";
import PeopleOutlineIcon from "@mui/icons-material/PeopleOutline";
import QueueIcon from "@mui/icons-material/Queue";
import HealingIcon from "@mui/icons-material/Healing";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import TrendingDownIcon from "@mui/icons-material/TrendingDown";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import BadgeOutlinedIcon from "@mui/icons-material/BadgeOutlined";
import LocalHospitalOutlinedIcon from "@mui/icons-material/LocalHospitalOutlined";
import { useAuth } from "@/components/AuthProvider";
import type { DashboardSummary } from "@/lib/dashboardSummary";

const monthDays = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

type StatTone = "secondary" | "info" | "warning" | "primary";

type StatCardProps = {
  label: string;
  value: string;
  change: string;
  trending: "up" | "down";
  icon: ReactNode;
  tone: StatTone;
};

function statDelta(today: number, yesterday: number): { change: string; trending: "up" | "down" } {
  const d = today - yesterday;
  const trending: "up" | "down" = d >= 0 ? "up" : "down";
  if (d === 0) return { change: "0 vs yesterday", trending: "up" };
  const sign = d > 0 ? "+" : "";
  return { change: `${sign}${d} vs yesterday`, trending };
}

function MiniBarChart({ color }: { color: string }) {
  const bars = [40, 70, 55, 80, 45, 90, 65, 75, 50, 85];
  return (
    <Box sx={{ display: "flex", alignItems: "flex-end", gap: "3px", height: 48 }}>
      {bars.map((h, i) => (
        <Box
          key={i}
          sx={{
            width: 4,
            height: `${h}%`,
            borderRadius: 0.5,
            bgcolor: alpha(color, 0.32 + (i / bars.length) * 0.48),
          }}
        />
      ))}
    </Box>
  );
}

function StatCard({ label, value, change, trending, icon, tone }: StatCardProps) {
  const theme = useTheme();
  const palette =
    tone === "secondary"
      ? theme.palette.secondary
      : tone === "info"
        ? theme.palette.info
        : tone === "warning"
          ? theme.palette.warning
          : theme.palette.primary;
  const main = palette.main;
  const softFrom = alpha(main, 0.16);
  const softTo = alpha(main, 0.28);

  return (
    <Card
      sx={{
        height: "100%",
        borderRadius: 2.5,
        boxShadow: "0 6px 18px rgba(31, 78, 121, 0.08)",
      }}
    >
      <CardContent sx={{ p: 2.5 }}>
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 2 }}>
          <Box
            sx={{
              width: 48,
              height: 48,
              borderRadius: "12px",
              background: `linear-gradient(135deg, ${softFrom} 0%, ${softTo} 100%)`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: main,
            }}
          >
            {icon}
          </Box>
          <MiniBarChart color={main} />
        </Box>

        <Typography variant="h4" fontWeight={800} sx={{ lineHeight: 1.1 }}>
          {value}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          {label}
        </Typography>

        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mt: 1.25 }}>
          {trending === "up" ? (
            <TrendingUpIcon sx={{ fontSize: 18, color: "success.main" }} />
          ) : (
            <TrendingDownIcon sx={{ fontSize: 18, color: "warning.main" }} />
          )}
          <Typography
            variant="subtitle2"
            sx={{ color: trending === "up" ? "success.main" : "warning.main" }}
          >
            {change}
          </Typography>
        </Box>
      </CardContent>
    </Card>
  );
}

function buildCalendarCells(firstWeekday0: number, daysInMonth: number): string[] {
  const cells: string[] = [];
  for (let i = 0; i < firstWeekday0; i++) cells.push("");
  for (let d = 1; d <= daysInMonth; d++) cells.push(String(d));
  while (cells.length % 7 !== 0) cells.push("");
  return cells;
}

export default function DashboardPage() {
  const { profile } = useAuth();
  const firstName = profile?.fullname?.split(" ")[0] || "there";
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [data, setData] = useState<DashboardSummary | null>(null);

  const load = useCallback(async () => {
    setLoadError("");
    setLoading(true);
    try {
      const res = await fetch("/api/dashboard/summary", { cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as DashboardSummary & { error?: string };
      if (!res.ok) {
        setData(null);
        setLoadError(json.error ?? `Request failed (${res.status})`);
        return;
      }
      if ("error" in json && typeof json.error === "string") {
        setData(null);
        setLoadError(json.error);
        return;
      }
      setData(json as DashboardSummary);
    } catch {
      setData(null);
      setLoadError("Failed to load dashboard.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const statCards = useMemo((): StatCardProps[] => {
    if (!data) return [];
    const s = data.stats;
    return [
      {
        label: "Distinct patients (encounters today)",
        value: String(s.totalPatientsToday),
        ...statDelta(s.totalPatientsToday, s.totalPatientsYesterday),
        icon: <PeopleOutlineIcon />,
        tone: "secondary",
      },
      {
        label: "Active queue tickets today",
        value: String(s.queueCountToday),
        ...statDelta(s.queueCountToday, s.queueCountYesterday),
        icon: <QueueIcon />,
        tone: "info",
      },
      {
        label: "Open dispositions today",
        value: String(s.ongoingConsultationsToday),
        ...statDelta(s.ongoingConsultationsToday, s.ongoingConsultationsYesterday),
        icon: <HealingIcon />,
        tone: "warning",
      },
      {
        label: "Visits with disposition today",
        value: String(s.completedDispositionToday),
        ...statDelta(s.completedDispositionToday, s.completedDispositionYesterday),
        icon: <CheckCircleOutlineIcon />,
        tone: "primary",
      },
    ];
  }, [data]);

  const monthDonut = useMemo(() => {
    if (!data) return { p1: 33.33, p2: 33.34, p3: 33.33, labels: [] as { label: string; color: string }[] };
    const { newRegistrations, encounterVisits, distinctPatients } = data.monthPatientSummary;
    const sum = newRegistrations + encounterVisits + distinctPatients;
    if (sum <= 0) {
      return {
        p1: 33.33,
        p2: 33.34,
        p3: 33.33,
        labels: [
          { label: `New registrations (${newRegistrations})`, color: "#0D5BD7" },
          { label: `Encounter visits (${encounterVisits})`, color: "#4CC9C0" },
          { label: `Distinct patients (${distinctPatients})`, color: "#F8C354" },
        ],
      };
    }
    const p1 = (newRegistrations / sum) * 100;
    const p2 = (encounterVisits / sum) * 100;
    const p3 = 100 - p1 - p2;
    return {
      p1,
      p2,
      p3,
      labels: [
        { label: `New registrations (${newRegistrations})`, color: "#0D5BD7" },
        { label: `Encounter visits (${encounterVisits})`, color: "#4CC9C0" },
        { label: `Distinct patients (${distinctPatients})`, color: "#F8C354" },
      ],
    };
  }, [data]);

  const calendarCells = useMemo(() => {
    if (!data) return [];
    return buildCalendarCells(data.calendar.firstWeekday0, data.calendar.daysInMonth);
  }, [data]);

  return (
    <Box sx={{ pb: 2 }}>
      <Card
        sx={{
          mb: 2.5,
          borderRadius: 3,
          background: "linear-gradient(135deg, #1F4E79 0%, #4CC9C0 55%, #2FBF71 100%)",
          color: "#fff",
          boxShadow: "0 12px 26px rgba(31, 78, 121, 0.18)",
        }}
      >
        <CardContent sx={{ p: { xs: 2.5, md: 3 }, position: "relative", overflow: "hidden" }}>
          <Typography variant="h5" fontWeight={800}>
            Welcome back, {firstName}
          </Typography>
          <Typography sx={{ mt: 0.5, color: alpha("#fff", 0.78) }}>
            Live snapshot from the database{data?.todayYmd ? ` · ${data.todayYmd}` : ""}.
          </Typography>
          <Box
            sx={{
              position: "absolute",
              right: -50,
              top: -60,
              width: 220,
              height: 220,
              borderRadius: "50%",
              bgcolor: alpha("#fff", 0.1),
            }}
          />
        </CardContent>
      </Card>

      {loadError ? (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setLoadError("")}>
          {loadError}
        </Alert>
      ) : null}

      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
          <CircularProgress />
        </Box>
      ) : null}

      {!loading && data ? (
        <Grid container spacing={2.5}>
          {statCards.map((stat) => (
            <Grid key={stat.label} size={{ xs: 12, sm: 6, xl: 3 }}>
              <StatCard {...stat} />
            </Grid>
          ))}

          <Grid size={{ xs: 12, lg: 4 }}>
            <Card sx={{ borderRadius: 2.5, height: "100%", boxShadow: "0 6px 18px rgba(31, 78, 121, 0.08)" }}>
              <CardContent>
                <Typography fontWeight={700}>Patients summary</Typography>
                <Typography variant="caption" color="text.secondary">
                  {data.calendarMonthLabel} (clinic month)
                </Typography>
                <Box sx={{ display: "flex", justifyContent: "center", py: 2 }}>
                  <Box
                    sx={{
                      width: 170,
                      height: 170,
                      borderRadius: "50%",
                      background: `conic-gradient(#0D5BD7 0 ${monthDonut.p1}%, #4CC9C0 ${monthDonut.p1}% ${
                        monthDonut.p1 + monthDonut.p2
                      }%, #F8C354 ${monthDonut.p1 + monthDonut.p2}% 100%)`,
                      display: "grid",
                      placeItems: "center",
                    }}
                  >
                    <Box
                      sx={{
                        width: 98,
                        height: 98,
                        borderRadius: "50%",
                        bgcolor: "#fff",
                        border: "8px solid",
                        borderColor: alpha("#1F4E79", 0.08),
                      }}
                    />
                  </Box>
                </Box>
                <Stack gap={1}>
                  {monthDonut.labels.map((x) => (
                    <Box key={x.label} sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                      <Box sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: x.color }} />
                      <Typography variant="body2">{x.label}</Typography>
                    </Box>
                  ))}
                </Stack>
              </CardContent>
            </Card>
          </Grid>

          <Grid size={{ xs: 12, lg: 4 }}>
            <Card sx={{ borderRadius: 2.5, height: "100%", boxShadow: "0 6px 18px rgba(31, 78, 121, 0.08)" }}>
              <CardContent>
                <Typography fontWeight={700}>Today&apos;s encounters</Typography>
                <Typography variant="caption" color="text.secondary">
                  Sorted by time
                </Typography>
                <Stack sx={{ mt: 2 }} divider={<Divider flexItem />}>
                  {data.todayAppointments.length === 0 ? (
                    <Typography variant="body2" color="text.secondary">
                      No encounters scheduled for today.
                    </Typography>
                  ) : (
                    data.todayAppointments.map((x) => (
                      <Box
                        key={x.transId}
                        sx={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          py: 1.2,
                        }}
                      >
                        <Box sx={{ display: "flex", alignItems: "center", gap: 1.25, minWidth: 0 }}>
                          <Avatar sx={{ width: 36, height: 36, bgcolor: alpha("#1F4E79", 0.12), color: "#1F4E79" }}>
                            {x.patientName
                              .split(" ")
                              .slice(0, 2)
                              .map((n) => n[0])
                              .join("")}
                          </Avatar>
                          <Box sx={{ minWidth: 0 }}>
                            <Typography variant="body2" fontWeight={700} noWrap>
                              {x.patientName}
                            </Typography>
                            <Typography variant="caption" color="text.secondary" noWrap>
                              {x.diagnosis}
                            </Typography>
                          </Box>
                        </Box>
                        <Chip
                          size="small"
                          icon={<AccessTimeIcon sx={{ fontSize: 15 }} />}
                          label={x.timeLabel}
                          sx={{ bgcolor: alpha("#0D5BD7", 0.1), color: "#0D5BD7", fontWeight: 700, flexShrink: 0 }}
                        />
                      </Box>
                    ))
                  )}
                </Stack>
              </CardContent>
            </Card>
          </Grid>

          <Grid size={{ xs: 12, lg: 4 }}>
            <Card sx={{ borderRadius: 2.5, height: "100%", boxShadow: "0 6px 18px rgba(31, 78, 121, 0.08)" }}>
              <CardContent>
                <Typography fontWeight={700}>Next in queue</Typography>
                <Typography variant="caption" color="text.secondary">
                  Earliest waiting ticket today
                </Typography>
                {!data.nextPatient ? (
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                    No waiting queue tickets for today.
                  </Typography>
                ) : (
                  <>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mt: 2 }}>
                      <Avatar sx={{ width: 46, height: 46, bgcolor: alpha("#2FBF71", 0.2), color: "#0D7A4D" }}>
                        {data.nextPatient.initials}
                      </Avatar>
                      <Box sx={{ minWidth: 0 }}>
                        <Typography variant="body1" fontWeight={800} noWrap>
                          {data.nextPatient.patientName}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" noWrap>
                          {data.nextPatient.diagnosis}
                        </Typography>
                      </Box>
                    </Box>
                    <Grid container spacing={1.2} sx={{ mt: 2 }}>
                      {[
                        {
                          icon: <BadgeOutlinedIcon fontSize="small" />,
                          label: "Patient ID",
                          value: data.nextPatient.patientId,
                        },
                        {
                          icon: <LocalHospitalOutlinedIcon fontSize="small" />,
                          label: "Age",
                          value: data.nextPatient.age,
                        },
                        {
                          icon: <CalendarMonthIcon fontSize="small" />,
                          label: "Last visit",
                          value: data.nextPatient.lastVisit,
                        },
                        {
                          icon: <AccessTimeIcon fontSize="small" />,
                          label: "Encounter time",
                          value: data.nextPatient.queueTime,
                        },
                      ].map((x) => (
                        <Grid key={x.label} size={{ xs: 6 }}>
                          <Box sx={{ p: 1.2, borderRadius: 1.5, bgcolor: alpha("#1F4E79", 0.04) }}>
                            <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, color: "text.secondary" }}>
                              {x.icon}
                              <Typography variant="caption">{x.label}</Typography>
                            </Box>
                            <Typography variant="body2" fontWeight={700} sx={{ mt: 0.5 }}>
                              {x.value}
                            </Typography>
                          </Box>
                        </Grid>
                      ))}
                    </Grid>
                  </>
                )}
              </CardContent>
            </Card>
          </Grid>

          <Grid size={{ xs: 12, lg: 4 }}>
            <Card sx={{ borderRadius: 2.5, boxShadow: "0 6px 18px rgba(31, 78, 121, 0.08)" }}>
              <CardContent>
                <Typography fontWeight={700}>Encounter disposition (month)</Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
                  Top categories by visit count
                </Typography>
                {data.dispositionMonth.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    No encounters recorded this month.
                  </Typography>
                ) : (
                  <Stack gap={1.4} sx={{ mt: 2 }}>
                    {data.dispositionMonth.map((x, i) => {
                      const colors = ["#0D5BD7", "#2FBF71", "#F8C354"];
                      const color = colors[i] ?? "#1F4E79";
                      return (
                        <Box key={x.label}>
                          <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.6 }}>
                            <Typography variant="caption" color="text.secondary">
                              {x.label}
                            </Typography>
                            <Typography variant="caption" fontWeight={700}>
                              {x.percent}%
                            </Typography>
                          </Box>
                          <Box sx={{ height: 6, borderRadius: 3, bgcolor: alpha(color, 0.2), overflow: "hidden" }}>
                            <Box sx={{ width: `${x.percent}%`, height: "100%", bgcolor: color }} />
                          </Box>
                        </Box>
                      );
                    })}
                  </Stack>
                )}
              </CardContent>
            </Card>
          </Grid>

          <Grid size={{ xs: 12, lg: 4 }}>
            <Card sx={{ borderRadius: 2.5, boxShadow: "0 6px 18px rgba(31, 78, 121, 0.08)" }}>
              <CardContent>
                <Typography fontWeight={700}>Waiting queue</Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
                  Today (first tickets)
                </Typography>
                {data.waitingQueue.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    No waiting tickets.
                  </Typography>
                ) : (
                  <Stack sx={{ mt: 1 }} gap={1.2}>
                    {data.waitingQueue.map((x) => (
                      <Box
                        key={x.id}
                        sx={{
                          p: 1.3,
                          borderRadius: 1.5,
                          bgcolor: alpha("#1F4E79", 0.04),
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          gap: 1,
                        }}
                      >
                        <Box sx={{ minWidth: 0 }}>
                          <Typography variant="body2" fontWeight={700} noWrap>
                            {x.patientName}
                          </Typography>
                          <Typography variant="caption" color="text.secondary" noWrap>
                            {x.notes}
                          </Typography>
                        </Box>
                        <Chip
                          size="small"
                          label={x.status}
                          color="warning"
                          sx={{ textTransform: "capitalize", fontWeight: 700, flexShrink: 0 }}
                        />
                      </Box>
                    ))}
                  </Stack>
                )}
              </CardContent>
            </Card>
          </Grid>

          <Grid size={{ xs: 12, lg: 4 }}>
            <Card sx={{ borderRadius: 2.5, boxShadow: "0 6px 18px rgba(31, 78, 121, 0.08)" }}>
              <CardContent>
                <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <Typography fontWeight={700}>Calendar</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {data.calendarMonthLabel}
                  </Typography>
                </Box>
                <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
                  Bold ring = has encounter · filled = today
                </Typography>
                <Box sx={{ mt: 1.5, display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 0.35 }}>
                  {monthDays.map((d) => (
                    <Typography key={d} variant="caption" color="text.secondary" sx={{ textAlign: "center", py: 0.6 }}>
                      {d}
                    </Typography>
                  ))}
                  {calendarCells.map((day, idx) => {
                    const n = Number(day);
                    const isToday = n === data.todayDayOfMonth;
                    const hasEnc = n > 0 && data.encounterDaysThisMonth.includes(n);
                    return (
                      <Box
                        key={`${day}-${idx}`}
                        sx={{
                          mx: "auto",
                          my: 0.25,
                          width: 30,
                          height: 30,
                          borderRadius: "50%",
                          display: "grid",
                          placeItems: "center",
                          fontSize: 12,
                          color: day ? (isToday ? "#fff" : "text.primary") : "transparent",
                          bgcolor: isToday ? "#0D5BD7" : "transparent",
                          fontWeight: isToday ? 800 : 500,
                          boxShadow: hasEnc && !isToday ? `inset 0 0 0 2px ${alpha("#1F4E79", 0.45)}` : undefined,
                        }}
                      >
                        {day || "."}
                      </Box>
                    );
                  })}
                </Box>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      ) : null}
    </Box>
  );
}
