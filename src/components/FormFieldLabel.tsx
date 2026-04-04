"use client";

import type { ReactNode } from "react";
import { Box, Typography } from "@mui/material";

export function FormFieldLabel({
  htmlFor,
  children,
  uppercase = false,
  required: fieldRequired = false,
}: {
  htmlFor: string;
  children: ReactNode;
  /** When true, label text is forced to all caps (default is sentence case). */
  uppercase?: boolean;
  required?: boolean;
}) {
  return (
    <Typography
      component="label"
      variant="body2"
      htmlFor={htmlFor}
      sx={{
        display: "block",
        mb: 0.75,
        fontWeight: 600,
        letterSpacing: uppercase ? 0.02 : 0,
        textTransform: uppercase ? "uppercase" : "none",
        color: "text.primary",
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
