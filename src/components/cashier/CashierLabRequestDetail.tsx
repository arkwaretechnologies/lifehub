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
import { fetchPatientListRowById } from "@/lib/consultationData";
import { formatDateMMDDYYYY } from "@/lib/dateDisplay";
import {
  fetchLabRequestHeaderById,
  fetchLabRequestItemDetailsForRequestIds,
  type LabRequestHeaderRow,
  type LabRequestItemDetailRow,
} from "@/lib/labRequests";
import { PaymentModal } from "@/components/cashier/PaymentModal";
import { fetchActivePaymentMethods, type PaymentMethodRow } from "@/lib/paymentMethods";
import { fetchLabTestUnitPricesByIds } from "@/lib/labTests";
import { createLabSaleWithItems, generateNextDailyOrNumber } from "@/lib/cashierPayments";
import { fetchActiveDiscountTypes, type DiscountTypeRow } from "@/lib/discountTypes";

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

export default function CashierLabRequestDetail() {
  const params = useParams();
  const router = useRouter();
  const labRequestId = String(params.labRequestId ?? "").trim();

  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);
  const [header, setHeader] = useState<LabRequestHeaderRow | null>(null);
  const [patientName, setPatientName] = useState<string | null>(null);
  const [patientIdStr, setPatientIdStr] = useState<string | null>(null);
  const [items, setItems] = useState<LabRequestItemDetailRow[]>([]);

  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodRow[]>([]);
  const [discountTypes, setDiscountTypes] = useState<DiscountTypeRow[]>([]);
  const [payOpen, setPayOpen] = useState(false);
  const [payBusy, setPayBusy] = useState(false);
  const [payError, setPayError] = useState("");
  const [paySuccess, setPaySuccess] = useState("");
  const [labTotalDue, setLabTotalDue] = useState<number>(0);
  const [labTotalLoading, setLabTotalLoading] = useState(false);
  const [payModalKey, setPayModalKey] = useState(0);

  const reloadAll = useCallback(async () => {
    setLoadError("");
    setLoading(true);
    setHeader(null);
    setPatientName(null);
    setPatientIdStr(null);
    setItems([]);

    if (!isUuid(labRequestId)) {
      setLoadError("Invalid order reference.");
      setLoading(false);
      return;
    }

    const headRes = await fetchLabRequestHeaderById(labRequestId);
    if (headRes.error) {
      setLoadError(headRes.error);
      setLoading(false);
      return;
    }
    if (!headRes.row) {
      setLoadError("Lab order not found.");
      setLoading(false);
      return;
    }

    if (headRes.row.encounter_id != null && String(headRes.row.encounter_id).trim() !== "") {
      setLoadError(
        "This laboratory order is linked to a visit. Use Visit checkout on the Cashier page and open that visit.",
      );
      setLoading(false);
      return;
    }

    setHeader(headRes.row);
    const pid = headRes.row.patient_id;
    if (pid != null && Number.isFinite(pid) && pid > 0) {
      const patRes = await fetchPatientListRowById(pid);
      if (patRes.error) {
        setHeader(null);
        setLoadError(patRes.error);
        setLoading(false);
        return;
      }
      setPatientIdStr(String(pid));
      setPatientName(patRes.row?.name?.trim() ? patRes.row.name.trim() : null);
    }

    const itemsRes = await fetchLabRequestItemDetailsForRequestIds([labRequestId]);
    setLoading(false);
    if (itemsRes.error) {
      setLoadError(itemsRes.error);
      return;
    }
    setItems(itemsRes.items);
  }, [labRequestId]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      await Promise.resolve();
      if (cancelled) return;
      await reloadAll();
      const methodsRes = await fetchActivePaymentMethods();
      if (!cancelled) {
        setPaymentMethods(methodsRes.error ? [] : methodsRes.methods);
      }

      const discRes = await fetchActiveDiscountTypes();
      if (!cancelled) {
        setDiscountTypes(discRes.error ? [] : discRes.discounts);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [labRequestId, reloadAll]);

  const req = header;

  const anyUnpaid = useMemo(() => {
    return !!req && items.length > 0;
  }, [items.length, req]);

  const totalDue = useMemo(() => {
    return labTotalDue;
  }, [labTotalDue]);

  async function handleConfirmPay(args: {
    paymentMethod: PaymentMethodRow;
    orNumber: string;
    discountType: DiscountTypeRow | null;
    discountMode: "pct" | "amount";
    discountPct: number;
    discountAmount: number;
    amountTendered: number | null;
    changeAmount: number | null;
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
      const priceRes = await fetchLabTestUnitPricesByIds(allLabTestIds);
      if (priceRes.error) throw new Error(priceRes.error);

      const payloadItems = items.map((it) => ({
        lab_test_id: it.lab_test_id,
        quantity: 1,
        unit_price: priceRes.unitPriceById.get(it.lab_test_id) ?? 0,
        discount: 0,
        notes: it.notes,
      }));

      let subtotal = 0;
      for (const it of payloadItems) subtotal += it.quantity * it.unit_price - it.discount;
      const totalDiscount =
        args.discountMode === "amount"
          ? Math.min(Math.max(0, args.discountAmount), subtotal)
          : Math.min(Math.max(0, (subtotal * Math.max(0, args.discountPct)) / 100), subtotal);

      const res = await createLabSaleWithItems({
        labRequestId,
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

      setPayOpen(false);
      setPaySuccess("Payment saved.");
      await reloadAll();
      router.replace("/cashier?tab=walkin");
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
          href="/cashier?tab=walkin"
          variant="outlined"
          size="small"
          startIcon={<ArrowBackIcon />}
          sx={{ textTransform: "none" }}
        >
          Back to cashier
        </Button>
        <Typography variant="h5">Payment — walk-in laboratory</Typography>
        <Box sx={{ flex: 1 }} />
        <Button
          variant="contained"
          color="secondary"
          disabled={loading || !!loadError || !anyUnpaid || paymentMethods.length === 0 || labTotalLoading}
          onClick={() => {
            setPayError("");
            setPaySuccess("");
            setPayModalKey((k) => k + 1);
            setPayOpen(true);
            if (items.length === 0) {
              setLabTotalDue(0);
              return;
            }
            setLabTotalLoading(true);
            const allLabTestIds = [...new Set(items.map((r) => r.lab_test_id).filter(Boolean))];
            void fetchLabTestUnitPricesByIds(allLabTestIds).then((res) => {
              setLabTotalLoading(false);
              if (res.error) {
                setPayError(res.error);
                setLabTotalDue(0);
                return;
              }
              let sum = 0;
              for (const row of items) sum += res.unitPriceById.get(row.lab_test_id) ?? 0;
              setLabTotalDue(sum);
            });
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

      {paySuccess ? (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setPaySuccess("")}>
          {paySuccess}
        </Alert>
      ) : null}

      <PaymentModal
        key={payModalKey}
        open={payOpen}
        title="Pay — laboratory order"
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
        summaryRows={[{ label: "Laboratory tests", amount: labTotalDue }]}
        onConfirm={handleConfirmPay}
      />

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
                Tests on this order that still need to be paid at the register.
              </Typography>

              <Typography variant="subtitle2" sx={{ mb: 0.5, fontWeight: 700 }}>
                Lab order · {formatDateMMDDYYYY(req.request_date)} {formatLabTime(req.request_time)} ·{" "}
                {req.priority ?? "—"}
              </Typography>
              {req.remarks?.trim() ? (
                <Typography variant="body2" sx={{ ...consultBodyTypoSx, mb: 1 }}>
                  {req.remarks}
                </Typography>
              ) : null}

              <TableContainer>
                <Table size="small" sx={consultTableSx}>
                  <TableHead>
                    <TableRow sx={consultTableHeadRowSx}>
                      <TableCell sx={consultTableHeadCellSx}>Test</TableCell>
                      <TableCell sx={consultTableHeadCellSx}>Priority</TableCell>
                      <TableCell sx={consultTableHeadCellSx}>Notes</TableCell>
                      <TableCell sx={consultTableHeadCellSx}>Line reference</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {items.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} sx={consultTableBodyCellSx}>
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
                          <TableCell
                            sx={{
                              ...consultTableBodyCellSx,
                              fontFamily: "monospace",
                              fontSize: "0.75rem",
                              wordBreak: "break-all",
                            }}
                          >
                            {it.id}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </CardContent>
          </Card>
        </>
      ) : null}
    </Box>
  );
}
