"use client";

import {
  Grid,
  Card,
  CardContent,
  Typography,
  Box,
  alpha,
  useTheme,
} from "@mui/material";
import PeopleOutlineIcon from "@mui/icons-material/PeopleOutline";
import QueueIcon from "@mui/icons-material/Queue";
import HealingIcon from "@mui/icons-material/Healing";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import TrendingDownIcon from "@mui/icons-material/TrendingDown";
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

export default function DashboardPage() {
  const { profile } = useAuth();
  const theme = useTheme();
  const firstName = profile?.fullname?.split(" ")[0] || "there";

  return (
    <>
      {/* Welcome banner */}
      <Card
        sx={{
          mb: 3,
          overflow: "hidden",
          background: "linear-gradient(135deg, #1F4E79 0%, #4CC9C0 55%, #2FBF71 100%)",
          color: "#fff",
          border: "none",
        }}
      >
        <CardContent sx={{ p: { xs: 3, md: 5 }, position: "relative" }}>
          <Box sx={{ maxWidth: 480 }}>
            <Typography variant="h4" fontWeight={800} gutterBottom>
              Welcome back 👋
            </Typography>
            <Typography variant="h4" fontWeight={800} sx={{ mb: 2 }}>
              {firstName}
            </Typography>
            <Typography variant="body1" sx={{ opacity: 0.72, lineHeight: 1.8 }}>
              Use the sidebar to navigate through patient management, laboratory,
              pharmacy, and cashier operations. Your clinic dashboard is ready.
            </Typography>
          </Box>

          {/* Decorative circles */}
          <Box
            sx={{
              position: "absolute",
              top: -40,
              right: -40,
              width: 200,
              height: 200,
              borderRadius: "50%",
              bgcolor: alpha("#4CC9C0", 0.14),
              display: { xs: "none", md: "block" },
            }}
          />
          <Box
            sx={{
              position: "absolute",
              bottom: -60,
              right: 80,
              width: 260,
              height: 260,
              borderRadius: "50%",
              bgcolor: alpha("#2FBF71", 0.12),
              display: { xs: "none", md: "block" },
            }}
          />
        </CardContent>
      </Card>

      {/* Stat cards */}
      <Grid container spacing={3}>
        {stats.map((stat) => (
          <Grid key={stat.label} size={{ xs: 12, sm: 6, md: 3 }}>
            <Card sx={{ height: "100%" }}>
              <CardContent sx={{ p: 3 }}>
                {(() => {
                  const palette =
                    stat.tone === "secondary"
                      ? theme.palette.secondary
                      : stat.tone === "info"
                        ? theme.palette.info
                        : stat.tone === "warning"
                          ? theme.palette.warning
                          : theme.palette.primary;
                  const main = palette.main;
                  const softFrom = alpha(main, 0.16);
                  const softTo = alpha(main, 0.28);
                  return (
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    mb: 3,
                  }}
                >
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
                    {stat.icon}
                  </Box>
                  <MiniBarChart color={main} />
                </Box>
                  );
                })()}

                <Typography variant="h3" fontWeight={700} sx={{ mb: 0.5 }}>
                  {stat.value}
                </Typography>

                <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                  {stat.trending === "up" ? (
                    <TrendingUpIcon sx={{ fontSize: 20, color: "success.main" }} />
                  ) : (
                    <TrendingDownIcon sx={{ fontSize: 20, color: "warning.main" }} />
                  )}
                  <Typography
                    variant="subtitle2"
                    sx={{
                      color: stat.trending === "up" ? "success.main" : "warning.main",
                    }}
                  >
                    {stat.change}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ ml: 0.5 }}>
                    {stat.label}
                  </Typography>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
    </>
  );
}
