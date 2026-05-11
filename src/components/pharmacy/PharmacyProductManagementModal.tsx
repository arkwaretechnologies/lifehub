"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  MenuItem,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  Tabs,
  TextField,
  Typography,
  Paper,
  FormControlLabel,
  Switch,
} from "@mui/material";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import SaveOutlinedIcon from "@mui/icons-material/SaveOutlined";
import CloseOutlinedIcon from "@mui/icons-material/CloseOutlined";
import VisibilityOffOutlinedIcon from "@mui/icons-material/VisibilityOffOutlined";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import {
  deletePharmacyCategoryIfNoProducts,
  fetchProductCountsByPharmacyCategory,
  insertPharmacyCategory,
  insertProductForPos,
  listPharmacyCategories,
  listSuppliers,
  updatePharmacyCategory,
  type PharmacyCategoryRow,
  type SupplierRow,
} from "@/lib/pharmacyPosDb";

/** Outlined fields: stable label notch + aligned text (avoids label clipping on Select / number rows). */
const ITEM_FORM_FIELD_SX = {
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
  "& .MuiSelect-select": {
    display: "flex",
    alignItems: "center",
    minHeight: "1.5em",
    py: 1.25,
    boxSizing: "border-box",
  },
} as const;

/** Categories row + table editors: small inputs, vertically centered text. */
const CAT_FIELD_SX = {
  "& .MuiOutlinedInput-root": {
    minHeight: 40,
    alignItems: "center",
  },
  "& .MuiInputBase-input": {
    py: 1,
    fontSize: "0.875rem",
    lineHeight: 1.43,
    boxSizing: "border-box",
  },
} as const;

/** Derive a short uppercase code from the display name (e.g. "OTC / Wellness" → "OTC_WELLNESS"). */
function suggestCategoryCodeFromName(name: string): string {
  const raw = name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
  if (!raw) return "";
  return raw.slice(0, 32);
}

const PHARMACY_UNITS = [
  "tablet",
  "capsule",
  "softgel",
  "ampule",
  "vial",
  "bottle",
  "sachet",
  "tube",
  "patch",
  "drop",
  "spray",
  "inhaler",
  "suppository",
  "syringe",
  "mL",
  "L",
  "g",
  "mg",
  "mcg",
  "IU",
  "unit",
  "piece",
  "kit",
  "box",
  "pack",
] as const;

const CATEGORY_ROWS_PER_PAGE_OPTIONS = [5, 10, 25] as const;

type Props = {
  open: boolean;
  onClose: () => void;
};

export default function PharmacyProductManagementModal({ open, onClose }: Props) {
  const [tab, setTab] = useState(0);

  const [categories, setCategories] = useState<PharmacyCategoryRow[]>([]);
  const [catLoading, setCatLoading] = useState(false);
  const [categoriesLoadError, setCategoriesLoadError] = useState<string | null>(null);
  const [catMsg, setCatMsg] = useState<string | null>(null);
  const [newCatCode, setNewCatCode] = useState("");
  const [newCatName, setNewCatName] = useState("");
  /** User edited Code — stop overwriting from Name until next clear / save. */
  const [newCatCodeManual, setNewCatCodeManual] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editCode, setEditCode] = useState("");
  const [editName, setEditName] = useState("");
  const [catPage, setCatPage] = useState(0);
  const [catRowsPerPage, setCatRowsPerPage] = useState(10);
  /** Products per category — for delete button enable/disable (server re-checks on delete). */
  const [productCountByCategoryId, setProductCountByCategoryId] = useState<Record<number, number>>({});

  const [prodCategoryId, setProdCategoryId] = useState<number | "">("");
  const [prodBarcode, setProdBarcode] = useState("");
  const [prodGeneric, setProdGeneric] = useState("");
  const [prodBrand, setProdBrand] = useState("");
  const [prodStrength, setProdStrength] = useState("");
  const [prodDosageForm, setProdDosageForm] = useState("");
  const [prodUom, setProdUom] = useState<string>("tablet");
  const [prodCost, setProdCost] = useState("");
  const [prodRetail, setProdRetail] = useState("");
  const [prodMsg, setProdMsg] = useState<string | null>(null);
  const [suppliers, setSuppliers] = useState<SupplierRow[]>([]);
  const [suppliersLoadError, setSuppliersLoadError] = useState<string | null>(null);
  const [prodDescription, setProdDescription] = useState("");
  const [prodSupplierId, setProdSupplierId] = useState<number | "">("");
  const [prodRequiresRx, setProdRequiresRx] = useState(false);
  const [prodReorderLevel, setProdReorderLevel] = useState("");
  const [prodReorderQty, setProdReorderQty] = useState("");
  const [prodVatExempt, setProdVatExempt] = useState(false);
  const [prodVatRate, setProdVatRate] = useState("12");
  const [prodIsActive, setProdIsActive] = useState(true);

  const loadSuppliers = useCallback(async () => {
    const { rows, error } = await listSuppliers();
    if (error) {
      setSuppliersLoadError(error);
      setSuppliers([]);
      return;
    }
    setSuppliersLoadError(null);
    setSuppliers(rows.filter((s) => s.is_active !== false));
  }, []);

  const loadCategories = useCallback(async () => {
    setCatLoading(true);
    setCategoriesLoadError(null);
    const [{ rows, error }, countsRes] = await Promise.all([
      listPharmacyCategories(),
      fetchProductCountsByPharmacyCategory(),
    ]);
    setCatLoading(false);
    if (error) {
      setCategoriesLoadError(error);
      setCategories([]);
      setProductCountByCategoryId({});
      return;
    }
    setCategoriesLoadError(null);
    setCategories(rows);
    setProductCountByCategoryId(countsRes.error ? {} : countsRes.countsByCategoryId);
  }, []);

  useEffect(() => {
    if (!open) return;
    void loadCategories();
    void loadSuppliers();
  }, [open, loadCategories, loadSuppliers]);

  /** Refetch whenever the Categories tab is shown (fresh list from DB). */
  useEffect(() => {
    if (!open || tab !== 1) return;
    void loadCategories();
  }, [open, tab, loadCategories]);

  /** Refresh suppliers when Item setup is visible (e.g. after adding one from Suppliers modal elsewhere). */
  useEffect(() => {
    if (!open || tab !== 0) return;
    void loadSuppliers();
  }, [open, tab, loadSuppliers]);

  const paginatedCategories = useMemo(() => {
    const start = catPage * catRowsPerPage;
    return categories.slice(start, start + catRowsPerPage);
  }, [categories, catPage, catRowsPerPage]);

  useEffect(() => {
    const pageCount = Math.max(1, Math.ceil(categories.length / catRowsPerPage));
    const lastPage = pageCount - 1;
    if (catPage > lastPage) setCatPage(lastPage);
  }, [categories.length, catRowsPerPage, catPage]);

  useEffect(() => {
    if (!open || categories.length === 0 || prodCategoryId !== "") return;
    setProdCategoryId(categories[0]!.id);
  }, [open, categories, prodCategoryId]);

  useEffect(() => {
    if (!open) {
      setTab(0);
      setNewCatCode("");
      setNewCatName("");
      setNewCatCodeManual(false);
      setEditingId(null);
      setProdBarcode("");
      setProdGeneric("");
      setProdBrand("");
      setProdStrength("");
      setProdDosageForm("");
      setProdUom("tablet");
      setProdCost("");
      setProdRetail("");
      setProdMsg(null);
      setSuppliers([]);
      setSuppliersLoadError(null);
      setProdDescription("");
      setProdSupplierId("");
      setProdRequiresRx(false);
      setProdReorderLevel("");
      setProdReorderQty("");
      setProdVatExempt(false);
      setProdVatRate("12");
      setProdIsActive(true);
      setCatMsg(null);
      setCategoriesLoadError(null);
      setCatLoading(false);
      setCatPage(0);
      setCatRowsPerPage(10);
      setProductCountByCategoryId({});
    }
  }, [open]);

  const saveNewCategory = async () => {
    const e = await insertPharmacyCategory({ code: newCatCode, name: newCatName });
    setCatMsg(e.error ?? "Saved.");
    setNewCatCode("");
    setNewCatName("");
    setNewCatCodeManual(false);
    await loadCategories();
  };

  const startEdit = (c: PharmacyCategoryRow) => {
    setEditingId(c.id);
    setEditCode(c.code);
    setEditName(c.name);
  };

  const saveEdit = async () => {
    if (editingId == null) return;
    const e = await updatePharmacyCategory(editingId, { code: editCode, name: editName });
    setCatMsg(e.error ?? "Updated.");
    setEditingId(null);
    await loadCategories();
  };

  const deactivateCategory = async (c: PharmacyCategoryRow) => {
    const e = await updatePharmacyCategory(c.id, { is_active: false });
    setCatMsg(e.error ?? "Category hidden.");
    await loadCategories();
  };

  const activateCategory = async (c: PharmacyCategoryRow) => {
    const e = await updatePharmacyCategory(c.id, { is_active: true });
    setCatMsg(e.error ?? "Category is active again.");
    await loadCategories();
  };

  const tryDeleteCategory = async (c: PharmacyCategoryRow) => {
    const linked = productCountByCategoryId[c.id] ?? 0;
    if (linked > 0) {
      setCatMsg(`Cannot delete: ${linked} product(s) are linked to this category.`);
      return;
    }
    if (!window.confirm(`Delete category “${c.name}” (${c.code})? This cannot be undone.`)) return;
    const e = await deletePharmacyCategoryIfNoProducts(c.id);
    if (e.error) {
      setCatMsg(e.error);
      await loadCategories();
      return;
    }
    setCatMsg("Category deleted.");
    if (prodCategoryId === c.id) setProdCategoryId("");
    setEditingId(null);
    await loadCategories();
  };

  const saveProduct = async () => {
    if (prodCategoryId === "") {
      setProdMsg("Choose a category.");
      return;
    }
    const cost = Number(prodCost);
    const retail = Number(prodRetail);
    if (!prodGeneric.trim()) {
      setProdMsg("Item name (generic) is required.");
      return;
    }
    if (!Number.isFinite(retail) || retail < 0) {
      setProdMsg("Valid retail price is required.");
      return;
    }
    const uc = Number.isFinite(cost) && cost >= 0 ? cost : retail * 0.7;
    const rl =
      prodReorderLevel.trim() === "" ? null : Number.parseInt(prodReorderLevel.trim(), 10);
    const rq =
      prodReorderQty.trim() === "" ? null : Number.parseInt(prodReorderQty.trim(), 10);
    if (prodReorderLevel.trim() !== "" && (!Number.isFinite(rl) || (rl as number) < 0)) {
      setProdMsg("Reorder level must be a non-negative whole number.");
      return;
    }
    if (prodReorderQty.trim() !== "" && (!Number.isFinite(rq) || (rq as number) < 0)) {
      setProdMsg("Reorder quantity must be a non-negative whole number.");
      return;
    }
    let vatRateNum: number | null = null;
    if (!prodVatExempt) {
      vatRateNum = Number.parseFloat(prodVatRate.replace(",", "."));
      if (!Number.isFinite(vatRateNum) || vatRateNum < 0 || vatRateNum > 100) {
        setProdMsg("VAT rate must be between 0 and 100 (percent).");
        return;
      }
    }
    const r = await insertProductForPos({
      categoryId: prodCategoryId as number,
      genericName: prodGeneric.trim(),
      brandName: prodBrand.trim() || null,
      strength: prodStrength.trim() || null,
      dosageForm: prodDosageForm.trim() || null,
      description: prodDescription.trim() || null,
      unitOfMeasure: prodUom,
      unitPrice: retail,
      unitCost: uc,
      barcode: prodBarcode.trim() || null,
      supplierId: prodSupplierId === "" ? null : prodSupplierId,
      requiresPrescription: prodRequiresRx,
      reorderLevel: rl,
      reorderQuantity: rq,
      vatExempt: prodVatExempt,
      vatRate: prodVatExempt ? 0 : vatRateNum,
      isActive: prodIsActive,
    });
    setProdMsg(r.error ?? "Product added.");
    if (!r.error) {
      setProdBarcode("");
      setProdGeneric("");
      setProdBrand("");
      setProdStrength("");
      setProdDosageForm("");
      setProdDescription("");
      setProdSupplierId("");
      setProdRequiresRx(false);
      setProdReorderLevel("");
      setProdReorderQty("");
      setProdVatExempt(false);
      setProdVatRate("12");
      setProdIsActive(true);
      setProdCost("");
      setProdRetail("");
      void loadCategories();
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle>Product Management</DialogTitle>
      <DialogContent sx={{ overflow: "visible", pt: 1 }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ borderBottom: 1, borderColor: "divider", mb: 2 }}>
          <Tab label="Item setup" />
          <Tab label="Categories" />
        </Tabs>

        {tab === 0 && (
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Typography variant="body2" color="text.secondary">
              Fields match the products table: category, supplier, identifiers, pricing, VAT, reorder, and flags.
            </Typography>
            {suppliersLoadError && (
              <Alert severity="warning" onClose={() => setSuppliersLoadError(null)}>
                Could not load suppliers: {suppliersLoadError}
              </Alert>
            )}
            <TextField
              select
              variant="outlined"
              label="Category"
              value={prodCategoryId === "" ? "" : prodCategoryId}
              onChange={(e) => setProdCategoryId(Number(e.target.value))}
              fullWidth
              required
              InputLabelProps={{ shrink: true }}
              SelectProps={{ displayEmpty: true }}
              sx={ITEM_FORM_FIELD_SX}
            >
              <MenuItem value="" disabled>
                Select category
              </MenuItem>
              {categories.filter((c) => c.is_active !== false).map((c) => (
                <MenuItem key={c.id} value={c.id}>
                  {c.name} ({c.code})
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              variant="outlined"
              label="Supplier (optional)"
              value={prodSupplierId === "" ? "" : prodSupplierId}
              onChange={(e) => {
                const v = e.target.value;
                setProdSupplierId(v === "" ? "" : Number(v));
              }}
              fullWidth
              InputLabelProps={{ shrink: true }}
              SelectProps={{ displayEmpty: true }}
              sx={ITEM_FORM_FIELD_SX}
            >
              <MenuItem value="">
                <em>None</em>
              </MenuItem>
              {suppliers.map((s) => (
                <MenuItem key={s.id} value={s.id}>
                  {s.name}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              variant="outlined"
              label="Barcode"
              value={prodBarcode}
              onChange={(e) => setProdBarcode(e.target.value)}
              fullWidth
              InputLabelProps={{ shrink: true }}
              sx={ITEM_FORM_FIELD_SX}
            />
            <TextField
              variant="outlined"
              label="Item name (generic)"
              value={prodGeneric}
              onChange={(e) => setProdGeneric(e.target.value)}
              fullWidth
              required
              InputLabelProps={{ shrink: true }}
              sx={ITEM_FORM_FIELD_SX}
            />
            <TextField
              variant="outlined"
              label="Brand (optional)"
              value={prodBrand}
              onChange={(e) => setProdBrand(e.target.value)}
              fullWidth
              InputLabelProps={{ shrink: true }}
              sx={ITEM_FORM_FIELD_SX}
            />
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField
                variant="outlined"
                label="Strength (optional)"
                value={prodStrength}
                onChange={(e) => setProdStrength(e.target.value)}
                fullWidth
                InputLabelProps={{ shrink: true }}
                sx={ITEM_FORM_FIELD_SX}
              />
              <TextField
                variant="outlined"
                label="Dosage form (optional)"
                value={prodDosageForm}
                onChange={(e) => setProdDosageForm(e.target.value)}
                fullWidth
                placeholder="e.g. tablet, syrup"
                InputLabelProps={{ shrink: true }}
                sx={ITEM_FORM_FIELD_SX}
              />
            </Stack>
            <TextField
              select
              variant="outlined"
              label="Unit of measure"
              value={prodUom}
              onChange={(e) => setProdUom(e.target.value)}
              fullWidth
              InputLabelProps={{ shrink: true }}
              sx={ITEM_FORM_FIELD_SX}
            >
              {PHARMACY_UNITS.map((u) => (
                <MenuItem key={u} value={u}>
                  {u}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              variant="outlined"
              label="Description (optional)"
              value={prodDescription}
              onChange={(e) => setProdDescription(e.target.value)}
              fullWidth
              multiline
              minRows={2}
              InputLabelProps={{ shrink: true }}
              sx={ITEM_FORM_FIELD_SX}
            />
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems="flex-start">
              <TextField
                variant="outlined"
                label="Reorder level (optional)"
                value={prodReorderLevel}
                onChange={(e) => setProdReorderLevel(e.target.value.replace(/\D/g, ""))}
                fullWidth
                helperText="Alert when on-hand falls at or below this"
                InputLabelProps={{ shrink: true }}
                sx={ITEM_FORM_FIELD_SX}
              />
              <TextField
                variant="outlined"
                label="Reorder quantity (optional)"
                value={prodReorderQty}
                onChange={(e) => setProdReorderQty(e.target.value.replace(/\D/g, ""))}
                fullWidth
                helperText="Suggested order size when restocking"
                InputLabelProps={{ shrink: true }}
                sx={ITEM_FORM_FIELD_SX}
              />
            </Stack>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems="center" flexWrap="wrap">
              <FormControlLabel
                control={
                  <Switch checked={prodIsActive} onChange={(_, c) => setProdIsActive(c)} color="primary" />
                }
                label="Active (sellable)"
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={prodRequiresRx}
                    onChange={(_, c) => setProdRequiresRx(c)}
                    color="primary"
                  />
                }
                label="Requires prescription"
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={prodVatExempt}
                    onChange={(_, c) => {
                      setProdVatExempt(c);
                      if (c) setProdVatRate("0");
                      else if (prodVatRate === "0" || prodVatRate === "") setProdVatRate("12");
                    }}
                    color="primary"
                  />
                }
                label="VAT exempt"
              />
              <TextField
                variant="outlined"
                label="VAT rate (%)"
                value={prodVatRate}
                onChange={(e) => setProdVatRate(e.target.value.replace(/[^\d.,]/g, ""))}
                disabled={prodVatExempt}
                sx={{ ...ITEM_FORM_FIELD_SX, width: { xs: "100%", sm: 160 } }}
                InputLabelProps={{ shrink: true }}
                helperText={prodVatExempt ? "0% when exempt" : "Percent, e.g. 12"}
              />
            </Stack>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems="flex-start">
              <TextField
                variant="outlined"
                label="Cost (PHP)"
                value={prodCost}
                onChange={(e) => setProdCost(e.target.value.replace(/[^\d.]/g, ""))}
                fullWidth
                helperText="Optional — defaults to 70% of retail if empty"
                InputLabelProps={{ shrink: true }}
                sx={ITEM_FORM_FIELD_SX}
              />
              <TextField
                variant="outlined"
                label="Retail price (PHP)"
                value={prodRetail}
                onChange={(e) => setProdRetail(e.target.value.replace(/[^\d.]/g, ""))}
                fullWidth
                required
                InputLabelProps={{ shrink: true }}
                sx={ITEM_FORM_FIELD_SX}
              />
            </Stack>
            {prodMsg && (
              <Alert severity={prodMsg === "Product added." ? "success" : "error"} onClose={() => setProdMsg(null)}>
                {prodMsg}
              </Alert>
            )}
            <Button variant="contained" onClick={() => void saveProduct()}>
              Save product
            </Button>
          </Stack>
        )}

        {tab === 1 && (
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Typography variant="subtitle2" fontWeight={700}>
              New category
            </Typography>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1} alignItems={{ sm: "center" }}>
              <TextField
                variant="outlined"
                label="Code"
                size="small"
                value={newCatCode}
                onChange={(e) => {
                  setNewCatCodeManual(true);
                  setNewCatCode(e.target.value.toUpperCase());
                }}
                InputLabelProps={{ shrink: true }}
                sx={{ ...CAT_FIELD_SX, width: { xs: "100%", sm: 160 } }}
              />
              <TextField
                variant="outlined"
                label="Name"
                size="small"
                value={newCatName}
                onChange={(e) => {
                  const v = e.target.value;
                  setNewCatName(v);
                  if (v.trim() === "") {
                    setNewCatCodeManual(false);
                    setNewCatCode("");
                    return;
                  }
                  if (!newCatCodeManual) {
                    setNewCatCode(suggestCategoryCodeFromName(v));
                  }
                }}
                fullWidth
                InputLabelProps={{ shrink: true }}
                sx={CAT_FIELD_SX}
              />
              <Button variant="outlined" onClick={() => void saveNewCategory()}>
                Add
              </Button>
            </Stack>
            {categoriesLoadError && (
              <Alert severity="error" onClose={() => setCategoriesLoadError(null)}>
                Could not load categories: {categoriesLoadError}
              </Alert>
            )}
            {catMsg && <Alert severity="info">{catMsg}</Alert>}
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Code</TableCell>
                    <TableCell>Name</TableCell>
                    <TableCell align="right">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {catLoading && (
                    <TableRow>
                      <TableCell colSpan={3} align="center" sx={{ py: 3 }}>
                        <CircularProgress size={28} />
                      </TableCell>
                    </TableRow>
                  )}
                  {!catLoading &&
                    paginatedCategories.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell>
                        {editingId === c.id ? (
                          <TextField
                            variant="outlined"
                            size="small"
                            hiddenLabel
                            placeholder="Code"
                            value={editCode}
                            onChange={(e) => setEditCode(e.target.value)}
                            fullWidth
                            sx={CAT_FIELD_SX}
                          />
                        ) : (
                          c.code
                        )}
                      </TableCell>
                      <TableCell>
                        {editingId === c.id ? (
                          <TextField
                            variant="outlined"
                            size="small"
                            hiddenLabel
                            placeholder="Name"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            fullWidth
                            sx={CAT_FIELD_SX}
                          />
                        ) : (
                          <>
                            {c.name}
                            {c.is_active === false && (
                              <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                                (inactive)
                              </Typography>
                            )}
                          </>
                        )}
                      </TableCell>
                      <TableCell align="right">
                        {editingId === c.id ? (
                          <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                            <IconButton size="small" color="primary" onClick={() => void saveEdit()}>
                              <SaveOutlinedIcon fontSize="small" />
                            </IconButton>
                            <IconButton size="small" onClick={() => setEditingId(null)}>
                              <CloseOutlinedIcon fontSize="small" />
                            </IconButton>
                          </Stack>
                        ) : (
                          <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                            <IconButton size="small" onClick={() => startEdit(c)} title="Edit category">
                              <EditOutlinedIcon fontSize="small" />
                            </IconButton>
                            {c.is_active === false ? (
                              <IconButton
                                size="small"
                                color="primary"
                                onClick={() => void activateCategory(c)}
                                title="Show category again"
                              >
                                <VisibilityOutlinedIcon fontSize="small" />
                              </IconButton>
                            ) : (
                              <IconButton
                                size="small"
                                color="warning"
                                onClick={() => void deactivateCategory(c)}
                                title="Hide category"
                              >
                                <VisibilityOffOutlinedIcon fontSize="small" />
                              </IconButton>
                            )}
                            <IconButton
                              size="small"
                              color="error"
                              onClick={() => void tryDeleteCategory(c)}
                              disabled={(productCountByCategoryId[c.id] ?? 0) > 0}
                              title={
                                (productCountByCategoryId[c.id] ?? 0) > 0
                                  ? "Cannot delete: products are linked to this category"
                                  : "Delete category"
                              }
                            >
                              <DeleteOutlineIcon fontSize="small" />
                            </IconButton>
                          </Stack>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {!catLoading && categories.length === 0 && !categoriesLoadError && (
                    <TableRow>
                      <TableCell colSpan={3}>
                        <Typography variant="body2" color="text.secondary">
                          No categories yet — add one above.
                        </Typography>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
            <TablePagination
              component="div"
              count={categories.length}
              page={catPage}
              onPageChange={(_, newPage) => {
                setEditingId(null);
                setCatPage(newPage);
              }}
              rowsPerPage={catRowsPerPage}
              onRowsPerPageChange={(e) => {
                setEditingId(null);
                setCatRowsPerPage(Number.parseInt(e.target.value, 10));
                setCatPage(0);
              }}
              rowsPerPageOptions={[...CATEGORY_ROWS_PER_PAGE_OPTIONS]}
              labelRowsPerPage="Rows per page"
              sx={{
                "& .MuiTablePagination-toolbar": { textTransform: "none" },
                "& .MuiTablePagination-select": { textTransform: "none" },
                "& .MuiTablePagination-selectLabel, & .MuiTablePagination-displayedRows": {
                  textTransform: "none",
                },
              }}
            />
          </Stack>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
