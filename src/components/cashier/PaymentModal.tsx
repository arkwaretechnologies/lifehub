"use client";

import { useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  TextField,
  Typography,
} from "@mui/material";

import { isCashPaymentMethod, type PaymentMethodRow } from "@/lib/paymentMethods";
import type { DiscountTypeRow } from "@/lib/discountTypes";
import type { QueuePriorityRow } from "@/lib/queueReception";

function moneyNum(v: number | string | null | undefined): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : Number(String(v));
  return Number.isFinite(n) ? n : 0;
}

function formatMoney(v: number | string | null | undefined): string {
  return moneyNum(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function roundMoney2(n: number): number {
  return Math.round(n * 100) / 100;
}

function pctNum(v: number | string | null | undefined): number {
  const n = typeof v === "number" ? v : Number(String(v ?? ""));
  return Number.isFinite(n) ? n : 0;
}

export type PaymentModalSummaryRow = {
  label: string;
  amount: number;
};

export function PaymentModal(props: {
  open: boolean;
  title: string;
  totalDue: number;
  /** Discount applies to this portion only; defaults to {@link totalDue}. */
  discountableSubtotal?: number;
  /** Added after discount (e.g. order amendments); can be negative for net refunds. */
  fixedAdjustments?: number;
  summaryRows?: PaymentModalSummaryRow[];
  paymentMethods: PaymentMethodRow[];
  discountTypes?: DiscountTypeRow[];
  busy?: boolean;
  errorText?: string;
  confirmLabel?: string;
  /** Refund flow: no discount/cash tender validation. */
  isRefund?: boolean;
  onGenerateOrNumber?: () => Promise<string>;
  onClose: () => void;
  /** Shown when paying laboratory orders: used if reception did not link an entrance ticket for this visit today. */
  labQueuePrioritySelect?: {
    priorities: QueuePriorityRow[];
    value: number | "";
    onChange: (v: number | "") => void;
  } | null;
  onConfirm: (args: {
    paymentMethod: PaymentMethodRow;
    orNumber: string;
    discountType: DiscountTypeRow | null;
    discountMode: "pct" | "amount";
    discountPct: number;
    discountAmount: number;
    amountTendered: number | null;
    changeAmount: number | null;
    /** Resolved from {@link labQueuePrioritySelect} when present. */
    labQueuePriorityId: number | null;
  }) => Promise<void> | void;
}) {
  const {
    open,
    title,
    totalDue,
    discountableSubtotal,
    fixedAdjustments = 0,
    summaryRows,
    paymentMethods,
    discountTypes,
    busy,
    errorText,
    confirmLabel = "Pay",
    isRefund = false,
    onGenerateOrNumber,
    onClose,
    onConfirm,
    labQueuePrioritySelect,
  } = props;

  const fieldSx = useMemo(
    () => ({
      "& .MuiInputBase-root": {
        minHeight: 46,
        alignItems: "center",
        borderRadius: 1.5,
      },
      "& .MuiInputBase-input": {
        py: 1.25,
      },
      "& .MuiInputLabel-root": {
        lineHeight: 1.2,
      },
    }),
    [],
  );

  const [paymentMethodId, setPaymentMethodId] = useState<number | "">("");
  const [orNumber, setOrNumber] = useState("");
  const [discountTypeId, setDiscountTypeId] = useState<number | "" | "other">("");
  const [otherDiscountPctRaw, setOtherDiscountPctRaw] = useState("");
  const [otherDiscountAmountRaw, setOtherDiscountAmountRaw] = useState("");
  const [discountMode, setDiscountMode] = useState<"pct" | "amount">("pct");
  const [amountTenderedRaw, setAmountTenderedRaw] = useState("");
  const [localError, setLocalError] = useState<string>("");
  const [genBusy, setGenBusy] = useState(false);

  const selectedMethod = useMemo(() => {
    if (paymentMethodId === "") return null;
    return paymentMethods.find((m) => m.id === paymentMethodId) ?? null;
  }, [paymentMethodId, paymentMethods]);

  const cashMode = useMemo(() => isCashPaymentMethod(selectedMethod), [selectedMethod]);

  const selectedDiscount = useMemo(() => {
    if (discountTypeId === "" || (typeof discountTypeId === "string" && discountTypeId === "other")) return null;
    return (discountTypes ?? []).find((d) => d.id === discountTypeId) ?? null;
  }, [discountTypeId, discountTypes]);

  const otherDiscountPct = useMemo(() => {
    const t = otherDiscountPctRaw.trim();
    if (t === "") return 0;
    const n = Number(t);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, n);
  }, [otherDiscountPctRaw]);

  const otherDiscountAmount = useMemo(() => {
    const t = otherDiscountAmountRaw.trim();
    if (t === "") return 0;
    const n = Number(t);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, n);
  }, [otherDiscountAmountRaw]);

  const effectiveDiscountPct = useMemo(() => {
    if (typeof discountTypeId === "string" && discountTypeId === "other") return otherDiscountPct;
    return pctNum(selectedDiscount?.discount_pct);
  }, [discountTypeId, otherDiscountPct, selectedDiscount?.discount_pct]);

  const discountableDue = moneyNum(discountableSubtotal ?? totalDue);
  const discountAppliesToSubset =
    discountableSubtotal != null && moneyNum(totalDue) > discountableDue + 0.005;

  const showDiscountSection =
    !isRefund && (discountTypes?.length ?? 0) > 0 && discountableDue > 0.005;

  const effectiveDiscountMode = useMemo(() => {
    // If a discount type is selected from DB, it’s always percentage-based.
    if (selectedDiscount) return "pct" as const;
    return discountMode;
  }, [discountMode, selectedDiscount]);

  const discountPctDisplay = useMemo(() => {
    if (typeof discountTypeId === "string" && discountTypeId === "other") return otherDiscountPctRaw;
    if (selectedDiscount) return String(pctNum(selectedDiscount.discount_pct));
    return "";
  }, [discountTypeId, otherDiscountPctRaw, selectedDiscount]);

  const discountPctEditable = useMemo(() => {
    return typeof discountTypeId === "string" && discountTypeId === "other" && !selectedDiscount && effectiveDiscountMode === "pct";
  }, [discountTypeId, effectiveDiscountMode, selectedDiscount]);

  const discountAmountEditable = useMemo(() => {
    return typeof discountTypeId === "string" && discountTypeId === "other" && !selectedDiscount && effectiveDiscountMode === "amount";
  }, [discountTypeId, selectedDiscount, effectiveDiscountMode]);

  const showDiscountDetails = useMemo(() => {
    if (typeof discountTypeId === "string" && discountTypeId === "other") return true;
    if (selectedDiscount) return true;
    return false;
  }, [discountTypeId, selectedDiscount]);

  const discountAmount = useMemo(() => {
    const due = discountableDue;
    if (due <= 0) return 0;
    if (selectedDiscount || effectiveDiscountMode === "pct") {
      const pct = Number.isFinite(effectiveDiscountPct) ? Math.max(0, effectiveDiscountPct) : 0;
      if (pct <= 0) return 0;
      return Math.min(due, Math.max(0, due * (pct / 100)));
    }
    // amount mode
    return Math.min(due, otherDiscountAmount);
  }, [discountableDue, effectiveDiscountMode, effectiveDiscountPct, otherDiscountAmount, selectedDiscount]);

  const totalAfterDiscount = useMemo(() => {
    if (isRefund) return moneyNum(totalDue);
    return Math.max(0, roundMoney2(moneyNum(totalDue) - discountAmount));
  }, [discountAmount, isRefund, totalDue]);

  const amountTendered = useMemo(() => {
    const t = amountTenderedRaw.trim();
    if (t === "") return null;
    const n = Number(t);
    if (!Number.isFinite(n)) return null;
    return n;
  }, [amountTenderedRaw]);

  const computedChange = useMemo(() => {
    if (!cashMode) return null;
    const tendered = amountTendered ?? 0;
    return Math.max(0, tendered - totalAfterDiscount);
  }, [amountTendered, cashMode, totalAfterDiscount]);

  const disableConfirm = useMemo(() => {
    if (busy) return true;
    if (!selectedMethod) return true;
    // OR can be auto-generated on confirm if `onGenerateOrNumber` exists.
    if (!orNumber.trim() && !onGenerateOrNumber) return true;
    if (isRefund) return false;
    if (cashMode) {
      const t = amountTendered;
      if (t == null) return true;
      if (t < totalAfterDiscount) return true;
    }
    return false;
  }, [amountTendered, busy, cashMode, isRefund, onGenerateOrNumber, orNumber, selectedMethod, totalAfterDiscount]);

  const effectiveSummaryRows = useMemo(() => {
    const rows = (summaryRows ?? []).filter((r) => r && r.label && Number.isFinite(r.amount));
    return rows;
  }, [summaryRows]);

  async function handleGenerateOr() {
    if (!onGenerateOrNumber) return;
    setLocalError("");
    setGenBusy(true);
    try {
      const v = await onGenerateOrNumber();
      setOrNumber(v);
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : "Could not generate OR number.");
    } finally {
      setGenBusy(false);
    }
  }

  async function handleConfirm() {
    setLocalError("");
    if (!selectedMethod) {
      setLocalError("Select a payment method.");
      return;
    }
    let or = orNumber.trim();
    if (!or && onGenerateOrNumber) {
      try {
        setGenBusy(true);
        or = await onGenerateOrNumber();
        setOrNumber(or);
      } catch (e) {
        setLocalError(e instanceof Error ? e.message : "Could not generate OR number.");
        return;
      } finally {
        setGenBusy(false);
      }
    }
    if (!or) {
      setLocalError("Enter an OR number.");
      return;
    }
    if (!isRefund && cashMode) {
      if (amountTendered == null || !Number.isFinite(amountTendered)) {
        setLocalError("Enter a valid amount tendered.");
        return;
      }
      if (amountTendered < totalAfterDiscount) {
        setLocalError("Amount tendered must be at least the total due.");
        return;
      }
    }

    let labQueuePriorityId: number | null = null;
    if (labQueuePrioritySelect && labQueuePrioritySelect.priorities.length > 0) {
      const v = labQueuePrioritySelect.value;
      if (v !== "" && Number.isFinite(v)) {
        labQueuePriorityId = Number(v);
      } else {
        const first = labQueuePrioritySelect.priorities[0]?.id;
        labQueuePriorityId = first != null && Number.isFinite(first) ? first : null;
      }
    }

    try {
      await onConfirm({
        paymentMethod: selectedMethod,
        orNumber: or,
        discountType: typeof discountTypeId === "string" && discountTypeId === "other" ? null : selectedDiscount,
        discountMode: effectiveDiscountMode,
        discountPct: effectiveDiscountMode === "pct" ? effectiveDiscountPct : 0,
        discountAmount,
        amountTendered: cashMode ? (amountTendered ?? 0) : null,
        changeAmount: cashMode ? (computedChange ?? 0) : null,
        labQueuePriorityId,
      });
    } catch {
      /* Parent may navigate away after payment; ignore stale router/modal errors. */
    }
  }

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="sm" fullWidth>
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (disableConfirm || genBusy) return;
          void handleConfirm();
        }}
      >
      <DialogTitle>{title}</DialogTitle>
      <DialogContent sx={{ pt: 1 }}>
        {errorText ? (
          <Alert severity="error" sx={{ mb: 2 }}>
            {errorText}
          </Alert>
        ) : null}
        {localError ? (
          <Alert severity="warning" sx={{ mb: 2 }} onClose={() => setLocalError("")}>
            {localError}
          </Alert>
        ) : null}

        <Box sx={{ mb: 2 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 0.75 }}>
            Payment details
          </Typography>
          {effectiveSummaryRows.length > 0 ? (
            <Box sx={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 0.75 }}>
              {effectiveSummaryRows.map((r) => (
                <Box key={r.label} sx={{ display: "contents" }}>
                  <Typography variant="body2" color="text.secondary">
                    {r.label}
                  </Typography>
                  <Typography variant="body2" sx={{ fontVariantNumeric: "tabular-nums" }}>
                    {formatMoney(r.amount)}
                  </Typography>
                </Box>
              ))}
              <Box sx={{ display: "contents" }}>
                <Typography variant="body2" sx={{ fontWeight: 800 }}>
                  Total due
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>
                  {formatMoney(totalDue)}
                </Typography>
              </Box>
              {showDiscountDetails ? (
                <>
                  <Box sx={{ display: "contents" }}>
                    <Typography variant="body2" color="text.secondary">
                      Discount
                    </Typography>
                    <Typography variant="body2" sx={{ fontVariantNumeric: "tabular-nums" }}>
                      -{formatMoney(discountAmount)}
                    </Typography>
                  </Box>
                  <Box sx={{ display: "contents" }}>
                    <Typography variant="body2" sx={{ fontWeight: 800 }}>
                      Total after discount
                    </Typography>
                    <Typography variant="body2" sx={{ fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>
                      {formatMoney(totalAfterDiscount)}
                    </Typography>
                  </Box>
                </>
              ) : null}
            </Box>
          ) : (
            <Typography variant="body2" color="text.secondary">
              Total due: {formatMoney(totalDue)}
            </Typography>
          )}
        </Box>

        <FormControl fullWidth size="small" sx={{ mb: 2, ...fieldSx }}>
          <InputLabel id="payment-method-label">Payment method</InputLabel>
          <Select
            labelId="payment-method-label"
            value={paymentMethodId}
            label="Payment method"
            onChange={(e) => setPaymentMethodId((e.target.value as number) ?? "")}
            disabled={busy}
          >
            {paymentMethods.map((m) => (
              <MenuItem key={m.id} value={m.id}>
                {m.name} ({m.code})
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {labQueuePrioritySelect && labQueuePrioritySelect.priorities.length > 0 ? (
          <FormControl fullWidth size="small" sx={{ mb: 2, ...fieldSx }}>
            <InputLabel id="lab-queue-priority-label">Laboratory queue priority</InputLabel>
            <Select
              labelId="lab-queue-priority-label"
              value={labQueuePrioritySelect.value === "" ? "" : labQueuePrioritySelect.value}
              label="Laboratory queue priority"
              onChange={(e) => {
                const raw = e.target.value as number | string;
                if (raw === "" || raw === undefined) labQueuePrioritySelect.onChange("");
                else labQueuePrioritySelect.onChange(Number(raw));
              }}
              disabled={busy || genBusy}
            >
              {labQueuePrioritySelect.priorities.map((p) => (
                <MenuItem key={p.id} value={p.id}>
                  {p.name?.trim() ? p.name : p.code}
                </MenuItem>
              ))}
            </Select>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.75 }}>
              Used when no reception entrance ticket is found for this visit today (priority is copied from reception
              when available).
            </Typography>
          </FormControl>
        ) : null}

        <TextField
          fullWidth
          size="small"
          label="OR number"
          value={orNumber}
          onChange={(e) => setOrNumber(e.target.value.toUpperCase())}
          disabled={busy || genBusy}
          sx={{ mb: 2, ...fieldSx }}
          InputProps={{
            endAdornment: onGenerateOrNumber ? (
              <Button
                type="button"
                size="small"
                onClick={() => void handleGenerateOr()}
                disabled={!!busy || genBusy}
                sx={{ textTransform: "none", ml: 1, whiteSpace: "nowrap" }}
              >
                {genBusy ? "Generating…" : "Generate"}
              </Button>
            ) : undefined,
          }}
        />

        {showDiscountSection ? (
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", sm: "1.2fr 0.55fr 0.75fr" },
              gap: 1.25,
              mb: 2,
              alignItems: "start",
            }}
          >
            <FormControl fullWidth size="small" sx={{ ...fieldSx }}>
              <InputLabel id="discount-type-label">Discount</InputLabel>
              <Select
                labelId="discount-type-label"
                value={discountTypeId}
                label="Discount"
                onChange={(e) => {
                  const v = (e.target.value as number | "other" | "") ?? "";
                  setDiscountTypeId(v);
                  if (v !== "other") {
                    setOtherDiscountPctRaw("");
                    setOtherDiscountAmountRaw("");
                    setDiscountMode("pct");
                  }
                }}
                disabled={busy || genBusy}
              >
                <MenuItem value="">None</MenuItem>
                {discountTypes!.map((d) => (
                  <MenuItem key={d.id} value={d.id}>
                    {d.name} ({pctNum(d.discount_pct)}%)
                  </MenuItem>
                ))}
                <MenuItem value="other">Other</MenuItem>
              </Select>
            </FormControl>

            <FormControl fullWidth size="small" sx={{ ...fieldSx }}>
              <InputLabel id="discount-mode-label">As</InputLabel>
              <Select
                labelId="discount-mode-label"
                value={effectiveDiscountMode}
                label="As"
                onChange={(e) => setDiscountMode((e.target.value as "pct" | "amount") ?? "pct")}
                disabled={busy || genBusy || !!selectedDiscount || discountTypeId !== "other"}
              >
                <MenuItem value="pct">%</MenuItem>
                <MenuItem value="amount">Amount</MenuItem>
              </Select>
            </FormControl>

            <TextField
              fullWidth
              size="small"
              label={effectiveDiscountMode === "amount" ? "Discount amount" : "Discount %"}
              value={effectiveDiscountMode === "amount" ? otherDiscountAmountRaw : discountPctDisplay}
              onChange={(e) =>
                effectiveDiscountMode === "amount"
                  ? setOtherDiscountAmountRaw(e.target.value)
                  : setOtherDiscountPctRaw(e.target.value)
              }
              disabled={busy || genBusy || (effectiveDiscountMode === "amount" ? !discountAmountEditable : !discountPctEditable)}
              inputMode="decimal"
              sx={fieldSx}
            />
          </Box>
        ) : null}

        {showDiscountSection && discountAppliesToSubset ? (
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: -1, mb: 2 }}>
            Discount applies to laboratory and imaging only (not consultation charges).
          </Typography>
        ) : null}

        {!isRefund && cashMode ? (
          <>
            <TextField
              fullWidth
              size="small"
              label="Amount tendered"
              value={amountTenderedRaw}
              onChange={(e) => setAmountTenderedRaw(e.target.value)}
              disabled={busy || genBusy}
              inputMode="decimal"
              sx={{ mb: 2, ...fieldSx }}
            />
            <TextField
              fullWidth
              size="small"
              label="Change"
              value={computedChange == null ? "" : formatMoney(computedChange)}
              disabled
              sx={fieldSx}
            />
          </>
        ) : null}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button type="button" onClick={onClose} disabled={!!busy} sx={{ textTransform: "none" }}>
          Cancel
        </Button>
        <Button
          type="submit"
          variant="contained"
          color="secondary"
          disabled={disableConfirm || genBusy}
        >
          {confirmLabel}
        </Button>
      </DialogActions>
      </form>
    </Dialog>
  );
}

