"use client";

import {
  Box,
  Card,
  CardContent,
  Checkbox,
  FormControlLabel,
  Grid,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  alpha,
  useTheme,
} from "@mui/material";
import PosReportShell, { moneyPhp, type PosReportControls } from "@/components/reports/PosReportShell";
import ReportTablePagination from "@/components/reports/ReportTablePagination";
import type {
  DailySalesRow,
  LowStockExpiryRow,
  OnHandItemRow,
  PaymentMethodRow,
  SalesByProductRow,
  ShiftReadingRow,
  VoidedReturnedRow,
  WalkInDailyRow,
} from "@/lib/posReports";
import type { PosReportApiKey } from "@/lib/reportsNavLeaves";
import { useMemo, useState, type ReactNode } from "react";

type PosReportPageProps = {
  title: string;
  reportKey: PosReportApiKey;
  /** Initial date range in days (1 = today only). Default 14. */
  defaultDaysBack?: number;
};

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <Card variant="outlined" sx={{ height: "100%" }}>
      <CardContent>
        <Typography variant="body2" color="text.secondary" gutterBottom>
          {label}
        </Typography>
        <Typography variant="h6" fontWeight={600}>
          {value}
        </Typography>
      </CardContent>
    </Card>
  );
}

function DailySalesBarChart({ daily }: { daily: DailySalesRow[] }) {
  const theme = useTheme();
  const color = theme.palette.primary.main;
  const max = Math.max(1, ...daily.map((d) => d.total));
  const h = 200;
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "flex-end",
        gap: 0.5,
        height: h,
        pt: 2,
        px: 0.5,
        overflowX: "auto",
        pb: 0.5,
      }}
    >
      {daily.map((d) => {
        const pct = (d.total / max) * 100;
        const barH = Math.max(d.total > 0 ? 8 : 2, (pct / 100) * (h - 36));
        const [, m, day] = d.date.split("-");
        return (
          <Box
            key={d.date}
            sx={{
              flex: 1,
              minWidth: 28,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "flex-end",
            }}
          >
            <Typography variant="caption" sx={{ fontSize: "0.65rem", color: "text.secondary", mb: 0.25 }}>
              {d.total > 0 ? moneyPhp(d.total) : ""}
            </Typography>
            <Box
              sx={{
                width: "100%",
                maxWidth: 32,
                height: barH,
                bgcolor: alpha(color, 0.85),
                borderRadius: "4px 4px 0 0",
              }}
            />
            <Typography variant="caption" sx={{ fontSize: "0.65rem", color: "text.secondary", mt: 0.5 }}>
              {m}/{day}
            </Typography>
          </Box>
        );
      })}
    </Box>
  );
}

function EmptyTable({ message }: { message: string }) {
  return (
    <Typography variant="body2" color="text.secondary" sx={{ py: 4, textAlign: "center" }}>
      {message}
    </Typography>
  );
}

function ReportTable({
  columns,
  rows,
  emptyMessage,
  controls,
}: {
  columns: string[];
  rows: ReactNode[][];
  emptyMessage: string;
  controls: PosReportControls;
}) {
  return (
    <>
      {rows.length === 0 ? (
        <EmptyTable message={emptyMessage} />
      ) : (
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                {columns.map((c) => (
                  <TableCell key={c}>{c}</TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((cells, i) => (
                <TableRow key={i}>
                  {cells.map((cell, j) => (
                    <TableCell key={j}>{cell}</TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
      <ReportTablePagination
        pagination={controls.pagination}
        onPageChange={controls.setPage}
        onPageSizeChange={controls.setPageSize}
      />
    </>
  );
}

function DailySalesView({ data, controls }: { data: Record<string, unknown>; controls: PosReportControls }) {
  const daily = (data.daily as DailySalesRow[]) ?? [];
  const totalRevenue = Number(data.totalRevenue) || 0;
  const transactionCount = Number(data.transactionCount) || 0;
  return (
    <>
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <SummaryCard label="Total revenue" value={moneyPhp(totalRevenue)} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <SummaryCard label="Transactions" value={String(transactionCount)} />
        </Grid>
      </Grid>
      <Card variant="outlined">
        <CardContent>
          <Typography variant="subtitle2" gutterBottom>
            Daily sales
          </Typography>
          {daily.length === 0 && (controls.pagination?.totalCount ?? 0) === 0 ? (
            <EmptyTable message="No completed sales in this date range." />
          ) : (
            <>
              <DailySalesBarChart daily={daily} />
              <ReportTable
                columns={["Date", "Revenue", "Transactions"]}
                emptyMessage="No daily rows on this page."
                controls={controls}
                rows={daily.map((d) => [d.date, moneyPhp(d.total), d.count])}
              />
            </>
          )}
        </CardContent>
      </Card>
    </>
  );
}

function SalesByProductView({ data, controls }: { data: Record<string, unknown>; controls: PosReportControls }) {
  const rows = (data.rows as SalesByProductRow[]) ?? [];
  return (
    <Card variant="outlined">
      <CardContent>
        <ReportTable
          columns={["Product", "Qty sold", "Revenue"]}
          emptyMessage="No product sales in this date range."
          controls={controls}
          rows={rows.map((r) => [r.productLabel, r.quantitySold, moneyPhp(r.revenue)])}
        />
      </CardContent>
    </Card>
  );
}

function WalkInRxView({ data, controls }: { data: Record<string, unknown>; controls: PosReportControls }) {
  const walkInRevenue = Number(data.walkInRevenue) || 0;
  const walkInCount = Number(data.walkInCount) || 0;
  const rxRevenue = Number(data.rxRevenue) || 0;
  const rxCount = Number(data.rxCount) || 0;
  const totalRevenue = Number(data.totalRevenue) || 0;
  const daily = (data.daily as WalkInDailyRow[]) ?? [];
  return (
    <>
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, sm: 6 }}>
          <SummaryCard label="Walk-in revenue" value={`${moneyPhp(walkInRevenue)} (${walkInCount} txn)`} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6 }}>
          <SummaryCard label="Prescription revenue" value={`${moneyPhp(rxRevenue)} (${rxCount} txn)`} />
        </Grid>
        <Grid size={{ xs: 12 }}>
          <SummaryCard label="Total" value={moneyPhp(totalRevenue)} />
        </Grid>
      </Grid>
      <Card variant="outlined">
        <CardContent>
          <Typography variant="subtitle2" gutterBottom>
            Daily breakdown
          </Typography>
          <ReportTable
            columns={["Date", "Walk-in revenue", "Walk-in txn", "Rx revenue", "Rx txn"]}
            emptyMessage="No sales in this date range."
            controls={controls}
            rows={daily.map((d) => [
              d.date,
              moneyPhp(d.walkInRevenue),
              d.walkInCount,
              moneyPhp(d.rxRevenue),
              d.rxCount,
            ])}
          />
        </CardContent>
      </Card>
    </>
  );
}

function PaymentMethodView({ data, controls }: { data: Record<string, unknown>; controls: PosReportControls }) {
  const rows = (data.rows as PaymentMethodRow[]) ?? [];
  const total = Number(data.total) || 0;
  return (
    <>
      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid size={{ xs: 12, sm: 4 }}>
          <SummaryCard label="Total collected" value={moneyPhp(total)} />
        </Grid>
      </Grid>
      <Card variant="outlined">
        <CardContent>
          <ReportTable
            columns={["Payment method", "Amount", "Transactions", "% of total"]}
            emptyMessage="No payments in this date range."
            controls={controls}
            rows={rows.map((r) => [
              r.paymentMethod,
              moneyPhp(r.amount),
              r.transactionCount,
              `${r.percent}%`,
            ])}
          />
        </CardContent>
      </Card>
    </>
  );
}

function VoidedReturnedView({ data, controls }: { data: Record<string, unknown>; controls: PosReportControls }) {
  const rows = (data.rows as VoidedReturnedRow[]) ?? [];
  return (
    <Card variant="outlined">
      <CardContent>
        <ReportTable
          columns={["OR", "Date", "Amount", "Kind", "Status"]}
          emptyMessage="No voided or returned sales in this date range."
          controls={controls}
          rows={rows.map((r) => [
            r.orNumber,
            r.saleDate,
            moneyPhp(r.totalAmount),
            r.kind,
            r.status,
          ])}
        />
      </CardContent>
    </Card>
  );
}

function ShiftReadingsView({ data, controls }: { data: Record<string, unknown>; controls: PosReportControls }) {
  const rows = (data.rows as ShiftReadingRow[]) ?? [];
  return (
    <Card variant="outlined">
      <CardContent>
        <ReportTable
          columns={["Date", "Type", "Gross sales", "Transactions", "Shift opened"]}
          emptyMessage="No shift readings in this date range."
          controls={controls}
          rows={rows.map((r) => [
            new Date(r.createdAt).toLocaleString(),
            r.readingType,
            moneyPhp(r.grossSales),
            r.transactionCount,
            r.openedAt ? new Date(r.openedAt).toLocaleString() : "—",
          ])}
        />
      </CardContent>
    </Card>
  );
}

function LowStockExpiryView({ data, controls }: { data: Record<string, unknown>; controls: PosReportControls }) {
  const rows = (data.rows as LowStockExpiryRow[]) ?? [];
  return (
    <Card variant="outlined">
      <CardContent>
        <ReportTable
          columns={["Product", "On hand", "Reorder level", "Low stock", "Nearest expiry", "Days until expiry"]}
          emptyMessage="No low-stock or expiring products found."
          controls={controls}
          rows={rows.map((r) => [
            r.productLabel,
            r.onHand,
            r.reorderLevel ?? "—",
            r.isLowStock ? "Yes" : "No",
            r.nearestExpiry ?? "—",
            r.daysUntilExpiry != null ? String(r.daysUntilExpiry) : "—",
          ])}
        />
      </CardContent>
    </Card>
  );
}

function OnHandItemsView({ data, controls }: { data: Record<string, unknown>; controls: PosReportControls }) {
  const rows = (data.rows as OnHandItemRow[]) ?? [];
  const grandTotal = Number(data.grandTotal) || 0;
  const totalProducts = controls.pagination?.totalCount ?? rows.length;
  return (
    <>
      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid size={{ xs: 12, sm: 6 }}>
          <SummaryCard label="Estimated sell-through value (all on hand)" value={moneyPhp(grandTotal)} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6 }}>
          <SummaryCard label="Products listed" value={String(totalProducts)} />
        </Grid>
      </Grid>
      <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 2 }}>
        Estimated value uses current catalog unit price × quantity on hand. Not guaranteed revenue.
      </Typography>
      <Card variant="outlined">
        <CardContent>
          <ReportTable
            columns={["Product", "Category", "On hand", "Unit price", "Estimated value"]}
            emptyMessage="No products with stock on hand."
            controls={controls}
            rows={rows.map((r) => [
              r.productLabel,
              r.categoryName ?? "—",
              r.onHand,
              moneyPhp(r.unitPrice),
              moneyPhp(r.estimatedValue),
            ])}
          />
        </CardContent>
      </Card>
    </>
  );
}

function ReportBody({
  reportKey,
  data,
  controls,
}: {
  reportKey: PosReportApiKey;
  data: Record<string, unknown>;
  controls: PosReportControls;
}) {
  switch (reportKey) {
    case "daily-sales-summary":
      return <DailySalesView data={data} controls={controls} />;
    case "sales-by-product":
      return <SalesByProductView data={data} controls={controls} />;
    case "walk-in-vs-prescription":
      return <WalkInRxView data={data} controls={controls} />;
    case "payment-method-breakdown":
      return <PaymentMethodView data={data} controls={controls} />;
    case "voided-returned-sales":
      return <VoidedReturnedView data={data} controls={controls} />;
    case "shift-readings":
      return <ShiftReadingsView data={data} controls={controls} />;
    case "low-stock-expiry":
      return <LowStockExpiryView data={data} controls={controls} />;
    case "on-hand-items":
      return <OnHandItemsView data={data} controls={controls} />;
    default:
      return null;
  }
}

export default function PosReportPage({ title, reportKey, defaultDaysBack = 14 }: PosReportPageProps) {
  const [showZeroStock, setShowZeroStock] = useState(false);
  const dateRangeDisabled = reportKey === "on-hand-items" || reportKey === "low-stock-expiry";

  const extraParams = useMemo((): Record<string, string> | undefined => {
    if (reportKey === "on-hand-items" && showZeroStock) return { showZeroStock: "1" };
    if (reportKey === "low-stock-expiry") return { expiryDays: "90" };
    return undefined;
  }, [reportKey, showZeroStock]);

  return (
    <PosReportShell
      title={title}
      reportKey={reportKey}
      dateRangeDisabled={dateRangeDisabled}
      defaultDaysBack={defaultDaysBack}
      extraParams={extraParams}
      extraControls={
        reportKey === "on-hand-items" ? (
          <FormControlLabel
            control={
              <Checkbox checked={showZeroStock} onChange={(e) => setShowZeroStock(e.target.checked)} />
            }
            label="Show zero stock"
          />
        ) : reportKey === "low-stock-expiry" ? (
          <Typography variant="body2" color="text.secondary">
            Products at/below reorder level or expiring within 90 days
          </Typography>
        ) : null
      }
    >
      {(data, controls) => (
        <ReportBody reportKey={reportKey} data={(data as Record<string, unknown>) ?? {}} controls={controls} />
      )}
    </PosReportShell>
  );
}
