"use client";

import type { ReactNode } from "react";
import { Typography } from "@mui/material";
import type { SxProps, Theme } from "@mui/material/styles";

/** Matches Physician's Record section headings (GENERAL, Vital signs, etc.). */
export function ConsultationSectionTitle({
  children,
  sx,
  /** Smaller bottom margin for nested PE-style blocks (default: section spacing). */
  dense = false,
}: {
  children: ReactNode;
  sx?: SxProps<Theme>;
  dense?: boolean;
}) {
  return (
    <Typography
      variant="body2"
      fontWeight={700}
      color="info.main"
      sx={{ letterSpacing: "0.02em", display: "block", mb: dense ? 1 : 2, ...sx }}
    >
      {children}
    </Typography>
  );
}

/** Inset panel headings (Past medical history, Current medications). */
export function ConsultationSubsectionTitle({ children }: { children: ReactNode }) {
  return (
    <Typography
      component="h3"
      variant="body2"
      fontWeight={700}
      color="info.main"
      sx={{ letterSpacing: "0.02em", display: "block", mb: 1.5 }}
    >
      {children}
    </Typography>
  );
}

/** FormControlLabel for checkboxes/radios — matches Physician `checkboxRowSx`. */
export const consultFormControlLabelSx = {
  m: 0,
  mr: 0,
  alignItems: "center",
  gap: 0,
  columnGap: 0.25,
  "& .MuiCheckbox-root": { padding: "4px" },
  "& .MuiRadio-root": { padding: "4px" },
  "& .MuiFormControlLabel-label": {
    fontSize: "0.8125rem",
    fontWeight: 500,
    color: "text.primary",
  },
} as const;
