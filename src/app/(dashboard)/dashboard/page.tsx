"use client";

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

const stats = [
  {
    label: "Total Patients Today",
    value: "42",
    change: "+12%",
    trending: "up" as const,
    icon: <PeopleOutlineIcon />,
    tone: "secondary" as const,
  },
  {
    label: "Queue Count",
    value: "8",
    change: "+3",
    trending: "up" as const,
    icon: <QueueIcon />,
    tone: "info" as const,
  },
  {
    label: "Ongoing Consultations",
    value: "3",
    change: "-2",
    trending: "down" as const,
    icon: <HealingIcon />,
    tone: "warning" as const,
  },
  {
    label: "Completed Transactions",
    value: "31",
    change: "+18%",
    trending: "up" as const,
    icon: <CheckCircleOutlineIcon />,
    tone: "primary" as const,
  },
];

const appointments = [
  { patient: "MJ Mical", diagnosis: "Mild Cough", time: "09:00 AM" },
  { patient: "Sanath Deo", diagnosis: "Health Checkup", time: "12:30 PM" },
  { patient: "Loera Phanj", diagnosis: "Fever", time: "01:00 PM" },
  { patient: "Kornola Haris", diagnosis: "Common Cold", time: "01:30 PM" },
];

const appointmentRequests = [
  { name: "Maria Sarafat", note: "Follow-up check", status: "pending" as const },
  { name: "Jhon Deo", note: "Dental consult", status: "approved" as const },
  { name: "Mica Tan", note: "Lab result review", status: "pending" as const },
];

const monthDays = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const calendarCells = [
  "",
  "",
  "",
  "",
  "",
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "11",
  "12",
  "13",
  "14",
  "15",
  "16",
  "17",
  "18",
  "19",
  "20",
  "21",
  "22",
  "23",
  "24",
  "25",
  "26",
  "27",
  "28",
  "29",
  "30",
];

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

function StatCard({
  label,
  value,
  change,
  trending,
  icon,
  tone,
}: (typeof stats)[number]) {
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
          <Typography variant="caption" color="text.secondary">
            vs yesterday
          </Typography>
        </Box>
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const { profile } = useAuth();
  const firstName = profile?.fullname?.split(" ")[0] || "there";
  const selectedDate = 24;

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
            Your clinic operations snapshot for today is ready.
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

      <Grid container spacing={2.5}>
        {stats.map((stat) => (
          <Grid key={stat.label} size={{ xs: 12, sm: 6, xl: 3 }}>
            <StatCard {...stat} />
          </Grid>
        ))}

        <Grid size={{ xs: 12, lg: 4 }}>
          <Card sx={{ borderRadius: 2.5, height: "100%", boxShadow: "0 6px 18px rgba(31, 78, 121, 0.08)" }}>
            <CardContent>
              <Typography fontWeight={700}>Patients Summary</Typography>
              <Typography variant="caption" color="text.secondary">
                This Month
              </Typography>
              <Box sx={{ display: "flex", justifyContent: "center", py: 2 }}>
                <Box
                  sx={{
                    width: 170,
                    height: 170,
                    borderRadius: "50%",
                    background:
                      "conic-gradient(#0D5BD7 0 58%, #4CC9C0 58% 81%, #F8C354 81% 100%)",
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
                {[
                  { label: "New Patients", color: "#0D5BD7" },
                  { label: "Returning", color: "#4CC9C0" },
                  { label: "Follow-up", color: "#F8C354" },
                ].map((x) => (
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
              <Typography fontWeight={700}>Today Appointments</Typography>
              <Typography variant="caption" color="text.secondary">
                Sorted by time
              </Typography>
              <Stack sx={{ mt: 2 }} divider={<Divider flexItem />}>
                {appointments.map((x) => (
                  <Box
                    key={`${x.patient}-${x.time}`}
                    sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", py: 1.2 }}
                  >
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1.25 }}>
                      <Avatar sx={{ width: 36, height: 36, bgcolor: alpha("#1F4E79", 0.12), color: "#1F4E79" }}>
                        {x.patient
                          .split(" ")
                          .slice(0, 2)
                          .map((n) => n[0])
                          .join("")}
                      </Avatar>
                      <Box>
                        <Typography variant="body2" fontWeight={700}>
                          {x.patient}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {x.diagnosis}
                        </Typography>
                      </Box>
                    </Box>
                    <Chip
                      size="small"
                      icon={<AccessTimeIcon sx={{ fontSize: 15 }} />}
                      label={x.time}
                      sx={{ bgcolor: alpha("#0D5BD7", 0.1), color: "#0D5BD7", fontWeight: 700 }}
                    />
                  </Box>
                ))}
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, lg: 4 }}>
          <Card sx={{ borderRadius: 2.5, height: "100%", boxShadow: "0 6px 18px rgba(31, 78, 121, 0.08)" }}>
            <CardContent>
              <Typography fontWeight={700}>Next Patient Details</Typography>
              <Typography variant="caption" color="text.secondary">
                Queue item #1
              </Typography>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mt: 2 }}>
                <Avatar sx={{ width: 46, height: 46, bgcolor: alpha("#2FBF71", 0.2), color: "#0D7A4D" }}>SD</Avatar>
                <Box>
                  <Typography variant="body1" fontWeight={800}>
                    Sanath Deo
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Health checkup
                  </Typography>
                </Box>
              </Box>
              <Grid container spacing={1.2} sx={{ mt: 2 }}>
                {[
                  { icon: <BadgeOutlinedIcon fontSize="small" />, label: "Patient ID", value: "0200910" },
                  { icon: <LocalHospitalOutlinedIcon fontSize="small" />, label: "Age", value: "59" },
                  { icon: <CalendarMonthIcon fontSize="small" />, label: "Last Visit", value: "15 Dec 2025" },
                  { icon: <AccessTimeIcon fontSize="small" />, label: "Queue Time", value: "10:20 AM" },
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
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, lg: 4 }}>
          <Card sx={{ borderRadius: 2.5, boxShadow: "0 6px 18px rgba(31, 78, 121, 0.08)" }}>
            <CardContent>
              <Typography fontWeight={700}>Patients Review</Typography>
              <Stack gap={1.4} sx={{ mt: 2 }}>
                {[
                  { label: "Excellent", value: 88, color: "#0D5BD7" },
                  { label: "Good", value: 72, color: "#2FBF71" },
                  { label: "Average", value: 41, color: "#F8C354" },
                ].map((x) => (
                  <Box key={x.label}>
                    <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.6 }}>
                      <Typography variant="caption" color="text.secondary">
                        {x.label}
                      </Typography>
                      <Typography variant="caption" fontWeight={700}>
                        {x.value}%
                      </Typography>
                    </Box>
                    <Box sx={{ height: 6, borderRadius: 3, bgcolor: alpha(x.color, 0.2), overflow: "hidden" }}>
                      <Box sx={{ width: `${x.value}%`, height: "100%", bgcolor: x.color }} />
                    </Box>
                  </Box>
                ))}
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, lg: 4 }}>
          <Card sx={{ borderRadius: 2.5, boxShadow: "0 6px 18px rgba(31, 78, 121, 0.08)" }}>
            <CardContent>
              <Typography fontWeight={700}>Appointment Requests</Typography>
              <Stack sx={{ mt: 2 }} gap={1.2}>
                {appointmentRequests.map((x) => (
                  <Box
                    key={x.name}
                    sx={{
                      p: 1.3,
                      borderRadius: 1.5,
                      bgcolor: alpha("#1F4E79", 0.04),
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <Box>
                      <Typography variant="body2" fontWeight={700}>
                        {x.name}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {x.note}
                      </Typography>
                    </Box>
                    <Chip
                      size="small"
                      label={x.status}
                      color={x.status === "approved" ? "success" : "warning"}
                      sx={{ textTransform: "capitalize", fontWeight: 700 }}
                    />
                  </Box>
                ))}
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, lg: 4 }}>
          <Card sx={{ borderRadius: 2.5, boxShadow: "0 6px 18px rgba(31, 78, 121, 0.08)" }}>
            <CardContent>
              <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <Typography fontWeight={700}>Calendar</Typography>
                <Typography variant="caption" color="text.secondary">
                  Dec 2025
                </Typography>
              </Box>
              <Box sx={{ mt: 1.5, display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 0.35 }}>
                {monthDays.map((d) => (
                  <Typography key={d} variant="caption" color="text.secondary" sx={{ textAlign: "center", py: 0.6 }}>
                    {d}
                  </Typography>
                ))}
                {calendarCells.map((day, idx) => {
                  const isSelected = Number(day) === selectedDate;
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
                        color: day ? (isSelected ? "#fff" : "text.primary") : "transparent",
                        bgcolor: isSelected ? "#0D5BD7" : "transparent",
                        fontWeight: isSelected ? 800 : 500,
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
    </Box>
  );
}
