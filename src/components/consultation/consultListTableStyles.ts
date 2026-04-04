/**
 * Shared table + body typography for consultation home and patient records list
 * (aligned with Medical history / ConsultationSectionTitle).
 */
export const consultTableSx = {
  border: "1px solid",
  borderColor: "divider",
  "& td": { borderColor: "divider" },
} as const;

export const consultTableHeadRowSx = { bgcolor: "grey.200" } as const;

export const consultTableHeadCellSx = {
  textTransform: "uppercase" as const,
  fontWeight: 700,
  color: "info.main",
  letterSpacing: "0.02em",
  fontSize: "0.8125rem",
} as const;

export const consultTableBodyCellSx = {
  fontSize: "0.8125rem",
  fontWeight: 500,
  color: "text.primary",
  verticalAlign: "middle" as const,
} as const;

export const consultBodyTypoSx = {
  fontSize: "0.8125rem",
  lineHeight: 1.6,
  fontWeight: 500,
} as const;
