"use client";

import { createTheme, alpha, type Shadows } from "@mui/material/styles";

declare module "@mui/material/styles" {
  interface PaletteColor {
    lighter?: string;
    darker?: string;
  }
  interface SimplePaletteColorOptions {
    lighter?: string;
    darker?: string;
  }
}

// Medical Calm design tokens (strict blue/green system).
const BRAND = {
  teal: "#4CC9C0", // Primary (soft teal)
  green: "#2FBF71", // Secondary (green)
  blue: "#1F4E79", // Accent (blue)
  orange: "#F59E0B", // Highlight (use VERY sparingly)
} as const;

const NEUTRAL = {
  bg: "#F8FAFC",
  surface: "#FFFFFF",
  text: "#1E293B",
  textSecondary: "#64748B",
  border: "#E2E8F0",
  header: "#F1F5F9",
} as const;

const MOTION = {
  duration: "200ms",
  easing: "cubic-bezier(0.4, 0, 0.2, 1)",
} as const;

const SOFT_SHADOW = {
  resting: "0 4px 12px rgba(0,0,0,0.05)",
  hover: "0 10px 24px rgba(0,0,0,0.08)",
  popover: "0 12px 32px rgba(0,0,0,0.12)",
} as const;

const theme = createTheme({
  palette: {
    // palette.primary: Primary (soft teal)
    primary: {
      lighter: alpha(BRAND.teal, 0.14),
      light: alpha(BRAND.teal, 0.28),
      main: BRAND.teal,
      dark: "#2EA49D",
      darker: "#1D6E69",
      contrastText: "#FFFFFF",
    },
    // palette.secondary: Secondary (green)
    secondary: {
      lighter: alpha(BRAND.green, 0.14),
      light: alpha(BRAND.green, 0.28),
      main: BRAND.green,
      dark: "#24985A",
      darker: "#1B7243",
      contrastText: "#FFFFFF",
    },
    // palette.info: Accent (blue)
    info: {
      lighter: alpha(BRAND.blue, 0.14),
      light: alpha(BRAND.blue, 0.28),
      main: BRAND.blue,
      dark: "#163D60",
      darker: "#0E2A43",
      contrastText: "#FFFFFF",
    },
    warning: {
      lighter: alpha(BRAND.orange, 0.14),
      light: alpha(BRAND.orange, 0.28),
      main: BRAND.orange,
      dark: "#D18407",
      darker: "#8A5504",
      contrastText: "#1E293B",
    },
    background: {
      default: NEUTRAL.bg,
      paper: NEUTRAL.surface,
    },
    text: {
      primary: NEUTRAL.text,
      secondary: NEUTRAL.textSecondary,
    },
    divider: NEUTRAL.border,
    action: {
      hover: alpha(NEUTRAL.textSecondary, 0.08),
      selected: alpha(NEUTRAL.textSecondary, 0.12),
      focus: alpha(BRAND.blue, 0.18),
    },
  },
  typography: {
    fontFamily:
      "'Inter', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans', 'Liberation Sans', sans-serif",
    h3: { fontWeight: 800, letterSpacing: -0.6 },
    h4: { fontWeight: 800, letterSpacing: -0.5 },
    h5: { fontWeight: 750, letterSpacing: -0.3 },
    h6: { fontWeight: 700, letterSpacing: -0.2 },
    subtitle1: { fontWeight: 650 },
    subtitle2: { fontWeight: 650 },
    body1: { fontSize: "0.875rem", lineHeight: 1.6 },
    body2: { fontSize: "0.8125rem", lineHeight: 1.6 },
    caption: { fontSize: "0.75rem", lineHeight: 1.5 },
  },
  shape: {
    borderRadius: 12,
  },
  shadows: [
    "none",
    "0 1px 2px rgba(15, 23, 42, 0.06)",
    "0 2px 6px rgba(15, 23, 42, 0.06)",
    "0 4px 12px rgba(15, 23, 42, 0.06)",
    "0 8px 20px rgba(15, 23, 42, 0.08)",
    "0 12px 28px rgba(15, 23, 42, 0.10)",
    "0 16px 36px rgba(15, 23, 42, 0.10)",
    "0 20px 44px rgba(15, 23, 42, 0.10)",
    "0 24px 52px rgba(15, 23, 42, 0.10)",
    ...Array(16).fill("none"),
  ] as unknown as Shadows,
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: { backgroundColor: NEUTRAL.bg },

        /**
         * Apple-like scrollbars (subtle, rounded, non-harsh).
         * - Chrome/Edge/Safari: ::-webkit-scrollbar*
         * - Firefox: scrollbar-width / scrollbar-color
         */
        "*": {
          scrollbarWidth: "thin",
          scrollbarColor: `${alpha(NEUTRAL.text, 0.22)} transparent`,
        },
        "*::-webkit-scrollbar": {
          width: 10,
          height: 10,
        },
        "*::-webkit-scrollbar-track": {
          background: "transparent",
        },
        "*::-webkit-scrollbar-thumb": {
          backgroundColor: alpha(NEUTRAL.text, 0.22),
          borderRadius: 999,
          border: "3px solid transparent",
          backgroundClip: "padding-box",
        },
        "*::-webkit-scrollbar-thumb:hover": {
          backgroundColor: alpha(NEUTRAL.text, 0.32),
        },
        "*::-webkit-scrollbar-thumb:active": {
          backgroundColor: alpha(NEUTRAL.text, 0.42),
        },
        "*::-webkit-scrollbar-corner": {
          background: "transparent",
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          transition: `box-shadow ${MOTION.duration} ${MOTION.easing}, transform ${MOTION.duration} ${MOTION.easing}, background-color ${MOTION.duration} ${MOTION.easing}`,
        },
      },
    },
    MuiButtonBase: {
      styleOverrides: {
        root: {
          transition: `transform ${MOTION.duration} ${MOTION.easing}, box-shadow ${MOTION.duration} ${MOTION.easing}, background-color ${MOTION.duration} ${MOTION.easing}, color ${MOTION.duration} ${MOTION.easing}`,
          WebkitTapHighlightColor: "transparent",
        },
      },
    },
    MuiCard: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: {
          borderRadius: 12,
          backgroundColor: NEUTRAL.surface,
          border: `1px solid ${NEUTRAL.border}`,
          boxShadow: SOFT_SHADOW.resting,
          position: "relative" as const,
          zIndex: 0,
          transition: `transform ${MOTION.duration} ${MOTION.easing}, box-shadow ${MOTION.duration} ${MOTION.easing}`,
          "@media (hover:hover)": {
            "&:hover": {
              transform: "translateY(-2px)",
              boxShadow: SOFT_SHADOW.hover,
            },
          },
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: "none" as const,
          borderRadius: 10,
          fontWeight: 700,
          boxShadow: "none",
          transform: "translateZ(0)",
          willChange: "transform, box-shadow",
          transition: `transform ${MOTION.duration} ${MOTION.easing}, box-shadow ${MOTION.duration} ${MOTION.easing}, background-color ${MOTION.duration} ${MOTION.easing}, border-color ${MOTION.duration} ${MOTION.easing}, color ${MOTION.duration} ${MOTION.easing}`,
          "@media (hover:hover)": {
            "&:hover": {
              transform: "scale(1.02)",
              boxShadow: SOFT_SHADOW.resting,
            },
          },
          "&:active": {
            transform: "scale(0.98)",
          },
        },
        containedPrimary: {
          // Strict rule: Primary contained buttons are GREEN.
          backgroundColor: BRAND.green,
          "@media (hover:hover)": {
            "&:hover": {
              backgroundColor: "#24985A",
              boxShadow: SOFT_SHADOW.hover,
            },
          },
        },
        containedSecondary: {
          backgroundColor: BRAND.teal,
          "@media (hover:hover)": {
            "&:hover": {
              backgroundColor: "#2EA49D",
              boxShadow: SOFT_SHADOW.hover,
            },
          },
        },
        outlined: {
          borderColor: NEUTRAL.border,
          "@media (hover:hover)": {
            "&:hover": {
              borderColor: alpha(BRAND.blue, 0.35),
              backgroundColor: alpha(BRAND.blue, 0.04),
            },
          },
        },
      },
    },
    MuiTextField: {
      defaultProps: { variant: "outlined" as const },
      styleOverrides: {
        root: {
          "& .MuiOutlinedInput-root": {
            borderRadius: 10,
          },
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          transition: `box-shadow ${MOTION.duration} ${MOTION.easing}, background-color ${MOTION.duration} ${MOTION.easing}`,
          "& .MuiOutlinedInput-notchedOutline": {
            transition: `border-color ${MOTION.duration} ${MOTION.easing}`,
            borderColor: NEUTRAL.border,
          },
          "&.Mui-focused": {
            boxShadow: `0 0 0 4px ${alpha(BRAND.blue, 0.14)}`,
          },
          "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
            // Accent blue focus ring (medical SaaS feel)
            borderColor: BRAND.blue,
            borderWidth: 1,
          },
        },
      },
    },
    MuiListItemButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          transition: `background-color ${MOTION.duration} ${MOTION.easing}, transform ${MOTION.duration} ${MOTION.easing}, padding ${MOTION.duration} ${MOTION.easing}`,
          "@media (hover:hover)": {
            "&:hover": {
              transform: "translateX(4px)",
            },
          },
          "&.Mui-selected": {
            transition: `background-color ${MOTION.duration} ${MOTION.easing}, transform ${MOTION.duration} ${MOTION.easing}`,
          },
        },
      },
    },
    MuiTableRow: {
      styleOverrides: {
        root: {
          transition: `background-color ${MOTION.duration} ${MOTION.easing}`,
          "@media (hover:hover)": {
            "&:hover": {
              backgroundColor: NEUTRAL.bg,
            },
          },
        },
      },
    },
    MuiMenu: {
      styleOverrides: {
        paper: {
          boxShadow: SOFT_SHADOW.popover,
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: { fontWeight: 600, borderRadius: 8 },
      },
    },
    MuiTableHead: {
      styleOverrides: {
        root: {
          "& .MuiTableCell-head": {
            backgroundColor: NEUTRAL.header,
            color: NEUTRAL.textSecondary,
            fontWeight: 600,
            fontSize: "0.8125rem",
          },
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: {
          borderBottom: "none",
        },
      },
    },
  },
});

export default theme;
