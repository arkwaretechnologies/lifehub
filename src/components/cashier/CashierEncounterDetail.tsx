"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  LinearProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { fetchEncounterSummaryByTransId, fetchEncounterWorkspacePatient } from "@/lib/consultationData";
import { authenticatedFetch } from "@/lib/authenticatedFetch";
import type { ConsultationPatient } from "@/components/consultation/consultationTypes";
import { formatDateMMDDYYYY } from "@/lib/dateDisplay";
import {
  fetchLabRequestItemDetailsForRequestIds,
  hasUnpricedNonPackageLabLines,
  labRequestUsesPackageBundling,
  labLineCheckoutUnitFee,
  labRequestCheckoutSubtotal,
  labRequestPackagesDisplayNames,
  type EncounterLabRequestSummary,
  type LabRequestItemDetailRow,
} from "@/lib/labRequests";
import {
  fetchPhysicianFeeSaleItemsWithServiceNames,
  fetchUnpaidPhysicianFeeSalesForEncounter,
  formatPhysicianFeeSaleDisplayStatus,
  type PhysicianFeeSaleItemDetail,
  type PhysicianFeeSaleWithStatus,
} from "@/lib/physicianFeeSales";
import { fetchLabRequestsWithoutLabSaleForEncounters } from "@/lib/cashierLabQueue";
import {
  fetchImagingRequestItemsForRequestIdsClient,
  fetchImagingRequestsWithoutSaleForEncounters,
  type EncounterImagingRequestSummary,
  type ImagingRequestItemRow,
} from "@/lib/imagingRequests";
import { PaymentModal } from "@/components/cashier/PaymentModal";
import { fetchActivePaymentMethods, type PaymentMethodRow } from "@/lib/paymentMethods";
import { fetchLabTestCheckoutPricesByIds } from "@/lib/labTests";
import {
  createLabSaleWithItems,
  generateNextDailyOrNumber,
  markPhysicianFeeSalesPaid,
  type LabSaleItemInsertRow,
} from "@/lib/cashierPayments";
import { fetchActiveDiscountTypes, type DiscountTypeRow } from "@/lib/discountTypes";
import { ConsultationSectionTitle } from "@/components/consultation/ConsultationSectionTitle";
import {
  consultBodyTypoSx,
  consultTableBodyCellSx,
  consultTableHeadCellSx,
  consultTableHeadRowSx,
  consultTableSx,
} from "@/components/consultation/consultListTableStyles";
import { fetchQueuePriorities, type QueuePriorityRow } from "@/lib/queueReception";
import { openCashierAcknowledgementReceiptPrint } from "@/lib/cashierAcknowledgementReceiptPrint";
import { isCashPaymentMethod } from "@/lib/paymentMethods";
import { scheduleCashierHomeNavigation } from "@/lib/thermalPrintIframe";
import {
  openReceptionQueueReceiptPrint,
  storeCashierLabQueueReprintOffer,
} from "@/lib/receptionQueueReceiptPrint";
import type { DiagnosticAmendmentRow } from "@/lib/diagnosticAmendments";
import {
  diagnosticBreakdownToPaymentSummaryRows,
  fetchVisitDiagnosticDueBreakdown,
  type DiagnosticPricedItem,
  type VisitDiagnosticDueBreakdown,
} from "@/lib/visitDiagnosticDueBreakdown";
import { CONSULTATION_BRANDING } from "@/components/consultation/consultationTypes";

function CashierDiagnosticBillSection(props: {
  title: string;
  items: DiagnosticPricedItem[];
  paid?: boolean;
  sectionTotal?: number;
  totalCaption?: string;
  emphasizeDue?: boolean;
}) {
  const { title, items, paid, sectionTotal, totalCaption, emphasizeDue } = props;
  if (items.length === 0) return null;
  return (
    <Box sx={{ mb: 3 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1, flexWrap: "wrap" }}>
        <ConsultationSectionTitle dense sx={{ mt: 0 }}>
          {title}
        </ConsultationSectionTitle>
        {paid ? <Chip label="Paid" size="small" color="success" sx={{ fontWeight: 700, height: 22 }} /> : null}
      </Box>
      <TableContainer>
        <Table size="small" sx={consultTableSx}>
          <TableHead>
            <TableRow sx={consultTableHeadRowSx}>
              <TableCell sx={consultTableHeadCellSx}>#</TableCell>
              <TableCell sx={consultTableHeadCellSx}>Bill</TableCell>
              <TableCell sx={consultTableHeadCellSx}>Item</TableCell>
              <TableCell align="right" sx={consultTableHeadCellSx}>
                Qty
              </TableCell>
              <TableCell align="right" sx={consultTableHeadCellSx}>
                Unit fee
              </TableCell>
              <TableCell align="right" sx={consultTableHeadCellSx}>
                Discount
              </TableCell>
              <TableCell align="right" sx={consultTableHeadCellSx}>
                Line total
              </TableCell>
              <TableCell sx={consultTableHeadCellSx}>Notes</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {items.map((it, idx) => (
              <TableRow key={`${title}-${it.name}-${idx}`}>
                <TableCell sx={consultTableBodyCellSx}>{idx + 1}</TableCell>
                <TableCell sx={consultTableBodyCellSx}>
                  {idx === 0 ? (
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {paid ? "Settled at cashier" : "Additional due"}
                    </Typography>
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell sx={consultTableBodyCellSx}>{it.name}</TableCell>
                <TableCell align="right" sx={consultTableBodyCellSx}>
                  1
                </TableCell>
                <TableCell align="right" sx={consultTableBodyCellSx}>
                  {formatMoney(it.price)}
                </TableCell>
                <TableCell align="right" sx={consultTableBodyCellSx}>
                  {formatMoney(0)}
                </TableCell>
                <TableCell align="right" sx={{ ...consultTableBodyCellSx, fontWeight: 700 }}>
                  {formatMoney(it.price)}
                </TableCell>
                <TableCell sx={consultTableBodyCellSx}>{paid ? "Paid" : "Due at cashier"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      {sectionTotal != null && totalCaption ? (
        <Typography
          variant="caption"
          sx={{
            display: "block",
            mt: 0.75,
            fontWeight: 700,
            color: emphasizeDue ? "warning.dark" : "text.secondary",
          }}
        >
          {totalCaption}: {formatMoney(sectionTotal)}
        </Typography>
      ) : null}
    </Box>
  );
}

function isUuid(s: string): boolean {
  const t = s.trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(t);
}

function moneyNum(v: number | string | null | undefined): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : Number(String(v));
  return Number.isFinite(n) ? n : 0;
}

function patientIdNum(v: string | null | undefined): number | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  if (!/^\d+$/.test(s)) return null;
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function formatMoney(v: number | string | null | undefined): string {
  return moneyNum(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function roundMoney2(n: number): number {
  return Math.round(n * 100) / 100;
}

function formatLabTime(value: string | null | undefined): string {
  if (value == null || String(value).trim() === "") return "—";
  const s = String(value);
  if (s.length >= 5 && s[4] === ":") return s.slice(0, 5);
  const m = s.match(/(\d{1,2}:\d{2})/);
  return m?.[1] ?? "—";
}

async function fetchPendingAmendmentsForEncounter(encounterId: string): Promise<DiagnosticAmendmentRow[]> {
  const amendRes = await authenticatedFetch(
    `/api/consultation/diagnostic-amend?encounterId=${encodeURIComponent(encounterId)}`,
    { cache: "no-store" },
  );
  const amendJson = (await amendRes.json().catch(() => ({}))) as {
    amendments?: DiagnosticAmendmentRow[];
    amendment?: DiagnosticAmendmentRow | null;
  };
  if (!amendRes.ok) return [];
  return Array.isArray(amendJson.amendments)
    ? amendJson.amendments
    : amendJson.amendment
      ? [amendJson.amendment]
      : [];
}

async function syncAndFetchPendingAmendments(encounterId: string): Promise<DiagnosticAmendmentRow[]> {
  const syncRes = await authenticatedFetch("/api/consultation/sync-diagnostic-amendments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ encounterId }),
  });
  const syncJson = (await syncRes.json().catch(() => ({}))) as {
    amendments?: DiagnosticAmendmentRow[];
    error?: string;
  };
  if (syncRes.ok && Array.isArray(syncJson.amendments)) {
    return syncJson.amendments;
  }
  if (!syncRes.ok && syncJson.error) {
    throw new Error(syncJson.error);
  }
  return fetchPendingAmendmentsForEncounter(encounterId);
}

function sumPositiveAmendmentDue(amendments: DiagnosticAmendmentRow[]): number {
  return roundMoney2(
    amendments.reduce((s, a) => {
      const d = moneyNum(a.amount_delta);
      return d > 0 ? s + d : s;
    }, 0),
  );
}

function sumPositiveAmendmentDueForLab(amendments: DiagnosticAmendmentRow[]): number {
  return roundMoney2(
    amendments.reduce((s, a) => {
      if (!a.lab_request_id) return s;
      const d = moneyNum(a.amount_delta);
      return d > 0 ? s + d : s;
    }, 0),
  );
}

function sumPositiveAmendmentDueForImaging(amendments: DiagnosticAmendmentRow[]): number {
  return roundMoney2(
    amendments.reduce((s, a) => {
      if (!a.imaging_request_id) return s;
      const d = moneyNum(a.amount_delta);
      return d > 0 ? s + d : s;
    }, 0),
  );
}

function paymentLinesFromAmendments(amendments: DiagnosticAmendmentRow[]): Array<{ label: string; amount: number }> {
  const rows: Array<{ label: string; amount: number }> = [];
  for (const a of amendments) {
    const delta = moneyNum(a.amount_delta);
    if (delta <= 0) continue;
    const kind = a.lab_request_id ? "Laboratory" : a.imaging_request_id ? "Imaging" : "Order";
    const added = a.summary_json?.added ?? [];
    if (added.length > 0) {
      for (const line of added) {
        rows.push({ label: `${line.label} (${kind})`, amount: moneyNum(line.amount) });
      }
    } else {
      rows.push({ label: `${kind} order change`, amount: delta });
    }
  }
  return rows;
}

/** `encounters.queue_no` from reception (visit header), for cashier messaging. */
function receptionQueueNoLine(queueNoTrimmed: string): string {
  return queueNoTrimmed ? `Queue No.: ${queueNoTrimmed}` : "No queue no assigned";
}

export default function CashierEncounterDetail() {
  const params = useParams();
  const router = useRouter();
  const encounterId = String(params.encounterId ?? "").trim();

  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);
  const [patient, setPatient] = useState<ConsultationPatient | null>(null);

  const [feeSales, setFeeSales] = useState<PhysicianFeeSaleWithStatus[]>([]);
  const [feeItemsBySale, setFeeItemsBySale] = useState<Map<string, PhysicianFeeSaleItemDetail[]>>(() => new Map());

  const [openLabRequests, setOpenLabRequests] = useState<EncounterLabRequestSummary[]>([]);
  const [labItemRows, setLabItemRows] = useState<LabRequestItemDetailRow[]>([]);
  const [openImagingRequests, setOpenImagingRequests] = useState<EncounterImagingRequestSummary[]>([]);
  const [imagingItemRows, setImagingItemRows] = useState<ImagingRequestItemRow[]>([]);

  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodRow[]>([]);
  const [discountTypes, setDiscountTypes] = useState<DiscountTypeRow[]>([]);
  const [payOpen, setPayOpen] = useState(false);
  const [payBusy, setPayBusy] = useState(false);
  const [payError, setPayError] = useState("");
  const [paySuccess, setPaySuccess] = useState("");
  const [labTotalLoading, setLabTotalLoading] = useState(false);
  const [payModalKey, setPayModalKey] = useState(0);
  const [queuePriorities, setQueuePriorities] = useState<QueuePriorityRow[]>([]);
  /** Shown when lab orders exist: priority fetch failed (error) or returned no rows (warning). */
  const [labQueuePriorityBanner, setLabQueuePriorityBanner] = useState<{
    severity: "error" | "warning";
    message: string;
  } | null>(null);
  const [labQueuePrioritySel, setLabQueuePrioritySel] = useState<number | "">("");
  /** After-pay lab queue identifier; queue slip prints here when visit had no reception queue no. */
  const [labReceiptQueueDisplay, setLabReceiptQueueDisplay] = useState("");
  const [pendingAmendments, setPendingAmendments] = useState<DiagnosticAmendmentRow[]>([]);
  const [diagnosticBreakdown, setDiagnosticBreakdown] = useState<VisitDiagnosticDueBreakdown | null>(null);

  const reloadAll = useCallback(async (): Promise<{ receptionQueueNo: string }> => {
    setPaySuccess("");
    setLabQueuePriorityBanner(null);
    setLoadError("");
    setLoading(true);

    if (!isUuid(encounterId)) {
      setLoadError("Invalid encounter id.");
      setPatient(null);
      setFeeSales([]);
      setFeeItemsBySale(new Map());
      setOpenLabRequests([]);
      setLabItemRows([]);
      setLabUnitPriceByTestId(new Map());
      setLabReceiptQueueDisplay("");
      setPendingAmendments([]);
      setDiagnosticBreakdown(null);
      setLoading(false);
      setLabTotalLoading(false);
      return { receptionQueueNo: "" };
    }

    setLabTotalLoading(true);

    const [pat, encSum] = await Promise.all([
      fetchEncounterWorkspacePatient(encounterId),
      fetchEncounterSummaryByTransId(encounterId),
    ]);
    const qn = (encSum.encounter?.queueNo ?? "").trim();
    setPatient(pat);

    const [salesRes, openLabsRes, openImgRes] = await Promise.all([
      fetchUnpaidPhysicianFeeSalesForEncounter(encounterId),
      fetchLabRequestsWithoutLabSaleForEncounters([encounterId]),
      fetchImagingRequestsWithoutSaleForEncounters([encounterId]),
    ]);

    if (salesRes.error) {
      setLoadError(salesRes.error);
      setFeeSales([]);
      setFeeItemsBySale(new Map());
      setOpenLabRequests([]);
      setLabItemRows([]);
      setLabUnitPriceByTestId(new Map());
      setLoading(false);
      setLabTotalLoading(false);
      return { receptionQueueNo: qn };
    }

    setFeeSales(salesRes.sales);
    const saleIds = salesRes.sales.map((s) => s.id);
    const itemsRes = await fetchPhysicianFeeSaleItemsWithServiceNames(saleIds);
    if (itemsRes.error) {
      setLoadError(itemsRes.error);
      setFeeItemsBySale(new Map());
      setOpenLabRequests([]);
      setLabItemRows([]);
      setLabUnitPriceByTestId(new Map());
      setLoading(false);
      setLabTotalLoading(false);
      return { receptionQueueNo: qn };
    }
    setFeeItemsBySale(itemsRes.itemsBySaleId);

    if (openLabsRes.error) {
      setLoadError(openLabsRes.error);
      setOpenLabRequests([]);
      setLabItemRows([]);
      setLabUnitPriceByTestId(new Map());
      setLoading(false);
      setLabTotalLoading(false);
      return { receptionQueueNo: qn };
    }

    const openList = openLabsRes.byEncounter.get(encounterId) ?? [];
    setOpenLabRequests(openList);
    const reqIds = openList.map((r) => r.id);
    const labItemsRes = await fetchLabRequestItemDetailsForRequestIds(reqIds);

    if (openImgRes.error) {
      setLoadError(openImgRes.error);
      setOpenImagingRequests([]);
      setImagingItemRows([]);
      setLabUnitPriceByTestId(new Map());
      setLoading(false);
      setLabTotalLoading(false);
      return { receptionQueueNo: qn };
    }
    const imgList = openImgRes.byEncounter.get(encounterId) ?? [];
    setOpenImagingRequests(imgList);
    const imgIds = imgList.map((r) => r.id);
    const imgItemsClient = await fetchImagingRequestItemsForRequestIdsClient(imgIds);

    if (labItemsRes.error) {
      setLoadError(labItemsRes.error);
      setLabItemRows([]);
      setImagingItemRows([]);
      setLabUnitPriceByTestId(new Map());
      setLoading(false);
      setLabTotalLoading(false);
      return { receptionQueueNo: qn };
    }
    setLabItemRows(labItemsRes.items);
    if (imgItemsClient.error) {
      setLoadError(imgItemsClient.error);
      setImagingItemRows([]);
      setLabUnitPriceByTestId(new Map());
      setLoading(false);
      setLabTotalLoading(false);
      return { receptionQueueNo: qn };
    }
    setImagingItemRows(imgItemsClient.rows);

    const labTestIds = [...new Set(labItemsRes.items.map((r) => r.lab_test_id).filter(Boolean))];
    if (labTestIds.length > 0) {
      const priceRes = await fetchLabTestCheckoutPricesByIds(labTestIds);
      if (priceRes.error) {
        setLabUnitPriceByTestId(new Map());
      } else {
        setLabUnitPriceByTestId(priceRes.unitPriceById);
      }
    } else {
      setLabUnitPriceByTestId(new Map());
    }
    setLabTotalLoading(false);

    try {
      const list = await syncAndFetchPendingAmendments(encounterId);
      setPendingAmendments(list);
      const { breakdown, error: bdErr } = await fetchVisitDiagnosticDueBreakdown(encounterId, list);
      if (!bdErr) setDiagnosticBreakdown(breakdown);
      else setDiagnosticBreakdown(null);
    } catch {
      setPendingAmendments([]);
      setDiagnosticBreakdown(null);
    }

    setLoading(false);
    return { receptionQueueNo: qn };
  }, [encounterId]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      await Promise.resolve();
      if (cancelled) return;
      const { receptionQueueNo: visitQueueNo } = await reloadAll();

      const methodsRes = await fetchActivePaymentMethods();
      if (!cancelled) {
        setPaymentMethods(methodsRes.error ? [] : methodsRes.methods);
      }

      const discRes = await fetchActiveDiscountTypes();
      if (!cancelled) {
        setDiscountTypes(discRes.error ? [] : discRes.discounts);
      }

      const pq = await fetchQueuePriorities();
      if (!cancelled) {
        if (pq.error) {
          setQueuePriorities([]);
          setLabQueuePriorityBanner({
            severity: "error",
            message: `Could not load queue priorities (${pq.error}). Pay is still allowed; the server will try a default priority when issuing the laboratory queue ticket.\n\n${receptionQueueNoLine(visitQueueNo)}`,
          });
        } else {
          setQueuePriorities(pq.priorities);
          if (pq.priorities.length === 0) {
            setLabQueuePriorityBanner({
              severity: "warning",
              message: receptionQueueNoLine(visitQueueNo),
            });
          } else {
            setLabQueuePriorityBanner(null);
          }
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [encounterId, reloadAll]);

  const labItemsByRequestId = useMemo(() => {
    const m = new Map<string, LabRequestItemDetailRow[]>();
    for (const row of labItemRows) {
      const list = m.get(row.lab_request_id) ?? [];
      list.push(row);
      m.set(row.lab_request_id, list);
    }
    return m;
  }, [labItemRows]);

  /** Unit prices for lab tests on this visit (same source as Pay / lab sale creation). */
  const [labUnitPriceByTestId, setLabUnitPriceByTestId] = useState<Map<string, number>>(() => new Map());

  /** Refetch lab catalog prices after pay/reload without flashing the full page loader. */
  useEffect(() => {
    if (loading) return;
    const ids = [...new Set(labItemRows.map((r) => r.lab_test_id).filter(Boolean))];
    if (ids.length === 0) {
      setLabUnitPriceByTestId(new Map());
      setLabTotalLoading(false);
      return;
    }
    setLabTotalLoading(true);
    let cancelled = false;
    void fetchLabTestCheckoutPricesByIds(ids).then((res) => {
      if (cancelled) return;
      setLabTotalLoading(false);
      if (res.error) {
        setLabUnitPriceByTestId(new Map());
        return;
      }
      setLabUnitPriceByTestId(res.unitPriceById);
    });
    return () => {
      cancelled = true;
    };
  }, [labItemRows, loading]);

  type FeeVisitChargeRow = {
    key: string;
    rowNum: number;
    billTitle: string;
    billStatusLabel: string;
    billId: string;
    line: PhysicianFeeSaleItemDetail;
  };

  const feeVisitChargeRows = useMemo((): FeeVisitChargeRow[] => {
    const rows: FeeVisitChargeRow[] = [];
    let n = 0;
    for (const sale of feeSales) {
      const billTitle = `Sale · ${formatDateMMDDYYYY(sale.created_at)}`;
      const billStatusLabel = formatPhysicianFeeSaleDisplayStatus(sale.status);
      const lines = feeItemsBySale.get(sale.id) ?? [];
      for (const line of lines) {
        n += 1;
        rows.push({
          key: `fee-${line.id}`,
          rowNum: n,
          billTitle,
          billStatusLabel,
          billId: sale.id,
          line,
        });
      }
    }
    return rows;
  }, [feeSales, feeItemsBySale]);

  const labOrdersForDisplay = useMemo(() => {
    return openLabRequests.map((req) => {
      const items = labItemsByRequestId.get(req.id) ?? [];
      const subtotal = labRequestCheckoutSubtotal(req, items, labUnitPriceByTestId);
      const lines = items.map((item, idx) => ({
        item,
        unitPrice: labLineCheckoutUnitFee(req, items, item, labUnitPriceByTestId),
        rowNum: idx + 1,
      }));
      return { req, items, subtotal, lines };
    });
  }, [openLabRequests, labItemsByRequestId, labUnitPriceByTestId]);

  /** Same sum as the laboratory panels (package subtotals do not depend on catalog-price fetch succeeding). */
  const labTotalDue = useMemo(() => {
    return labOrdersForDisplay.reduce((sum, o) => sum + o.subtotal, 0);
  }, [labOrdersForDisplay]);

  const imagingItemsByRequestId = useMemo(() => {
    const m = new Map<string, ImagingRequestItemRow[]>();
    for (const it of imagingItemRows) {
      const list = m.get(it.imaging_request_id) ?? [];
      list.push(it);
      m.set(it.imaging_request_id, list);
    }
    return m;
  }, [imagingItemRows]);

  const imagingTotalDue = useMemo(() => {
    return imagingItemRows.reduce((sum, it) => sum + moneyNum(it.unit_price), 0);
  }, [imagingItemRows]);

  const imagingOrdersForDisplay = useMemo(() => {
    return openImagingRequests.map((req) => {
      const items = imagingItemsByRequestId.get(req.id) ?? [];
      const subtotal = items.reduce((sum, it) => sum + moneyNum(it.unit_price), 0);
      return { req, items, subtotal };
    });
  }, [openImagingRequests, imagingItemsByRequestId]);

  /** Sum of listed line totals only (no header fallback). */
  const feeLineItemsSum = useMemo(() => {
    let s = 0;
    for (const sale of feeSales) {
      const lines = feeItemsBySale.get(sale.id) ?? [];
      for (const it of lines) {
        s += moneyNum(it.total_fee);
      }
    }
    return s;
  }, [feeSales, feeItemsBySale]);

  /** Sum of stored sale headers — can drift from line items if `physician_fee_sales.total_amount` was not updated. */
  const feeHeaderTotalSum = useMemo(() => {
    return feeSales.reduce((s, row) => s + moneyNum(row.total_amount), 0);
  }, [feeSales]);

  /**
   * Amount due for physician fees: itemized lines only.
   * `fetchPhysicianFeeSaleItemsWithServiceNames` initializes an empty array per sale id so “no rows” means zero due,
   * never a phantom header total copied from unrelated billing.
   */
  const feeTotalDue = feeLineItemsSum;

  const unpaidNet = useMemo(
    () => roundMoney2(feeTotalDue + labTotalDue + imagingTotalDue),
    [feeTotalDue, labTotalDue, imagingTotalDue],
  );

  const amendmentDueTotal = useMemo(() => sumPositiveAmendmentDue(pendingAmendments), [pendingAmendments]);

  /** One line per category in Visit totals (open orders + paid-order add-ons, no duplicate rows). */
  const visitSummaryLabDue = useMemo(() => {
    const additional = Math.max(
      diagnosticBreakdown?.labDueTotal ?? 0,
      sumPositiveAmendmentDueForLab(pendingAmendments),
    );
    return roundMoney2(labTotalDue + additional);
  }, [labTotalDue, diagnosticBreakdown?.labDueTotal, pendingAmendments]);

  const visitSummaryImagingDue = useMemo(() => {
    const additional = Math.max(
      diagnosticBreakdown?.imagingDueTotal ?? 0,
      sumPositiveAmendmentDueForImaging(pendingAmendments),
    );
    return roundMoney2(imagingTotalDue + additional);
  }, [imagingTotalDue, diagnosticBreakdown?.imagingDueTotal, pendingAmendments]);

  /** Matches Visit totals — never add open orders and diagnostic due twice. */
  const checkoutTotal = useMemo(
    () => roundMoney2(feeTotalDue + visitSummaryLabDue + visitSummaryImagingDue),
    [feeTotalDue, visitSummaryLabDue, visitSummaryImagingDue],
  );
  const checkoutAbs = useMemo(() => Math.abs(checkoutTotal), [checkoutTotal]);

  /** Paid-order lab/imaging add-ons only (already excluded from {@link unpaidNet}). */
  const diagnosticCheckoutPortion = useMemo(
    () =>
      roundMoney2(
        Math.max(0, visitSummaryLabDue - labTotalDue) + Math.max(0, visitSummaryImagingDue - imagingTotalDue),
      ),
    [visitSummaryLabDue, visitSummaryImagingDue, labTotalDue, imagingTotalDue],
  );

  const isRefundCheckout = checkoutTotal < -0.005;
  const hasCheckout = Math.abs(checkoutTotal) > 0.005;

  const anyUnpaid = feeSales.length > 0 || openLabRequests.length > 0 || openImagingRequests.length > 0;

  const hasDiagnosticChargeRows = Boolean(
    diagnosticBreakdown &&
      (diagnosticBreakdown.labPaid.length > 0 ||
        diagnosticBreakdown.labDue.length > 0 ||
        diagnosticBreakdown.imagingPaid.length > 0 ||
        diagnosticBreakdown.imagingDue.length > 0),
  );

  function amendmentKindLabel(a: DiagnosticAmendmentRow): string {
    if (a.lab_request_id) return "Laboratory";
    if (a.imaging_request_id) return "Imaging";
    return "Order";
  }

  const checkoutSummaryRows = useMemo(() => {
    const rows: { label: string; amount: number }[] = [];
    if (feeTotalDue > 0) rows.push({ label: "Consultation charges", amount: feeTotalDue });
    if (labTotalDue > 0) {
      rows.push({ label: "Laboratory orders (new)", amount: labTotalDue });
    } else if (diagnosticBreakdown && diagnosticBreakdown.labDue.length > 0) {
      for (const it of diagnosticBreakdown.labDue) {
        rows.push({ label: `${it.name} (Laboratory)`, amount: moneyNum(it.price) });
      }
    }
    if (imagingTotalDue > 0) {
      rows.push({ label: "Imaging orders (new)", amount: imagingTotalDue });
    } else if (diagnosticBreakdown && diagnosticBreakdown.imagingDue.length > 0) {
      for (const it of diagnosticBreakdown.imagingDue) {
        rows.push({ label: `${it.name} (Imaging)`, amount: moneyNum(it.price) });
      }
    }
    if (
      rows.length <= (feeTotalDue > 0 ? 1 : 0) &&
      pendingAmendments.length > 0
    ) {
      rows.push(...paymentLinesFromAmendments(pendingAmendments));
    }
    return rows;
  }, [feeTotalDue, labTotalDue, imagingTotalDue, pendingAmendments, diagnosticBreakdown]);

  const checkoutUiLoading = loading || labTotalLoading;

  async function settlePendingAmendments(args: {
    paymentMethod: PaymentMethodRow;
    baseOrNumber: string;
    amountTendered: number | null;
    changeAmount: number | null;
    recordCashOnFirst: boolean;
    amendments: DiagnosticAmendmentRow[];
  }): Promise<string[]> {
    if (!patient || args.amendments.length === 0) return [];
    const pid = patientIdNum(patient.patientId);
    if (pid == null) throw new Error("Invalid patient id.");
    const messages: string[] = [];
    const positive = args.amendments.filter((a) => moneyNum(a.amount_delta) > 0);
    const refund = args.amendments.filter((a) => moneyNum(a.amount_delta) < 0);
    const ordered = [...positive, ...refund];
    let cashRecorded = !args.recordCashOnFirst;
    for (let i = 0; i < ordered.length; i++) {
      const amendment = ordered[i]!;
      const delta = moneyNum(amendment.amount_delta);
      const orNumber =
        ordered.length === 1 && !args.baseOrNumber.includes("-")
          ? delta < 0
            ? `${args.baseOrNumber}-R`
            : args.baseOrNumber
          : `${args.baseOrNumber}-A${i + 1}${delta < 0 ? "R" : ""}`;
      const res = await authenticatedFetch("/api/cashier/settle-diagnostic-amendment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amendmentId: amendment.id,
          paymentMethodId: args.paymentMethod.id,
          orNumber,
          amountTendered: !cashRecorded ? args.amountTendered : null,
          changeAmount: !cashRecorded ? args.changeAmount : null,
          patient: {
            id: pid,
            name: patient.name,
            contact_no: patient.contactNo?.trim() || null,
          },
          cashierPriorityId:
            typeof labQueuePrioritySel === "number" && Number.isFinite(labQueuePrioritySel)
              ? labQueuePrioritySel
              : null,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string; queueDisplay?: string };
      if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
      cashRecorded = true;
      const qLine = json.queueDisplay ? ` Queue ${json.queueDisplay} is active again.` : "";
      messages.push(
        delta < 0
          ? `${amendmentKindLabel(amendment)} refund ${formatMoney(Math.abs(delta))}${qLine}`
          : `${amendmentKindLabel(amendment)} ${formatMoney(delta)}${qLine}`,
      );
    }
    return messages;
  }

  async function handleConfirmPay(args: {
    paymentMethod: PaymentMethodRow;
    orNumber: string;
    discountType: DiscountTypeRow | null;
    discountMode: "pct" | "amount";
    discountPct: number;
    discountAmount: number;
    amountTendered: number | null;
    changeAmount: number | null;
    labQueuePriorityId: number | null;
  }) {
    if (!patient) {
      setPayError("Patient not loaded.");
      return;
    }
    setPayError("");
    setPaySuccess("");
    setPayBusy(true);
    try {
      let freshAmendments = await syncAndFetchPendingAmendments(encounterId);
      let freshBreakdown = (await fetchVisitDiagnosticDueBreakdown(encounterId, freshAmendments)).breakdown;
      if ((freshBreakdown?.diagnosticDueTotal ?? 0) > sumPositiveAmendmentDue(freshAmendments) + 0.009) {
        freshAmendments = await syncAndFetchPendingAmendments(encounterId);
        freshBreakdown = (await fetchVisitDiagnosticDueBreakdown(encounterId, freshAmendments)).breakdown;
      }
      const freshAmendDue = sumPositiveAmendmentDue(freshAmendments);
      const freshDiagnosticDue = freshBreakdown?.diagnosticDueTotal ?? diagnosticBreakdown?.diagnosticDueTotal ?? 0;

      const feeSaleSubtotals = feeSales.map((s) => {
        const lines = feeItemsBySale.get(s.id) ?? [];
        const lineSum = lines.reduce((acc, it) => acc + moneyNum(it.total_fee), 0);
        return { id: s.id, subtotal: lineSum };
      });

      // Create lab sales (one per lab request) + items
      const allLabTestIds = [...new Set(labItemRows.map((r) => r.lab_test_id).filter(Boolean))];
      const priceRes = await fetchLabTestCheckoutPricesByIds(allLabTestIds);
      if (
        priceRes.error &&
        hasUnpricedNonPackageLabLines(openLabRequests, labItemsByRequestId, priceRes.unitPriceById)
      ) {
        throw new Error(priceRes.error);
      }

      const baseOr = args.orNumber.trim();
      const nLabs = openLabRequests.length;
      const hasPhysicianFees = feeTotalDue > 0;

      const labSubtotals = openLabRequests.map((req) => {
        const items = labItemsByRequestId.get(req.id) ?? [];
        return {
          labRequestId: req.id,
          subtotal: labRequestCheckoutSubtotal(req, items, priceRes.unitPriceById),
        };
      });

      const imagingSubtotals = openImagingRequests.map((req) => {
        const items = imagingItemsByRequestId.get(req.id) ?? [];
        return {
          imagingRequestId: req.id,
          subtotal: items.reduce((s, it) => s + moneyNum(it.unit_price), 0),
        };
      });

      const grandSubtotal =
        feeSaleSubtotals.reduce((s, r) => s + r.subtotal, 0) +
        labSubtotals.reduce((s, r) => s + r.subtotal, 0) +
        imagingSubtotals.reduce((s, r) => s + r.subtotal, 0);

      const totalDiscount =
        args.discountMode === "amount"
          ? Math.min(Math.max(0, args.discountAmount), grandSubtotal)
          : Math.min(Math.max(0, (grandSubtotal * Math.max(0, args.discountPct)) / 100), grandSubtotal);

      function allocateDiscount(subtotals: number[], total: number): number[] {
        const safeSubs = subtotals.map((n) => (Number.isFinite(n) && n > 0 ? n : 0));
        const sum = safeSubs.reduce((s, n) => s + n, 0);
        if (total <= 0 || sum <= 0) return safeSubs.map(() => 0);
        const raw = safeSubs.map((n) => (total * n) / sum);
        const cents = raw.map((n) => Math.floor(n * 100));
        let used = cents.reduce((s, c) => s + c, 0);
        const target = Math.round(total * 100);
        const frac = raw.map((n, i) => ({ i, frac: n * 100 - cents[i] }));
        frac.sort((a, b) => b.frac - a.frac);
        for (let k = 0; used < target && k < frac.length; k++) {
          cents[frac[k].i] += 1;
          used += 1;
        }
        return cents.map((c, i) => Math.min(c / 100, safeSubs[i]));
      }

      const combinedDiscounts = allocateDiscount(
        [
          ...feeSaleSubtotals.map((s) => s.subtotal),
          ...labSubtotals.map((s) => s.subtotal),
          ...imagingSubtotals.map((s) => s.subtotal),
        ],
        totalDiscount,
      );
      const feeDiscounts = combinedDiscounts.slice(0, feeSaleSubtotals.length);
      const labDiscounts = combinedDiscounts.slice(
        feeSaleSubtotals.length,
        feeSaleSubtotals.length + labSubtotals.length,
      );
      const imagingDiscounts = combinedDiscounts.slice(feeSaleSubtotals.length + labSubtotals.length);

      // Update physician fee sales with allocated discounts
      if (feeSales.length > 0) {
        const markRes2 = await markPhysicianFeeSalesPaid({
          sales: feeSaleSubtotals.map((s, idx) => ({ ...s, discountAmount: feeDiscounts[idx] ?? 0 })),
          orNumber: args.orNumber,
          paymentMethodId: args.paymentMethod.id,
          amountTendered: args.amountTendered,
          changeAmount: args.changeAmount,
          discountTypeId: args.discountMode === "pct" ? args.discountType?.id ?? null : null,
        });
        if (markRes2.error) throw new Error(markRes2.error);
      }

      for (let i = 0; i < openLabRequests.length; i++) {
        const req = openLabRequests[i];
        const items = labItemsByRequestId.get(req.id) ?? [];
        const payloadItems: LabSaleItemInsertRow[] = items.map((it) => ({
          lab_test_id: it.lab_test_id,
          quantity: 1,
          unit_price: labLineCheckoutUnitFee(req, items, it, priceRes.unitPriceById),
          discount: 0,
          notes: it.notes,
        }));
        if (i === 0) {
          for (const imgReq of openImagingRequests) {
            for (const it of imagingItemsByRequestId.get(imgReq.id) ?? []) {
              payloadItems.push({
                imaging_catalog_id: it.imaging_catalog_id,
                quantity: 1,
                unit_price: moneyNum(it.unit_price),
                discount: 0,
                notes: it.study_name,
              });
            }
          }
        }
        const labOrNumber = nLabs === 1 && openImagingRequests.length === 0 ? baseOr : `${baseOr}-L${i + 1}`;
        const tenderedOnLab =
          hasPhysicianFees ? null : i === 0 && openImagingRequests.length === 0 ? args.amountTendered : null;
        const changeOnLab = hasPhysicianFees ? null : i === 0 && openImagingRequests.length === 0 ? args.changeAmount : null;
        const labDisc = (labDiscounts[i] ?? 0) + (i === 0 ? imagingDiscounts.reduce((a, b) => a + b, 0) : 0);

        const saleRes = await createLabSaleWithItems({
          labRequestId: req.id,
          imagingRequestId: i === 0 && openImagingRequests[0] ? openImagingRequests[0].id : null,
          patientId: patientIdNum(patient.patientId),
          orNumber: labOrNumber,
          paymentMethodId: args.paymentMethod.id,
          amountTendered: tenderedOnLab,
          changeAmount: changeOnLab,
          discountTypeId: args.discountMode === "pct" ? args.discountType?.id ?? null : null,
          discountAmount: labDisc,
          items: payloadItems,
        });
        if (saleRes.error) throw new Error(saleRes.error);
      }

      if (openLabRequests.length === 0) {
        for (let i = 0; i < openImagingRequests.length; i++) {
          const req = openImagingRequests[i];
          const items = imagingItemsByRequestId.get(req.id) ?? [];
          const payloadItems = items.map((it) => ({
            imaging_catalog_id: it.imaging_catalog_id,
            quantity: 1,
            unit_price: moneyNum(it.unit_price),
            discount: 0,
            notes: it.study_name,
          }));
          const imgOrNumber = openImagingRequests.length === 1 ? baseOr : `${baseOr}-I${i + 1}`;
          const saleRes = await createLabSaleWithItems({
            imagingRequestId: req.id,
            patientId: patientIdNum(patient.patientId),
            orNumber: imgOrNumber,
            paymentMethodId: args.paymentMethod.id,
            amountTendered: hasPhysicianFees ? null : i === 0 ? args.amountTendered : null,
            changeAmount: hasPhysicianFees ? null : i === 0 ? args.changeAmount : null,
            discountTypeId: args.discountMode === "pct" ? args.discountType?.id ?? null : null,
            discountAmount: imagingDiscounts[i] ?? 0,
            items: payloadItems,
          });
          if (saleRes.error) throw new Error(saleRes.error);
        }
      }

      let labQueueLine = "";
      let labQueueSlip:
        | { queueDisplay: string; queueTicketId: string | null }
        | null = null;
      if (openLabRequests.length > 0 || openImagingRequests.length > 0) {
        const pid = patientIdNum(patient.patientId);
        if (pid == null) throw new Error("Patient id missing for diagnostic queue ticket.");
        const encSnap = await fetchEncounterSummaryByTransId(encounterId);
        const receptionQueueNoBeforePay = (encSnap.encounter?.queueNo ?? "").trim();
        const queueRes = await authenticatedFetch("/api/cashier/lab-queue-ticket", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            encounterTransId: encounterId,
            labRequestIds: openLabRequests.map((r) => r.id),
            imagingRequestIds: openImagingRequests.map((r) => r.id),
            cashierPriorityId: args.labQueuePriorityId,
            patient: {
              id: pid,
              name: (patient.name ?? "").trim() || "Patient",
              contact_no: patient.contactNo?.trim() ? patient.contactNo.trim() : null,
            },
          }),
        });
        const qj = (await queueRes.json().catch(() => ({}))) as {
          error?: string;
          queueDisplay?: string;
          queueTicketId?: string;
        };
        if (!queueRes.ok || qj.error) throw new Error(qj.error ?? "Could not create laboratory queue ticket.");
        const qd = (qj.queueDisplay ?? "").trim();
        const tid = (qj.queueTicketId ?? "").trim();
        setLabReceiptQueueDisplay(qd);
        const dest =
          openLabRequests.length > 0 && openImagingRequests.length > 0
            ? "Laboratory & imaging"
            : openImagingRequests.length > 0
              ? "Imaging"
              : "Laboratory";
        labQueueLine = qd
          ? ` ${dest} queue: ${qd}. Collect your slip at reception.`
          : ` ${dest} queue assigned. Collect your slip at reception.`;
        if (!receptionQueueNoBeforePay && qd) {
          labQueueSlip = { queueDisplay: qd, queueTicketId: tid || null };
        } else if (receptionQueueNoBeforePay && tid) {
          storeCashierLabQueueReprintOffer({
            ticketId: tid,
            queueDisplay: receptionQueueNoBeforePay,
          });
        }
      }

      const paymentLines: { label: string; amount: number }[] = [];
      if (feeTotalDue > 0) paymentLines.push({ label: "Consultation charges", amount: feeTotalDue });
      if (labTotalDue > 0) {
        paymentLines.push({ label: "Laboratory orders (new)", amount: labTotalDue });
      } else if (freshBreakdown && freshBreakdown.labDue.length > 0) {
        for (const it of freshBreakdown.labDue) {
          paymentLines.push({ label: `${it.name} (Laboratory)`, amount: moneyNum(it.price) });
        }
      }
      if (imagingTotalDue > 0) {
        paymentLines.push({ label: "Imaging orders (new)", amount: imagingTotalDue });
      } else if (freshBreakdown && freshBreakdown.imagingDue.length > 0) {
        for (const it of freshBreakdown.imagingDue) {
          paymentLines.push({ label: `${it.name} (Imaging)`, amount: moneyNum(it.price) });
        }
      }
      if (paymentLines.length === (feeTotalDue > 0 ? 1 : 0) && freshAmendments.length > 0) {
        paymentLines.push(...paymentLinesFromAmendments(freshAmendments));
      }

      const freshLabPortion = Math.max(
        labTotalDue,
        freshBreakdown?.labDueTotal ?? 0,
        sumPositiveAmendmentDueForLab(freshAmendments),
      );
      const freshImgPortion = Math.max(
        imagingTotalDue,
        freshBreakdown?.imagingDueTotal ?? 0,
        sumPositiveAmendmentDueForImaging(freshAmendments),
      );
      const amendCheckoutTotal = roundMoney2(feeTotalDue + freshLabPortion + freshImgPortion);

      await openCashierAcknowledgementReceiptPrint({
        facilityName: "LifeHub Medical & Diagnostic Center",
        facilityAddressLines: ["Poblacion, Imelda, Zamboanga Sibugay"],
        facilityContactLine: `Contact: ${CONSULTATION_BRANDING.tel}`,
        facilityEmailLine: `Email: ${CONSULTATION_BRANDING.email}`,
        customerName: (patient.name ?? "").trim() || "Customer",
        customerAddress: (patient.address ?? "").trim() || "—",
        transId: encounterId,
        orNumber: args.orNumber,
        paymentMethodLabel:
          (args.paymentMethod.name ?? "").trim() || `Method #${args.paymentMethod.id}`,
        paymentLines,
        subtotal: amendCheckoutTotal,
        discountAmount: totalDiscount,
        totalDue: isRefundCheckout
          ? checkoutAbs
          : Math.max(0, grandSubtotal - totalDiscount + freshLabPortion + freshImgPortion - labTotalDue - imagingTotalDue),
        amountTendered: args.amountTendered,
        changeAmount: args.changeAmount,
        openCashDrawer: isCashPaymentMethod(args.paymentMethod),
      });
      if (labQueueSlip != null) {
        await openReceptionQueueReceiptPrint({
          patientName: (patient.name ?? "").trim() || "Patient",
          destinationLabel: "Laboratory",
          queueDisplay: labQueueSlip.queueDisplay,
          transId: encounterId,
          queueTicketId: labQueueSlip.queueTicketId,
        });
      }

      const amendMessages = await settlePendingAmendments({
        paymentMethod: args.paymentMethod,
        baseOrNumber: baseOr,
        amountTendered: hasPhysicianFees || openLabRequests.length > 0 || openImagingRequests.length > 0 ? null : args.amountTendered,
        changeAmount: hasPhysicianFees || openLabRequests.length > 0 || openImagingRequests.length > 0 ? null : args.changeAmount,
        recordCashOnFirst: !(hasPhysicianFees || openLabRequests.length > 0 || openImagingRequests.length > 0),
        amendments: freshAmendments,
      });

      setPendingAmendments([]);
      if (freshBreakdown) setDiagnosticBreakdown(freshBreakdown);

      setPayOpen(false);
      setPayBusy(false);
      const amendLine = amendMessages.length > 0 ? ` ${amendMessages.join(" · ")}.` : "";
      setPaySuccess(
        isRefundCheckout
          ? `Refund of ${formatMoney(checkoutAbs)} recorded.${amendLine}${labQueueLine}`
          : `Payment of ${formatMoney(checkoutAbs)} saved.${amendLine}${labQueueLine}`,
      );
      scheduleCashierHomeNavigation("/cashier?tab=visit");
      return;
    } catch (e) {
      setPayError(e instanceof Error ? e.message : "Could not save payment.");
      setPayBusy(false);
    }
  }

  return (
    <Box>
      <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 2, flexWrap: "wrap" }}>
        <Button
          component={Link}
          href="/cashier"
          variant="outlined"
          size="small"
          startIcon={<ArrowBackIcon />}
          sx={{ textTransform: "none" }}
        >
          Back to queue
        </Button>
        <Typography variant="h5">Payment — visit details</Typography>
        <Box sx={{ flex: 1 }} />
        <Button
          variant="contained"
          color={isRefundCheckout ? "warning" : "secondary"}
          disabled={checkoutUiLoading || !!loadError || !hasCheckout || paymentMethods.length === 0}
          onClick={() => {
            setPayError("");
            setPaySuccess("");
            setLabReceiptQueueDisplay("");
            setPayModalKey((k) => k + 1);
            setPayOpen(true);
            if (openLabRequests.length > 0 && queuePriorities.length > 0) {
              setLabQueuePrioritySel(queuePriorities[0]!.id);
            }
          }}
          sx={{ textTransform: "none" }}
        >
          {checkoutUiLoading
            ? "Loading charges…"
            : isRefundCheckout
              ? `Refund ${formatMoney(checkoutAbs)}`
              : `Pay ${formatMoney(checkoutAbs)}`}
        </Button>
      </Box>

      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Visit ID:{" "}
        <Box component="span" sx={{ fontFamily: "monospace" }}>
          {encounterId}
        </Box>
      </Typography>

      {checkoutUiLoading ? (
        <Card
          sx={{
            mb: 2,
            border: 1,
            borderColor: "divider",
            boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
          }}
        >
          <CardContent sx={{ py: { xs: 5, sm: 7 }, px: { xs: 2, sm: 4 } }}>
            <Box
              sx={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 2,
                maxWidth: 420,
                mx: "auto",
              }}
            >
              <CircularProgress size={52} thickness={3.5} color="secondary" />
              <Typography variant="h6" fontWeight={700} textAlign="center">
                Loading visit charges
              </Typography>
              <Typography variant="body2" color="text.secondary" textAlign="center">
                Fetching consultation fees, laboratory and imaging orders, and balances due at cashier…
              </Typography>
              <LinearProgress
                color="secondary"
                sx={{ width: "100%", mt: 1, height: 6, borderRadius: 3 }}
              />
            </Box>
          </CardContent>
        </Card>
      ) : null}

      {loadError ? (
        <Alert severity="error" sx={{ mb: 2 }}>
          {loadError}
        </Alert>
      ) : null}

      {labQueuePriorityBanner && openLabRequests.length > 0 ? (
        <Alert
          severity={labQueuePriorityBanner.severity}
          sx={{ mb: 2, whiteSpace: "pre-line" }}
          onClose={() => setLabQueuePriorityBanner(null)}
        >
          {labQueuePriorityBanner.message}
        </Alert>
      ) : null}

      {paySuccess ? (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setPaySuccess("")}>
          {paySuccess}
        </Alert>
      ) : null}

      {labReceiptQueueDisplay.trim() ? (
        <Alert
          severity="info"
          sx={{ mb: 2 }}
          onClose={() => {
            setLabReceiptQueueDisplay("");
          }}
        >
          Laboratory queue{" "}
          <Box component="strong" sx={{ fontFamily: "monospace" }}>
            {labReceiptQueueDisplay}
          </Box>
          . Your laboratory slip will be printed at{" "}
          <Box component="strong" display="inline">
            reception
          </Box>
          .
        </Alert>
      ) : null}

      {!checkoutUiLoading && patient ? (
        <Card sx={{ mb: 2 }}>
          <CardContent>
            <ConsultationSectionTitle>Patient</ConsultationSectionTitle>
            <Typography variant="body2" sx={{ ...consultBodyTypoSx, textTransform: "capitalize" }}>
              {patient.name?.toLowerCase() ?? "—"} · ID {patient.patientId} · {patient.ageSex}
            </Typography>
          </CardContent>
        </Card>
      ) : null}

      <PaymentModal
        key={payModalKey}
        open={payOpen}
        title={isRefundCheckout ? "Refund — visit checkout" : "Pay — visit checkout"}
        paymentMethods={paymentMethods}
        discountTypes={discountTypes}
        busy={payBusy}
        errorText={payError}
        isRefund={isRefundCheckout}
        confirmLabel={isRefundCheckout ? `Refund ${formatMoney(checkoutAbs)}` : `Pay ${formatMoney(checkoutAbs)}`}
        onGenerateOrNumber={async () => {
          const res = await generateNextDailyOrNumber();
          if (res.error || !res.orNumber) throw new Error(res.error ?? "Could not generate OR number.");
          return res.orNumber;
        }}
        onClose={() => setPayOpen(false)}
        totalDue={checkoutAbs}
        discountableSubtotal={unpaidNet > 0.005 ? unpaidNet : undefined}
        fixedAdjustments={isRefundCheckout ? 0 : unpaidNet > 0.005 ? diagnosticCheckoutPortion : 0}
        summaryRows={checkoutSummaryRows}
        labQueuePrioritySelect={
          openLabRequests.length > 0 && queuePriorities.length > 0
            ? {
                priorities: queuePriorities,
                value: labQueuePrioritySel,
                onChange: setLabQueuePrioritySel,
              }
            : null
        }
        onConfirm={handleConfirmPay}
      />

      {!checkoutUiLoading && !loadError ? (
        <Card sx={{ mb: 2 }}>
          <CardContent>
            <ConsultationSectionTitle>Visit charges — unpaid</ConsultationSectionTitle>
            <Typography variant="body2" color="text.primary" sx={{ ...consultBodyTypoSx, mb: 2, display: "block" }}>
              Consultation, laboratory, and imaging lines use the same bill layout as consultation Charges. Paid
              orders and additional tests due at cashier are listed below before new unpaid orders.
            </Typography>

            {feeVisitChargeRows.length === 0 &&
            labOrdersForDisplay.length === 0 &&
            imagingOrdersForDisplay.length === 0 &&
            !hasDiagnosticChargeRows ? (
              <Typography variant="body2" sx={consultBodyTypoSx}>
                No unpaid consultation charges, laboratory orders, or imaging orders for this visit.
              </Typography>
            ) : (
              <>
                {diagnosticBreakdown ? (
                  <Box sx={{ mb: feeVisitChargeRows.length > 0 || labOrdersForDisplay.length > 0 || imagingOrdersForDisplay.length > 0 ? 2 : 0 }}>
                    <CashierDiagnosticBillSection
                      title="Laboratory — paid at cashier"
                      items={diagnosticBreakdown.labPaid}
                      paid
                      sectionTotal={
                        diagnosticBreakdown.labPaid.length > 0
                          ? roundMoney2(
                              diagnosticBreakdown.labPaid.reduce((s, it) => s + moneyNum(it.price), 0),
                            )
                          : undefined
                      }
                      totalCaption="Settled total"
                    />
                    <CashierDiagnosticBillSection
                      title="Laboratory — additional due at cashier"
                      items={diagnosticBreakdown.labDue}
                      sectionTotal={diagnosticBreakdown.labDueTotal}
                      totalCaption="Balance due"
                      emphasizeDue
                    />
                    <CashierDiagnosticBillSection
                      title="Imaging — paid at cashier"
                      items={diagnosticBreakdown.imagingPaid}
                      paid
                      sectionTotal={
                        diagnosticBreakdown.imagingPaid.length > 0
                          ? roundMoney2(
                              diagnosticBreakdown.imagingPaid.reduce((s, it) => s + moneyNum(it.price), 0),
                            )
                          : undefined
                      }
                      totalCaption="Settled total"
                    />
                    <CashierDiagnosticBillSection
                      title="Imaging — additional due at cashier"
                      items={diagnosticBreakdown.imagingDue}
                      sectionTotal={diagnosticBreakdown.imagingDueTotal}
                      totalCaption="Balance due"
                      emphasizeDue
                    />
                  </Box>
                ) : null}

                {feeVisitChargeRows.length > 0 ? (
                  <Box sx={{ mb: labOrdersForDisplay.length > 0 ? 4 : 0 }}>
                    <ConsultationSectionTitle dense sx={{ mt: 0 }}>
                      Consultation bill
                    </ConsultationSectionTitle>
                    <TableContainer>
                      <Table size="small" sx={consultTableSx}>
                        <TableHead>
                          <TableRow sx={consultTableHeadRowSx}>
                            <TableCell sx={consultTableHeadCellSx}>#</TableCell>
                            <TableCell sx={consultTableHeadCellSx}>Bill</TableCell>
                            <TableCell sx={consultTableHeadCellSx}>Item</TableCell>
                            <TableCell align="right" sx={consultTableHeadCellSx}>
                              Qty
                            </TableCell>
                            <TableCell align="right" sx={consultTableHeadCellSx}>
                              Unit fee
                            </TableCell>
                            <TableCell align="right" sx={consultTableHeadCellSx}>
                              Discount
                            </TableCell>
                            <TableCell align="right" sx={consultTableHeadCellSx}>
                              Line total
                            </TableCell>
                            <TableCell sx={consultTableHeadCellSx}>Notes</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {feeVisitChargeRows.map((row) => (
                            <TableRow key={row.key}>
                              <TableCell sx={consultTableBodyCellSx}>{row.rowNum}</TableCell>
                              <TableCell sx={consultTableBodyCellSx}>
                                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                  {row.billTitle}
                                </Typography>
                                <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.25 }}>
                                  Status: {row.billStatusLabel}
                                </Typography>
                                <Typography
                                  variant="caption"
                                  color="text.secondary"
                                  sx={{
                                    display: "block",
                                    fontFamily: "monospace",
                                    wordBreak: "break-all",
                                    mt: 0.25,
                                  }}
                                >
                                  {row.billId}
                                </Typography>
                              </TableCell>
                              <TableCell sx={consultTableBodyCellSx}>
                                {(row.line.service_name ?? "").trim() || `Service #${row.line.physician_service_id}`}
                              </TableCell>
                              <TableCell align="right" sx={consultTableBodyCellSx}>
                                {row.line.quantity}
                              </TableCell>
                              <TableCell align="right" sx={consultTableBodyCellSx}>
                                {formatMoney(row.line.unit_fee)}
                              </TableCell>
                              <TableCell align="right" sx={consultTableBodyCellSx}>
                                {formatMoney(row.line.discount)}
                              </TableCell>
                              <TableCell align="right" sx={consultTableBodyCellSx}>
                                {formatMoney(row.line.total_fee)}
                              </TableCell>
                              <TableCell sx={consultTableBodyCellSx}>{row.line.notes?.trim() || "—"}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </Box>
                ) : null}

                {labOrdersForDisplay.length > 0 ? (
                  <Box sx={{ mb: imagingOrdersForDisplay.length > 0 ? 4 : 0 }}>
                    <ConsultationSectionTitle dense sx={{ mt: 0 }}>
                      Laboratory orders
                    </ConsultationSectionTitle>
                    <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
                      {labOrdersForDisplay.map(({ req, lines, subtotal }) => {
                        const isPkg = labRequestUsesPackageBundling(req);
                        const pkgNames = labRequestPackagesDisplayNames(req);
                        const cov = new Set(req.package_covered_test_ids ?? []);
                        const uncoveredLines = lines.filter((row) => !cov.has(row.item.lab_test_id));
                        const when = `${formatDateMMDDYYYY(req.request_date)} ${formatLabTime(req.request_time)}`;
                        return (
                          <Box
                            key={req.id}
                            sx={{
                              border: 1,
                              borderColor: "divider",
                              borderRadius: 1,
                              bgcolor: "action.hover",
                              overflow: "hidden",
                            }}
                          >
                            <Box
                              sx={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "flex-start",
                                gap: 2,
                                flexWrap: "wrap",
                                px: 2,
                                py: 1.75,
                                borderBottom: 1,
                                borderColor: "divider",
                                bgcolor: "background.paper",
                              }}
                            >
                              <Box sx={{ minWidth: 0 }}>
                                <Typography variant="subtitle2" fontWeight={800}>
                                  Laboratory order · {when} · {req.priority ?? "—"}
                                </Typography>
                                {isPkg && req.lab_packages.length > 0 ? (
                                  <Typography variant="body2" color="primary.main" sx={{ fontWeight: 700, mt: 0.5 }}>
                                    Package sale · {pkgNames}
                                  </Typography>
                                ) : (
                                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, fontWeight: 600 }}>
                                    Laboratory sale (per‑test pricing)
                                  </Typography>
                                )}
                                <Typography
                                  variant="caption"
                                  color="text.secondary"
                                  sx={{ display: "block", fontFamily: "monospace", wordBreak: "break-all", mt: 0.75 }}
                                >
                                  {req.id}
                                </Typography>
                              </Box>
                              <Box sx={{ textAlign: { xs: "left", sm: "right" }, flexShrink: 0 }}>
                                <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                                  {isPkg ? "Package total due" : "Order total due"}
                                </Typography>
                                <Typography variant="h6" component="div" fontWeight={800}>
                                  {labTotalLoading ? "…" : formatMoney(subtotal)}
                                </Typography>
                              </Box>
                            </Box>
                            <TableContainer sx={{ bgcolor: "background.paper" }}>
                              <Table size="small" sx={consultTableSx}>
                                <TableHead>
                                  <TableRow sx={consultTableHeadRowSx}>
                                    <TableCell sx={consultTableHeadCellSx}>#</TableCell>
                                    <TableCell sx={consultTableHeadCellSx}>{isPkg ? "Package / item" : "Test / item"}</TableCell>
                                    <TableCell align="right" sx={consultTableHeadCellSx}>
                                      Qty
                                    </TableCell>
                                    <TableCell align="right" sx={consultTableHeadCellSx}>
                                      Unit fee
                                    </TableCell>
                                    <TableCell align="right" sx={consultTableHeadCellSx}>
                                      Discount
                                    </TableCell>
                                    <TableCell align="right" sx={consultTableHeadCellSx}>
                                      Line total
                                    </TableCell>
                                    <TableCell sx={consultTableHeadCellSx}>Notes</TableCell>
                                  </TableRow>
                                </TableHead>
                                <TableBody>
                                  {isPkg && req.lab_packages.length > 0 ? (
                                    <>
                                      {req.lab_packages.map((pkg, pIdx) => (
                                        <TableRow key={`lab-pkg-${req.id}-${pkg.id}`}>
                                          <TableCell sx={consultTableBodyCellSx}>{pIdx + 1}</TableCell>
                                          <TableCell sx={consultTableBodyCellSx}>
                                            <Typography variant="body2" fontWeight={700}>
                                              {pkg.name}
                                            </Typography>
                                            {pkg.description?.trim() ? (
                                              <Typography
                                                variant="caption"
                                                color="text.secondary"
                                                sx={{ display: "block", mt: 0.5, whiteSpace: "pre-wrap" }}
                                              >
                                                {pkg.description.trim()}
                                              </Typography>
                                            ) : null}
                                          </TableCell>
                                          <TableCell align="right" sx={consultTableBodyCellSx}>
                                            1
                                          </TableCell>
                                          <TableCell align="right" sx={consultTableBodyCellSx}>
                                            {labTotalLoading ? "…" : formatMoney(pkg.package_price)}
                                          </TableCell>
                                          <TableCell align="right" sx={consultTableBodyCellSx}>
                                            {formatMoney(0)}
                                          </TableCell>
                                          <TableCell align="right" sx={consultTableBodyCellSx}>
                                            {labTotalLoading ? "…" : formatMoney(pkg.package_price)}
                                          </TableCell>
                                          <TableCell sx={consultTableBodyCellSx}>
                                            {pIdx === 0
                                              ? [
                                                  req.priority?.trim() ? `Priority: ${req.priority}` : null,
                                                  req.clinical_diagnosis?.trim(),
                                                  req.remarks?.trim(),
                                                ]
                                                  .filter(Boolean)
                                                  .join(" · ") || "—"
                                              : "—"}
                                          </TableCell>
                                        </TableRow>
                                      ))}
                                      {uncoveredLines.map((row, uIdx) => (
                                        <TableRow key={`lab-extra-${req.id}-${row.item.id}`}>
                                          <TableCell sx={consultTableBodyCellSx}>
                                            {req.lab_packages.length + uIdx + 1}
                                          </TableCell>
                                          <TableCell sx={consultTableBodyCellSx}>
                                            {(row.item.test_name ?? "").trim() || `Test ${row.item.lab_test_id}`}
                                          </TableCell>
                                          <TableCell align="right" sx={consultTableBodyCellSx}>
                                            1
                                          </TableCell>
                                          <TableCell align="right" sx={consultTableBodyCellSx}>
                                            {labTotalLoading ? "…" : formatMoney(row.unitPrice)}
                                          </TableCell>
                                          <TableCell align="right" sx={consultTableBodyCellSx}>
                                            {formatMoney(0)}
                                          </TableCell>
                                          <TableCell align="right" sx={consultTableBodyCellSx}>
                                            {labTotalLoading ? "…" : formatMoney(row.unitPrice)}
                                          </TableCell>
                                          <TableCell sx={consultTableBodyCellSx}>
                                            {[row.item.priority?.trim() ? `Priority: ${row.item.priority}` : null, row.item.notes?.trim()]
                                              .filter(Boolean)
                                              .join(" · ") || "—"}
                                          </TableCell>
                                        </TableRow>
                                      ))}
                                    </>
                                  ) : lines.length === 0 ? (
                                    <TableRow>
                                      <TableCell colSpan={7} sx={consultTableBodyCellSx}>
                                        No line items loaded for this order.
                                      </TableCell>
                                    </TableRow>
                                  ) : (
                                    lines.map((row) => (
                                      <TableRow key={row.item.id}>
                                        <TableCell sx={consultTableBodyCellSx}>{row.rowNum}</TableCell>
                                        <TableCell sx={consultTableBodyCellSx}>
                                          {(row.item.test_name ?? "").trim() || `Test ${row.item.lab_test_id}`}
                                        </TableCell>
                                        <TableCell align="right" sx={consultTableBodyCellSx}>
                                          1
                                        </TableCell>
                                        <TableCell align="right" sx={consultTableBodyCellSx}>
                                          {labTotalLoading ? "…" : formatMoney(row.unitPrice)}
                                        </TableCell>
                                        <TableCell align="right" sx={consultTableBodyCellSx}>
                                          {formatMoney(0)}
                                        </TableCell>
                                        <TableCell align="right" sx={consultTableBodyCellSx}>
                                          {labTotalLoading ? "…" : formatMoney(row.unitPrice)}
                                        </TableCell>
                                        <TableCell sx={consultTableBodyCellSx}>
                                          {[row.item.priority?.trim() ? `Priority: ${row.item.priority}` : null, row.item.notes?.trim()]
                                            .filter(Boolean)
                                            .join(" · ") || "—"}
                                        </TableCell>
                                      </TableRow>
                                    ))
                                  )}
                                </TableBody>
                              </Table>
                            </TableContainer>
                          </Box>
                        );
                      })}
                    </Box>
                  </Box>
                ) : null}

                {imagingOrdersForDisplay.length > 0 ? (
                  <Box sx={{ mb: 0 }}>
                    <ConsultationSectionTitle dense sx={{ mt: 0 }}>
                      Imaging orders
                    </ConsultationSectionTitle>
                    <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
                      {imagingOrdersForDisplay.map(({ req, items, subtotal }) => {
                        const when = `${formatDateMMDDYYYY(req.request_date)} ${formatLabTime(req.request_time)}`;
                        return (
                          <Box
                            key={req.id}
                            sx={{
                              border: 1,
                              borderColor: "divider",
                              borderRadius: 1,
                              bgcolor: "action.hover",
                              overflow: "hidden",
                            }}
                          >
                            <Box
                              sx={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "flex-start",
                                gap: 2,
                                flexWrap: "wrap",
                                px: 2,
                                py: 1.5,
                                borderBottom: 1,
                                borderColor: "divider",
                              }}
                            >
                              <Box>
                                <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                                  Imaging order · {when}
                                </Typography>
                                <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.25 }}>
                                  Priority: {req.priority?.trim() || "—"}
                                  {req.remarks?.trim() ? ` · ${req.remarks.trim()}` : ""}
                                </Typography>
                              </Box>
                              <Typography variant="subtitle2" sx={{ fontWeight: 800, color: "error.main" }}>
                                Order total: {formatMoney(subtotal)}
                              </Typography>
                            </Box>
                            <TableContainer>
                              <Table size="small" sx={consultTableSx}>
                                <TableHead>
                                  <TableRow sx={consultTableHeadRowSx}>
                                    <TableCell sx={consultTableHeadCellSx}>#</TableCell>
                                    <TableCell sx={consultTableHeadCellSx}>Study</TableCell>
                                    <TableCell align="right" sx={consultTableHeadCellSx}>
                                      Unit fee
                                    </TableCell>
                                    <TableCell align="right" sx={consultTableHeadCellSx}>
                                      Line total
                                    </TableCell>
                                    <TableCell sx={consultTableHeadCellSx}>Notes</TableCell>
                                  </TableRow>
                                </TableHead>
                                <TableBody>
                                  {items.length === 0 ? (
                                    <TableRow>
                                      <TableCell colSpan={5} sx={consultTableBodyCellSx}>
                                        No line items loaded for this order.
                                      </TableCell>
                                    </TableRow>
                                  ) : (
                                    items.map((it, idx) => (
                                      <TableRow key={it.id}>
                                        <TableCell sx={consultTableBodyCellSx}>{idx + 1}</TableCell>
                                        <TableCell sx={consultTableBodyCellSx}>
                                          {(it.study_name ?? "").trim() || `Study ${it.imaging_catalog_id}`}
                                          {it.view_text?.trim() ? (
                                            <Typography
                                              variant="caption"
                                              color="text.secondary"
                                              sx={{ display: "block", mt: 0.25 }}
                                            >
                                              View: {it.view_text.trim()}
                                            </Typography>
                                          ) : null}
                                        </TableCell>
                                        <TableCell align="right" sx={consultTableBodyCellSx}>
                                          {formatMoney(it.unit_price)}
                                        </TableCell>
                                        <TableCell align="right" sx={consultTableBodyCellSx}>
                                          {formatMoney(it.unit_price)}
                                        </TableCell>
                                        <TableCell sx={consultTableBodyCellSx}>{it.remarks?.trim() || "—"}</TableCell>
                                      </TableRow>
                                    ))
                                  )}
                                </TableBody>
                              </Table>
                            </TableContainer>
                          </Box>
                        );
                      })}
                    </Box>
                  </Box>
                ) : null}

                <Box
                  sx={{
                    mt: 2,
                    display: "flex",
                    justifyContent: { xs: "stretch", sm: "flex-end" },
                    width: "100%",
                  }}
                >
                  <Box sx={{ maxWidth: { xs: "100%", sm: 440 }, width: { xs: "100%", sm: "auto" } }}>
                    <Typography variant="subtitle2" fontWeight={700} color="text.secondary" sx={{ mb: 1 }}>
                      Visit totals
                    </Typography>
                    <TableContainer sx={{ width: "100%" }}>
                      <Table size="small" sx={consultTableSx}>
                        <TableHead>
                          <TableRow sx={consultTableHeadRowSx}>
                            <TableCell sx={consultTableHeadCellSx}>Description</TableCell>
                            <TableCell align="right" sx={{ ...consultTableHeadCellSx, width: "9rem", whiteSpace: "nowrap" }}>
                              Amount
                            </TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {feeTotalDue > 0.005 ? (
                            <TableRow>
                              <TableCell sx={consultTableBodyCellSx}>Consultation</TableCell>
                              <TableCell align="right" sx={{ ...consultTableBodyCellSx, fontWeight: 700 }}>
                                {formatMoney(feeTotalDue)}
                              </TableCell>
                            </TableRow>
                          ) : null}
                          {visitSummaryLabDue > 0.005 ? (
                            <TableRow>
                              <TableCell sx={consultTableBodyCellSx}>Laboratory</TableCell>
                              <TableCell
                                align="right"
                                sx={{
                                  ...consultTableBodyCellSx,
                                  fontWeight: 700,
                                  color: labTotalDue > 0.005 ? undefined : "warning.dark",
                                }}
                              >
                                {labTotalLoading && openLabRequests.length > 0 ? "…" : formatMoney(visitSummaryLabDue)}
                              </TableCell>
                            </TableRow>
                          ) : null}
                          {visitSummaryImagingDue > 0.005 ? (
                            <TableRow>
                              <TableCell sx={consultTableBodyCellSx}>Imaging</TableCell>
                              <TableCell
                                align="right"
                                sx={{
                                  ...consultTableBodyCellSx,
                                  fontWeight: 700,
                                  color: imagingTotalDue > 0.005 ? undefined : "warning.dark",
                                }}
                              >
                                {formatMoney(visitSummaryImagingDue)}
                              </TableCell>
                            </TableRow>
                          ) : null}
                          {feeSales.length > 0 && feeHeaderTotalSum !== feeTotalDue ? (
                            <TableRow>
                              <TableCell
                                colSpan={2}
                                sx={{
                                  ...consultTableBodyCellSx,
                                  py: 0.75,
                                  fontSize: "0.8rem",
                                  color: "text.secondary",
                                  borderBottomWidth: 1,
                                }}
                              >
                                Stored physician bill headers total {formatMoney(feeHeaderTotalSum)} — listed
                                consultation lines total {formatMoney(feeTotalDue)}.
                              </TableCell>
                            </TableRow>
                          ) : null}
                          <TableRow>
                            <TableCell colSpan={2} sx={{ py: 1, borderBottom: "none" }}>
                              <Divider />
                            </TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell sx={{ ...consultTableBodyCellSx, fontWeight: 800 }}>
                              {isRefundCheckout ? "Net refund due" : "Total"}
                            </TableCell>
                            <TableCell
                              align="right"
                              sx={{
                                ...consultTableBodyCellSx,
                                fontWeight: 800,
                                color: isRefundCheckout ? "info.main" : "warning.dark",
                              }}
                            >
                              {labTotalLoading && openLabRequests.length > 0
                                ? "…"
                                : isRefundCheckout
                                  ? formatMoney(checkoutAbs)
                                  : formatMoney(checkoutTotal)}
                            </TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </Box>
                </Box>
              </>
            )}
          </CardContent>
        </Card>
      ) : null}
    </Box>
  );
}
