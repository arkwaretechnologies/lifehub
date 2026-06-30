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
  FormControlLabel,
  IconButton,
  InputAdornment,
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
import type { LabCategoryRow } from "@/lib/labTests";
import { authenticatedFetch } from "@/lib/authenticatedFetch";
import { invalidateLabCatalogCache } from "@/lib/labCatalogCache";

type CategoryForm = {
  code: string;
  name: string;
  description: string;
  sort_order: string;
  is_active: boolean;
};

const emptyForm = (): CategoryForm => ({
  code: "",
  name: "",
  description: "",
  sort_order: "",
  is_active: true,
});

function rowToForm(r: LabCategoryRow): CategoryForm {
  return {
    code: r.code ?? "",
    name: r.name ?? "",
    description: r.description ?? "",
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

export default function SettingsLabCategoriesPage() {
  const [rows, setRows] = useState<LabCategoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState("");

  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState<CategoryForm>(emptyForm());
  const [addSaving, setAddSaving] = useState(false);
  const [addError, setAddError] = useState("");

  const [editOpen, setEditOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<CategoryForm>(emptyForm());
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState("");

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<LabCategoryRow | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const hay = [String(r.id), r.code, r.name, r.description, r.sort_order != null ? String(r.sort_order) : ""]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [rows, searchQuery]);

  useEffect(() => {
    setPage(0);
  }, [searchQuery]);

  const pagedRows = useMemo(
    () => filteredRows.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage),
    [filteredRows, page, rowsPerPage],
  );

  useEffect(() => {
    const last = Math.max(0, Math.ceil(filteredRows.length / rowsPerPage) - 1);
    if (page > last) setPage(last);
  }, [filteredRows.length, rowsPerPage, page]);

  const loadCategories = useCallback(async () => {
    setListError("");
    setLoading(true);
    try {
      const res = await authenticatedFetch("/api/settings/laboratory/categories");
      const json = (await res.json().catch(() => null)) as
        | { categories?: LabCategoryRow[]; error?: string }
        | null;
      if (!res.ok || !json || json.error) {
        setListError(json?.error ?? "Failed to load categories.");
        setRows([]);
        return;
      }
      setRows(json.categories ?? []);
    } catch {
      setListError("Failed to load categories.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCategories();
  }, [loadCategories]);

  const openAdd = () => {
    setAddForm(emptyForm());
    setAddError("");
    setAddOpen(true);
  };

  const openEdit = (r: LabCategoryRow) => {
    const id = Number(r.id);
    if (!Number.isFinite(id) || id <= 0) return;
    setEditingId(id);
    setEditForm(rowToForm(r));
    setEditError("");
    setEditOpen(true);
  };

  const openDelete = (r: LabCategoryRow) => {
    setDeleteTarget(r);
    setDeleteError("");
    setDeleteOpen(true);
  };

  const handleAddSave = async () => {
    const code = addForm.code.trim();
    const name = addForm.name.trim();
    if (!code || !name) {
      setAddError("Code and name are required.");
      return;
    }
    const sortRaw = addForm.sort_order.trim();
    const sort_order =
      sortRaw === "" ? null : Number.parseInt(sortRaw, 10);
    if (sortRaw !== "" && !Number.isFinite(sort_order as number)) {
      setAddError("Sort order must be a whole number or empty.");
      return;
    }
    setAddSaving(true);
    setAddError("");
    try {
      const res = await authenticatedFetch("/api/settings/laboratory/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          name,
          description: addForm.description.trim() || null,
          sort_order: sortRaw === "" ? null : sort_order,
          is_active: addForm.is_active,
        }),
      });
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok || json?.error) {
        setAddError(json?.error ?? "Could not create category.");
        return;
      }
      setAddOpen(false);
      invalidateLabCatalogCache();
      await loadCategories();
    } catch {
      setAddError("Could not create category.");
    } finally {
      setAddSaving(false);
    }
  };

  const handleEditSave = async () => {
    if (editingId == null) return;
    const code = editForm.code.trim();
    const name = editForm.name.trim();
    if (!code || !name) {
      setEditError("Code and name are required.");
      return;
    }
    const sortRaw = editForm.sort_order.trim();
    const sort_order =
      sortRaw === "" ? null : Number.parseInt(sortRaw, 10);
    if (sortRaw !== "" && !Number.isFinite(sort_order as number)) {
      setEditError("Sort order must be a whole number or empty.");
      return;
    }
    setEditSaving(true);
    setEditError("");
    try {
      const res = await authenticatedFetch(`/api/settings/laboratory/categories/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          name,
          description: editForm.description.trim() || null,
          sort_order: sortRaw === "" ? null : sort_order,
          is_active: editForm.is_active,
        }),
      });
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok || json?.error) {
        setEditError(json?.error ?? "Could not update category.");
        return;
      }
      setEditOpen(false);
      setEditingId(null);
      invalidateLabCatalogCache();
      await loadCategories();
    } catch {
      setEditError("Could not update category.");
    } finally {
      setEditSaving(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (deleteTarget == null) return;
    const id = Number(deleteTarget.id);
    if (!Number.isFinite(id) || id <= 0) return;
    setDeleteLoading(true);
    setDeleteError("");
    try {
      const res = await authenticatedFetch(`/api/settings/laboratory/categories/${id}`, { method: "DELETE" });
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok || json?.error) {
        setDeleteError(json?.error ?? "Could not delete category.");
        return;
      }
      setDeleteOpen(false);
      setDeleteTarget(null);
      invalidateLabCatalogCache();
      await loadCategories();
    } catch {
      setDeleteError("Could not delete category.");
    } finally {
      setDeleteLoading(false);
    }
  };

  const formFields = (
    form: CategoryForm,
    setForm: Dispatch<SetStateAction<CategoryForm>>,
  ) => (
    <Stack spacing={2} sx={{ pt: 0.5 }}>
      <TextField
        label="Code"
        required
        placeholder="e.g. CHEM"
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
        label="Sort order"
        type="number"
        inputProps={{ step: 1 }}
        placeholder="Lower appears first"
        value={form.sort_order}
        onChange={(e) => setForm((f) => ({ ...f, sort_order: e.target.value }))}
        {...fieldSx}
      />
      <FormControlLabel
        control={
          <Switch
            checked={form.is_active}
            onChange={(_, v) => setForm((f) => ({ ...f, is_active: v }))}
          />
        }
        label="Active"
      />
    </Stack>
  );

  return (
    <>
      <Typography variant="h5" sx={{ mb: 2 }}>
        Laboratory — Categories
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Manage catalog groupings for lab tests. Categories with assigned tests cannot be deleted until
        those tests are moved or removed.
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
                Categories
              </Typography>
              <Button
                variant="contained"
                size="medium"
                startIcon={<AddIcon />}
                onClick={openAdd}
                sx={{
                  alignSelf: { xs: "stretch", sm: "auto" },
                  py: 1.25,
                  px: 2.5,
                  fontSize: "0.95rem",
                  borderRadius: 999,
                }}
              >
                Add category
              </Button>
            </Stack>
            <TextField
              placeholder="Search code, name, description…"
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
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Code</TableCell>
                    <TableCell>Name</TableCell>
                    <TableCell>Description</TableCell>
                    <TableCell align="right" width={100}>
                      Sort
                    </TableCell>
                    <TableCell width={100}>Status</TableCell>
                    <TableCell align="right" width={100}>
                      Actions
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6}>
                        <Typography variant="body2" color="text.secondary">
                          No categories yet. Add one to get started.
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ) : filteredRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6}>
                        <Typography variant="body2" color="text.secondary">
                          No categories match your search. Try a different term.
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ) : (
                    pagedRows.map((r) => (
                      <TableRow key={String(r.id)} hover>
                        <TableCell sx={{ fontFamily: "monospace", fontWeight: 600 }}>{r.code}</TableCell>
                        <TableCell>{r.name}</TableCell>
                        <TableCell sx={{ maxWidth: 280, color: "text.secondary" }}>
                          {r.description ?? "—"}
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
          {!loading && filteredRows.length > 0 ? (
            <TablePagination
              component="div"
              count={filteredRows.length}
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

      <Dialog open={addOpen} onClose={() => !addSaving && setAddOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add category</DialogTitle>
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

      <Dialog open={editOpen} onClose={() => !editSaving && setEditOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Edit category</DialogTitle>
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
        <DialogTitle>Delete category</DialogTitle>
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
