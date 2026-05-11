"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AddOutlinedIcon from "@mui/icons-material/AddOutlined";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  CircularProgress,
  Divider,
  IconButton,
  Snackbar,
  TextField,
  Typography,
} from "@mui/material";
import { useAuth } from "@/components/AuthProvider";
import type { ConsultationPatient } from "@/components/consultation/consultationTypes";
import { useConsultationSave } from "@/components/consultation/consultationSaveContext";
import { fetchActivePhysicianServices, type PhysicianServiceRow } from "@/lib/physicianServices";
import { fetchActiveDiscountTypes, type DiscountTypeRow } from "@/lib/discountTypes";
import { fetchLabRequestsForEncounter, isBillingAsLabPackage } from "@/lib/labRequests";
import { fetchActiveLabPricesByTestIds } from "@/lib/labServicePrices";
import { fetchLabTestsByIds } from "@/lib/labTests";
import { fetchEncounterPlansTreatment } from "@/lib/consultationData";
import {
  fetchLatestPhysicianFeeSaleForEncounter,
  replacePhysicianFeeSaleItems,
  resolveValidPhysicianId,
  upsertPhysicianFeeSaleForEncounter,
} from "@/lib/physicianFeeSales";
import type { UserProfile } from "@/lib/types";

function moneyNum(v: number | string): number {
  const n = typeof v === "number" ? v : Number(String(v));
  return Number.isFinite(n) ? n : 0;
}

function formatMoney(v: number | string): string {
  const n = moneyNum(v);
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function pctNum(v: number | string | null | undefined): number {
  const n = typeof v === "number" ? v : Number(String(v ?? ""));
  return Number.isFinite(n) ? n : 0;
}

const IMAGING_NOTES_START = "[IMAGING_REQUEST]";
const IMAGING_NOTES_END = "[/IMAGING_REQUEST]";

type PricedItem = { name: string; price: number };

type ChargeLineDraft = {
  key: string;
  serviceId: string;
  price: string;
  discountTypeId: string;
};

function newChargeLine(): ChargeLineDraft {
  return {
    key: crypto.randomUUID(),
    serviceId: "",
    price: "",
    discountTypeId: "",
  };
}

function linesSnapshot(lines: ChargeLineDraft[]): string {
  return JSON.stringify(
    lines.map((l) => ({
      serviceId: l.serviceId.trim(),
      price: String(l.price ?? "").trim(),
      discountTypeId: l.discountTypeId.trim(),
    })),
  );
}

export default function ChargesServicesPanel({ transId, patient }: { transId: string; patient: ConsultationPatient }) {
  const { user, profile } = useAuth();
  const { registerSaveHandler, setPanelDirty } = useConsultationSave();
  const [loadingServices, setLoadingServices] = useState(true);
  const [loadingDiscounts, setLoadingDiscounts] = useState(true);
  const [error, setError] = useState("");
  const [services, setServices] = useState<PhysicianServiceRow[]>([]);
  const [discounts, setDiscounts] = useState<DiscountTypeRow[]>([]);
  const [lines, setLines] = useState<ChargeLineDraft[]>(() => [newChargeLine()]);
  const [saveLoading, setSaveLoading] = useState(false);
  const [toastOpen, setToastOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [toastSeverity, setToastSeverity] = useState<"success" | "error">("success");
  const [existingSaleId, setExistingSaleId] = useState<string | null>(null);
  const baselineRef = useRef<string>(linesSnapshot([newChargeLine()]));
  const hydratedRef = useRef(false);
  const [labExtraTotal, setLabExtraTotal] = useState(0);
  const [labItems, setLabItems] = useState<PricedItem[]>([]);
  const [imagingItems, setImagingItems] = useState<PricedItem[]>([]);

  useEffect(() => {
    let cancelled = false;
    setLoadingServices(true);
    setError("");
    void (async () => {
      const r = await fetchActivePhysicianServices();
      if (cancelled) return;
      setLoadingServices(false);
      if (r.error) {
        setError(r.error);
        setServices([]);
      } else {
        setServices(r.services);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoadingDiscounts(true);
    void (async () => {
      const r = await fetchActiveDiscountTypes();
      if (cancelled) return;
      setLoadingDiscounts(false);
      if (r.error) {
        const msg = r.error ?? "Failed to load discounts.";
        setError((prev) => (prev ? prev : msg));
        setDiscounts([]);
      } else {
        setDiscounts(r.discounts);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setExistingSaleId(null);
    hydratedRef.current = false;
    void (async () => {
      const r = await fetchLatestPhysicianFeeSaleForEncounter(transId);
      if (cancelled) return;
      if (r.error) return;
      if (!r.sale) return;
      setExistingSaleId(r.sale.id);
      if (!r.sale.notes) return;
      try {
        const parsed = JSON.parse(r.sale.notes) as { charges_services_lines?: Array<{ serviceId?: string; price?: string; discountTypeId?: string }> };
        const arr = parsed?.charges_services_lines ?? [];
        if (!Array.isArray(arr) || arr.length === 0) return;
        const next = arr.map((row) => ({
            key: crypto.randomUUID(),
            serviceId: String(row.serviceId ?? ""),
            price: String(row.price ?? ""),
            discountTypeId: String(row.discountTypeId ?? ""),
          }));
        baselineRef.current = linesSnapshot(next);
        hydratedRef.current = true;
        setLines(next);
      } catch {
        // ignore invalid JSON
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [transId]);

  useEffect(() => {
    // If there was no saved sale loaded, treat the current lines as baseline once services load.
    if (hydratedRef.current) return;
    if (loadingServices) return;
    baselineRef.current = linesSnapshot(lines);
    hydratedRef.current = true;
  }, [loadingServices, lines]);

  const refreshLabExtraTotal = useCallback(async () => {
    setLabExtraTotal(0);
    setLabItems([]);
    const enc = await fetchLabRequestsForEncounter(transId);
    if (enc.error) return;
    const requests = enc.requests;
    if (requests.length === 0) return;

    const allTestIds = [...new Set(requests.flatMap((r) => r.labTestIds))];
    if (allTestIds.length === 0) return;

    const prices = await fetchActiveLabPricesByTestIds(allTestIds);
    if (prices.error) return;
    const tests = await fetchLabTestsByIds(allTestIds);
    if (tests.error) return;

    const priceMap = prices.pricesByTestId;
    let sum = 0;
    const items: PricedItem[] = [];

    const sortedReqs = [...requests].sort((a, b) => a.created_at.localeCompare(b.created_at));

    for (const req of sortedReqs) {
      const cov = new Set(req.package_covered_test_ids ?? []);
      if (isBillingAsLabPackage(req) && req.lab_packages.length > 0) {
        for (const pkg of req.lab_packages) {
          const p = Number.isFinite(pkg.package_price) ? pkg.package_price : 0;
          sum += p;
          items.push({
            name: `${pkg.name} (laboratory package)`,
            price: p,
          });
        }
        for (const tid of req.labTestIds) {
          if (cov.has(tid)) continue;
          const price = priceMap.get(tid) ?? 0;
          sum += price;
          const name = tests.testsById.get(tid)?.name ?? `Lab test ${tid.slice(0, 8)}…`;
          items.push({ name, price });
        }
      } else {
        for (const tid of req.labTestIds) {
          const price = priceMap.get(tid) ?? 0;
          sum += price;
          const name = tests.testsById.get(tid)?.name ?? `Lab test ${tid.slice(0, 8)}…`;
          items.push({ name, price });
        }
      }
    }

    setLabExtraTotal(sum);
    items.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
    setLabItems(items);
  }, [transId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await refreshLabExtraTotal();
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshLabExtraTotal]);

  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent<{ transId?: string }>;
      if (!ce.detail?.transId || ce.detail.transId !== transId) return;
      void refreshLabExtraTotal();
    };
    window.addEventListener("lifehub:lab-requests-updated", handler);
    return () => {
      window.removeEventListener("lifehub:lab-requests-updated", handler);
    };
  }, [refreshLabExtraTotal, transId]);

  const refreshImagingItems = useCallback(async () => {
    setImagingItems([]);
    const r = await fetchEncounterPlansTreatment(transId);
    if (r.error) return;
    const notes = r.form.plan_notes ?? "";
    const start = notes.indexOf(IMAGING_NOTES_START);
    const end = notes.indexOf(IMAGING_NOTES_END);
    if (start === -1 || end === -1 || end < start) return;
    const inner = notes.slice(start + IMAGING_NOTES_START.length, end);
    const lines = inner
      .split("\n")
      .map((s) => s.trim())
      .filter((s) => s.startsWith("- "));

    if (lines.length === 0) return;

    // Use physician_services (already fetched for combobox) as a price source for imaging.
    const svcByName = new Map<string, number>();
    for (const s of services) {
      if (String(s.service_type ?? "").trim().toLowerCase() !== "imaging") continue;
      const n = typeof s.default_fee === "number" ? s.default_fee : Number(String(s.default_fee ?? ""));
      svcByName.set(String(s.name ?? "").trim().toLowerCase(), Number.isFinite(n) ? n : 0);
    }

    const normalized: PricedItem[] = lines.map((raw) => {
      const label = raw.replace(/^-+\s*/, "").trim();
      const base = label.replace(/\s*\(View:.*\)\s*$/i, "").trim();
      const price = svcByName.get(base.toLowerCase()) ?? 0;
      return { name: label, price };
    });
    normalized.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
    setImagingItems(normalized);
  }, [services, transId]);

  useEffect(() => {
    void refreshImagingItems();
  }, [refreshImagingItems]);

  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent<{ transId?: string }>;
      if (!ce.detail?.transId || ce.detail.transId !== transId) return;
      void refreshImagingItems();
    };
    window.addEventListener("lifehub:imaging-updated", handler);
    return () => window.removeEventListener("lifehub:imaging-updated", handler);
  }, [refreshImagingItems, transId]);

  const serviceById = useMemo(() => {
    const m = new Map<string, PhysicianServiceRow>();
    for (const s of services) m.set(String(s.id), s);
    return m;
  }, [services]);

  const discountById = useMemo(() => {
    const m = new Map<string, DiscountTypeRow>();
    for (const d of discounts) m.set(String(d.id), d);
    return m;
  }, [discounts]);

  const serviceOptions = useMemo(() => services, [services]);
  const discountOptions = useMemo(() => discounts, [discounts]);

  const outlinedFieldSx = useMemo(
    () =>
      ({
        "& .MuiOutlinedInput-root": {
          bgcolor: "background.paper",
          minHeight: 44,
          alignItems: "center",
        },
        "& .MuiOutlinedInput-input, & .MuiInputBase-input": {
          py: 1.125,
          lineHeight: 1.5,
          height: "auto",
          boxSizing: "border-box" as const,
        },
        "& .MuiInputLabel-root": {
          lineHeight: 1.3,
        },
      }) as const,
    [],
  );

  const emptyState = useMemo(() => {
    if (loadingServices) return null;
    if (error) return null;
    if (services.length > 0) return null;
    return (
      <Typography variant="body2" color="text.secondary">
        No active services found.
      </Typography>
    );
  }, [loadingServices, error, services.length]);

  const calcDiscountedPrice = useCallback(
    (line: ChargeLineDraft): string => {
      const base = moneyNum(line.price);
      const d = line.discountTypeId ? discountById.get(line.discountTypeId) ?? null : null;
      const pct = pctNum(d?.discount_pct);
      const out = base * (1 - pct / 100);
      return Number.isFinite(out) ? formatMoney(out) : formatMoney(base);
    },
    [discountById],
  );

  const totals = useMemo(() => {
    const picked = lines.filter((l) => l.serviceId.trim() !== "");
    const subtotal = picked.reduce((sum, l) => sum + moneyNum(l.price), 0);
    const discountAmount = picked.reduce((sum, l) => {
      const base = moneyNum(l.price);
      const d = l.discountTypeId ? discountById.get(l.discountTypeId) ?? null : null;
      const pct = pctNum(d?.discount_pct);
      const out = base * (1 - pct / 100);
      const disc = base - (Number.isFinite(out) ? out : base);
      return sum + disc;
    }, 0);
    const totalAmount = subtotal - discountAmount;
    const discountTypeId =
      picked.length > 0 && picked.every((l) => l.discountTypeId && l.discountTypeId === picked[0]!.discountTypeId)
        ? Number(picked[0]!.discountTypeId)
        : null;
    return {
      subtotal: subtotal + labExtraTotal,
      discountAmount,
      totalAmount: totalAmount + labExtraTotal,
      discountTypeId: Number.isFinite(discountTypeId as number) ? (discountTypeId as number) : null,
    };
  }, [lines, discountById, labExtraTotal]);

  const saveCharges = useCallback(async () => {
    setSaveLoading(true);
    setToastOpen(false);
    try {
      const patientIdNum = (() => {
        const n = Number(String(patient.patientId ?? "").trim());
        return Number.isFinite(n) ? n : null;
      })();
      const physicianIdNum = (() => {
        const u = profile as UserProfile | null;
        const raw = (u as any)?.user_id ?? (user as any)?.user_id ?? (user as any)?.id;
        const n = typeof raw === "number" ? raw : Number(String(raw ?? ""));
        return Number.isFinite(n) ? n : null;
      })();

      const payloadNotes = JSON.stringify({
        charges_services_lines: lines
          .filter((l) => l.serviceId.trim() !== "")
          .map((l) => ({
            serviceId: l.serviceId.trim(),
            price: String(l.price ?? "").trim(),
            discountTypeId: l.discountTypeId.trim() || null,
          })),
      });

      const u = profile as UserProfile | null;
      const servedBy = u?.fullname?.trim() ? u.fullname.trim() : null;

      const resolvedPhysician = await resolveValidPhysicianId(physicianIdNum);
      if (resolvedPhysician.error) {
        setToastSeverity("error");
        setToastMessage(resolvedPhysician.error);
        setToastOpen(true);
        return;
      }
      if (physicianIdNum != null && resolvedPhysician.physicianId == null) {
        setToastSeverity("error");
        setToastMessage("Your user id is not found in the users table. Please re-login or contact admin.");
        setToastOpen(true);
        return;
      }

      const r = await upsertPhysicianFeeSaleForEncounter({
        existingId: existingSaleId,
        patientId: patientIdNum,
        encounterId: transId,
        physicianId: resolvedPhysician.physicianId,
        subtotal: totals.subtotal,
        discountAmount: totals.discountAmount,
        totalAmount: totals.totalAmount,
        discountTypeId: totals.discountTypeId,
        notes: payloadNotes,
        servedBy,
      });

      if (r.error) {
        setToastSeverity("error");
        setToastMessage(r.error);
        setToastOpen(true);
        return;
      }

      const saleId = r.id;
      if (!saleId) {
        setToastSeverity("error");
        setToastMessage("Charges saved but no sale id was returned.");
        setToastOpen(true);
        return;
      }

      const pickedLines = lines.filter((l) => l.serviceId.trim() !== "");
      const itemRows: Parameters<typeof replacePhysicianFeeSaleItems>[1] = [];
      for (const l of pickedLines) {
        const sid = Number(l.serviceId.trim());
        if (!Number.isFinite(sid) || sid <= 0) {
          setToastSeverity("error");
          setToastMessage("Invalid physician service on a charge line.");
          setToastOpen(true);
          return;
        }
        const unitFee = moneyNum(l.price);
        const d = l.discountTypeId ? discountById.get(l.discountTypeId) ?? null : null;
        const pct = pctNum(d?.discount_pct);
        const out = unitFee * (1 - pct / 100);
        const lineDiscount = unitFee - (Number.isFinite(out) ? out : unitFee);
        itemRows.push({
          physician_service_id: sid,
          quantity: 1,
          unit_fee: unitFee,
          discount: lineDiscount,
          notes: d?.name?.trim() ? `Discount: ${d.name}` : null,
        });
      }

      const itemsRes = await replacePhysicianFeeSaleItems(saleId, itemRows);
      if (itemsRes.error) {
        setToastSeverity("error");
        setToastMessage(itemsRes.error);
        setToastOpen(true);
        return;
      }

      setExistingSaleId(saleId);
      setToastSeverity("success");
      setToastMessage("Charges/services saved.");
      setToastOpen(true);
      baselineRef.current = linesSnapshot(lines);
      hydratedRef.current = true;
      setPanelDirty("charges-services", false);
    } finally {
      setSaveLoading(false);
    }
  }, [discountById, existingSaleId, lines, patient.patientId, profile, setPanelDirty, totals, transId, user]);

  useEffect(() => {
    return registerSaveHandler("charges-services", saveCharges);
  }, [registerSaveHandler, saveCharges]);

  useEffect(() => {
    if (!hydratedRef.current) return;
    const dirty = linesSnapshot(lines) !== baselineRef.current;
    setPanelDirty("charges-services", dirty);
  }, [lines, setPanelDirty]);

  return (
    <Box>
      <Snackbar
        open={toastOpen}
        autoHideDuration={3500}
        onClose={() => setToastOpen(false)}
        anchorOrigin={{ vertical: "top", horizontal: "center" }}
      >
        <Alert severity={toastSeverity} variant="filled" onClose={() => setToastOpen(false)} sx={{ width: "100%" }}>
          {toastMessage}
        </Alert>
      </Snackbar>

      {loadingServices ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
          <CircularProgress size={28} />
        </Box>
      ) : null}

      {error ? (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      ) : null}

      {emptyState}

      {!loadingServices && !error && services.length > 0 ? (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1.25 }}>
          {lines.map((line, idx) => {
            const selectedService = line.serviceId ? serviceById.get(line.serviceId) ?? null : null;
            const selectedDiscount = line.discountTypeId ? discountById.get(line.discountTypeId) ?? null : null;
            return (
              <Box key={line.key}>
                <Box
                  sx={{
                    display: "grid",
                    gridTemplateColumns: { xs: "1fr", md: "2fr 1fr 1fr 1fr auto" },
                    gap: 1,
                    alignItems: "center",
                  }}
                >
                  <Autocomplete
                    options={serviceOptions}
                    value={selectedService}
                    onChange={(_, v) => {
                      const id = v ? String(v.id) : "";
                      setLines((prev) =>
                        prev.map((r) =>
                          r.key === line.key
                            ? {
                                ...r,
                                serviceId: id,
                                price: v ? String(v.default_fee ?? "") : "",
                              }
                            : r,
                        ),
                      );
                    }}
                    getOptionLabel={(o) => `${o.name} — ${formatMoney(o.default_fee)}`}
                    isOptionEqualToValue={(a, b) => String(a.id) === String(b.id)}
                    renderInput={(params) => (
                      <TextField {...params} label="Service" placeholder="Select service" size="small" sx={outlinedFieldSx} />
                    )}
                  />

                  <TextField
                    label="Price"
                    size="small"
                    placeholder="0.00"
                    value={line.price}
                    onChange={(e) => setLines((prev) => prev.map((r) => (r.key === line.key ? { ...r, price: e.target.value } : r)))}
                    sx={outlinedFieldSx}
                    inputProps={{ inputMode: "decimal" }}
                  />

                  <Autocomplete
                    options={discountOptions}
                    loading={loadingDiscounts}
                    value={selectedDiscount}
                    onChange={(_, v) => {
                      const id = v ? String(v.id) : "";
                      setLines((prev) => prev.map((r) => (r.key === line.key ? { ...r, discountTypeId: id } : r)));
                    }}
                    getOptionLabel={(o) => `${o.name} (${pctNum(o.discount_pct)}%)`}
                    isOptionEqualToValue={(a, b) => String(a.id) === String(b.id)}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        label="Discount"
                        placeholder="None"
                        size="small"
                        sx={outlinedFieldSx}
                      />
                    )}
                  />

                  <TextField
                    label="Discounted price"
                    size="small"
                    value={calcDiscountedPrice(line)}
                    InputProps={{ readOnly: true }}
                    sx={outlinedFieldSx}
                  />

                  <IconButton
                    aria-label="Remove service line"
                    size="small"
                    onClick={() => {
                      setLines((prev) => {
                        const next = prev.filter((l) => l.key !== line.key);
                        return next.length === 0 ? [newChargeLine()] : next;
                      });
                    }}
                  >
                    <DeleteOutlineIcon fontSize="small" />
                  </IconButton>
                </Box>

                {idx < lines.length - 1 ? <Divider sx={{ mt: 1.25 }} /> : null}
              </Box>
            );
          })}

          <Box>
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.75 }}>
              Select a service to load its default fee. You can override the price and apply a discount type.
            </Typography>
            <Box sx={{ display: "flex", justifyContent: "flex-start" }}>
              <IconButton
                aria-label="Add service"
                onClick={() => setLines((prev) => [...prev, newChargeLine()])}
                size="small"
              >
                <AddOutlinedIcon fontSize="small" />
              </IconButton>
              <Typography variant="body2" sx={{ alignSelf: "center", ml: 0.75, fontWeight: 700 }}>
                Add service
              </Typography>
            </Box>
          </Box>

          <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 1, flexWrap: "wrap", mt: 1, alignItems: "flex-start" }}>
            <Box sx={{ mr: "auto" }}>
              {labItems.length > 0 ? (
                <Box sx={{ mt: 1 }}>
                  <Typography variant="subtitle2" fontWeight={800} sx={{ mb: 0.5 }}>
                    Laboratory services
                  </Typography>
                  <Box component="ul" sx={{ m: 0, pl: 2.25 }}>
                    {labItems.map((it, idx) => (
                      <Box component="li" key={`lab-${idx}-${it.name}`} sx={{ mb: 0.25 }}>
                        <Typography variant="body2" component="span">
                          {it.name}
                        </Typography>
                        <Typography variant="body2" component="span" sx={{ fontWeight: 800, ml: 1 }}>
                          {formatMoney(it.price)}
                        </Typography>
                      </Box>
                    ))}
                  </Box>
                </Box>
              ) : null}

              {imagingItems.length > 0 ? (
                <Box sx={{ mt: 1 }}>
                  <Typography variant="subtitle2" fontWeight={800} sx={{ mb: 0.5 }}>
                    Imaging
                  </Typography>
                  <Box component="ul" sx={{ m: 0, pl: 2.25 }}>
                    {imagingItems.map((it) => (
                      <Box component="li" key={`img-${it.name}`} sx={{ mb: 0.25 }}>
                        <Typography variant="body2" component="span">
                          {it.name}
                        </Typography>
                        <Typography variant="body2" component="span" sx={{ fontWeight: 800, ml: 1 }}>
                          {formatMoney(it.price)}
                        </Typography>
                      </Box>
                    ))}
                  </Box>
                </Box>
              ) : null}

              <Typography variant="body2" sx={{ mt: 1 }}>
                Subtotal: <Box component="span" sx={{ fontWeight: 800 }}>{formatMoney(totals.subtotal)}</Box> · Discount:{" "}
                <Box component="span" sx={{ fontWeight: 800 }}>{formatMoney(totals.discountAmount)}</Box> · Total:{" "}
                <Box component="span" sx={{ fontWeight: 800, color: "success.main" }}>{formatMoney(totals.totalAmount)}</Box>
              </Typography>
              {labExtraTotal > 0 ? (
                <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.25 }}>
                  Includes lab services: <Box component="span" sx={{ fontWeight: 800 }}>{formatMoney(labExtraTotal)}</Box>
                </Typography>
              ) : null}
            </Box>
            <Button
              type="button"
              variant="contained"
              color="secondary"
              size="small"
              disabled={saveLoading || loadingServices}
              onClick={() => void saveCharges()}
              sx={{ textTransform: "none", alignSelf: "flex-start" }}
            >
              {saveLoading ? "Saving…" : "Save Charges"}
            </Button>
          </Box>
        </Box>
      ) : null}
    </Box>
  );
}

