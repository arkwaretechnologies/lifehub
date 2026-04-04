"use client";

import type { ReactNode } from "react";
import { Box, Typography } from "@mui/material";

export function FormFieldLabel({
  htmlFor,
  children,
  uppercase = false,
  required: fieldRequired = false,
  /** Aligns with consultation Physician's Record field labels (`info.main`, 700). */
  variant = "default",
}: {
  htmlFor: string;
  children: ReactNode;
  /** When true, label text is forced to all caps (default is sentence case). */
  uppercase?: boolean;
  required?: boolean;
  variant?: "default" | "consultation";
}) {
  const isConsult = variant === "consultation";
  return (
    <Typography
      component="label"
      variant="body2"
      htmlFor={htmlFor}
      sx={{
        display: "block",
        mb: 0.75,
        fontWeight: isConsult ? 700 : 600,
        letterSpacing: isConsult ? 0.02 : uppercase ? 0.02 : 0,
        textTransform: uppercase ? "uppercase" : "none",
        color: isConsult ? "info.main" : "text.primary",
      }}
    >
      {children}
      {fieldRequired ? (
        <Box component="span" sx={{ color: "error.main", ml: 0.25 }} aria-hidden>
          *
        </Box>
      ) : null}
    </Typography>
  );
}
