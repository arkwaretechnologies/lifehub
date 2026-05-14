"use client";

import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
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
import type { LabCategoryRow, LabTestCatalogItem } from "@/lib/labTests";

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
});

function rowToForm(r: LabTestCatalogItem): TestForm {
  return {
    category_id: String(r.category_id ?? ""),
    code: r.code ?? "",
    name: r.name ?? "",
    description: r.description ?? "",
    specimen_type: r.specimen_type ?? "",
    unit: r.unit ?? "",
    reference_range: r.reference_range ?? "",
    results_template_code: r.results_template_code ?? "",
    turnaround_hours: r.turnaround_hours == null ? "" : String(r.turnaround_hours),
    price: r.price == null || r.price === "" ? "" : String(r.price),
    requires_fasting: r.requires_fasting === true,
    sort_order: r.sort_order == null ? "" : String(r.sort_order),
    is_active: r.is_active !== false,
  };
}

const fieldSx = {
  fullWidth: true as const,
  sx: {
    "& .MuiOutlinedInput-root": { minHeight: 44, borderRadius: 2 },
  },
};

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
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  const loadData = useCallback(async () => {
    setListError("");
    setLoading(true);
    try {
      const [cRes, tRes] = await Promise.all([
        fetch("/api/settings/laboratory/categories"),
        fetch("/api/settings/laboratory/lab-tests"),
      ]);
      const cJson = (await cRes.json().catch(() => null)) as
        | { categories?: LabCategoryRow[]; error?: string }
        | null;
      const tJson = (await tRes.json().catch(() => null)) as
        | { tests?: LabTestCatalogItem[]; error?: string }
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

  const categoryLabel = useCallback(
    (categoryId: number | string) => {
      const id = String(categoryId);
      const c = categories.find((x) => String(x.id) === id);
      return c ? `${c.name} (${c.code})` : id;
    },
    [categories],
  );

  const filteredTests = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return tests;
    return tests.filter((t) => {
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
  }, [tests, searchQuery, categoryLabel]);

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
    setEditForm(rowToForm(r));
    setEditError("");
    setEditOpen(true);
  };

  const openDelete = (r: LabTestCatalogItem) => {
    setDeleteTarget(r);
    setDeleteError("");
    setDeleteOpen(true);
  };

  const buildPayloadFromForm = (f: TestForm) => {
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
    const body: Record<string, unknown> = {
      category_id,
      code,
      name,
      description: f.description.trim() || null,
      specimen_type: f.specimen_type.trim() || null,
      unit: f.unit.trim() || null,
      reference_range: f.reference_range.trim() || null,
      results_template_code: f.results_template_code.trim() || null,
      turnaround_hours,
      price,
      requires_fasting: f.requires_fasting,
      sort_order,
      is_active: f.is_active,
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
      const res = await fetch("/api/settings/laboratory/lab-tests", {
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
      await loadData();
    } catch {
      setAddError("Could not create lab test.");
    } finally {
      setAddSaving(false);
    }
  };

  const handleEditSave = async () => {
    if (editingId == null) return;
    const built = buildPayloadFromForm(editForm);
    if ("error" in built) {
      setEditError(built.error ?? "Invalid form.");
      return;
    }
    setEditSaving(true);
    setEditError("");
    try {
      const res = await fetch(`/api/settings/laboratory/lab-tests/${encodeURIComponent(editingId)}`, {
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
      const res = await fetch(`/api/settings/laboratory/lab-tests/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok || json?.error) {
        setDeleteError(json?.error ?? "Could not delete lab test.");
        return;
      }
      setDeleteOpen(false);
      setDeleteTarget(null);
      await loadData();
    } catch {
      setDeleteError("Could not delete lab test.");
    } finally {
      setDeleteLoading(false);
    }
  };

  const formFields = (form: TestForm, setForm: Dispatch<SetStateAction<TestForm>>) => (
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
      <TextField
        label="Results template code"
        placeholder="e.g. BLOODCHEM3"
        value={form.results_template_code}
        onChange={(e) => setForm((f) => ({ ...f, results_template_code: e.target.value }))}
        {...fieldSx}
      />
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
    </Stack>
  );

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
                    <TableCell align="right">Price</TableCell>
                    <TableCell align="center">Fasting</TableCell>
                    <TableCell align="right">Sort</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell align="right" width={100}>
                      Actions
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {tests.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={10}>
                        <Typography variant="body2" color="text.secondary">
                          No lab tests yet. Add one to get started.
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ) : filteredTests.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={10}>
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
                        <TableCell align="right">{r.price != null && r.price !== "" ? String(r.price) : "—"}</TableCell>
                        <TableCell align="center">
                          {r.requires_fasting ? (
                            <Chip label="Yes" size="small" variant="outlined" />
                          ) : (
                            <Chip label="No" size="small" variant="outlined" />
                          )}
                        </TableCell>
                        <TableCell align="right">{r.sort_order ?? "—"}</TableCell>
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
        <DialogContent>{formFields(editForm, setEditForm)}</DialogContent>
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
