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
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/components/AuthProvider";

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
        setLoading(false);
        return;
      }

      if (!data) {
        setError("Invalid username or password.");
        setLoading(false);
        return;
      }

      login(data);
      router.push("/dashboard");
    } catch {
      setError("An unexpected error occurred.");
      setLoading(false);
    }
  };

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        bgcolor: "#F9FAFB",
      }}
    >
      {/* Left decorative panel */}
      <Box
        sx={{
          display: { xs: "none", md: "flex" },
          width: "50%",
          background: "linear-gradient(135deg, #003768 0%, #004B50 50%, #007867 100%)",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          position: "relative",
          overflow: "hidden",
          px: 6,
        }}
      >
        <Box
          sx={{
            position: "absolute",
            top: -100,
            left: -100,
            width: 400,
            height: 400,
            borderRadius: "50%",
            bgcolor: alpha("#5BE49B", 0.06),
          }}
        />
        <Box
          sx={{
            position: "absolute",
            bottom: -80,
            right: -80,
            width: 350,
            height: 350,
            borderRadius: "50%",
            bgcolor: alpha("#5BE49B", 0.08),
          }}
        />
        <Box sx={{ position: "relative", zIndex: 1, textAlign: "center" }}>
          <Box
            sx={{
              width: 64,
              height: 64,
              borderRadius: "16px",
              overflow: "hidden",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              mx: "auto",
              mb: 3,
            }}
          >
            <Image
              src="/lifehub-logo.png"
              alt="LifeHub logo"
              width={64}
              height={64}
              style={{ width: "100%", height: "100%", objectFit: "contain" }}
              priority
            />
          </Box>
          <Typography
            variant="h3"
            fontWeight={800}
            sx={{ color: "#fff", mb: 2 }}
          >
            LifeHub
          </Typography>
          <Typography
            variant="body1"
            sx={{ color: alpha("#fff", 0.64), maxWidth: 360, mx: "auto", lineHeight: 1.8 }}
          >
            Streamline your clinic operations with a modern management system
            built for healthcare professionals.
          </Typography>
        </Box>
      </Box>

      {/* Right login form */}
      <Box
        sx={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          px: { xs: 2, sm: 4 },
        }}
      >
        <Box sx={{ width: "100%", maxWidth: 420 }}>
          {/* Mobile logo */}
          <Box
            sx={{
              display: { xs: "flex", md: "none" },
              alignItems: "center",
              gap: 1,
              mb: 4,
            }}
          >
            <Box
              sx={{
                width: 40,
                height: 40,
                borderRadius: "12px",
                overflow: "hidden",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Image
                src="/lifehub-logo.png"
                alt="LifeHub logo"
                width={40}
                height={40}
                style={{ width: "100%", height: "100%", objectFit: "contain" }}
                priority
              />
            </Box>
            <Typography variant="h6" fontWeight={800}>
              LifeHub
            </Typography>
          </Box>

          <Typography variant="h4" fontWeight={800} sx={{ mb: 1 }}>
            Sign in
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
            Enter your credentials to access the dashboard
          </Typography>

          {error && (
            <Alert
              severity="error"
              sx={{ mb: 3, borderRadius: 1.5 }}
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
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              InputLabelProps={{ shrink: true }}
              sx={{ mb: 2.5 }}
            />
            <TextField
              label="Password"
              type="password"
              fullWidth
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              InputLabelProps={{ shrink: true }}
              sx={{ mb: 3 }}
            />
            <Button
              type="submit"
              variant="contained"
              fullWidth
              size="large"
              disabled={loading}
              sx={{
                py: 1.5,
                fontSize: "0.9375rem",
                bgcolor: "#212B36",
              }}
            >
              {loading ? (
                <CircularProgress size={24} color="inherit" />
              ) : (
                "Sign In"
              )}
            </Button>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
