import { NextRequest, NextResponse } from "next/server";
import {
  fetchDailySalesSummaryReport,
  fetchLowStockExpiryReport,
  fetchOnHandItemsReport,
  fetchPaymentMethodBreakdownReport,
  fetchSalesByProductReport,
  fetchShiftReadingsReport,
  fetchVoidedReturnedSalesReport,
  fetchWalkInVsPrescriptionReport,
  paginateReportRows,
  parseDateRange,
  parseReportPagination,
} from "@/lib/posReports";
import { POS_REPORT_API_KEYS, type PosReportApiKey } from "@/lib/reportsNavLeaves";
import { supabaseAdminClient } from "@/lib/supabaseAdminClient";

type RouteContext = { params: Promise<{ reportKey: string }> };

function isPosReportKey(key: string): key is PosReportApiKey {
  return (POS_REPORT_API_KEYS as readonly string[]).includes(key);
}

export async function GET(req: NextRequest, context: RouteContext) {
  const admin = supabaseAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." },
      { status: 500 },
    );
  }

  const { reportKey } = await context.params;
  if (!isPosReportKey(reportKey)) {
    return NextResponse.json({ error: "Unknown report." }, { status: 404 });
  }

  const sp = req.nextUrl.searchParams;
  const range = parseDateRange(sp.get("start"), sp.get("end"));
  const { page, pageSize } = parseReportPagination(sp.get("page"), sp.get("pageSize"));

  switch (reportKey) {
    case "daily-sales-summary": {
      const result = await fetchDailySalesSummaryReport(range, admin);
      if (result.error) {
        return NextResponse.json({ reportKey, range, ...result, pagination: null });
      }
      const paged = paginateReportRows(result.daily, page, pageSize);
      return NextResponse.json({
        reportKey,
        range,
        daily: paged.rows,
        totalRevenue: result.totalRevenue,
        transactionCount: result.transactionCount,
        pagination: paged.pagination,
        error: null,
      });
    }
    case "sales-by-product": {
      const result = await fetchSalesByProductReport(range, admin);
      if (result.error) return NextResponse.json({ reportKey, range, ...result, pagination: null });
      const paged = paginateReportRows(result.rows, page, pageSize);
      return NextResponse.json({
        reportKey,
        range,
        rows: paged.rows,
        pagination: paged.pagination,
        error: null,
      });
    }
    case "walk-in-vs-prescription": {
      const result = await fetchWalkInVsPrescriptionReport(range, admin);
      if (result.error) {
        return NextResponse.json({ reportKey, range, ...result, pagination: null });
      }
      const paged = paginateReportRows(result.daily, page, pageSize);
      return NextResponse.json({
        reportKey,
        range,
        walkInRevenue: result.walkInRevenue,
        walkInCount: result.walkInCount,
        rxRevenue: result.rxRevenue,
        rxCount: result.rxCount,
        totalRevenue: result.totalRevenue,
        daily: paged.rows,
        pagination: paged.pagination,
        error: null,
      });
    }
    case "payment-method-breakdown": {
      const result = await fetchPaymentMethodBreakdownReport(range, admin);
      if (result.error) return NextResponse.json({ reportKey, range, ...result, pagination: null });
      const paged = paginateReportRows(result.rows, page, pageSize);
      return NextResponse.json({
        reportKey,
        range,
        rows: paged.rows,
        total: result.total,
        pagination: paged.pagination,
        error: null,
      });
    }
    case "voided-returned-sales": {
      const result = await fetchVoidedReturnedSalesReport(range, admin);
      if (result.error) return NextResponse.json({ reportKey, range, ...result, pagination: null });
      const paged = paginateReportRows(result.rows, page, pageSize);
      return NextResponse.json({
        reportKey,
        range,
        rows: paged.rows,
        pagination: paged.pagination,
        error: null,
      });
    }
    case "shift-readings": {
      const result = await fetchShiftReadingsReport(range, admin);
      if (result.error) return NextResponse.json({ reportKey, range, ...result, pagination: null });
      const paged = paginateReportRows(result.rows, page, pageSize);
      return NextResponse.json({
        reportKey,
        range,
        rows: paged.rows,
        pagination: paged.pagination,
        error: null,
      });
    }
    case "low-stock-expiry": {
      const rawDays = sp.get("expiryDays");
      const parsed = rawDays != null ? Number.parseInt(rawDays, 10) : 90;
      const expiryDays = Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), 365) : 90;
      const result = await fetchLowStockExpiryReport(expiryDays, admin);
      if (result.error) {
        return NextResponse.json({ reportKey, expiryDays, ...result, pagination: null });
      }
      const paged = paginateReportRows(result.rows, page, pageSize);
      return NextResponse.json({
        reportKey,
        expiryDays,
        rows: paged.rows,
        pagination: paged.pagination,
        error: null,
      });
    }
    case "on-hand-items": {
      const showZeroStock = sp.get("showZeroStock") === "1";
      const result = await fetchOnHandItemsReport(showZeroStock, admin);
      if (result.error) {
        return NextResponse.json({ reportKey, showZeroStock, ...result, pagination: null });
      }
      const paged = paginateReportRows(result.rows, page, pageSize);
      return NextResponse.json({
        reportKey,
        showZeroStock,
        rows: paged.rows,
        grandTotal: result.grandTotal,
        pagination: paged.pagination,
        error: null,
      });
    }
    default:
      return NextResponse.json({ error: "Unknown report." }, { status: 404 });
  }
}
