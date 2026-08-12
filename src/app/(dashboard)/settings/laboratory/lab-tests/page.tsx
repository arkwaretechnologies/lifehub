"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type MouseEvent,
  type SetStateAction,
} from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  IconButton,
  InputAdornment,
  InputLabel,
  ListItemText,
  MenuItem,
  Select,
  type SelectChangeEvent,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import SearchIcon from "@mui/icons-material/Search";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import {
  buildPrintLayoutJsonFromFormFields,
  parseResultsPrintLayout,
  printLayoutFormFieldsFromDb,
} from "@/lib/labResultsPrintLayout";
import { splitAllowlistedResultsTemplateCodes } from "@/lib/labResultTemplates";
import type { LabCategoryRow, LabTestCatalogItem } from "@/lib/labTests";
import { filterOrderableLabTests, isNonOrderableResultLine } from "@/lib/labTests";
import { authenticatedFetch } from "@/lib/authenticatedFetch";
import { invalidateLabCatalogCache } from "@/lib/labCatalogCache";

type TestForm = {
  category_id: string;
  code: string;
  name: string;
  description: string;
  specimen_type: string;
  unit: string;
  reference_range: string;
  results_template_code: string;
  turnaround_hours: string;
  price: string;
  requires_fasting: boolean;
  sort_order: string;
  is_active: boolean;
  is_orderable: boolean;
  panel_lab_test_ids: string[];
  print_ref_x: string;
  print_ref_from_top: string;
  print_font_size: string;
  print_max_width: string;
  print_line_height: string;
  print_page_index: string;
};

const emptyForm = (): TestForm => ({
  category_id: "",
  code: "",
  name: "",
  description: "",
  specimen_type: "",
  unit: "",
  reference_range: "",
  results_template_code: "",
  turnaround_hours: "",
  price: "",
  requires_fasting: false,
  sort_order: "",
  is_active: true,
  is_orderable: true,
  panel_lab_test_ids: [],
  print_ref_x: "",
  print_ref_from_top: "",
  print_font_size: "",
  print_max_width: "",
  print_line_height: "",
  print_page_index: "",
});

function rowToForm(r: LabTestCatalogItem, allowedTemplateCodes: ReadonlySet<string>): TestForm {
  const tplCodes = splitAllowlistedResultsTemplateCodes(r.results_template_code, allowedTemplateCodes);
  const layout = printLayoutFormFieldsFromDb(r.results_print_layout);
  return {
    category_id: String(r.category_id ?? ""),
    code: r.code ?? "",
    name: r.name ?? "",
    description: r.description ?? "",
    specimen_type: r.specimen_type ?? "",
    unit: r.unit ?? "",
    reference_range: r.reference_range ?? "",
    results_template_code: tplCodes[0] ?? "",
    turnaround_hours: r.turnaround_hours == null ? "" : String(r.turnaround_hours),
    price: r.price == null || r.price === "" ? "" : String(r.price),
    requires_fasting: r.requires_fasting === true,
    sort_order: r.sort_order == null ? "" : String(r.sort_order),
    is_active: r.is_active !== false,
    is_orderable: r.is_orderable !== false,
    panel_lab_test_ids: r.panel_lab_test_ids ?? [],
    ...layout,
  };
}

const fieldSx = {
  fullWidth: true as const,
  sx: {
    "& .MuiOutlinedInput-root": { minHeight: 44, borderRadius: 2 },
  },
};

type OrderedAsPanelMultiSelectProps = {
  value: string[];
  onChange: (ids: string[]) => void;
  options: LabTestCatalogItem[];
  renderValue: (ids: string[]) => string;
  emptyMessage: string;
  required?: boolean;
};

function OrderedAsPanelMultiSelect({
  value,
  onChange,
  options,
  renderValue,
  emptyMessage,
  required = true,
}: OrderedAsPanelMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string[]>([]);

  const openMenu = () => {
    setDraft([...value]);
    setOpen(true);
  };

  const cancel = (e?: MouseEvent) => {
    e?.stopPropagation();
    setDraft([...value]);
    setOpen(false);
  };

  const confirm = (e?: MouseEvent) => {
    e?.stopPropagation();
    onChange([...draft]);
    setOpen(false);
  };

  const toggleId = (id: string) => {
    setDraft((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  return (
    <FormControl fullWidth required={required} sx={fieldSx.sx}>
      <InputLabel id="lab-test-panel-label">Ordered as</InputLabel>
      <Select<string[]>
        labelId="lab-test-panel-label"
        label="Ordered as"
        multiple
        open={open}
        onOpen={openMenu}
        value={value}
        renderValue={(selected) => renderValue(selected)}
        MenuProps={{
          autoFocus: false,
          PaperProps: { sx: { maxHeight: 360 } },
          onClose: (_e, reason) => {
            if (reason === "backdropClick" || reason === "escapeKeyDown") {
              setDraft([...value]);
            }
            setOpen(false);
          },
        }}
      >
        {options.length === 0 ? (
          <MenuItem value="" disabled>
            {emptyMessage}
          </MenuItem>
        ) : (
          options.map((p) => (
            <MenuItem
              key={p.id}
              value={p.id}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                toggleId(p.id);
              }}
            >
              <Checkbox checked={draft.includes(p.id)} size="small" />
              <ListItemText primary={`${p.code} — ${p.name}`} />
            </MenuItem>
          ))
        )}
        {options.length > 0 ? (
          <MenuItem
            disableRipple
            dense
            sx={{
              opacity: 1,
              borderTop: 1,
              borderColor: "divider",
              "&.Mui-focusVisible": { backgroundColor: "transparent" },
              "&:hover": { backgroundColor: "transparent" },
            }}
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => e.stopPropagation()}
          >
            <Box sx={{ display: "flex", gap: 1, justifyContent: "flex-end", width: "100%", py: 0.5 }}>
              <Button size="small" onClick={cancel}>
                Cancel
              </Button>
              <Button size="small" variant="contained" onClick={confirm}>
                OK
              </Button>
            </Box>
          </MenuItem>
        ) : null}
      </Select>
    </FormControl>
  );
}

const paginationSx = {
  "& .MuiTablePagination-toolbar": { textTransform: "none" as const },
  "& .MuiTablePagination-select": { textTransform: "none" as const },
  "& .MuiTablePagination-selectLabel, & .MuiTablePagination-displayedRows": {
    textTransform: "none" as const,
  },
};

function parseOptionalInt(raw: string): number | null {
  const t = raw.trim();
  if (t === "") return null;
  const n = Number.parseInt(t, 10);
  return Number.isFinite(n) ? n : null;
}

function parseOptionalNumber(raw: string): number | null {
  const t = raw.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export default function SettingsLabTestsPage() {
  const [tests, setTests] = useState<LabTestCatalogItem[]>([]);
  const [categories, setCategories] = useState<LabCategoryRow[]>([]);
  const [resultTemplateCodes, setResultTemplateCodes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState("");

  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState<TestForm>(emptyForm());
  const [addSaving, setAddSaving] = useState(false);
  const [addError, setAddError] = useState("");

  const [editOpen, setEditOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<TestForm>(emptyForm());
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState("");

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<LabTestCatalogItem | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [orderableOnlyFilter, setOrderableOnlyFilter] = useState(false);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  const loadData = useCallback(async () => {
    setListError("");
    setLoading(true);
    try {
      const [cRes, tRes, tplRes] = await Promise.all([
        authenticatedFetch("/api/settings/laboratory/categories"),
        authenticatedFetch("/api/settings/laboratory/lab-tests"),
        authenticatedFetch("/api/laboratory/lab-result-templates"),
      ]);
      const cJson = (await cRes.json().catch(() => null)) as
        | { categories?: LabCategoryRow[]; error?: string }
        | null;
      const tJson = (await tRes.json().catch(() => null)) as
        | { tests?: LabTestCatalogItem[]; error?: string }
        | null;
      const tplJson = (await tplRes.json().catch(() => null)) as
        | { templates?: Array<{ code?: string }>; error?: string }
        | null;

      let errMsg = "";
      if (!cRes.ok || cJson?.error) {
        errMsg = cJson?.error ?? "Failed to load categories.";
        setCategories([]);
      } else {
        setCategories(cJson?.categories ?? []);
      }

      if (!tRes.ok || tJson?.error) {
        errMsg = errMsg || (tJson?.error ?? "Failed to load lab tests.");
        setTests([]);
      } else {
        setTests(tJson?.tests ?? []);
      }

      if (!tplRes.ok || tplJson?.error) {
        errMsg = errMsg || (tplJson?.error ?? "Failed to load result templates.");
        setResultTemplateCodes([]);
      } else {
        setResultTemplateCodes(
          (tplJson?.templates ?? [])
            .map((t) => String(t.code ?? "").trim().toUpperCase())
            .filter(Boolean),
        );
      }

      setListError(errMsg);
    } catch {
      setListError("Failed to load data.");
      setTests([]);
      setCategories([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const allowedTemplateCodeSet = useMemo(
    () => new Set(resultTemplateCodes),
    [resultTemplateCodes],
  );

  const categoryLabel = useCallback(
    (categoryId: number | string) => {
      const id = String(categoryId);
      const c = categories.find((x) => String(x.id) === id);
      return c ? `${c.name} (${c.code})` : id;
    },
    [categories],
  );

  const nonOrderableLines = useMemo(() => tests.filter(isNonOrderableResultLine), [tests]);
  const testById = useMemo(() => new Map(tests.map((t) => [t.id, t])), [tests]);

  const panelLabel = useCallback(
    (panelId: string | null | undefined) => {
      if (!panelId) return "—";
      const p = testById.get(panelId);
      if (!p) return panelId;
      return p.name?.trim() || p.code || panelId;
    },
    [testById],
  );

  const panelLabels = useCallback(
    (panelIds: string[]) => {
      const labels = panelIds.map((id) => panelLabel(id)).filter((l) => l !== "—");
      return labels.length > 0 ? labels.join(", ") : "—";
    },
    [panelLabel],
  );

  const listSourceTests = useMemo(
    () => (orderableOnlyFilter ? filterOrderableLabTests(tests) : tests),
    [tests, orderableOnlyFilter],
  );

  const filteredTests = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return listSourceTests;
    return listSourceTests.filter((t) => {
      const cat = categoryLabel(t.category_id).toLowerCase();
      const hay = [
        t.code,
        t.name,
        t.description,
        t.specimen_type,
        t.unit,
        t.reference_range,
        t.results_template_code,
        String(t.id),
        String(t.price ?? ""),
        t.sort_order != null ? String(t.sort_order) : "",
        cat,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [listSourceTests, searchQuery, categoryLabel]);

  useEffect(() => {
    setPage(0);
  }, [searchQuery]);

  const pagedTests = useMemo(
    () => filteredTests.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage),
    [filteredTests, page, rowsPerPage],
  );

  useEffect(() => {
    const last = Math.max(0, Math.ceil(filteredTests.length / rowsPerPage) - 1);
    if (page > last) setPage(last);
  }, [filteredTests.length, rowsPerPage, page]);

  const openAdd = () => {
    setAddForm(emptyForm());
    setAddError("");
    setAddOpen(true);
  };

  const openEdit = (r: LabTestCatalogItem) => {
    setEditingId(r.id);
    setEditForm(rowToForm(r, allowedTemplateCodeSet));
    setEditError("");
    setEditOpen(true);
  };

  const openDelete = (r: LabTestCatalogItem) => {
    setDeleteTarget(r);
    setDeleteError("");
    setDeleteOpen(true);
  };

  const buildPayloadFromForm = (f: TestForm, existingPrintLayout?: unknown) => {
    const category_id = Number.parseInt(f.category_id, 10);
    if (!Number.isFinite(category_id) || category_id <= 0) {
      return { error: "Select a category." as const };
    }
    const code = f.code.trim();
    const name = f.name.trim();
    if (!code || !name) {
      return { error: "Code and name are required." as const };
    }
    const sort_order = parseOptionalInt(f.sort_order);
    if (f.sort_order.trim() !== "" && sort_order === null) {
      return { error: "Sort order must be a whole number or empty." as const };
    }
    const turnaround_hours = parseOptionalInt(f.turnaround_hours);
    if (f.turnaround_hours.trim() !== "" && turnaround_hours === null) {
      return { error: "Turnaround hours must be a whole number or empty." as const };
    }
    const price = parseOptionalNumber(f.price);
    if (f.price.trim() !== "" && price === null) {
      return { error: "Price must be a valid number or empty." as const };
    }
    if (!f.is_orderable && f.panel_lab_test_ids.length === 0) {
      return {
        error: "Select at least one orderable panel test for non-orderable result lines." as const,
      };
    }

    const existingLayout = existingPrintLayout != null ? parseResultsPrintLayout(existingPrintLayout) : null;
    const layoutBuilt = buildPrintLayoutJsonFromFormFields(
      {
        print_ref_x: f.print_ref_x,
        print_ref_from_top: f.print_ref_from_top,
        print_font_size: f.print_font_size,
        print_max_width: f.print_max_width,
        print_line_height: f.print_line_height,
        print_page_index: f.print_page_index,
      },
      existingLayout,
    );
    if (!layoutBuilt.ok) {
      return { error: layoutBuilt.error };
    }

    const body: Record<string, unknown> = {
      category_id,
      code,
      name,
      description: f.description.trim() || null,
      specimen_type: f.specimen_type.trim() || null,
      unit: f.unit.trim() || null,
      reference_range: f.reference_range.trim() || null,
      results_template_code: f.results_template_code.trim() || null,
      results_print_layout: layoutBuilt.value,
      turnaround_hours,
      price,
      requires_fasting: f.requires_fasting,
      sort_order,
      is_active: f.is_active,
      is_orderable: f.is_orderable,
      panel_lab_test_ids: f.panel_lab_test_ids,
    };
    return { body };
  };

  const handleAddSave = async () => {
    const built = buildPayloadFromForm(addForm);
    if ("error" in built) {
      setAddError(built.error ?? "Invalid form.");
      return;
    }
    setAddSaving(true);
    setAddError("");
    try {
      const res = await authenticatedFetch("/api/settings/laboratory/lab-tests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(built.body),
      });
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok || json?.error) {
        setAddError(json?.error ?? "Could not create lab test.");
        return;
      }
      setAddOpen(false);
      invalidateLabCatalogCache();
      await loadData();
    } catch {
      setAddError("Could not create lab test.");
    } finally {
      setAddSaving(false);
    }
  };

  const handleEditSave = async () => {
    if (editingId == null) return;
    const existingRow = tests.find((r) => r.id === editingId);
    const built = buildPayloadFromForm(editForm, existingRow?.results_print_layout);
    if ("error" in built) {
      setEditError(built.error ?? "Invalid form.");
      return;
    }
    setEditSaving(true);
    setEditError("");
    try {
      const res = await authenticatedFetch(`/api/settings/laboratory/lab-tests/${encodeURIComponent(editingId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(built.body),
      });
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok || json?.error) {
        setEditError(json?.error ?? "Could not update lab test.");
        return;
      }
      setEditOpen(false);
      setEditingId(null);
      invalidateLabCatalogCache();
      await loadData();
    } catch {
      setEditError("Could not update lab test.");
    } finally {
      setEditSaving(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (deleteTarget == null) return;
    const id = deleteTarget.id.trim();
    if (!id) return;
    setDeleteLoading(true);
    setDeleteError("");
    try {
      const res = await authenticatedFetch(`/api/settings/laboratory/lab-tests/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok || json?.error) {
        setDeleteError(json?.error ?? "Could not delete lab test.");
        return;
      }
      setDeleteOpen(false);
      setDeleteTarget(null);
      invalidateLabCatalogCache();
      await loadData();
    } catch {
      setDeleteError("Could not delete lab test.");
    } finally {
      setDeleteLoading(false);
    }
  };

  const orderablePanelOptions = useCallback(
    (form: TestForm, excludeTestId?: string | null) => {
      const catId = form.category_id.trim();
      if (!catId) return [];
      return filterOrderableLabTests(tests).filter(
        (t) =>
          String(t.category_id) === catId &&
          (!excludeTestId || t.id !== excludeTestId),
      );
    },
    [tests],
  );

  const formFields = (
    form: TestForm,
    setForm: Dispatch<SetStateAction<TestForm>>,
    excludeTestId?: string | null,
  ) => {
    const panelOptions = orderablePanelOptions(form, excludeTestId);
    return (
    <Stack spacing={2} sx={{ pt: 0.5 }}>
      <FormControl fullWidth required sx={fieldSx.sx}>
        <InputLabel id="lab-test-category-label">Category</InputLabel>
        <Select
          labelId="lab-test-category-label"
          label="Category"
          value={form.category_id}
          onChange={(e: SelectChangeEvent<string>) =>
            setForm((prev) => ({ ...prev, category_id: e.target.value }))
          }
        >
          {categories.length === 0 ? (
            <MenuItem value="" disabled>
              No categories loaded
            </MenuItem>
          ) : (
            categories.map((c) => (
              <MenuItem key={String(c.id)} value={String(c.id)}>
                {c.name} ({c.code})
              </MenuItem>
            ))
          )}
        </Select>
      </FormControl>
      <TextField
        label="Code"
        required
        value={form.code}
        onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
        {...fieldSx}
      />
      <TextField
        label="Name"
        required
        value={form.name}
        onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
        {...fieldSx}
      />
      <TextField
        label="Description"
        multiline
        minRows={2}
        value={form.description}
        onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
        {...fieldSx}
      />
      <TextField
        label="Specimen type"
        value={form.specimen_type}
        onChange={(e) => setForm((f) => ({ ...f, specimen_type: e.target.value }))}
        {...fieldSx}
      />
      <TextField
        label="Unit"
        value={form.unit}
        onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}
        {...fieldSx}
      />
      <TextField
        label="Reference range"
        value={form.reference_range}
        onChange={(e) => setForm((f) => ({ ...f, reference_range: e.target.value }))}
        {...fieldSx}
      />
      <Typography variant="subtitle2" fontWeight={700} sx={{ pt: 0.5 }}>
        Lab results PDF
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: -1 }}>
        Blank form: templates/Lab Results/LIFEHUB-MEDICAL-Results-&lt;CODE&gt;.pdf. Leave template empty to
        infer from test code. Coordinates use a 612×792 pt page (refFromTop from top edge).
      </Typography>
      <FormControl fullWidth sx={fieldSx.sx}>
        <InputLabel id="lab-test-results-template-label">Results template</InputLabel>
        <Select
          labelId="lab-test-results-template-label"
          label="Results template"
          value={form.results_template_code}
          onChange={(e: SelectChangeEvent<string>) =>
            setForm((prev) => ({ ...prev, results_template_code: e.target.value }))
          }
        >
          <MenuItem value="">
            <em>Infer from test code</em>
          </MenuItem>
          {resultTemplateCodes.map((code) => (
            <MenuItem key={code} value={code}>
              {code}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
        <TextField
          label="Print X (refX)"
          type="number"
          inputProps={{ step: "0.1" }}
          value={form.print_ref_x}
          onChange={(e) => setForm((f) => ({ ...f, print_ref_x: e.target.value }))}
          {...fieldSx}
        />
        <TextField
          label="Print Y from top (refFromTop)"
          type="number"
          inputProps={{ step: "0.1" }}
          value={form.print_ref_from_top}
          onChange={(e) => setForm((f) => ({ ...f, print_ref_from_top: e.target.value }))}
          {...fieldSx}
        />
      </Stack>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
        <TextField
          label="Font size (optional)"
          type="number"
          inputProps={{ step: "0.5" }}
          value={form.print_font_size}
          onChange={(e) => setForm((f) => ({ ...f, print_font_size: e.target.value }))}
          {...fieldSx}
        />
        <TextField
          label="Max width (optional)"
          type="number"
          inputProps={{ step: "1" }}
          value={form.print_max_width}
          onChange={(e) => setForm((f) => ({ ...f, print_max_width: e.target.value }))}
          {...fieldSx}
        />
        <TextField
          label="Line height (optional)"
          type="number"
          inputProps={{ step: "0.5" }}
          value={form.print_line_height}
          onChange={(e) => setForm((f) => ({ ...f, print_line_height: e.target.value }))}
          helperText="Wrapped result line spacing; default ≈ 1.15× font size"
          {...fieldSx}
        />
        <TextField
          label="Page index (optional)"
          type="number"
          inputProps={{ step: 1, min: 0 }}
          value={form.print_page_index}
          onChange={(e) => setForm((f) => ({ ...f, print_page_index: e.target.value }))}
          {...fieldSx}
        />
      </Stack>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
        <TextField
          label="Turnaround (hours)"
          type="number"
          inputProps={{ step: 1 }}
          value={form.turnaround_hours}
          onChange={(e) => setForm((f) => ({ ...f, turnaround_hours: e.target.value }))}
          {...fieldSx}
        />
        <TextField
          label="Price"
          type="number"
          inputProps={{ step: "0.01" }}
          value={form.price}
          onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
          {...fieldSx}
        />
        <TextField
          label="Sort order"
          type="number"
          inputProps={{ step: 1 }}
          value={form.sort_order}
          onChange={(e) => setForm((f) => ({ ...f, sort_order: e.target.value }))}
          {...fieldSx}
        />
      </Stack>
      <FormControlLabel
        control={
          <Switch
            checked={form.requires_fasting}
            onChange={(_, v) => setForm((f) => ({ ...f, requires_fasting: v }))}
          />
        }
        label="Fasting required"
      />
      <FormControlLabel
        control={
          <Switch checked={form.is_active} onChange={(_, v) => setForm((f) => ({ ...f, is_active: v }))} />
        }
        label="Active"
      />
      <FormControlLabel
        control={
          <Switch
            checked={form.is_orderable}
            onChange={(_, v) => setForm((f) => ({ ...f, is_orderable: v }))}
          />
        }
        label="Orderable in consultation and packages"
      />
      <Box>
        <OrderedAsPanelMultiSelect
          value={form.panel_lab_test_ids}
          onChange={(panel_lab_test_ids) => setForm((prev) => ({ ...prev, panel_lab_test_ids }))}
          options={panelOptions}
          renderValue={panelLabels}
          required={!form.is_orderable}
          emptyMessage={
            form.category_id ? "No orderable tests in this category" : "Select a category first"
          }
        />
        {form.is_orderable ? (
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.75 }}>
            Optional: also used as result lines under these panels when a panel is ordered.
          </Typography>
        ) : (
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.75 }}>
            Required for non-orderable result lines.
          </Typography>
        )}
      </Box>
    </Stack>
    );
  };

  return (
    <>
      <Typography variant="h5" sx={{ mb: 2 }}>
        Laboratory — Lab tests
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Manage individual tests in the catalog. Tests referenced on lab requests cannot be deleted until
        those requests are handled; package membership is removed automatically on delete.
      </Typography>

      <Card>
        <CardContent>
          <Stack spacing={2.5} sx={{ mb: 2 }}>
            <Stack
              direction={{ xs: "column", sm: "row" }}
              spacing={2}
              alignItems={{ sm: "center" }}
              justifyContent="space-between"
            >
              <Typography
                component="h2"
                variant="h6"
                fontWeight={700}
                sx={{ fontSize: { xs: "1.2rem", sm: "1.4rem" }, letterSpacing: "-0.01em" }}
              >
                Lab tests
              </Typography>
              <Button
                variant="contained"
                size="medium"
                startIcon={<AddIcon />}
                onClick={openAdd}
                disabled={categories.length === 0}
                sx={{
                  alignSelf: { xs: "stretch", sm: "auto" },
                  py: 1.25,
                  px: 2.5,
                  fontSize: "0.95rem",
                  borderRadius: 999,
                }}
              >
                Add lab test
              </Button>
            </Stack>
            <FormControlLabel
              control={
                <Switch
                  checked={orderableOnlyFilter}
                  onChange={(_, v) => {
                    setOrderableOnlyFilter(v);
                    setPage(0);
                  }}
                />
              }
              label="Show orderable tests only"
            />
            <TextField
              placeholder="Search code, name, category, specimen, unit…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon sx={{ fontSize: 28 }} color="action" />
                    </InputAdornment>
                  ),
                },
              }}
              sx={{
                maxWidth: { xs: "100%", sm: 640, md: 800 },
                "& .MuiOutlinedInput-root": {
                  minHeight: 56,
                  borderRadius: 999,
                  fontSize: "1.0625rem",
                  pl: 1.25,
                },
                "& .MuiOutlinedInput-input": {
                  py: 1.75,
                },
                "& .MuiOutlinedInput-input::placeholder": {
                  fontSize: "1.0625rem",
                  opacity: 0.55,
                },
              }}
            />
          </Stack>

          {categories.length === 0 && !loading ? (
            <Alert severity="warning" sx={{ mb: 2 }}>
              Add at least one category under Laboratory — Categories before creating lab tests.
            </Alert>
          ) : null}

          {listError ? (
            <Alert severity="error" sx={{ mb: 2 }}>
              {listError}
            </Alert>
          ) : null}

          {loading ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
              <CircularProgress size={32} />
            </Box>
          ) : (
            <TableContainer sx={{ maxWidth: "100%", overflowX: "auto" }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Code</TableCell>
                    <TableCell>Name</TableCell>
                    <TableCell>Category</TableCell>
                    <TableCell>Specimen</TableCell>
                    <TableCell>Unit</TableCell>
                    <TableCell>Template</TableCell>
                    <TableCell align="right">Price</TableCell>
                    <TableCell align="center">Fasting</TableCell>
                    <TableCell align="right">Sort</TableCell>
                    <TableCell align="center">Orderable</TableCell>
                    <TableCell>Ordered as</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell align="right" width={100}>
                      Actions
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {tests.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={13}>
                        <Typography variant="body2" color="text.secondary">
                          No lab tests yet. Add one to get started.
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ) : filteredTests.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={13}>
                        <Typography variant="body2" color="text.secondary">
                          No tests match your search. Try a different term.
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ) : (
                    pagedTests.map((r) => (
                      <TableRow key={r.id} hover>
                        <TableCell sx={{ fontFamily: "monospace", fontWeight: 600, whiteSpace: "nowrap" }}>
                          {r.code}
                        </TableCell>
                        <TableCell sx={{ minWidth: 160 }}>{r.name}</TableCell>
                        <TableCell sx={{ whiteSpace: "nowrap", color: "text.secondary" }}>
                          {categoryLabel(r.category_id)}
                        </TableCell>
                        <TableCell sx={{ maxWidth: 120 }}>{r.specimen_type ?? "—"}</TableCell>
                        <TableCell>{r.unit ?? "—"}</TableCell>
                        <TableCell sx={{ whiteSpace: "nowrap", fontFamily: "monospace", fontSize: "0.8rem" }}>
                          {splitAllowlistedResultsTemplateCodes(r.results_template_code, allowedTemplateCodeSet)[0] ??
                            "—"}
                        </TableCell>
                        <TableCell align="right">{r.price != null && r.price !== "" ? String(r.price) : "—"}</TableCell>
                        <TableCell align="center">
                          {r.requires_fasting ? (
                            <Chip label="Yes" size="small" variant="outlined" />
                          ) : (
                            <Chip label="No" size="small" variant="outlined" />
                          )}
                        </TableCell>
                        <TableCell align="right">{r.sort_order ?? "—"}</TableCell>
                        <TableCell align="center">
                          {r.is_orderable !== false ? (
                            <Chip label="Yes" size="small" color="primary" variant="outlined" />
                          ) : (
                            <Chip label="No" size="small" variant="outlined" />
                          )}
                        </TableCell>
                        <TableCell sx={{ maxWidth: 200 }}>
                          {panelLabels(r.panel_lab_test_ids ?? [])}
                        </TableCell>
                        <TableCell>
                          {r.is_active !== false ? (
                            <Chip label="Active" size="small" color="success" variant="outlined" />
                          ) : (
                            <Chip label="Inactive" size="small" variant="outlined" />
                          )}
                        </TableCell>
                        <TableCell align="right">
                          <Tooltip title="Edit">
                            <IconButton size="small" onClick={() => openEdit(r)} aria-label="Edit">
                              <EditIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Delete">
                            <IconButton
                              size="small"
                              color="error"
                              onClick={() => openDelete(r)}
                              aria-label="Delete"
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          )}
          {!loading && filteredTests.length > 0 ? (
            <TablePagination
              component="div"
              count={filteredTests.length}
              page={page}
              onPageChange={(_, p) => setPage(p)}
              rowsPerPage={rowsPerPage}
              rowsPerPageOptions={[5, 10, 25, 50]}
              onRowsPerPageChange={(e) => {
                const n = Number.parseInt(String(e.target.value ?? "10"), 10);
                setRowsPerPage(Number.isFinite(n) && n > 0 ? n : 10);
                setPage(0);
              }}
              labelRowsPerPage="Rows per page"
              sx={{ mt: 1, ...paginationSx }}
            />
          ) : null}
          {!loading && nonOrderableLines.length > 0 ? (
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 2 }}>
              {nonOrderableLines.length} non-orderable result-line test
              {nonOrderableLines.length === 1 ? "" : "s"} appear in this list for configuration; they are used
              on the Lab Results form and ordered via their panel test in consultation.
            </Typography>
          ) : null}
        </CardContent>
      </Card>

      <Dialog open={addOpen} onClose={() => !addSaving && setAddOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>Add lab test</DialogTitle>
        <DialogContent>{formFields(addForm, setAddForm)}</DialogContent>
        {addError ? (
          <Box sx={{ px: 3, pb: 0 }}>
            <Alert severity="error">{addError}</Alert>
          </Box>
        ) : null}
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setAddOpen(false)} disabled={addSaving}>
            Cancel
          </Button>
          <Button variant="contained" onClick={() => void handleAddSave()} disabled={addSaving}>
            {addSaving ? <CircularProgress size={22} /> : "Save"}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={editOpen} onClose={() => !editSaving && setEditOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>Edit lab test</DialogTitle>
        <DialogContent>{formFields(editForm, setEditForm, editingId)}</DialogContent>
        {editError ? (
          <Box sx={{ px: 3, pb: 0 }}>
            <Alert severity="error">{editError}</Alert>
          </Box>
        ) : null}
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setEditOpen(false)} disabled={editSaving}>
            Cancel
          </Button>
          <Button variant="contained" onClick={() => void handleEditSave()} disabled={editSaving}>
            {editSaving ? <CircularProgress size={22} /> : "Save changes"}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={deleteOpen} onClose={() => !deleteLoading && setDeleteOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Delete lab test</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            Delete{" "}
            <Typography component="span" fontWeight={700}>
              {deleteTarget?.name ?? deleteTarget?.code}
            </Typography>
            ? This cannot be undone.
          </Typography>
          {deleteError ? (
            <Alert severity="error" sx={{ mt: 2 }}>
              {deleteError}
            </Alert>
          ) : null}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDeleteOpen(false)} disabled={deleteLoading}>
            Cancel
          </Button>
          <Button
            color="error"
            variant="contained"
            onClick={() => void handleDeleteConfirm()}
            disabled={deleteLoading}
          >
            {deleteLoading ? <CircularProgress size={22} color="inherit" /> : "Delete"}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
