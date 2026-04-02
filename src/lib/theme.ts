"use client";

import { createTheme, alpha } from "@mui/material/styles";

const PRIMARY = {
  lighter: "#C8FAD6",
  light: "#5BE49B",
  main: "#00A76F",
  dark: "#007867",
  darker: "#004B50",
};

const SECONDARY = {
  lighter: "#EFD6FF",
  light: "#C684FF",
  main: "#8E33FF",
  dark: "#5119B7",
  darker: "#27097A",
};

const INFO = {
  lighter: "#CAFDF5",
  light: "#61F3F3",
  main: "#00B8D9",
  dark: "#006C9C",
  darker: "#003768",
};

const SUCCESS = {
  lighter: "#D3FCD2",
  light: "#77ED8B",
  main: "#22C55E",
  dark: "#118D57",
  darker: "#065E49",
};

const WARNING = {
  lighter: "#FFF5CC",
  light: "#FFD666",
  main: "#FFAB00",
  dark: "#B76E00",
  darker: "#7A4100",
};

const ERROR = {
  lighter: "#FFE9D5",
  light: "#FFAC82",
  main: "#FF5630",
  dark: "#B71D18",
  darker: "#7A0916",
};

const GREY = {
  100: "#F9FAFB",
  200: "#F4F6F8",
  300: "#DFE3E8",
  400: "#C4CDD5",
  500: "#919EAB",
  600: "#637381",
  700: "#454F5B",
  800: "#212B36",
  900: "#161C24",
};

const theme = createTheme({
  palette: {
    primary: PRIMARY,
    secondary: SECONDARY,
    info: INFO,
    success: SUCCESS,
    warning: WARNING,
    error: ERROR,
    grey: GREY,
    background: {
      default: GREY[100],
      paper: "#FFFFFF",
    },
    text: {
      primary: GREY[800],
      secondary: GREY[600],
    },
    divider: alpha(GREY[500], 0.2),
    action: {
      hover: alpha(GREY[500], 0.08),
      selected: alpha(GREY[500], 0.12),
      focus: alpha(GREY[500], 0.24),
    },
  },
  typography: {
    fontFamily: "'Inter', 'Public Sans', 'Roboto', sans-serif",
    h4: { fontWeight: 700, fontSize: "1.5rem", lineHeight: 1.5 },
    h5: { fontWeight: 700, fontSize: "1.25rem", lineHeight: 1.5 },
    h6: { fontWeight: 700, fontSize: "1.0625rem", lineHeight: 1.5 },
    subtitle1: { fontWeight: 600, fontSize: "1rem", lineHeight: 1.5 },
    subtitle2: { fontWeight: 600, fontSize: "0.875rem", lineHeight: 1.57 },
    body1: { fontSize: "0.875rem", lineHeight: 1.57 },
    body2: { fontSize: "0.8125rem", lineHeight: 1.57 },
    caption: { fontSize: "0.75rem", lineHeight: 1.5 },
    overline: {
      fontSize: "0.6875rem",
      fontWeight: 700,
      lineHeight: 1.5,
      textTransform: "uppercase",
      letterSpacing: "0.08em",
    },
  },
  shape: {
    borderRadius: 8,
  },
  shadows: [
    "none",
    `0 1px 2px 0 ${alpha(GREY[500], 0.16)}`,
    `0 1px 2px 0 ${alpha(GREY[500], 0.16)}`,
    `0 4px 8px 0 ${alpha(GREY[500], 0.16)}`,
    `0 8px 16px 0 ${alpha(GREY[500], 0.16)}`,
    `0 12px 24px -4px ${alpha(GREY[500], 0.16)}`,
    `0 16px 32px -4px ${alpha(GREY[500], 0.16)}`,
    `0 20px 40px -4px ${alpha(GREY[500], 0.16)}`,
    `0 24px 48px 0 ${alpha(GREY[500], 0.16)}`,
    ...Array(16).fill("none"),
  ] as any,
  components: {
    MuiCard: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: {
          borderRadius: 16,
          boxShadow: `0 0 2px 0 ${alpha(GREY[500], 0.2)}, 0 12px 24px -4px ${alpha(GREY[500], 0.12)}`,
          position: "relative" as const,
          zIndex: 0,
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: "none" as const,
          borderRadius: 8,
          fontWeight: 700,
          boxShadow: "none",
          "&:hover": { boxShadow: "none" },
        },
        containedPrimary: {
          backgroundColor: PRIMARY.main,
          "&:hover": { backgroundColor: PRIMARY.dark },
        },
      },
    },
    MuiTextField: {
      defaultProps: { variant: "outlined" as const },
      styleOverrides: {
        root: {
          "& .MuiOutlinedInput-root": {
            borderRadius: 8,
          },
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
            backgroundColor: GREY[200],
            color: GREY[600],
            fontWeight: 600,
            fontSize: "0.8125rem",
          },
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: {
          borderBottom: `1px solid ${alpha(GREY[500], 0.16)}`,
        },
      },
    },
  },
});

export default theme;
