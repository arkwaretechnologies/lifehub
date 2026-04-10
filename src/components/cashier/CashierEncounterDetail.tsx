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
import { fetchEncounterWorkspacePatient } from "@/lib/consultationData";
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

  const reloadAll = useCallback(async () => {
    setPaySuccess("");
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
      return;
    }

    const pat = await fetchEncounterWorkspacePatient(encounterId);
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
      return;
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
      return;
    }
    setFeeItemsBySale(itemsRes.itemsBySaleId);

    if (openLabsRes.error) {
      setLoading(false);
      setLoadError(openLabsRes.error);
      setOpenLabRequests([]);
      setLabItemRows([]);
      return;
    }

    const openList = openLabsRes.byEncounter.get(encounterId) ?? [];
    setOpenLabRequests(openList);
    const reqIds = openList.map((r) => r.id);
    const labItemsRes = await fetchLabRequestItemDetailsForRequestIds(reqIds);
    setLoading(false);
    if (labItemsRes.error) {
      setLoadError(labItemsRes.error);
      setLabItemRows([]);
      return;
    }
    setLabItemRows(labItemsRes.items);
  }, [encounterId]);

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

      setPayOpen(false);
      setPaySuccess("Payment saved.");
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
            setPayModalKey((k) => k + 1);
            setPayOpen(true);
            // Pre-compute lab totals (if any) so the modal can show a real total due.
            if (openLabRequests.length === 0) {
              setLabTotalDue(0);
              return;
            }
            setLabTotalLoading(true);
            const allLabTestIds = [...new Set(labItemRows.map((r) => r.lab_test_id).filter(Boolean))];
            void fetchLabTestUnitPricesByIds(allLabTestIds).then((res) => {
              setLabTotalLoading(false);
              if (res.error) {
                setPayError(res.error);
                setLabTotalDue(0);
                return;
              }
              let sum = 0;
              for (const row of labItemRows) {
                sum += res.unitPriceById.get(row.lab_test_id) ?? 0;
              }
              setLabTotalDue(sum);
            });
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

      {paySuccess ? (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setPaySuccess("")}>
          {paySuccess}
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
        onConfirm={handleConfirmPay}
      />

      {!loading && !loadError ? (
        <>
          <Card sx={{ mb: 2 }}>
            <CardContent>
              <ConsultationSectionTitle>Consultation charges — unpaid</ConsultationSectionTitle>
              <Typography variant="body2" color="text.primary" sx={{ ...consultBodyTypoSx, mb: 2, display: "block" }}>
                Services and fees on each bill for this visit.
              </Typography>

              {feeSales.length === 0 ? (
                <Typography variant="body2" sx={consultBodyTypoSx}>
                  No unpaid consultation charges for this visit.
                </Typography>
              ) : (
                feeSales.map((sale) => {
                  const lines = feeItemsBySale.get(sale.id) ?? [];
                  const lineSum = lines.reduce((s, it) => s + moneyNum(it.total_fee), 0);
                  return (
                    <Box key={sale.id} sx={{ mb: 3, "&:last-child": { mb: 0 } }}>
                      <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 700 }}>
                        Sale · {formatDateMMDDYYYY(sale.created_at)}{" "}
                        <Box component="span" sx={{ fontWeight: 400, color: "text.secondary", ml: 1 }}>
                          status {(sale.status ?? "—").toString()}
                        </Box>
                      </Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 1, fontFamily: "monospace", fontSize: "0.75rem" }}>
                        {sale.id}
                      </Typography>
                      <TableContainer>
                        <Table size="small" sx={consultTableSx}>
                          <TableHead>
                            <TableRow sx={consultTableHeadRowSx}>
                              <TableCell sx={consultTableHeadCellSx}>#</TableCell>
                              <TableCell sx={consultTableHeadCellSx}>Service</TableCell>
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
                            {lines.length === 0 ? (
                              <TableRow>
                                <TableCell colSpan={7} sx={consultTableBodyCellSx}>
                                  No line items.
                                </TableCell>
                              </TableRow>
                            ) : (
                              lines.map((it) => (
                                <TableRow key={`${it.id}-${it.linenum}`}>
                                  <TableCell sx={consultTableBodyCellSx}>{it.linenum}</TableCell>
                                  <TableCell sx={consultTableBodyCellSx}>
                                    {(it.service_name ?? "").trim() || `Service #${it.physician_service_id}`}
                                  </TableCell>
                                  <TableCell align="right" sx={consultTableBodyCellSx}>
                                    {it.quantity}
                                  </TableCell>
                                  <TableCell align="right" sx={consultTableBodyCellSx}>
                                    {formatMoney(it.unit_fee)}
                                  </TableCell>
                                  <TableCell align="right" sx={consultTableBodyCellSx}>
                                    {formatMoney(it.discount)}
                                  </TableCell>
                                  <TableCell align="right" sx={consultTableBodyCellSx}>
                                    {formatMoney(it.total_fee)}
                                  </TableCell>
                                  <TableCell sx={consultTableBodyCellSx}>{it.notes?.trim() || "—"}</TableCell>
                                </TableRow>
                              ))
                            )}
                          </TableBody>
                        </Table>
                      </TableContainer>
                      <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 3, mt: 1 }}>
                        <Typography variant="body2" sx={consultBodyTypoSx}>
                          Bill total: <Box component="span" sx={{ fontWeight: 700 }}>{formatMoney(sale.total_amount)}</Box>
                        </Typography>
                        <Typography variant="body2" sx={consultBodyTypoSx}>
                          From line items: <Box component="span" sx={{ fontWeight: 700 }}>{formatMoney(lineSum)}</Box>
                        </Typography>
                      </Box>
                    </Box>
                  );
                })
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <ConsultationSectionTitle>Laboratory orders — unpaid</ConsultationSectionTitle>
              <Typography variant="body2" color="text.primary" sx={{ ...consultBodyTypoSx, mb: 2, display: "block" }}>
                Each order lists the tests still waiting to be paid at the register.
              </Typography>

              {openLabRequests.length === 0 ? (
                <Typography variant="body2" sx={consultBodyTypoSx}>
                  No laboratory orders waiting for payment on this visit.
                </Typography>
              ) : (
                openLabRequests.map((req) => {
                  const items = labItemsByRequestId.get(req.id) ?? [];
                  return (
                    <Box key={req.id} sx={{ mb: 3, "&:last-child": { mb: 0 } }}>
                      <Typography variant="subtitle2" sx={{ mb: 0.5, fontWeight: 700 }}>
                        Lab order · {formatDateMMDDYYYY(req.request_date)} {formatLabTime(req.request_time)} ·{" "}
                        {req.priority ?? "—"}
                      </Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 1, fontFamily: "monospace", fontSize: "0.75rem" }}>
                        {req.id}
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
                    </Box>
                  );
                })
              )}
            </CardContent>
          </Card>
        </>
      ) : null}
    </Box>
  );
}
