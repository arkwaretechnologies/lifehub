/** Report leaf routes — shared by Sidebar and navPermissionCatalog (no icons). */

export type ReportNavLeaf = {
  label: string;
  href: string;
  pageKey: string;
};

export const CONSULTATION_LAB_REPORTS: readonly ReportNavLeaf[] = [
  {
    label: "Encounter Summary",
    href: "/reports/consultation-lab/encounter-summary",
    pageKey: "reports/consultation-lab/encounter-summary",
  },
  {
    label: "Physician Workload",
    href: "/reports/consultation-lab/physician-workload",
    pageKey: "reports/consultation-lab/physician-workload",
  },
  {
    label: "Lab Order Volume",
    href: "/reports/consultation-lab/lab-order-volume",
    pageKey: "reports/consultation-lab/lab-order-volume",
  },
  {
    label: "Lab Turnaround Time",
    href: "/reports/consultation-lab/lab-turnaround-time",
    pageKey: "reports/consultation-lab/lab-turnaround-time",
  },
  {
    label: "Lab Revenue",
    href: "/reports/consultation-lab/lab-revenue",
    pageKey: "reports/consultation-lab/lab-revenue",
  },
  {
    label: "Outstanding Lab Orders",
    href: "/reports/consultation-lab/outstanding-lab-orders",
    pageKey: "reports/consultation-lab/outstanding-lab-orders",
  },
  {
    label: "OR Register",
    href: "/reports/consultation-lab/or-register",
    pageKey: "reports/consultation-lab/or-register",
  },
];

export const RADIOLOGY_REPORTS: readonly ReportNavLeaf[] = [
  {
    label: "Radiologist Interpretation",
    href: "/reports/radiology/radiologist-interpretation",
    pageKey: "reports/radiology/radiologist-interpretation",
  },
];

export const POS_REPORTS: readonly ReportNavLeaf[] = [
  {
    label: "Daily Sales Summary",
    href: "/reports/pos/daily-sales-summary",
    pageKey: "reports/pos/daily-sales-summary",
  },
  {
    label: "Sales by Product",
    href: "/reports/pos/sales-by-product",
    pageKey: "reports/pos/sales-by-product",
  },
  {
    label: "Walk-in vs Prescription",
    href: "/reports/pos/walk-in-vs-prescription",
    pageKey: "reports/pos/walk-in-vs-prescription",
  },
  {
    label: "Payment Method Breakdown",
    href: "/reports/pos/payment-method-breakdown",
    pageKey: "reports/pos/payment-method-breakdown",
  },
  {
    label: "Voided & Returned Sales",
    href: "/reports/pos/voided-returned-sales",
    pageKey: "reports/pos/voided-returned-sales",
  },
  {
    label: "Shift X/Z Readings",
    href: "/reports/pos/shift-readings",
    pageKey: "reports/pos/shift-readings",
  },
  {
    label: "Low Stock & Expiry",
    href: "/reports/pos/low-stock-expiry",
    pageKey: "reports/pos/low-stock-expiry",
  },
  {
    label: "On Hand Items",
    href: "/reports/pos/on-hand-items",
    pageKey: "reports/pos/on-hand-items",
  },
];

export const POS_REPORT_API_KEYS = [
  "daily-sales-summary",
  "sales-by-product",
  "walk-in-vs-prescription",
  "payment-method-breakdown",
  "voided-returned-sales",
  "shift-readings",
  "low-stock-expiry",
  "on-hand-items",
] as const;

export type PosReportApiKey = (typeof POS_REPORT_API_KEYS)[number];

export const CONSULTATION_LAB_REPORT_API_KEYS = [
  "physician-workload",
  "lab-order-volume",
  "lab-turnaround-time",
  "lab-revenue",
  "outstanding-lab-orders",
  "or-register",
] as const;

export type ConsultationLabReportApiKey = (typeof CONSULTATION_LAB_REPORT_API_KEYS)[number];

export const CONSULTATION_LAB_PLACEHOLDER_COPY: Record<string, string> = {
  "encounter-summary": "Daily visit counts by disposition and physician.",
  "physician-workload": "Completed consultations per physician over a date range.",
  "lab-order-volume": "Lab orders by test, category, and package.",
  "lab-turnaround-time": "Average time from order to result release.",
  "lab-revenue": "Lab collections by date and payment method.",
  "outstanding-lab-orders": "Unpaid or pending-payment lab requests.",
  "or-register": "Official receipt log across lab and physician fee sales.",
};

export function consultationLabSlugFromHref(href: string): string | null {
  const prefix = "/reports/consultation-lab/";
  if (!href.startsWith(prefix)) return null;
  return href.slice(prefix.length).replace(/\/$/, "") || null;
}

export function posReportApiKeyFromHref(href: string): PosReportApiKey | null {
  const prefix = "/reports/pos/";
  if (!href.startsWith(prefix)) return null;
  const slug = href.slice(prefix.length).replace(/\/$/, "");
  return (POS_REPORT_API_KEYS as readonly string[]).includes(slug) ? (slug as PosReportApiKey) : null;
}

export function consultationLabReportApiKeyFromHref(
  href: string,
): ConsultationLabReportApiKey | null {
  const slug = consultationLabSlugFromHref(href);
  if (!slug) return null;
  return (CONSULTATION_LAB_REPORT_API_KEYS as readonly string[]).includes(slug)
    ? (slug as ConsultationLabReportApiKey)
    : null;
}
