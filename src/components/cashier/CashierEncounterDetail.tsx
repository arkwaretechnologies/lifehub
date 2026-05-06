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
  CircularProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { fetchEncounterSummaryByTransId, fetchEncounterWorkspacePatient } from "@/lib/consultationData";
import type { ConsultationPatient } from "@/components/consultation/consultationTypes";
import { formatDateMMDDYYYY } from "@/lib/dateDisplay";
import {
  fetchLabRequestItemDetailsForRequestIds,
  type EncounterLabRequestSummary,
  type LabRequestItemDetailRow,
} from "@/lib/labRequests";
import {
  fetchPhysicianFeeSaleItemsWithServiceNames,
  fetchUnpaidPhysicianFeeSalesForEncounter,
  type PhysicianFeeSaleItemDetail,
  type PhysicianFeeSaleWithStatus,
} from "@/lib/physicianFeeSales";
import { fetchLabRequestsWithoutLabSaleForEncounters } from "@/lib/cashierLabQueue";
import { PaymentModal } from "@/components/cashier/PaymentModal";
import { fetchActivePaymentMethods, type PaymentMethodRow } from "@/lib/paymentMethods";
import { fetchLabTestUnitPricesByIds } from "@/lib/labTests";
import { createLabSaleWithItems, generateNextDailyOrNumber, markPhysicianFeeSalesPaid } from "@/lib/cashierPayments";
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
import { openCashierQueueReceiptReprintByTicketId, openReceptionQueueReceiptPrint } from "@/lib/receptionQueueReceiptPrint";
import { openCashierAcknowledgementReceiptPrint } from "@/lib/cashierAcknowledgementReceiptPrint";
import { CONSULTATION_BRANDING } from "@/components/consultation/consultationTypes";

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

function formatLabTime(value: string | null | undefined): string {
  if (value == null || String(value).trim() === "") return "—";
  const s = String(value);
  if (s.length >= 5 && s[4] === ":") return s.slice(0, 5);
  const m = s.match(/(\d{1,2}:\d{2})/);
  return m?.[1] ?? "—";
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

  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodRow[]>([]);
  const [discountTypes, setDiscountTypes] = useState<DiscountTypeRow[]>([]);
  const [payOpen, setPayOpen] = useState(false);
  const [payBusy, setPayBusy] = useState(false);
  const [payError, setPayError] = useState("");
  const [paySuccess, setPaySuccess] = useState("");
  const [labTotalDue, setLabTotalDue] = useState<number>(0);
  const [labTotalLoading, setLabTotalLoading] = useState(false);
  const [payModalKey, setPayModalKey] = useState(0);
  const [queuePriorities, setQueuePriorities] = useState<QueuePriorityRow[]>([]);
  /** Shown when lab orders exist: priority fetch failed (error) or returned no rows (warning). */
  const [labQueuePriorityBanner, setLabQueuePriorityBanner] = useState<{
    severity: "error" | "warning";
    message: string;
  } | null>(null);
  const [labQueuePrioritySel, setLabQueuePrioritySel] = useState<number | "">("");
  const [labReceiptTicketId, setLabReceiptTicketId] = useState<string | null>(null);
  const [labReceiptQueueDisplay, setLabReceiptQueueDisplay] = useState("");
  const [labReceiptCounterLabel, setLabReceiptCounterLabel] = useState("");

  const reloadAll = useCallback(async (): Promise<{ receptionQueueNo: string }> => {
    setPaySuccess("");
    setLabQueuePriorityBanner(null);
    setLoadError("");
    setLoading(true);

    if (!isUuid(encounterId)) {
      setLoadError("Invalid encounter id.");
      setLoading(false);
      setPatient(null);
      setFeeSales([]);
      setFeeItemsBySale(new Map());
      setOpenLabRequests([]);
      setLabItemRows([]);
      setLabReceiptTicketId(null);
      setLabReceiptQueueDisplay("");
      setLabReceiptCounterLabel("");
      return { receptionQueueNo: "" };
    }

    const [pat, encSum] = await Promise.all([
      fetchEncounterWorkspacePatient(encounterId),
      fetchEncounterSummaryByTransId(encounterId),
    ]);
    const qn = (encSum.encounter?.queueNo ?? "").trim();
    setPatient(pat);

    const [salesRes, openLabsRes] = await Promise.all([
      fetchUnpaidPhysicianFeeSalesForEncounter(encounterId),
      fetchLabRequestsWithoutLabSaleForEncounters([encounterId]),
    ]);

    if (salesRes.error) {
      setLoading(false);
      setLoadError(salesRes.error);
      setFeeSales([]);
      setFeeItemsBySale(new Map());
      setOpenLabRequests([]);
      setLabItemRows([]);
      return { receptionQueueNo: qn };
    }

    setFeeSales(salesRes.sales);
    const saleIds = salesRes.sales.map((s) => s.id);
    const itemsRes = await fetchPhysicianFeeSaleItemsWithServiceNames(saleIds);
    if (itemsRes.error) {
      setLoading(false);
      setLoadError(itemsRes.error);
      setFeeItemsBySale(new Map());
      setOpenLabRequests([]);
      setLabItemRows([]);
      return { receptionQueueNo: qn };
    }
    setFeeItemsBySale(itemsRes.itemsBySaleId);

    if (openLabsRes.error) {
      setLoading(false);
      setLoadError(openLabsRes.error);
      setOpenLabRequests([]);
      setLabItemRows([]);
      return { receptionQueueNo: qn };
    }

    const openList = openLabsRes.byEncounter.get(encounterId) ?? [];
    setOpenLabRequests(openList);
    const reqIds = openList.map((r) => r.id);
    const labItemsRes = await fetchLabRequestItemDetailsForRequestIds(reqIds);
    setLoading(false);
    if (labItemsRes.error) {
      setLoadError(labItemsRes.error);
      setLabItemRows([]);
      return { receptionQueueNo: qn };
    }
    setLabItemRows(labItemsRes.items);
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

  useEffect(() => {
    const ids = [...new Set(labItemRows.map((r) => r.lab_test_id).filter(Boolean))];
    if (ids.length === 0) {
      setLabUnitPriceByTestId(new Map());
      setLabTotalDue(0);
      setLabTotalLoading(false);
      return;
    }
    setLabTotalLoading(true);
    let cancelled = false;
    void fetchLabTestUnitPricesByIds(ids).then((res) => {
      if (cancelled) return;
      setLabTotalLoading(false);
      if (res.error) {
        setLabUnitPriceByTestId(new Map());
        setLabTotalDue(0);
        return;
      }
      setLabUnitPriceByTestId(res.unitPriceById);
      let sum = 0;
      for (const row of labItemRows) {
        sum += res.unitPriceById.get(row.lab_test_id) ?? 0;
      }
      setLabTotalDue(sum);
    });
    return () => {
      cancelled = true;
    };
  }, [labItemRows]);

  type UnifiedVisitChargeRow =
    | {
        kind: "fee";
        key: string;
        rowNum: number;
        billTitle: string;
        billId: string;
        line: PhysicianFeeSaleItemDetail;
      }
    | {
        kind: "lab";
        key: string;
        rowNum: number;
        billTitle: string;
        billId: string;
        item: LabRequestItemDetailRow;
        unitPrice: number;
      };

  const unifiedVisitChargeRows = useMemo((): UnifiedVisitChargeRow[] => {
    const rows: UnifiedVisitChargeRow[] = [];
    let n = 0;
    for (const sale of feeSales) {
      const billTitle = `Sale · ${formatDateMMDDYYYY(sale.created_at)} · ${(sale.status ?? "—").toString()}`;
      const lines = feeItemsBySale.get(sale.id) ?? [];
      for (const line of lines) {
        n += 1;
        rows.push({
          kind: "fee",
          key: `fee-${line.id}`,
          rowNum: n,
          billTitle,
          billId: sale.id,
          line,
        });
      }
    }
    for (const req of openLabRequests) {
      const billTitle = `Lab order · ${formatDateMMDDYYYY(req.request_date)} ${formatLabTime(req.request_time)} · ${req.priority ?? "—"}`;
      const items = labItemsByRequestId.get(req.id) ?? [];
      for (const item of items) {
        n += 1;
        rows.push({
          kind: "lab",
          key: `lab-${item.id}`,
          rowNum: n,
          billTitle,
          billId: req.id,
          item,
          unitPrice: labUnitPriceByTestId.get(item.lab_test_id) ?? 0,
        });
      }
    }
    return rows;
  }, [feeSales, feeItemsBySale, openLabRequests, labItemsByRequestId, labUnitPriceByTestId]);

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

  const feeTotalDue = useMemo(() => {
    return feeSales.reduce((s, row) => s + moneyNum(row.total_amount), 0);
  }, [feeSales]);

  const totalDue = useMemo(() => {
    return feeTotalDue + labTotalDue;
  }, [feeTotalDue, labTotalDue]);

  const anyUnpaid = feeSales.length > 0 || openLabRequests.length > 0;

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
      const feeSaleSubtotals = feeSales.map((s) => ({ id: s.id, subtotal: moneyNum(s.subtotal) }));

      // Create lab sales (one per lab request) + items
      const allLabTestIds = [...new Set(labItemRows.map((r) => r.lab_test_id).filter(Boolean))];
      const priceRes = await fetchLabTestUnitPricesByIds(allLabTestIds);
      if (priceRes.error) throw new Error(priceRes.error);

      const baseOr = args.orNumber.trim();
      const nLabs = openLabRequests.length;
      const hasPhysicianFees = feeSales.length > 0;

      const labSubtotals = openLabRequests.map((req) => {
        const items = labItemsByRequestId.get(req.id) ?? [];
        let subtotal = 0;
        for (const it of items) {
          subtotal += priceRes.unitPriceById.get(it.lab_test_id) ?? 0;
        }
        return { labRequestId: req.id, subtotal };
      });

      const grandSubtotal =
        feeSaleSubtotals.reduce((s, r) => s + r.subtotal, 0) + labSubtotals.reduce((s, r) => s + r.subtotal, 0);

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
        [...feeSaleSubtotals.map((s) => s.subtotal), ...labSubtotals.map((s) => s.subtotal)],
        totalDiscount,
      );
      const feeDiscounts = combinedDiscounts.slice(0, feeSaleSubtotals.length);
      const labDiscounts = combinedDiscounts.slice(feeSaleSubtotals.length);

      // Update physician fee sales with allocated discounts
      const markRes2 = await markPhysicianFeeSalesPaid({
        sales: feeSaleSubtotals.map((s, idx) => ({ ...s, discountAmount: feeDiscounts[idx] ?? 0 })),
        orNumber: args.orNumber,
        paymentMethodId: args.paymentMethod.id,
        amountTendered: args.amountTendered,
        changeAmount: args.changeAmount,
        discountTypeId: args.discountMode === "pct" ? args.discountType?.id ?? null : null,
      });
      if (markRes2.error) throw new Error(markRes2.error);

      for (let i = 0; i < openLabRequests.length; i++) {
        const req = openLabRequests[i];
        const items = labItemsByRequestId.get(req.id) ?? [];
        const payloadItems = items.map((it) => ({
          lab_test_id: it.lab_test_id,
          quantity: 1,
          unit_price: priceRes.unitPriceById.get(it.lab_test_id) ?? 0,
          discount: 0,
          notes: it.notes,
        }));
        const labOrNumber = nLabs === 1 ? baseOr : `${baseOr}-L${i + 1}`;
        const tenderedOnLab =
          hasPhysicianFees ? null : i === 0 ? args.amountTendered : null;
        const changeOnLab = hasPhysicianFees ? null : i === 0 ? args.changeAmount : null;

        const saleRes = await createLabSaleWithItems({
          labRequestId: req.id,
          patientId: patientIdNum(patient.patientId),
          orNumber: labOrNumber,
          paymentMethodId: args.paymentMethod.id,
          amountTendered: tenderedOnLab,
          changeAmount: changeOnLab,
          discountTypeId: args.discountMode === "pct" ? args.discountType?.id ?? null : null,
          discountAmount: labDiscounts[i] ?? 0,
          items: payloadItems,
        });
        if (saleRes.error) throw new Error(saleRes.error);
      }

      let labQueueLine = "";
      if (openLabRequests.length > 0) {
        const pid = patientIdNum(patient.patientId);
        if (pid == null) throw new Error("Patient id missing for laboratory queue ticket.");
        const queueRes = await fetch("/api/cashier/lab-queue-ticket", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            encounterTransId: encounterId,
            labRequestIds: openLabRequests.map((r) => r.id),
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
          counterCode?: string;
        };
        if (!queueRes.ok || qj.error) throw new Error(qj.error ?? "Could not create laboratory queue ticket.");
        const qd = (qj.queueDisplay ?? "").trim();
        const qtid = (qj.queueTicketId ?? "").trim();
        setLabReceiptTicketId(qtid || null);
        setLabReceiptQueueDisplay(qd);
        setLabReceiptCounterLabel((qj.counterCode ?? "LAB").trim());
        labQueueLine = qd ? ` Laboratory queue: ${qd}.` : " Laboratory queue ticket issued.";
        if (qd && qtid) {
          await openReceptionQueueReceiptPrint({
            patientName: (patient.name ?? "").trim() || "Patient",
            destinationLabel: (qj.counterCode ?? "Laboratory").trim(),
            queueDisplay: qd,
            transId: encounterId,
            queueTicketId: qtid,
          });
        }
      }

      setPayOpen(false);
      const paymentLines: { label: string; amount: number }[] = [];
      if (feeTotalDue > 0) paymentLines.push({ label: "Consultation charges", amount: feeTotalDue });
      if (openLabRequests.length > 0 && labTotalDue > 0) {
        paymentLines.push({ label: "Laboratory orders", amount: labTotalDue });
      }

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
        subtotal: grandSubtotal,
        discountAmount: totalDiscount,
        totalDue: Math.max(0, grandSubtotal - totalDiscount),
        amountTendered: args.amountTendered,
        changeAmount: args.changeAmount,
      });
      setPaySuccess(`Payment saved.${labQueueLine}`);
      await reloadAll();
      router.replace("/cashier?tab=visit");
    } catch (e) {
      setPayError(e instanceof Error ? e.message : "Could not save payment.");
    } finally {
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
          color="secondary"
          disabled={
            loading || !!loadError || !anyUnpaid || paymentMethods.length === 0 || labTotalLoading
          }
          onClick={() => {
            setPayError("");
            setPaySuccess("");
            setLabReceiptTicketId(null);
            setLabReceiptQueueDisplay("");
            setLabReceiptCounterLabel("");
            setPayModalKey((k) => k + 1);
            setPayOpen(true);
            if (openLabRequests.length > 0 && queuePriorities.length > 0) {
              setLabQueuePrioritySel(queuePriorities[0]!.id);
            }
          }}
          sx={{ textTransform: "none" }}
        >
          Pay
        </Button>
      </Box>

      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Visit ID:{" "}
        <Box component="span" sx={{ fontFamily: "monospace" }}>
          {encounterId}
        </Box>
      </Typography>

      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
          <CircularProgress />
        </Box>
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

      {labReceiptTicketId ? (
        <Alert
          severity="info"
          sx={{ mb: 2 }}
          onClose={() => {
            setLabReceiptTicketId(null);
            setLabReceiptQueueDisplay("");
            setLabReceiptCounterLabel("");
          }}
          action={
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, alignItems: "center", py: 0.5 }}>
              <Button
                size="small"
                variant="outlined"
                color="inherit"
                sx={{ textTransform: "none" }}
                onClick={() =>
                  void openReceptionQueueReceiptPrint({
                    patientName: (patient?.name ?? "").trim() || "Patient",
                    destinationLabel: labReceiptCounterLabel || "Laboratory",
                    queueDisplay: labReceiptQueueDisplay,
                    transId: encounterId,
                    queueTicketId: labReceiptTicketId,
                  })
                }
              >
                Print slip
              </Button>
              <Button
                size="small"
                variant="outlined"
                color="inherit"
                sx={{ textTransform: "none" }}
                onClick={() => void openCashierQueueReceiptReprintByTicketId(labReceiptTicketId)}
              >
                Reprint
              </Button>
            </Box>
          }
        >
          Laboratory queue <strong>{labReceiptQueueDisplay || "—"}</strong>. Use Reprint if the slip was lost (reloads
          from the server).
        </Alert>
      ) : null}

      {!loading && patient ? (
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
        title="Pay — visit checkout"
        paymentMethods={paymentMethods}
        discountTypes={discountTypes}
        busy={payBusy}
        errorText={payError}
        onGenerateOrNumber={async () => {
          const res = await generateNextDailyOrNumber();
          if (res.error || !res.orNumber) throw new Error(res.error ?? "Could not generate OR number.");
          return res.orNumber;
        }}
        onClose={() => setPayOpen(false)}
        totalDue={totalDue}
        summaryRows={[
          { label: "Consultation charges", amount: feeTotalDue },
          ...(openLabRequests.length > 0 ? [{ label: "Laboratory orders", amount: labTotalDue }] : []),
        ]}
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

      {!loading && !loadError ? (
        <Card sx={{ mb: 2 }}>
          <CardContent>
            <ConsultationSectionTitle>Visit charges — unpaid</ConsultationSectionTitle>
            <Typography variant="body2" color="text.primary" sx={{ ...consultBodyTypoSx, mb: 2, display: "block" }}>
              Consultation bill lines and laboratory test lines for this visit. Each row is one chargeable line with its
              own reference id.
            </Typography>

            {unifiedVisitChargeRows.length === 0 ? (
              <Typography variant="body2" sx={consultBodyTypoSx}>
                No unpaid consultation charges or laboratory orders for this visit.
              </Typography>
            ) : (
              <>
                <TableContainer>
                  <Table size="small" sx={consultTableSx}>
                    <TableHead>
                      <TableRow sx={consultTableHeadRowSx}>
                        <TableCell sx={consultTableHeadCellSx}>#</TableCell>
                        <TableCell sx={consultTableHeadCellSx}>Bill / order</TableCell>
                        <TableCell sx={consultTableHeadCellSx}>Category</TableCell>
                        <TableCell sx={consultTableHeadCellSx}>Item</TableCell>
                        <TableCell sx={consultTableHeadCellSx}>Line reference</TableCell>
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
                      {unifiedVisitChargeRows.map((row) => (
                        <TableRow key={row.key}>
                          <TableCell sx={consultTableBodyCellSx}>{row.rowNum}</TableCell>
                          <TableCell sx={consultTableBodyCellSx}>
                            <Typography variant="body2" sx={{ fontWeight: 600 }}>
                              {row.billTitle}
                            </Typography>
                            <Typography
                              variant="caption"
                              color="text.secondary"
                              sx={{ display: "block", fontFamily: "monospace", wordBreak: "break-all", mt: 0.25 }}
                            >
                              {row.billId}
                            </Typography>
                          </TableCell>
                          <TableCell sx={consultTableBodyCellSx}>
                            {row.kind === "fee" ? "Consultation" : "Laboratory"}
                          </TableCell>
                          <TableCell sx={consultTableBodyCellSx}>
                            {row.kind === "fee" ? (
                              (row.line.service_name ?? "").trim() || `Service #${row.line.physician_service_id}`
                            ) : (
                              (row.item.test_name ?? "").trim() || `Test ${row.item.lab_test_id}`
                            )}
                          </TableCell>
                          <TableCell
                            sx={{
                              ...consultTableBodyCellSx,
                              fontFamily: "monospace",
                              fontSize: "0.75rem",
                              wordBreak: "break-all",
                            }}
                          >
                            {row.kind === "fee" ? row.line.id : row.item.id}
                          </TableCell>
                          {row.kind === "fee" ? (
                            <>
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
                            </>
                          ) : (
                            <>
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
                            </>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>

                <Box
                  sx={{
                    display: "flex",
                    flexDirection: { xs: "column", sm: "row" },
                    justifyContent: "flex-end",
                    alignItems: { xs: "stretch", sm: "baseline" },
                    gap: { xs: 1, sm: 3 },
                    mt: 2,
                  }}
                >
                  {feeSales.length > 0 ? (
                    <Typography variant="body2" sx={consultBodyTypoSx}>
                      Consultation bill totals:{" "}
                      <Box component="span" sx={{ fontWeight: 700 }}>
                        {formatMoney(feeTotalDue)}
                      </Box>
                      {feeLineItemsSum !== feeTotalDue ? (
                        <Box component="span" sx={{ display: "block", color: "text.secondary", fontSize: "0.8rem", mt: 0.25 }}>
                          (Sum of line items: {formatMoney(feeLineItemsSum)})
                        </Box>
                      ) : null}
                    </Typography>
                  ) : null}
                  {openLabRequests.length > 0 ? (
                    <Typography variant="body2" sx={consultBodyTypoSx}>
                      Laboratory (listed lines):{" "}
                      <Box component="span" sx={{ fontWeight: 700 }}>
                        {labTotalLoading ? "…" : formatMoney(labTotalDue)}
                      </Box>
                    </Typography>
                  ) : null}
                  <Typography variant="body2" sx={{ ...consultBodyTypoSx, fontWeight: 800 }}>
                    Visit total due:{" "}
                    <Box component="span" sx={{ fontWeight: 800 }}>
                      {labTotalLoading && openLabRequests.length > 0 ? "…" : formatMoney(totalDue)}
                    </Box>
                  </Typography>
                </Box>
              </>
            )}
          </CardContent>
        </Card>
      ) : null}
    </Box>
  );
}
