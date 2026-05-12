"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import {
  Box,
  TextField,
  Button,
  Typography,
  Alert,
  CircularProgress,
  alpha,
} from "@mui/material";
import { keyframes } from "@mui/system";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/components/AuthProvider";
import { firstAllowedHref } from "@/lib/navPermissionCatalog";
import { LIFEHUB_LOGO_SRC } from "@/lib/lifehubLogo";

const cardEntrance = keyframes`
  from {
    opacity: 0;
    transform: translateY(26px) scale(0.985);
    filter: blur(7px);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
    filter: blur(0);
  }
`;

const leftPaneEntrance = keyframes`
  from {
    opacity: 0;
    transform: translateX(-26px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
`;

const rightPaneEntrance = keyframes`
  from {
    opacity: 0;
    transform: translateX(26px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
`;

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const { data, error: rpcError } = await supabase.rpc("authenticate_user", {
        identifier: identifier.trim(),
        input_password: password,
      });

      if (rpcError) {
        setError(rpcError.message);
        return;
      }

      if (!data) {
        setError("Invalid username or password.");
        return;
      }

      await login(data);
      let dest = "/dashboard";
      try {
        const raw = localStorage.getItem("lifehub_session");
        if (raw) {
          const { menuAccess } = JSON.parse(raw) as { menuAccess?: { rbac?: boolean; pageKeys?: string[] } };
          if (menuAccess?.rbac && menuAccess.pageKeys?.length) {
            const href = firstAllowedHref(menuAccess.pageKeys);
            if (href) dest = href;
          }
        }
      } catch {
        /* keep /dashboard */
      }
      router.push(dest);
    } catch {
      setError("An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box
      sx={{
        minHeight: "100dvh",
        boxSizing: "border-box",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
        overflow: "hidden",
        /* Breathing room around the floating card */
        px: { xs: 2, sm: 3 },
        py: { xs: 3, sm: 5 },
        background:
          "linear-gradient(165deg, #e3f2fd 0%, #e8f6f4 38%, #f5faf9 72%, #ffffff 100%)",
      }}
    >
      {/* Soft ambient orbs (page backdrop, outside the card) */}
      <Box
        sx={{
          position: "absolute",
          top: "-12%",
          left: "-8%",
          width: { xs: 280, md: 420 },
          height: { xs: 280, md: 420 },
          borderRadius: "50%",
          bgcolor: alpha("#4CC9C0", 0.22),
          filter: "blur(2px)",
          pointerEvents: "none",
        }}
      />
      <Box
        sx={{
          position: "absolute",
          bottom: "-10%",
          right: "-5%",
          width: { xs: 260, md: 380 },
          height: { xs: 260, md: 380 },
          borderRadius: "50%",
          bgcolor: alpha("#1F4E79", 0.12),
          filter: "blur(2px)",
          pointerEvents: "none",
        }}
      />
      <Box
        sx={{
          position: "absolute",
          top: "35%",
          right: "8%",
          width: 180,
          height: 180,
          borderRadius: "50%",
          bgcolor: alpha("#2FBF71", 0.14),
          filter: "blur(3px)",
          pointerEvents: "none",
          display: { xs: "none", lg: "block" },
        }}
      />

      {/* Centered floating card — slightly larger than the original 960px */}
      <Box
        sx={{
          position: "relative",
          zIndex: 1,
          width: "100%",
          maxWidth: 1160,
          minHeight: { md: 520 },
          borderRadius: { xs: 3, md: "24px" },
          overflow: "hidden",
          display: "flex",
          flexDirection: { xs: "column", md: "row" },
          boxShadow:
            "0 34px 90px rgba(31, 78, 121, 0.18), 0 16px 42px rgba(15, 55, 82, 0.08)",
          bgcolor: "#fff",
          animation: `${cardEntrance} 780ms cubic-bezier(0.2, 0.8, 0.2, 1) both`,
          willChange: "transform, opacity",
        }}
      >
        {/* Hero / brand half */}
        <Box
          sx={{
            /* Wider brand column (~62%) vs form (~38%) */
            flex: { md: "1.58 1 0%" },
            minHeight: { xs: 360, sm: 460, md: 520 },
            background:
              "linear-gradient(140deg, #1F6F8B 0%, #45C7BA 54%, #2FC878 100%)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
            position: "relative",
            overflow: "hidden",
            px: { xs: 3, sm: 5, md: 6 },
            py: { xs: 5, md: 6 },
            animation: `${leftPaneEntrance} 760ms cubic-bezier(0.2, 0.8, 0.2, 1) 120ms both`,
          }}
        >
          <Box
            sx={{
              position: "absolute",
              top: -96,
              left: -92,
              width: { xs: 260, md: 330 },
              height: { xs: 260, md: 330 },
              borderRadius: "50%",
              bgcolor: alpha("#FFFFFF", 0.09),
            }}
          />
          <Box
            sx={{
              position: "absolute",
              bottom: -92,
              right: -72,
              width: { xs: 260, md: 340 },
              height: { xs: 260, md: 340 },
              borderRadius: "50%",
              bgcolor: alpha("#B9FFE3", 0.14),
            }}
          />
          <Box sx={{ position: "relative", zIndex: 1, textAlign: "center", width: "100%" }}>
            <Box
              sx={{
                width: { xs: 220, sm: 280, md: 360 },
                height: { xs: 220, sm: 280, md: 360 },
                maxWidth: "100%",
                borderRadius: "24px",
                overflow: "visible",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                mx: "auto",
                mb: { xs: 1.5, md: 0 },
                position: "relative",
                "&::before": {
                  content: '""',
                  position: "absolute",
                  inset: "12%",
                  borderRadius: "50%",
                  bgcolor: alpha("#FFFFFF", 0.16),
                  filter: "blur(34px)",
                },
              }}
            >
              <Image
                src={LIFEHUB_LOGO_SRC}
                alt="LifeHub logo"
                width={420}
                height={420}
                style={{ width: "100%", height: "100%", objectFit: "contain", position: "relative" }}
                priority
              />
            </Box>
            <Box
              sx={{
                mt: { xs: 3, md: 2.5 },
                mx: "auto",
                textAlign: "center",
                position: "relative",
              }}
            >
              <Typography
                variant="h6"
                sx={{
                  color: alpha("#fff", 0.76),
                  fontFamily: "var(--font-inter), 'Segoe UI', sans-serif",
                  fontWeight: 400,
                  fontSize: { xs: "1rem", sm: "1.15rem", md: "1.3rem" },
                  letterSpacing: "0.14em",
                  lineHeight: 1,
                  mb: 0.5,
                  textShadow: "0 4px 16px rgba(0, 0, 0, 0.24)",
                }}
              >
                Your health
              </Typography>
              <Typography
                variant="h6"
                sx={{
                  color: "#FFFFFF",
                  mt: 0,
                  fontFamily: "var(--font-inter), 'Segoe UI', sans-serif",
                  fontWeight: 600,
                  fontSize: { xs: "1.25rem", sm: "1.55rem", md: "1.85rem" },
                  letterSpacing: { xs: "0.12em", md: "0.14em" },
                  lineHeight: 1,
                  textTransform: "uppercase",
                  textShadow: "0 7px 22px rgba(0, 0, 0, 0.32)",
                }}
              >
                has a home
              </Typography>
            </Box>
          </Box>
        </Box>

        {/* Form column */}
        <Box
          sx={{
            flex: { md: "1 1 0%" },
            bgcolor: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            px: { xs: 3, sm: 4, md: 5 },
            py: { xs: 4, md: 6 },
            animation: `${rightPaneEntrance} 760ms cubic-bezier(0.2, 0.8, 0.2, 1) 180ms both`,
          }}
        >
          <Box sx={{ width: "100%", maxWidth: 400 }}>
            <Box sx={{ mb: 4 }}>
              <Typography
                variant="h4"
                fontWeight={600}
                sx={{
                  mb: 0.75,
                  fontFamily: "var(--font-montserrat), 'Inter', sans-serif",
                  letterSpacing: "0.12em",
                  color: "#1F4E79",
                  textTransform: "uppercase",
                  fontSize: { xs: "1.5rem", md: "1.75rem" },
                  lineHeight: 1.22,
                  textAlign: "left",
                }}
              >
                <Box component="span" sx={{ display: "block" }}>
                  Clinic
                </Box>
                <Box component="span" sx={{ display: "block" }}>
                  Management
                </Box>
                <Box component="span" sx={{ display: "block" }}>
                  System
                </Box>
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 400 }}>
                Sign in to access your dashboard
              </Typography>
            </Box>

            {error && (
              <Alert
                severity="error"
                sx={{
                  mb: 3,
                  borderRadius: 2,
                  border: "1px solid",
                  borderColor: "error.light",
                }}
              >
                {error}
              </Alert>
            )}

            <Box component="form" onSubmit={handleLogin}>
              <TextField
                label="Username or Email"
                type="text"
                fullWidth
                required
                name="username"
                autoComplete="username"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                InputLabelProps={{ shrink: true }}
                sx={{
                  mb: 2.5,
                  "& .MuiOutlinedInput-root": {
                    borderRadius: 2,
                    bgcolor: "grey.50",
                    transition: "all 0.2s ease",
                    "&:hover": {
                      bgcolor: "grey.100",
                    },
                    "&.Mui-focused": {
                      bgcolor: "#fff",
                      boxShadow: "0 0 0 3px rgba(31, 78, 121, 0.12)",
                    },
                  },
                }}
              />
              <TextField
                label="Password"
                type="password"
                fullWidth
                required
                name="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                InputLabelProps={{ shrink: true }}
                sx={{
                  mb: 3.5,
                  "& .MuiOutlinedInput-root": {
                    borderRadius: 2,
                    bgcolor: "grey.50",
                    transition: "all 0.2s ease",
                    "&:hover": {
                      bgcolor: "grey.100",
                    },
                    "&.Mui-focused": {
                      bgcolor: "#fff",
                      boxShadow: "0 0 0 3px rgba(31, 78, 121, 0.12)",
                    },
                  },
                }}
              />
              <Button
                type="submit"
                variant="contained"
                fullWidth
                size="large"
                disabled={loading}
                sx={{
                  py: 1.75,
                  borderRadius: 2,
                  fontSize: "0.9375rem",
                  fontWeight: 700,
                  textTransform: "none",
                  background: "linear-gradient(135deg, #1F4E79 0%, #4CC9C0 100%)",
                  boxShadow: "0 4px 14px rgba(31, 78, 121, 0.25)",
                  transition: "all 0.2s ease",
                  "&:hover": {
                    boxShadow: "0 6px 20px rgba(31, 78, 121, 0.35)",
                    transform: "translateY(-1px)",
                  },
                  "&:active": {
                    transform: "translateY(0)",
                  },
                }}
              >
                {loading ? <CircularProgress size={24} color="inherit" /> : "Sign In"}
              </Button>
            </Box>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
