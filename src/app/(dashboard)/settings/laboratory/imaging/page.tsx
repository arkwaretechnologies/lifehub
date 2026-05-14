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
import type { ImagingCatalogRow } from "@/lib/imagingCatalog";

type ImagingForm = {
  code: string;
  name: string;
  default_price: string;
  requires_view_field: boolean;
  view_field_label: string;
  sort_order: string;
  is_active: boolean;
};

const emptyForm = (): ImagingForm => ({
  code: "",
  name: "",
  default_price: "",
  requires_view_field: false,
  view_field_label: "VIEW",
  sort_order: "",
  is_active: true,
});

function rowToForm(r: ImagingCatalogRow): ImagingForm {
  return {
    code: r.code ?? "",
    name: r.name ?? "",
    default_price: r.default_price == null || r.default_price === 0 ? "" : String(r.default_price),
    requires_view_field: r.requires_view_field === true,
    view_field_label: r.view_field_label ?? "VIEW",
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

function parsePrice(raw: string): { value: number; error?: string } {
  const t = raw.trim();
  if (t === "") return { value: 0 };
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return { value: 0, error: "Price must be a valid non-negative number." };
  return { value: n };
}

function parseOptionalInt(raw: string): number | null {
  const t = raw.trim();
  if (t === "") return null;
  const n = Number.parseInt(t, 10);
  return Number.isFinite(n) ? n : null;
}

export default function SettingsLaboratoryImagingPage() {
  const [rows, setRows] = useState<ImagingCatalogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState("");

  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState<ImagingForm>(emptyForm());
  const [addSaving, setAddSaving] = useState(false);
  const [addError, setAddError] = useState("");

  const [editOpen, setEditOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<ImagingForm>(emptyForm());
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState("");

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ImagingCatalogRow | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const hay = [
        r.id,
        r.code,
        r.name,
        String(r.default_price),
        r.sort_order != null ? String(r.sort_order) : "",
        r.requires_view_field ? "view" : "",
      ]
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

  const loadRows = useCallback(async () => {
    setListError("");
    setLoading(true);
    try {
      const res = await fetch("/api/settings/laboratory/imaging");
      const json = (await res.json().catch(() => null)) as
        | { imaging?: ImagingCatalogRow[]; error?: string }
        | null;
      if (!res.ok || !json || json.error) {
        setListError(json?.error ?? "Failed to load imaging catalog.");
        setRows([]);
        return;
      }
      setRows(json.imaging ?? []);
    } catch {
      setListError("Failed to load imaging catalog.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  const openAdd = () => {
    setAddForm(emptyForm());
    setAddError("");
    setAddOpen(true);
  };

  const openEdit = (r: ImagingCatalogRow) => {
    setEditingId(r.id);
    setEditForm(rowToForm(r));
    setEditError("");
    setEditOpen(true);
  };

  const openDelete = (r: ImagingCatalogRow) => {
    setDeleteTarget(r);
    setDeleteError("");
    setDeleteOpen(true);
  };

  const validate = (
    f: ImagingForm,
  ): { error: string } | { body: Record<string, unknown> } => {
    const code = f.code.trim().toUpperCase().replace(/\s+/g, "_");
    const name = f.name.trim();
    if (!code || !name) return { error: "Code and name are required." };
    if (!/^[A-Z0-9_]+$/.test(code)) {
      return { error: "Code must be letters, digits, and underscores only." };
    }
    const { value: default_price, error: pe } = parsePrice(f.default_price);
    if (pe) return { error: pe };
    const sort_order = parseOptionalInt(f.sort_order);
    if (f.sort_order.trim() !== "" && sort_order === null) {
      return { error: "Sort order must be a whole number or empty." };
    }
    const requires_view_field = f.requires_view_field === true;
    const view_field_label = requires_view_field
      ? f.view_field_label.trim() || "VIEW"
      : null;
    return {
      body: {
        code,
        name,
        default_price,
        requires_view_field,
        view_field_label,
        sort_order,
        is_active: f.is_active,
      },
    };
  };

  const handleAddSave = async () => {
    const v = validate(addForm);
    if ("error" in v) {
      setAddError(v.error);
      return;
    }
    setAddSaving(true);
    setAddError("");
    try {
      const res = await fetch("/api/settings/laboratory/imaging", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(v.body),
      });
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok || json?.error) {
        setAddError(json?.error ?? "Could not create imaging study.");
        return;
      }
      setAddOpen(false);
      await loadRows();
    } catch {
      setAddError("Could not create imaging study.");
    } finally {
      setAddSaving(false);
    }
  };

  const handleEditSave = async () => {
    if (editingId == null) return;
    const v = validate(editForm);
    if ("error" in v) {
      setEditError(v.error);
      return;
    }
    setEditSaving(true);
    setEditError("");
    try {
      const res = await fetch(`/api/settings/laboratory/imaging/${encodeURIComponent(editingId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(v.body),
      });
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok || json?.error) {
        setEditError(json?.error ?? "Could not update imaging study.");
        return;
      }
      setEditOpen(false);
      setEditingId(null);
      await loadRows();
    } catch {
      setEditError("Could not update imaging study.");
    } finally {
      setEditSaving(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (deleteTarget == null) return;
    setDeleteLoading(true);
    setDeleteError("");
    try {
      const res = await fetch(`/api/settings/laboratory/imaging/${encodeURIComponent(deleteTarget.id)}`, {
        method: "DELETE",
      });
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok || json?.error) {
        setDeleteError(json?.error ?? "Could not delete imaging study.");
        return;
      }
      setDeleteOpen(false);
      setDeleteTarget(null);
      await loadRows();
    } catch {
      setDeleteError("Could not delete imaging study.");
    } finally {
      setDeleteLoading(false);
    }
  };

  const formFields = (form: ImagingForm, setForm: Dispatch<SetStateAction<ImagingForm>>) => (
    <Stack spacing={2} sx={{ pt: 0.5 }}>
      <TextField
        label="Code"
        required
        placeholder="e.g. CHEST_XRAY"
        value={form.code}
        onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
        helperText="Stable key (uppercase). Used when saving consultation requests."
        {...fieldSx}
      />
      <TextField
        label="Display name"
        required
        value={form.name}
        onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
        {...fieldSx}
      />
      <TextField
        label="Default price"
        type="number"
        inputProps={{ step: "0.01", min: 0 }}
        value={form.default_price}
        onChange={(e) => setForm((f) => ({ ...f, default_price: e.target.value }))}
        {...fieldSx}
      />
      <FormControlLabel
        control={
          <Switch
            checked={form.requires_view_field}
            onChange={(_, v) => setForm((f) => ({ ...f, requires_view_field: v }))}
          />
        }
        label="Extra field (e.g. X-ray view)"
      />
      <TextField
        label="Field label"
        value={form.view_field_label}
        onChange={(e) => setForm((f) => ({ ...f, view_field_label: e.target.value }))}
        disabled={!form.requires_view_field}
        placeholder="VIEW"
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
          <Switch checked={form.is_active} onChange={(_, v) => setForm((f) => ({ ...f, is_active: v }))} />
        }
        label="Active"
      />
    </Stack>
  );

  return (
    <>
      <Typography variant="h5" sx={{ mb: 2 }}>
        Laboratory — Imaging
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Configure imaging studies shown in consultation (Plans/Treatment). Default prices appear on the
        imaging request dialog. Apply the Supabase migration <Typography component="span" variant="body2" sx={{ fontFamily: "monospace" }}>supabase/migrations/20260212140000_imaging_catalog.sql</Typography> if the table is missing.
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
                Imaging studies
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
                Add study
              </Button>
            </Stack>
            <TextField
              placeholder="Search code, name, price…"
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
                "& .MuiOutlinedInput-input": { py: 1.75 },
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
            <TableContainer sx={{ maxWidth: "100%", overflowX: "auto" }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell width={72}>ID</TableCell>
                    <TableCell>Code</TableCell>
                    <TableCell>Name</TableCell>
                    <TableCell align="right">Default price</TableCell>
                    <TableCell align="center">View field</TableCell>
                    <TableCell align="right">Sort</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell align="right" width={100}>
                      Actions
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8}>
                        <Typography variant="body2" color="text.secondary">
                          No imaging studies. Run the database migration, then refresh — five default studies are
                          seeded.
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ) : filteredRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8}>
                        <Typography variant="body2" color="text.secondary">
                          No rows match your search.
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ) : (
                    pagedRows.map((r) => (
                      <TableRow key={r.id} hover>
                        <TableCell>{r.id}</TableCell>
                        <TableCell sx={{ fontFamily: "monospace", fontWeight: 600 }}>{r.code}</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>{r.name}</TableCell>
                        <TableCell align="right">
                          {Number.isFinite(r.default_price)
                            ? r.default_price.toLocaleString(undefined, {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })
                            : "—"}
                        </TableCell>
                        <TableCell align="center">
                          {r.requires_view_field ? (
                            <Chip label={r.view_field_label ?? "VIEW"} size="small" variant="outlined" />
                          ) : (
                            "—"
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
        <DialogTitle>Add imaging study</DialogTitle>
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
        <DialogTitle>Edit imaging study</DialogTitle>
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
        <DialogTitle>Delete imaging study</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            Delete{" "}
            <Typography component="span" fontWeight={700}>
              {deleteTarget?.name}
            </Typography>
            ? Past consultation notes that reference this name may need manual review.
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
