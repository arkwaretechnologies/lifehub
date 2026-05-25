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
import { ConsultationSectionTitle } from "@/components/consultation/ConsultationSectionTitle";
import {
  consultBodyTypoSx,
  consultTableBodyCellSx,
  consultTableHeadCellSx,
  consultTableHeadRowSx,
  consultTableSx,
} from "@/components/consultation/consultListTableStyles";
import { fetchEncounterSummaryByTransId, fetchPatientListRowById } from "@/lib/consultationData";
import { authenticatedFetch } from "@/lib/authenticatedFetch";
import { formatDateMMDDYYYY } from "@/lib/dateDisplay";
import {
  fetchLabRequestHeaderById,
  fetchLabRequestItemDetailsForRequestIds,
  hasUnpricedNonPackageLabLines,
  labRequestUsesPackageBundling,
  labLineCheckoutUnitFee,
  labRequestCheckoutSubtotal,
  labRequestPackagePriceTotal,
  labRequestPackagesDisplayNames,
  type LabRequestHeaderRow,
  type LabRequestItemDetailRow,
  type LabRequestPackagePricing,
} from "@/lib/labRequests";
import { PaymentModal } from "@/components/cashier/PaymentModal";
import { fetchActivePaymentMethods, type PaymentMethodRow } from "@/lib/paymentMethods";
import { fetchLabTestCheckoutPricesByIds } from "@/lib/labTests";
import {
  createLabSaleWithItems,
  generateNextDailyOrNumber,
  type LabSaleItemInsertRow,
} from "@/lib/cashierPayments";
import {
  fetchImagingRequestItemsForRequestIdsClient,
  fetchImagingRequestsWithoutSaleForEncounters,
  type EncounterImagingRequestSummary,
  type ImagingRequestItemRow,
} from "@/lib/imagingRequests";
import { fetchActiveDiscountTypes, type DiscountTypeRow } from "@/lib/discountTypes";
import { fetchQueuePriorities, type QueuePriorityRow } from "@/lib/queueReception";
import { openCashierAcknowledgementReceiptPrint } from "@/lib/cashierAcknowledgementReceiptPrint";
import { isCashPaymentMethod } from "@/lib/paymentMethods";
import { scheduleCashierHomeNavigation } from "@/lib/thermalPrintIframe";
import {
  openReceptionQueueReceiptPrint,
  storeCashierLabQueueReprintOffer,
} from "@/lib/receptionQueueReceiptPrint";
import { CONSULTATION_BRANDING } from "@/components/consultation/consultationTypes";

function isUuid(s: string): boolean {
  const t = s.trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(t);
}

function formatLabTime(value: string | null | undefined): string {
  if (value == null || String(value).trim() === "") return "—";
  const s = String(value);
  if (s.length >= 5 && s[4] === ":") return s.slice(0, 5);
  const m = s.match(/(\d{1,2}:\d{2})/);
  return m?.[1] ?? "—";
}

function formatMoneyDisplay(v: number): string {
  return v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function receptionQueueNoLine(queueNoTrimmed: string): string {
  return queueNoTrimmed ? `Queue No.: ${queueNoTrimmed}` : "No queue no assigned";
}

export default function CashierLabRequestDetail() {
  const params = useParams();
  const router = useRouter();
  const labRequestId = String(params.labRequestId ?? "").trim();

  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);
  const [header, setHeader] = useState<LabRequestHeaderRow | null>(null);
  const [patientName, setPatientName] = useState<string | null>(null);
  const [patientAddress, setPatientAddress] = useState<string | null>(null);
  const [patientIdStr, setPatientIdStr] = useState<string | null>(null);
  const [patientContactNo, setPatientContactNo] = useState<string | null>(null);
  const [items, setItems] = useState<LabRequestItemDetailRow[]>([]);
  const [openImagingRequests, setOpenImagingRequests] = useState<EncounterImagingRequestSummary[]>([]);
  const [imagingItemRows, setImagingItemRows] = useState<ImagingRequestItemRow[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodRow[]>([]);
  const [discountTypes, setDiscountTypes] = useState<DiscountTypeRow[]>([]);
  const [payOpen, setPayOpen] = useState(false);
  const [payBusy, setPayBusy] = useState(false);
  const [payError, setPayError] = useState("");
  const [paySuccess, setPaySuccess] = useState("");
  const [labUnitPriceByTestId, setLabUnitPriceByTestId] = useState<Map<string, number>>(() => new Map());
  const [labTotalLoading, setLabTotalLoading] = useState(false);
  const [labPriceError, setLabPriceError] = useState("");
  const [payModalKey, setPayModalKey] = useState(0);
  const [queuePriorities, setQueuePriorities] = useState<QueuePriorityRow[]>([]);
  const [labQueuePriorityBanner, setLabQueuePriorityBanner] = useState<{
    severity: "error" | "warning";
    message: string;
  } | null>(null);
  const [labQueuePrioritySel, setLabQueuePrioritySel] = useState<number | "">("");
  /** After-pay lab queue label; queue slip prints here when visit had no reception queue no. */
  const [labReceiptQueueDisplay, setLabReceiptQueueDisplay] = useState("");
  const [encounterTransId, setEncounterTransId] = useState("");

  const reloadAll = useCallback(async (): Promise<{ receptionQueueNo: string }> => {
    setLoadError("");
    setLabQueuePriorityBanner(null);
    setLoading(true);
    setHeader(null);
    setPatientName(null);
    setPatientAddress(null);
    setPatientIdStr(null);
    setPatientContactNo(null);
    setItems([]);
    setOpenImagingRequests([]);
    setImagingItemRows([]);

    if (!isUuid(labRequestId)) {
      setLoadError("Invalid order reference.");
      setLoading(false);
      return { receptionQueueNo: "" };
    }

    const headRes = await fetchLabRequestHeaderById(labRequestId);
    if (headRes.error) {
      setLoadError(headRes.error);
      setLoading(false);
      return { receptionQueueNo: "" };
    }
    if (!headRes.row) {
      setLoadError("Lab order not found.");
      setLoading(false);
      return { receptionQueueNo: "" };
    }

    setHeader(headRes.row);
    const encRaw = headRes.row.encounter_id != null ? String(headRes.row.encounter_id).trim() : "";
    const encUuid = isUuid(encRaw) ? encRaw : "";
    setEncounterTransId(encUuid);
    const pid = headRes.row.patient_id;
    if (pid != null && Number.isFinite(pid) && pid > 0) {
      const patRes = await fetchPatientListRowById(pid);
      if (patRes.error) {
        setHeader(null);
        setLoadError(patRes.error);
        setLoading(false);
        return { receptionQueueNo: "" };
      }
      setPatientIdStr(String(pid));
      setPatientName(patRes.row?.name?.trim() ? patRes.row.name.trim() : null);
      const addr = patRes.row?.address?.trim();
      setPatientAddress(addr ? addr : null);
      const cn = patRes.row?.contact_no?.trim();
      setPatientContactNo(cn ? cn : null);
    }

    const itemsRes = await fetchLabRequestItemDetailsForRequestIds([labRequestId]);
    if (itemsRes.error) {
      setLoading(false);
      setLoadError(itemsRes.error);
      return { receptionQueueNo: "" };
    }
    setItems(itemsRes.items);

    if (encUuid) {
      const imgRes = await fetchImagingRequestsWithoutSaleForEncounters([encUuid]);
      if (imgRes.error) {
        setLoading(false);
        setLoadError(imgRes.error);
        return { receptionQueueNo: "" };
      }
      const imgList = imgRes.byEncounter.get(encUuid) ?? [];
      setOpenImagingRequests(imgList);
      const imgIds = imgList.map((r) => r.id);
      const imgItemsRes = await fetchImagingRequestItemsForRequestIdsClient(imgIds);
      if (imgItemsRes.error) {
        setLoading(false);
        setLoadError(imgItemsRes.error);
        return { receptionQueueNo: "" };
      }
      setImagingItemRows(imgItemsRes.rows);
    }

    setLoading(false);

    let visitQn = "";
    if (encUuid) {
      const encSum = await fetchEncounterSummaryByTransId(encUuid);
      visitQn = (encSum.encounter?.queueNo ?? "").trim();
    }
    return { receptionQueueNo: visitQn };
  }, [labRequestId]);

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
            message: `Could not load queue priorities (${pq.error}). Pay is still allowed for visit-linked orders; the server will try a default priority when issuing the laboratory queue ticket.\n\n${receptionQueueNoLine(visitQueueNo)}`,
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
  }, [labRequestId, reloadAll]);

  const req = header;

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
    return imagingItemRows.reduce((sum, it) => sum + Number(it.unit_price ?? 0), 0);
  }, [imagingItemRows]);

  const pkgPricing: LabRequestPackagePricing = useMemo(
    () =>
      req
        ? { lab_packages: req.lab_packages, package_covered_test_ids: req.package_covered_test_ids }
        : { lab_packages: [], package_covered_test_ids: [] },
    [req],
  );

  const isPkgBundling = useMemo(() => (req ? labRequestUsesPackageBundling(req) : false), [req, pkgPricing]);

  const uncoveredItems = useMemo(() => {
    if (!isPkgBundling) return items;
    const cov = new Set(req?.package_covered_test_ids ?? []);
    return items.filter((it) => !cov.has(it.lab_test_id));
  }, [isPkgBundling, items, req?.package_covered_test_ids]);

  useEffect(() => {
    const ids = [...new Set(items.map((r) => r.lab_test_id).filter(Boolean))];
    if (ids.length === 0 && !(req && isPkgBundling)) {
      setLabUnitPriceByTestId(new Map());
      setLabPriceError("");
      setLabTotalLoading(false);
      return;
    }
    setLabTotalLoading(true);
    setLabPriceError("");
    let cancelled = false;
    void fetchLabTestCheckoutPricesByIds(ids).then((res) => {
      if (cancelled) return;
      setLabTotalLoading(false);
      if (res.error) {
        setLabUnitPriceByTestId(new Map());
        const byReq = new Map([[labRequestId, items]]);
        if (req && hasUnpricedNonPackageLabLines([req], byReq, res.unitPriceById)) {
          setLabPriceError(res.error);
        }
        return;
      }
      setLabUnitPriceByTestId(res.unitPriceById);
    });
    return () => {
      cancelled = true;
    };
  }, [items, req, isPkgBundling, labRequestId]);

  const labTotalDue = useMemo(() => {
    if (!req) return 0;
    if (items.length === 0 && !isPkgBundling) return 0;
    return labRequestCheckoutSubtotal(pkgPricing, items, labUnitPriceByTestId);
  }, [req, items, isPkgBundling, pkgPricing, labUnitPriceByTestId]);

  const labPackageDue = useMemo(() => labRequestPackagePriceTotal(pkgPricing), [pkgPricing]);

  const labIndividualDue = useMemo(() => {
    if (!isPkgBundling) return 0;
    let s = 0;
    for (const it of uncoveredItems) {
      s += labUnitPriceByTestId.get(it.lab_test_id) ?? 0;
    }
    return s;
  }, [isPkgBundling, uncoveredItems, labUnitPriceByTestId]);

  const labPaySummaryRows = useMemo(() => {
    const rows: { label: string; amount: number }[] = [];
    if (!req) return rows;
    const hasPkg = isPkgBundling && req.lab_packages.length > 0;
    const hasExtra = isPkgBundling && uncoveredItems.length > 0;
    if (hasPkg) {
      rows.push({
        label: req.lab_packages.length > 1 ? "Laboratory packages" : "Laboratory package",
        amount: labPackageDue,
      });
    }
    if (hasExtra) {
      rows.push({
        label: uncoveredItems.length > 1 ? "Additional laboratory tests" : "Additional laboratory test",
        amount: labIndividualDue,
      });
    }
    if (!isPkgBundling && labTotalDue > 0) {
      rows.push({ label: "Laboratory tests", amount: labTotalDue });
    }
    if (imagingTotalDue > 0) {
      rows.push({ label: "Imaging studies", amount: imagingTotalDue });
    }
    return rows;
  }, [req, isPkgBundling, uncoveredItems.length, labPackageDue, labIndividualDue, labTotalDue, imagingTotalDue]);

  const anyUnpaid = useMemo(() => {
    const hasLab = !!req && (items.length > 0 || labRequestUsesPackageBundling(req));
    const hasImg = openImagingRequests.length > 0 && imagingItemRows.length > 0;
    return hasLab || hasImg;
  }, [items.length, req, openImagingRequests.length, imagingItemRows.length]);

  const totalDue = useMemo(() => {
    return labTotalDue + imagingTotalDue;
  }, [labTotalDue, imagingTotalDue]);

  const hasImagingCharges = openImagingRequests.length > 0 && imagingItemRows.length > 0;

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
    if (!req) {
      setPayError("Lab order not loaded.");
      return;
    }
    setPayError("");
    setPaySuccess("");
    setPayBusy(true);
    try {
      const allLabTestIds = [...new Set(items.map((r) => r.lab_test_id).filter(Boolean))];
      const priceRes = await fetchLabTestCheckoutPricesByIds(allLabTestIds);
      const linesByReq = new Map([[labRequestId, items]]);
      if (priceRes.error && hasUnpricedNonPackageLabLines(req ? [req] : [], linesByReq, priceRes.unitPriceById)) {
        throw new Error(priceRes.error);
      }

      const pkgReq: LabRequestPackagePricing = {
        lab_packages: req.lab_packages,
        package_covered_test_ids: req.package_covered_test_ids,
      };
      const payloadItems: LabSaleItemInsertRow[] = items.map((it) => ({
        lab_test_id: it.lab_test_id,
        quantity: 1,
        unit_price: labLineCheckoutUnitFee(pkgReq, items, it, priceRes.unitPriceById),
        discount: 0,
        notes: it.notes,
      }));

      const imagingSubtotal = imagingItemRows.reduce((s, it) => s + Number(it.unit_price ?? 0), 0);
      for (const imgReq of openImagingRequests) {
        for (const it of imagingItemsByRequestId.get(imgReq.id) ?? []) {
          payloadItems.push({
            imaging_catalog_id: it.imaging_catalog_id,
            quantity: 1,
            unit_price: Number(it.unit_price ?? 0),
            discount: 0,
            notes: it.study_name,
          });
        }
      }

      let labSubtotal = 0;
      for (const it of payloadItems) {
        if (it.lab_test_id) labSubtotal += it.quantity * it.unit_price - it.discount;
      }
      const subtotal = labSubtotal + imagingSubtotal;
      const totalDiscount =
        args.discountMode === "amount"
          ? Math.min(Math.max(0, args.discountAmount), subtotal)
          : Math.min(Math.max(0, (subtotal * Math.max(0, args.discountPct)) / 100), subtotal);

      const res = await createLabSaleWithItems({
        labRequestId,
        imagingRequestId: openImagingRequests[0]?.id ?? null,
        patientId: req.patient_id ?? null,
        orNumber: args.orNumber,
        paymentMethodId: args.paymentMethod.id,
        amountTendered: args.amountTendered,
        changeAmount: args.changeAmount,
        discountTypeId: args.discountMode === "pct" ? args.discountType?.id ?? null : null,
        discountAmount: totalDiscount,
        items: payloadItems,
      });
      if (res.error) throw new Error(res.error);

      let labQueueLine = "";
      let labQueueSlip:
        | { queueDisplay: string; queueTicketId: string | null; transId: string }
        | null = null;
      const encId = encounterTransId.trim();
      const pidStr = patientIdStr?.trim() ?? "";
      if (encId && pidStr && /^\d+$/.test(pidStr)) {
        const pid = Number.parseInt(pidStr, 10);
        const encSnap = await fetchEncounterSummaryByTransId(encId);
        const receptionQueueNoBeforePay = (encSnap.encounter?.queueNo ?? "").trim();
        const queueRes = await authenticatedFetch("/api/cashier/lab-queue-ticket", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            encounterTransId: encId,
            labRequestIds: [labRequestId],
            imagingRequestIds: openImagingRequests.map((r) => r.id),
            cashierPriorityId: args.labQueuePriorityId,
            patient: {
              id: pid,
              name: (patientName ?? "").trim() || "Patient",
              contact_no: patientContactNo,
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
        labQueueLine = qd
          ? ` Laboratory queue: ${qd}. Collect your laboratory slip at reception.`
          : " Laboratory queue assigned. Collect your laboratory slip at reception.";
        if (!receptionQueueNoBeforePay && qd) {
          labQueueSlip = { queueDisplay: qd, queueTicketId: tid || null, transId: encId };
        } else if (receptionQueueNoBeforePay && tid) {
          storeCashierLabQueueReprintOffer({
            ticketId: tid,
            queueDisplay: receptionQueueNoBeforePay,
          });
        }
      }

      const paymentLines: { label: string; amount: number }[] = items.map((it) => ({
        label: (it.test_name ?? "").trim() || `Test ${it.lab_test_id}`,
        amount: labLineCheckoutUnitFee(pkgReq, items, it, priceRes.unitPriceById),
      }));
      if (imagingSubtotal > 0) {
        paymentLines.push({ label: "Imaging studies", amount: imagingSubtotal });
      }

      await openCashierAcknowledgementReceiptPrint({
        facilityName: "LifeHub Medical & Diagnostic Center",
        facilityAddressLines: ["Poblacion, Imelda, Zamboanga Sibugay"],
        facilityContactLine: `Contact: ${CONSULTATION_BRANDING.tel}`,
        facilityEmailLine: `Email: ${CONSULTATION_BRANDING.email}`,
        customerName: (patientName ?? "").trim() || "Customer",
        customerAddress: (patientAddress ?? "").trim() || "—",
        transId: encounterTransId.trim() || undefined,
        orNumber: args.orNumber,
        paymentMethodLabel:
          (args.paymentMethod.name ?? "").trim() || `Method #${args.paymentMethod.id}`,
        paymentLines,
        subtotal,
        discountAmount: totalDiscount,
        totalDue: Math.max(0, subtotal - totalDiscount),
        amountTendered: args.amountTendered,
        changeAmount: args.changeAmount,
        openCashDrawer: isCashPaymentMethod(args.paymentMethod),
      });
      if (labQueueSlip != null) {
        await openReceptionQueueReceiptPrint({
          patientName: (patientName ?? "").trim() || "Patient",
          destinationLabel: "Laboratory",
          queueDisplay: labQueueSlip.queueDisplay,
          transId: labQueueSlip.transId,
          queueTicketId: labQueueSlip.queueTicketId,
        });
      }
      setPayOpen(false);
      setPayBusy(false);
      setPaySuccess(`Payment saved.${labQueueLine}`);
      scheduleCashierHomeNavigation("/cashier?tab=walkin");
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
          href="/cashier?tab=walkin"
          variant="outlined"
          size="small"
          startIcon={<ArrowBackIcon />}
          sx={{ textTransform: "none" }}
        >
          Back to cashier
        </Button>
        <Typography variant="h5">
          {hasImagingCharges ? "Payment — walk-in laboratory & imaging" : "Payment — walk-in laboratory"}
        </Typography>
        <Box sx={{ flex: 1 }} />
        <Button
          variant="contained"
          color="secondary"
          disabled={
            loading ||
            !!loadError ||
            !!labPriceError ||
            !anyUnpaid ||
            paymentMethods.length === 0 ||
            labTotalLoading
          }
          onClick={() => {
            setPayError(labPriceError);
            setPaySuccess("");
            setLabReceiptQueueDisplay("");
            setPayModalKey((k) => k + 1);
            setPayOpen(true);
            if (encounterTransId && queuePriorities.length > 0) {
              setLabQueuePrioritySel(queuePriorities[0]!.id);
            }
          }}
          sx={{ textTransform: "none" }}
        >
          Pay
        </Button>
      </Box>

      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Order reference:{" "}
        <Box component="span" sx={{ fontFamily: "monospace" }}>
          {labRequestId}
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

      {labPriceError ? (
        <Alert severity="error" sx={{ mb: 2 }}>
          {labPriceError}
        </Alert>
      ) : null}

      {labQueuePriorityBanner && encounterTransId ? (
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

      <PaymentModal
        key={payModalKey}
        open={payOpen}
        title={hasImagingCharges ? "Pay — laboratory & imaging" : "Pay — laboratory order"}
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
        summaryRows={labPaySummaryRows}
        labQueuePrioritySelect={
          encounterTransId && queuePriorities.length > 0
            ? {
                priorities: queuePriorities,
                value: labQueuePrioritySel,
                onChange: setLabQueuePrioritySel,
              }
            : null
        }
        onConfirm={handleConfirmPay}
      />

      {!loading && !loadError && req && !encounterTransId ? (
        <Alert severity="info" sx={{ mb: 2 }}>
          This lab order is not linked to a visit. After reception registers the patient and links this order to a
          visit, payment here can issue a laboratory queue ticket.
        </Alert>
      ) : null}

      {!loading && !loadError && req ? (
        <>
          <Card sx={{ mb: 2 }}>
            <CardContent>
              <ConsultationSectionTitle>Patient</ConsultationSectionTitle>
              <Typography variant="body2" sx={{ ...consultBodyTypoSx, textTransform: "capitalize" }}>
                {patientName?.toLowerCase() ?? "—"}
                {patientIdStr ? ` · ID ${patientIdStr}` : ""}
              </Typography>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <ConsultationSectionTitle>Laboratory order — unpaid</ConsultationSectionTitle>
              <Typography variant="body2" color="text.primary" sx={{ ...consultBodyTypoSx, mb: 2, display: "block" }}>
                {isPkgBundling && uncoveredItems.length > 0
                  ? "Laboratory package and additional tests on this order — pay at the register."
                  : isPkgBundling
                    ? "Laboratory package on this order — pay at the register."
                    : "Tests on this order that still need to be paid at the register."}
              </Typography>

              <Typography variant="subtitle2" sx={{ mb: 0.5, fontWeight: 700 }}>
                Lab order · {formatDateMMDDYYYY(req.request_date)} {formatLabTime(req.request_time)} ·{" "}
                {req.priority ?? "—"}
              </Typography>
              {req.lab_packages.length > 0 && !isPkgBundling ? (
                <Typography variant="body2" sx={{ ...consultBodyTypoSx, mb: req.remarks?.trim() ? 0.5 : 1 }}>
                  Package{req.lab_packages.length > 1 ? "s" : ""}:{" "}
                  <Box component="span" sx={{ fontWeight: 700 }}>
                    {labRequestPackagesDisplayNames(req)}
                  </Box>
                </Typography>
              ) : null}
              {req.remarks?.trim() ? (
                <Typography variant="body2" sx={{ ...consultBodyTypoSx, mb: 1 }}>
                  {req.remarks}
                </Typography>
              ) : null}

              <TableContainer>
                <Table size="small" sx={consultTableSx}>
                  <TableHead>
                    <TableRow sx={consultTableHeadRowSx}>
                      <TableCell sx={consultTableHeadCellSx}>
                        {isPkgBundling ? "Package / test" : "Test"}
                      </TableCell>
                      <TableCell sx={consultTableHeadCellSx}>Priority</TableCell>
                      <TableCell sx={consultTableHeadCellSx}>Notes</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {isPkgBundling ? (
                      <>
                        {req.lab_packages.map((pkg) => (
                          <TableRow key={`walkin-lab-pkg-${req.id}-${pkg.id}`}>
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
                              <Typography
                                variant="caption"
                                color="primary.main"
                                sx={{ display: "block", mt: 0.5, fontWeight: 700 }}
                              >
                                Package price PHP{" "}
                                {formatMoneyDisplay(Number.isFinite(pkg.package_price) ? pkg.package_price : 0)}
                              </Typography>
                            </TableCell>
                            <TableCell sx={{ ...consultTableBodyCellSx, textTransform: "uppercase" }}>
                              {req.priority ?? "—"}
                            </TableCell>
                            <TableCell sx={consultTableBodyCellSx}>
                              {[
                                req.clinical_diagnosis?.trim(),
                                req.remarks?.trim(),
                              ]
                                .filter(Boolean)
                                .join(" · ") || "—"}
                            </TableCell>
                          </TableRow>
                        ))}
                        {uncoveredItems.map((it) => {
                          const unit = labUnitPriceByTestId.get(it.lab_test_id) ?? 0;
                          return (
                            <TableRow key={`walkin-lab-extra-${it.id}`}>
                              <TableCell sx={consultTableBodyCellSx}>
                                <Typography variant="body2" fontWeight={700}>
                                  {(it.test_name ?? "").trim() || `Test ${it.lab_test_id}`}
                                </Typography>
                                {unit > 0 ? (
                                  <Typography
                                    variant="caption"
                                    color="primary.main"
                                    sx={{ display: "block", mt: 0.5, fontWeight: 700 }}
                                  >
                                    PHP {formatMoneyDisplay(unit)}
                                  </Typography>
                                ) : labTotalLoading ? (
                                  <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
                                    Loading price…
                                  </Typography>
                                ) : null}
                              </TableCell>
                              <TableCell sx={{ ...consultTableBodyCellSx, textTransform: "uppercase" }}>
                                {it.priority ?? req.priority ?? "—"}
                              </TableCell>
                              <TableCell sx={consultTableBodyCellSx}>{it.notes?.trim() || "—"}</TableCell>
                            </TableRow>
                          );
                        })}
                        {req.lab_packages.length === 0 && uncoveredItems.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={3} sx={consultTableBodyCellSx}>
                              No line items.
                            </TableCell>
                          </TableRow>
                        ) : null}
                      </>
                    ) : items.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={3} sx={consultTableBodyCellSx}>
                          No line items.
                        </TableCell>
                      </TableRow>
                    ) : (
                      items.map((it) => (
                        <TableRow key={it.id}>
                          <TableCell sx={consultTableBodyCellSx}>
                            {(it.test_name ?? "").trim() || `Test ${it.lab_test_id}`}
                          </TableCell>
                          <TableCell sx={{ ...consultTableBodyCellSx, textTransform: "uppercase" }}>
                            {it.priority ?? "—"}
                          </TableCell>
                          <TableCell sx={consultTableBodyCellSx}>{it.notes?.trim() || "—"}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </CardContent>
          </Card>

          {hasImagingCharges ? (
            <Card sx={{ mt: 2 }}>
              <CardContent>
                <ConsultationSectionTitle>Imaging order — unpaid</ConsultationSectionTitle>
                <Typography variant="body2" color="text.primary" sx={{ ...consultBodyTypoSx, mb: 2, display: "block" }}>
                  Imaging studies on this visit that still need to be paid at the register.
                </Typography>
                {openImagingRequests.map((imgReq) => {
                  const imgItems = imagingItemsByRequestId.get(imgReq.id) ?? [];
                  return (
                    <Box key={imgReq.id} sx={{ mb: imgItems.length > 0 ? 2 : 0 }}>
                      <Typography variant="subtitle2" sx={{ mb: 0.5, fontWeight: 700 }}>
                        Imaging order · {formatDateMMDDYYYY(imgReq.request_date)}{" "}
                        {formatLabTime(imgReq.request_time)} · {imgReq.priority ?? "—"}
                      </Typography>
                      {imgReq.remarks?.trim() ? (
                        <Typography variant="body2" sx={{ ...consultBodyTypoSx, mb: 1 }}>
                          {imgReq.remarks}
                        </Typography>
                      ) : null}
                      <TableContainer>
                        <Table size="small" sx={consultTableSx}>
                          <TableHead>
                            <TableRow sx={consultTableHeadRowSx}>
                              <TableCell sx={consultTableHeadCellSx}>Study</TableCell>
                              <TableCell sx={consultTableHeadCellSx}>Price</TableCell>
                              <TableCell sx={consultTableHeadCellSx}>Notes</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {imgItems.length === 0 ? (
                              <TableRow>
                                <TableCell colSpan={3} sx={consultTableBodyCellSx}>
                                  No line items.
                                </TableCell>
                              </TableRow>
                            ) : (
                              imgItems.map((it) => (
                                <TableRow key={it.id}>
                                  <TableCell sx={consultTableBodyCellSx}>
                                    {(it.study_name ?? "").trim() || `Study ${it.imaging_catalog_id}`}
                                  </TableCell>
                                  <TableCell sx={consultTableBodyCellSx}>
                                    PHP {formatMoneyDisplay(Number(it.unit_price ?? 0))}
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
              </CardContent>
            </Card>
          ) : null}
        </>
      ) : null}
    </Box>
  );
}
