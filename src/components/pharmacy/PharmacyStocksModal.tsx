"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Divider,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Radio,
  RadioGroup,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  Typography,
  Paper,
  Chip,
  Snackbar,
  IconButton,
  Tooltip,
} from "@mui/material";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import { alpha } from "@mui/material/styles";
import { useAuth } from "@/components/AuthProvider";
import { DatePickerField } from "@/components/DatePickerField";
import type { ProductPosRow } from "@/lib/pharmacyPosDb";
import {
  applyPharmacyStockIn,
  applyPharmacyStockOut,
  correctPharmacyStockLotQuantity,
  deletePharmacyStockLot,
  fetchProductByBarcode,
  updatePharmacyStockLotDetails,
  fetchStockLotsForProduct,
  formatProductOptionLabel,
  getClosestStockExpiryYmd,
  getProductStockOnHand,
  listSuppliers,
  searchPosProducts,
  type StockLotRow,
  type SupplierRow,
} from "@/lib/pharmacyPosDb";
import PharmacySuppliersModal from "@/components/pharmacy/PharmacySuppliersModal";
import { ACTION_PERMISSION_DENIED_MESSAGE, hasPharmacyCapability } from "@/lib/navPermissionCatalog";

const ADD_NEW_SUPPLIER_SELECT_VALUE = "__add_new_supplier__";

const LOTS_ROWS_PER_PAGE_OPTIONS = [5, 10, 25, 50] as const;

/** Today's date as YYYY-MM-DD in the browser's local timezone (for `input type="date"` min). */
function localDateYmd(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Outlined field: stable label notch + vertically centered input (avoids cramped / clipped text). */
const SEARCH_FIELD_SX = {
  mt: 1,
  "& .MuiOutlinedInput-root": {
    minHeight: 48,
    borderRadius: 1,
    alignItems: "center",
  },
  "& .MuiInputBase-input": {
    py: 1.25,
    fontSize: "1rem",
    lineHeight: 1.5,
    boxSizing: "border-box",
  },
  "& .MuiInputBase-input::placeholder": {
    opacity: 0.7,
  },
} as const;

/** Single-line adjustment fields: stable outlined notch + label (always use with empty-controlled values). */
const STOCK_ADJ_OUTLINED_SX = {
  "& .MuiOutlinedInput-root": {
    minHeight: 48,
    borderRadius: 1,
    alignItems: "center",
  },
  "& .MuiInputBase-input": {
    py: 1.25,
    fontSize: "1rem",
    lineHeight: 1.5,
    boxSizing: "border-box",
  },
} as const;

/** Multiline note: label on notch, text aligned to top inside the box. */
const STOCK_NOTES_FIELD_SX = {
  "& .MuiOutlinedInput-root": {
    borderRadius: 1,
    alignItems: "flex-start",
  },
  "& .MuiInputBase-input": {
    py: 1.25,
    fontSize: "1rem",
    lineHeight: 1.5,
    boxSizing: "border-box",
  },
} as const;

type Props = {
  open: boolean;
  onClose: () => void;
};

export default function PharmacyStocksModal({ open, onClose }: Props) {
  const { profile, menuAccess } = useAuth();
  const [permDeniedOpen, setPermDeniedOpen] = useState(false);
  const canManageSuppliers =
    !menuAccess.rbac || hasPharmacyCapability(menuAccess.pageKeys, "pharmacy/suppliers");
  const performedBy =
    profile != null && typeof profile.user_id === "number"
      ? String(profile.user_id)
      : null;

  const [q, setQ] = useState("");
  const [results, setResults] = useState<ProductPosRow[]>([]);
  const [resultSel, setResultSel] = useState(0);
  const [selProduct, setSelProduct] = useState<ProductPosRow | null>(null);

  /** Same as POS: confirm quantity + show closest expiry before locking in selection. */
  const [pickOpen, setPickOpen] = useState(false);
  const [pickDraft, setPickDraft] = useState<ProductPosRow | null>(null);
  const [pickQty, setPickQty] = useState("1");
  const [pickQtyErr, setPickQtyErr] = useState<string | null>(null);
  const [pickExpiryReady, setPickExpiryReady] = useState(false);
  const [pickExpiryInfo, setPickExpiryInfo] = useState<string | null>(null);
  const [lots, setLots] = useState<StockLotRow[]>([]);
  const [onHand, setOnHand] = useState<number>(0);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [actionErr, setActionErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [flow, setFlow] = useState<"in" | "out">("in");
  const [qtyStr, setQtyStr] = useState("");
  const [expiryYmd, setExpiryYmd] = useState("");
  const [batchNo, setBatchNo] = useState("");
  const [unitCostStr, setUnitCostStr] = useState("");
  const [drNumber, setDrNumber] = useState("");
  const [drDate, setDrDate] = useState("");
  /** Stock in: supplier from Suppliers module (`supplier_dr` on save = selected name). */
  const [stockInSupplierId, setStockInSupplierId] = useState<number | "">("");
  const [suppliers, setSuppliers] = useState<SupplierRow[]>([]);
  const [suppliersLoadErr, setSuppliersLoadErr] = useState<string | null>(null);
  const [suppliersModalOpen, setSuppliersModalOpen] = useState(false);
  const [lotIdOut, setLotIdOut] = useState("");
  const [outKind, setOutKind] = useState<"EXPIRY" | "STOCK_OUT">("EXPIRY");
  const [notes, setNotes] = useState("");
  const [lotsPage, setLotsPage] = useState(0);
  const [lotsRowsPerPage, setLotsRowsPerPage] = useState(10);

  const [editLot, setEditLot] = useState<StockLotRow | null>(null);
  const [editExpiry, setEditExpiry] = useState("");
  const [editBatch, setEditBatch] = useState("");
  const [editQty, setEditQty] = useState("");
  const [editNote, setEditNote] = useState("");
  const [editBusy, setEditBusy] = useState(false);
  const [editErr, setEditErr] = useState<string | null>(null);

  const [deleteLot, setDeleteLot] = useState<StockLotRow | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteErr, setDeleteErr] = useState<string | null>(null);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadSuppliers = useCallback(async () => {
    const { rows, error } = await listSuppliers();
    if (error) {
      setSuppliersLoadErr(error);
      setSuppliers([]);
      return;
    }
    setSuppliersLoadErr(null);
    setSuppliers(rows.filter((r) => r.is_active !== false));
  }, []);

  const paginatedLots = useMemo(() => {
    const start = lotsPage * lotsRowsPerPage;
    return lots.slice(start, start + lotsRowsPerPage);
  }, [lots, lotsPage, lotsRowsPerPage]);

  useEffect(() => {
    const pageCount = Math.max(1, Math.ceil(lots.length / lotsRowsPerPage));
    const lastPage = pageCount - 1;
    if (lotsPage > lastPage) setLotsPage(lastPage);
  }, [lots.length, lotsRowsPerPage, lotsPage]);

  useEffect(() => {
    if (selProduct?.id) setLotsPage(0);
  }, [selProduct?.id]);

  const refreshLots = useCallback(async (productId: string) => {
    setLoadErr(null);
    const [{ lots: L, error: e1 }, { qty, error: e2 }] = await Promise.all([
      fetchStockLotsForProduct(productId),
      getProductStockOnHand(productId),
    ]);
    if (e1) setLoadErr(e1);
    else if (e2) setLoadErr(e2);
    else setLoadErr(null);
    setLots(L);
    setOnHand(qty);
    setLotIdOut((prev) => {
      if (!L.length) return "";
      if (prev && L.some((l) => l.id === prev)) return prev;
      return L[0]!.id;
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    if (timer.current) clearTimeout(timer.current);
    const t = q.trim();
    if (t.length < 1) {
      setResults([]);
      return;
    }
    timer.current = setTimeout(() => {
      void (async () => {
        const { products, error } = await searchPosProducts(t, 40);
        if (error) return;
        setResults(products);
        setResultSel(0);
      })();
    }, 220);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [q, open]);

  useEffect(() => {
    if (!open || flow !== "in") return;
    void loadSuppliers();
  }, [open, flow, loadSuppliers]);

  useEffect(() => {
    if (!open) {
      setQ("");
      setResults([]);
      setSelProduct(null);
      setLots([]);
      setOnHand(0);
      setQtyStr("");
      setExpiryYmd("");
      setBatchNo("");
      setUnitCostStr("");
      setDrNumber("");
      setDrDate("");
      setStockInSupplierId("");
      setSuppliers([]);
      setSuppliersLoadErr(null);
      setSuppliersModalOpen(false);
      setLotIdOut("");
      setNotes("");
      setFlow("in");
      setOutKind("EXPIRY");
      setActionErr(null);
      setLoadErr(null);
      setPickOpen(false);
      setPickDraft(null);
      setPickQty("1");
      setPickQtyErr(null);
      setPickExpiryReady(false);
      setPickExpiryInfo(null);
      setResultSel(0);
      setLotsPage(0);
      setLotsRowsPerPage(10);
    }
  }, [open]);

  useEffect(() => {
    if (!selProduct) {
      setLots([]);
      setOnHand(0);
      return;
    }
    void refreshLots(selProduct.id);
  }, [selProduct, refreshLots]);

  const closePickModal = useCallback(() => {
    setPickOpen(false);
    setPickDraft(null);
    setPickQty("1");
    setPickQtyErr(null);
    setPickExpiryReady(false);
    setPickExpiryInfo(null);
  }, []);

  const openPickModal = useCallback((p: ProductPosRow) => {
    setPickQtyErr(null);
    setPickDraft(p);
    setPickQty("1");
    setPickExpiryReady(false);
    setPickExpiryInfo(null);
    setPickOpen(true);
  }, []);

  useEffect(() => {
    if (!pickOpen || !pickDraft) return;
    let cancelled = false;
    setPickExpiryReady(false);
    setPickExpiryInfo(null);
    void (async () => {
      const { lots, error } = await fetchStockLotsForProduct(pickDraft.id);
      if (cancelled) return;
      setPickExpiryReady(true);
      if (error) {
        setPickExpiryInfo(`Could not load stock: ${error}`);
        return;
      }
      const ymd = getClosestStockExpiryYmd(lots);
      if (ymd) {
        setPickExpiryInfo(`Closest expiry: ${ymd}`);
      } else if (lots.length === 0) {
        setPickExpiryInfo("No stock lots on hand — add stock to track expiry.");
      } else {
        setPickExpiryInfo("No expiry date on active lots for this product.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pickOpen, pickDraft?.id]);

  const pickProduct = (p: ProductPosRow, initialQty?: string) => {
    setSelProduct(p);
    setActionErr(null);
    setQtyStr(initialQty ?? "");
    setNotes("");
    setExpiryYmd("");
    setDrNumber("");
    setDrDate("");
    setStockInSupplierId("");
    setLotIdOut("");
  };

  const confirmPickFromModal = useCallback(() => {
    setPickQtyErr(null);
    if (!pickDraft) return;
    const n = Math.round(Number.parseInt(pickQty.replace(/\D/g, ""), 10));
    if (!Number.isFinite(n) || n < 1) {
      setPickQtyErr("Enter a whole number of at least 1.");
      return;
    }
    pickProduct(pickDraft, String(n));
    closePickModal();
    setQ("");
    setResults([]);
    setResultSel(0);
  }, [pickDraft, pickQty, closePickModal]);

  const onSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setResultSel((i) => Math.min(Math.max(0, results.length - 1), i + 1));
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setResultSel((i) => Math.max(0, i - 1));
    }
    if (e.key === "Enter") {
      e.preventDefault();
      if (pickOpen) return;
      void (async () => {
        const raw = q.trim();
        if (!raw) return;
        const { product: byBarcode } = await fetchProductByBarcode(raw);
        if (byBarcode) {
          openPickModal(byBarcode);
          return;
        }
        if (results.length > 0 && results[resultSel]) {
          openPickModal(results[resultSel]);
        }
      })();
    }
  };

  const openEditLot = (lot: StockLotRow) => {
    setEditLot(lot);
    setEditExpiry(lot.expiry_date?.trim().slice(0, 10) ?? "");
    setEditBatch(lot.batch_no ?? "");
    setEditQty(String(Number(lot.quantity)));
    setEditNote("");
    setEditErr(null);
  };

  const closeEditLot = () => {
    setEditLot(null);
    setEditErr(null);
  };

  const saveEditLot = async () => {
    if (!selProduct || !editLot) return;
    const note = editNote.trim();
    if (!note) {
      setEditErr("Reason / note is required for lot changes.");
      return;
    }
    const targetQty = Number(editQty);
    if (!Number.isFinite(targetQty) || targetQty < 0) {
      setEditErr("Enter a valid quantity (0 or more).");
      return;
    }
    const exp = editExpiry.trim().slice(0, 10);
    if (editExpiry.trim() && !/^\d{4}-\d{2}-\d{2}$/.test(exp)) {
      setEditErr("Expiry must be YYYY-MM-DD when provided.");
      return;
    }

    setEditBusy(true);
    setEditErr(null);

    const prevExp = editLot.expiry_date?.trim().slice(0, 10) ?? "";
    const prevBatch = editLot.batch_no ?? "";
    const detailsChanged = exp !== prevExp || editBatch.trim() !== prevBatch.trim();

    if (detailsChanged) {
      const { error } = await updatePharmacyStockLotDetails({
        stockId: editLot.id,
        productId: selProduct.id,
        expiryDate: exp || null,
        batchNo: editBatch.trim() || null,
      });
      if (error) {
        setEditErr(error);
        setEditBusy(false);
        return;
      }
    }

    const currentQty = Number(editLot.quantity) || 0;
    if (Math.abs(targetQty - currentQty) >= 1e-9) {
      const { error } = await correctPharmacyStockLotQuantity({
        stockId: editLot.id,
        productId: selProduct.id,
        newQuantity: targetQty,
        notes: note,
        performedBy,
      });
      if (error) {
        setEditErr(error);
        setEditBusy(false);
        return;
      }
    } else if (!detailsChanged) {
      setEditErr("Change expiry, batch, or quantity before saving.");
      setEditBusy(false);
      return;
    }

    closeEditLot();
    await refreshLots(selProduct.id);
    setEditBusy(false);
  };

  const confirmDeleteLot = async () => {
    if (!selProduct || !deleteLot) return;
    setDeleteBusy(true);
    setDeleteErr(null);
    const { error } = await deletePharmacyStockLot({
      stockId: deleteLot.id,
      productId: selProduct.id,
    });
    if (error) {
      setDeleteErr(error);
      setDeleteBusy(false);
      return;
    }
    setDeleteLot(null);
    await refreshLots(selProduct.id);
    setDeleteBusy(false);
  };

  const submit = async () => {
    if (!selProduct) {
      setActionErr("Select a product first.");
      return;
    }
    const qty = Number(qtyStr);
    if (!Number.isFinite(qty) || qty <= 0) {
      setActionErr("Enter a valid quantity.");
      return;
    }

    setBusy(true);
    setActionErr(null);

    if (flow === "in") {
      if (!expiryYmd.trim()) {
        setActionErr("Expiry date is required for stock in.");
        setBusy(false);
        return;
      }
      const exp = expiryYmd.trim().slice(0, 10);
      if (exp < localDateYmd()) {
        setActionErr("Expiry date cannot be before today.");
        setBusy(false);
        return;
      }
      const supplierRow =
        stockInSupplierId === "" ? null : suppliers.find((s) => s.id === stockInSupplierId);
      if (stockInSupplierId !== "" && !supplierRow) {
        setActionErr("Selected supplier is no longer available — refresh and pick again.");
        setBusy(false);
        void loadSuppliers();
        return;
      }
      const uc = unitCostStr.trim() === "" ? null : Number(unitCostStr);
      const { error } = await applyPharmacyStockIn({
        productId: selProduct.id,
        quantity: qty,
        expiryDate: expiryYmd,
        batchNo: batchNo.trim() || null,
        unitCost: uc != null && Number.isFinite(uc) ? uc : null,
        notes: notes.trim() || null,
        performedBy,
        drNumber: drNumber.trim() || null,
        drDate: drDate.trim() || null,
        supplierDr: supplierRow?.name.trim() || null,
      });
      if (error) setActionErr(error);
      else {
        setQtyStr("");
        setBatchNo("");
        setUnitCostStr("");
        setDrNumber("");
        setDrDate("");
        setStockInSupplierId("");
        setNotes("");
        await refreshLots(selProduct.id);
      }
    } else {
      if (!lotIdOut) {
        setActionErr("Select a lot to remove stock from.");
        setBusy(false);
        return;
      }
      if (!notes.trim()) {
        setActionErr("Reason / note is required for stock out.");
        setBusy(false);
        return;
      }
      const { error } = await applyPharmacyStockOut({
        stockId: lotIdOut,
        productId: selProduct.id,
        quantity: qty,
        movementType: outKind,
        notes: notes.trim(),
        performedBy,
      });
      if (error) setActionErr(error);
      else {
        setQtyStr("");
        setNotes("");
        await refreshLots(selProduct.id);
      }
    }
    setBusy(false);
  };

  return (
    <>
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="xl"
      fullWidth
      slotProps={{
        paper: {
          sx: {
            width: "100%",
            maxWidth: 1400,
            minHeight: { xs: "72vh", sm: "min(78vh, 840px)" },
            maxHeight: "92vh",
            display: "flex",
            flexDirection: "column",
          },
        },
      }}
    >
      <DialogTitle>Stocks</DialogTitle>
      <DialogContent sx={{ flex: 1, overflow: "auto", pt: 2, pb: 2 }}>
        <Stack spacing={2}>
          <Typography variant="caption" color="text.secondary">
            ↑↓ select a row, Enter or tap a row — then confirm quantity and see closest expiry.
          </Typography>
          <TextField
            variant="outlined"
            label="Search item"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onSearchKeyDown}
            fullWidth
            placeholder="Name or barcode"
            autoComplete="off"
            InputLabelProps={{ shrink: true }}
            sx={SEARCH_FIELD_SX}
          />

          {results.length > 0 && (
            <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 320 }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell>Product</TableCell>
                    <TableCell align="right">Retail</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {results.map((r, i) => (
                    <TableRow
                      key={r.id}
                      hover
                      selected={i === resultSel}
                      onClick={() => {
                        setResultSel(i);
                        openPickModal(r);
                      }}
                      sx={{ cursor: "pointer" }}
                    >
                      <TableCell>{formatProductOptionLabel(r)}</TableCell>
                      <TableCell align="right">₱{r.unit_price.toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}

          {selProduct && (
            <>
              <Paper
                variant="outlined"
                elevation={0}
                sx={(theme) => ({
                  px: 1.5,
                  py: 1,
                  borderRadius: 1.5,
                  borderWidth: 1,
                  borderColor: "primary.main",
                  bgcolor: alpha(theme.palette.primary.main, theme.palette.mode === "dark" ? 0.12 : 0.06),
                  boxShadow: `inset 3px 0 0 0 ${theme.palette.primary.main}`,
                })}
              >
                <Stack spacing={0.75}>
                  <Chip
                    label="Selected product"
                    size="small"
                    color="primary"
                    variant="outlined"
                    sx={{
                      alignSelf: "flex-start",
                      height: 22,
                      fontSize: "0.7rem",
                      fontWeight: 700,
                      "& .MuiChip-label": { px: 1 },
                    }}
                  />
                  <Typography
                    component="div"
                    variant="subtitle1"
                    sx={{
                      fontWeight: 700,
                      lineHeight: 1.4,
                      fontSize: "0.95rem",
                      color: "text.primary",
                    }}
                  >
                    {formatProductOptionLabel(selProduct)}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500 }}>
                    On hand (all lots):{" "}
                    <Box
                      component="span"
                      sx={{
                        color: "primary.main",
                        fontWeight: 700,
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {onHand}
                    </Box>{" "}
                    {selProduct.unit_of_measure}
                  </Typography>
                </Stack>
              </Paper>
              {loadErr && (
                <Alert severity="warning" onClose={() => setLoadErr(null)}>
                  {loadErr}
                </Alert>
              )}

              <Paper variant="outlined">
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Lot / expiry</TableCell>
                        <TableCell>Batch</TableCell>
                        <TableCell align="right">Qty</TableCell>
                        <TableCell align="right" width={96}>
                          Actions
                        </TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {lots.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={4}>
                            <Typography variant="body2" color="text.secondary">
                              No lots yet — use Stock in to receive with an expiry date.
                            </Typography>
                          </TableCell>
                        </TableRow>
                      ) : (
                        paginatedLots.map((l) => (
                          <TableRow key={l.id}>
                            <TableCell>{l.expiry_date ?? "—"}</TableCell>
                            <TableCell>{l.batch_no ?? "—"}</TableCell>
                            <TableCell align="right">{Number(l.quantity).toFixed(0)}</TableCell>
                            <TableCell align="right">
                              <Tooltip title="Edit lot">
                                <IconButton
                                  size="small"
                                  aria-label="Edit lot"
                                  onClick={() => openEditLot(l)}
                                  disabled={busy || editBusy || deleteBusy}
                                >
                                  <EditOutlinedIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                              <Tooltip title="Delete lot (zero qty, no sales history)">
                                <span>
                                  <IconButton
                                    size="small"
                                    aria-label="Delete lot"
                                    color="error"
                                    onClick={() => {
                                      setDeleteLot(l);
                                      setDeleteErr(null);
                                    }}
                                    disabled={busy || editBusy || deleteBusy}
                                  >
                                    <DeleteOutlineIcon fontSize="small" />
                                  </IconButton>
                                </span>
                              </Tooltip>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>
                {lots.length > 0 && (
                  <TablePagination
                    component="div"
                    count={lots.length}
                    page={lotsPage}
                    onPageChange={(_, newPage) => setLotsPage(newPage)}
                    rowsPerPage={lotsRowsPerPage}
                    onRowsPerPageChange={(e) => {
                      setLotsRowsPerPage(Number.parseInt(e.target.value, 10));
                      setLotsPage(0);
                    }}
                    rowsPerPageOptions={[...LOTS_ROWS_PER_PAGE_OPTIONS]}
                    labelRowsPerPage="Rows per page"
                    sx={{
                      borderTop: 1,
                      borderColor: "divider",
                      "& .MuiTablePagination-toolbar": { textTransform: "none" },
                    }}
                  />
                )}
              </Paper>

              <FormControl>
                <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
                  Adjustment
                </Typography>
                <RadioGroup row value={flow} onChange={(e) => setFlow(e.target.value as "in" | "out")}>
                  <FormControlLabel value="in" control={<Radio />} label="Stock in" />
                  <FormControlLabel value="out" control={<Radio />} label="Stock out" />
                </RadioGroup>
              </FormControl>

              {flow === "in" ? (
                <Stack spacing={2}>
                  <DatePickerField
                    id="pharmacy-stock-expiry"
                    label="Expiry date"
                    required
                    value={expiryYmd}
                    onChange={(e) => setExpiryYmd(e.target.value)}
                    slotProps={{ htmlInput: { min: localDateYmd() } }}
                    helperText="Cannot be earlier than today"
                  />
                  <TextField
                    variant="outlined"
                    label="Quantity in"
                    value={qtyStr}
                    onChange={(e) => setQtyStr(e.target.value.replace(/[^\d.]/g, ""))}
                    fullWidth
                    required
                    InputLabelProps={{ shrink: true }}
                    sx={STOCK_ADJ_OUTLINED_SX}
                  />
                  <TextField
                    variant="outlined"
                    label="Batch no. (optional)"
                    value={batchNo}
                    onChange={(e) => setBatchNo(e.target.value)}
                    fullWidth
                    InputLabelProps={{ shrink: true }}
                    sx={STOCK_ADJ_OUTLINED_SX}
                  />
                  <TextField
                    variant="outlined"
                    label="Unit cost (optional)"
                    value={unitCostStr}
                    onChange={(e) => setUnitCostStr(e.target.value.replace(/[^\d.]/g, ""))}
                    fullWidth
                    InputLabelProps={{ shrink: true }}
                    sx={STOCK_ADJ_OUTLINED_SX}
                  />
                  <Typography variant="subtitle2" sx={{ pt: 0.5 }}>
                    Supplier Delivery Receipt (DR)
                  </Typography>
                  <TextField
                    variant="outlined"
                    label="DR number (optional)"
                    value={drNumber}
                    onChange={(e) => setDrNumber(e.target.value)}
                    fullWidth
                    InputLabelProps={{ shrink: true }}
                    helperText="Delivery Receipt document number from the supplier"
                    sx={STOCK_ADJ_OUTLINED_SX}
                  />
                  <DatePickerField
                    id="pharmacy-stock-dr-date"
                    label="DR date (optional)"
                    value={drDate}
                    onChange={(e) => setDrDate(e.target.value)}
                  />
                  {suppliersLoadErr && (
                    <Alert severity="warning" onClose={() => setSuppliersLoadErr(null)}>
                      Could not load suppliers: {suppliersLoadErr}
                    </Alert>
                  )}
                  {suppliers.length === 0 && !suppliersLoadErr && (
                    <Alert severity="info">
                      Add suppliers under Pharmacy → <strong>Suppliers</strong>, then switch to <strong>Stock out</strong> and back to{" "}
                      <strong>Stock in</strong> to reload the list (or close and reopen this window).
                    </Alert>
                  )}
                  <FormControl fullWidth variant="outlined" sx={STOCK_ADJ_OUTLINED_SX}>
                    <InputLabel id="stock-in-supplier-label" shrink>
                      Supplier (on DR, optional)
                    </InputLabel>
                    <Select
                      labelId="stock-in-supplier-label"
                      label="Supplier (on DR, optional)"
                      notched
                      displayEmpty
                      value={stockInSupplierId === "" ? "" : String(stockInSupplierId)}
                      onChange={(e) => {
                        const v = String(e.target.value);
                        if (v === ADD_NEW_SUPPLIER_SELECT_VALUE) {
                          if (!canManageSuppliers) {
                            setPermDeniedOpen(true);
                            return;
                          }
                          setSuppliersModalOpen(true);
                          return;
                        }
                        setStockInSupplierId(v === "" ? "" : Number.parseInt(v, 10));
                      }}
                    >
                      <MenuItem value="">
                        <em>Select supplier</em>
                      </MenuItem>
                      {suppliers.map((s) => (
                        <MenuItem key={s.id} value={String(s.id)}>
                          {s.name}
                        </MenuItem>
                      ))}
                      {canManageSuppliers ? (
                        <Divider key="__supplier_divider__" component="li" sx={{ my: 0.5 }} />
                      ) : null}
                      {canManageSuppliers ? (
                        <MenuItem key={ADD_NEW_SUPPLIER_SELECT_VALUE} value={ADD_NEW_SUPPLIER_SELECT_VALUE}>
                          Add new supplier…
                        </MenuItem>
                      ) : null}
                    </Select>
                  </FormControl>
                  <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: -1 }}>
                    Pulled from your Suppliers list; the name is saved on the stock-in record.
                  </Typography>
                </Stack>
              ) : (
                <Stack spacing={2}>
                  <FormControl fullWidth variant="outlined">
                    <InputLabel id="lot-out-label">Lot (expiry)</InputLabel>
                    <Select
                      labelId="lot-out-label"
                      label="Lot (expiry)"
                      value={lotIdOut}
                      onChange={(e) => setLotIdOut(String(e.target.value))}
                    >
                      {lots.map((l) => (
                        <MenuItem key={l.id} value={l.id}>
                          {l.expiry_date ?? "No expiry"} · qty {Number(l.quantity)}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  <TextField
                    variant="outlined"
                    label="Quantity out"
                    value={qtyStr}
                    onChange={(e) => setQtyStr(e.target.value.replace(/[^\d.]/g, ""))}
                    fullWidth
                    required
                    InputLabelProps={{ shrink: true }}
                    sx={STOCK_ADJ_OUTLINED_SX}
                  />
                  <FormControl>
                    <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
                      Reason type
                    </Typography>
                    <RadioGroup
                      row
                      value={outKind}
                      onChange={(e) => setOutKind(e.target.value as "EXPIRY" | "STOCK_OUT")}
                    >
                      <FormControlLabel value="EXPIRY" control={<Radio />} label="Expiry / waste" />
                      <FormControlLabel value="STOCK_OUT" control={<Radio />} label="Other out" />
                    </RadioGroup>
                  </FormControl>
                </Stack>
              )}

              <TextField
                variant="outlined"
                label={flow === "in" ? "Note" : "Reason / note"}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                fullWidth
                required={flow === "out"}
                multiline
                minRows={2}
                InputLabelProps={{ shrink: true }}
                sx={STOCK_NOTES_FIELD_SX}
              />

              {actionErr && (
                <Alert severity="error" onClose={() => setActionErr(null)}>
                  {actionErr}
                </Alert>
              )}
            </>
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2, flexShrink: 0 }}>
        <Button onClick={onClose}>Close</Button>
        <Button variant="contained" disabled={!selProduct || busy} onClick={() => void submit()}>
          Save adjustment
        </Button>
      </DialogActions>
    </Dialog>

    <Dialog open={editLot != null} onClose={closeEditLot} maxWidth="sm" fullWidth>
      <DialogTitle>Edit lot</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          <DatePickerField
            id="pharmacy-stock-edit-lot-expiry"
            label="Expiry date (optional)"
            value={editExpiry}
            onChange={(e) => setEditExpiry(e.target.value)}
          />
          <TextField
            variant="outlined"
            label="Batch no. (optional)"
            value={editBatch}
            onChange={(e) => setEditBatch(e.target.value)}
            fullWidth
            InputLabelProps={{ shrink: true }}
            sx={STOCK_ADJ_OUTLINED_SX}
          />
          <TextField
            variant="outlined"
            label="Quantity on hand"
            value={editQty}
            onChange={(e) => setEditQty(e.target.value.replace(/[^\d.]/g, ""))}
            fullWidth
            required
            InputLabelProps={{ shrink: true }}
            helperText="Changes are recorded as stock in or stock out (audit trail)."
            sx={STOCK_ADJ_OUTLINED_SX}
          />
          <TextField
            variant="outlined"
            label="Reason / note"
            value={editNote}
            onChange={(e) => setEditNote(e.target.value)}
            fullWidth
            required
            multiline
            minRows={2}
            InputLabelProps={{ shrink: true }}
            sx={STOCK_NOTES_FIELD_SX}
          />
          {editErr && (
            <Alert severity="error" onClose={() => setEditErr(null)}>
              {editErr}
            </Alert>
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={closeEditLot} disabled={editBusy}>
          Cancel
        </Button>
        <Button variant="contained" disabled={editBusy} onClick={() => void saveEditLot()}>
          {editBusy ? "Saving…" : "Save lot"}
        </Button>
      </DialogActions>
    </Dialog>

    <Dialog
      open={deleteLot != null}
      onClose={() => !deleteBusy && setDeleteLot(null)}
      maxWidth="xs"
      fullWidth
    >
      <DialogTitle>Delete lot?</DialogTitle>
      <DialogContent>
        <Stack spacing={1.5}>
          <Typography variant="body2">
            {deleteLot && (
              <>
                Expiry <strong>{deleteLot.expiry_date ?? "—"}</strong>, batch{" "}
                <strong>{deleteLot.batch_no ?? "—"}</strong>, qty{" "}
                <strong>{Number(deleteLot.quantity).toFixed(0)}</strong>.
              </>
            )}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Only lots with <strong>zero</strong> quantity and no POS sale history can be removed. Otherwise use Edit or
            Stock out to correct quantity.
          </Typography>
          {deleteErr && (
            <Alert severity="error" onClose={() => setDeleteErr(null)}>
              {deleteErr}
            </Alert>
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={() => setDeleteLot(null)} disabled={deleteBusy}>
          Cancel
        </Button>
        <Button variant="contained" color="error" disabled={deleteBusy} onClick={() => void confirmDeleteLot()}>
          {deleteBusy ? "Deleting…" : "Delete"}
        </Button>
      </DialogActions>
    </Dialog>

    <Dialog open={pickOpen} onClose={closePickModal} maxWidth="sm" fullWidth>
      <DialogTitle>Select product</DialogTitle>
      <DialogContent>
        {pickDraft && (
          <Stack spacing={2} sx={{ mt: 0.5 }}>
            <Box>
              <Typography variant="body1" fontWeight={700}>
                {formatProductOptionLabel(pickDraft)}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {[pickDraft.strength, pickDraft.dosage_form].filter(Boolean).join(" · ")} · ₱
                {pickDraft.unit_price.toFixed(2)}
              </Typography>
            </Box>
            <Stack direction="row" spacing={1} alignItems="center">
              {!pickExpiryReady ? (
                <>
                  <CircularProgress size={22} />
                  <Typography variant="body2" color="text.secondary">
                    Loading expiry…
                  </Typography>
                </>
              ) : (
                <Typography variant="body2">{pickExpiryInfo ?? "—"}</Typography>
              )}
            </Stack>
            <TextField
              variant="outlined"
              label="Quantity"
              value={pickQty}
              onChange={(e) => {
                setPickQtyErr(null);
                setPickQty(e.target.value.replace(/\D/g, ""));
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  confirmPickFromModal();
                }
              }}
              fullWidth
              autoFocus
              inputProps={{ inputMode: "numeric", min: 1 }}
              error={Boolean(pickQtyErr)}
              helperText={pickQtyErr ?? undefined}
              InputLabelProps={{ shrink: true }}
              sx={STOCK_ADJ_OUTLINED_SX}
            />
          </Stack>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={closePickModal}>Cancel</Button>
        <Button variant="contained" onClick={() => void confirmPickFromModal()}>
          Continue
        </Button>
      </DialogActions>
    </Dialog>

    <PharmacySuppliersModal
      open={suppliersModalOpen}
      onClose={() => {
        setSuppliersModalOpen(false);
        void loadSuppliers();
      }}
      onSupplierAdded={(id) => {
        setStockInSupplierId(id);
        void loadSuppliers();
        setSuppliersModalOpen(false);
      }}
    />

    <Snackbar
      open={permDeniedOpen}
      autoHideDuration={5000}
      onClose={() => setPermDeniedOpen(false)}
      anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
    >
      <Alert severity="error" variant="filled" onClose={() => setPermDeniedOpen(false)} sx={{ width: "100%" }}>
        {ACTION_PERMISSION_DENIED_MESSAGE}
      </Alert>
    </Snackbar>
    </>
  );
}
