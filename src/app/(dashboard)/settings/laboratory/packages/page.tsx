"use client";

import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
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
  FormControlLabel,
  IconButton,
  InputAdornment,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Paper,
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
import ChevronLeft from "@mui/icons-material/ChevronLeft";
import ChevronRight from "@mui/icons-material/ChevronRight";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import KeyboardDoubleArrowLeft from "@mui/icons-material/KeyboardDoubleArrowLeft";
import KeyboardDoubleArrowRight from "@mui/icons-material/KeyboardDoubleArrowRight";
import SearchIcon from "@mui/icons-material/Search";
import type { LabPackageWithTests } from "@/lib/labPackages";
import type { LabCategoryRow, LabTestCatalogItem } from "@/lib/labTests";
import { collapseComponentsToPanel, labTestCategoryPickerLabel } from "@/lib/labTests";
import { authenticatedFetch } from "@/lib/authenticatedFetch";

type TestOption = { id: string; label: string };

type PackageForm = {
  name: string;
  description: string;
  package_price: string;
  sort_order: string;
  is_active: boolean;
  lab_test_ids: string[];
};

const emptyForm = (): PackageForm => ({
  name: "",
  description: "",
  package_price: "",
  sort_order: "",
  is_active: true,
  lab_test_ids: [],
});

function rowToForm(r: LabPackageWithTests): PackageForm {
  return {
    name: r.name ?? "",
    description: r.description ?? "",
    package_price: String(r.package_price ?? ""),
    sort_order: r.sort_order == null ? "" : String(r.sort_order),
    is_active: r.is_active !== false,
    lab_test_ids: [...(r.labTestIds ?? [])],
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

function parsePrice(raw: string): { value: number; error?: string } {
  const t = raw.trim();
  if (t === "") return { value: 0 };
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return { value: 0, error: "Price must be a valid non-negative number." };
  return { value: n };
}

function toggleId(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
}

function LabTestTransferList({
  options,
  value,
  onChange,
  disabled,
}: {
  options: TestOption[];
  value: string[];
  onChange: (ids: string[]) => void;
  disabled: boolean;
}) {
  const [leftFilter, setLeftFilter] = useState("");
  const [rightFilter, setRightFilter] = useState("");
  const [leftSel, setLeftSel] = useState<string[]>([]);
  const [rightSel, setRightSel] = useState<string[]>([]);

  const byId = useMemo(() => new Map(options.map((o) => [o.id, o])), [options]);

  const leftItems = useMemo(() => {
    const chosen = new Set(value);
    const q = leftFilter.trim().toLowerCase();
    return options
      .filter((o) => !chosen.has(o.id))
      .filter((o) => !q || o.label.toLowerCase().includes(q))
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
  }, [options, value, leftFilter]);

  const rightItems = useMemo(() => {
    const q = rightFilter.trim().toLowerCase();
    return value
      .map((id) => byId.get(id))
      .filter((o): o is TestOption => o != null)
      .filter((o) => !q || o.label.toLowerCase().includes(q));
  }, [value, byId, rightFilter]);

  const moveSelectedRight = () => {
    if (disabled || leftSel.length === 0) return;
    const add = leftSel.filter((id) => !value.includes(id) && byId.has(id));
    if (add.length === 0) return;
    onChange([...value, ...add]);
    setLeftSel([]);
  };

  const moveAllFilteredRight = () => {
    if (disabled || leftItems.length === 0) return;
    const ordered: string[] = [];
    const seen = new Set<string>();
    for (const id of value) {
      if (!seen.has(id)) {
        ordered.push(id);
        seen.add(id);
      }
    }
    for (const o of leftItems) {
      if (!seen.has(o.id)) {
        ordered.push(o.id);
        seen.add(o.id);
      }
    }
    onChange(ordered);
    setLeftSel([]);
  };

  const moveSelectedLeft = () => {
    if (disabled || rightSel.length === 0) return;
    const remove = new Set(rightSel);
    onChange(value.filter((id) => !remove.has(id)));
    setRightSel([]);
  };

  const moveAllFilteredLeft = () => {
    if (disabled || rightItems.length === 0) return;
    const vis = new Set(rightItems.map((o) => o.id));
    onChange(value.filter((id) => !vis.has(id)));
    setRightSel([]);
  };

  const listPaperSx = {
    flex: 1,
    minWidth: 0,
    minHeight: { xs: 420, sm: 500, md: 540 },
    display: "flex",
    flexDirection: "column" as const,
    borderRadius: 2,
    border: 1,
    borderColor: "divider",
    overflow: "hidden",
  };

  const listScrollSx = {
    flex: 1,
    overflow: "auto",
    minHeight: { xs: 340, sm: 420, md: 460 },
    maxHeight: { xs: "min(52vh, 420px)", sm: "min(58vh, 520px)", md: "min(62vh, 600px)" },
  };

  if (options.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        No lab tests loaded — save package details after tests exist in Lab tests.
      </Typography>
    );
  }

  return (
    <Box>
      <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>
        Included lab tests
      </Typography>
      <Stack direction={{ xs: "column", md: "row" }} spacing={1.5} alignItems="stretch">
        <Paper variant="outlined" sx={listPaperSx}>
          <Typography variant="caption" color="text.secondary" sx={{ px: 1.5, pt: 1.25, display: "block" }}>
            Available
          </Typography>
          <TextField
            size="medium"
            placeholder="Filter…"
            value={leftFilter}
            onChange={(e) => setLeftFilter(e.target.value)}
            disabled={disabled}
            fullWidth
            sx={{ px: 1, pt: 0.5, pb: 0.5, "& .MuiOutlinedInput-root": { borderRadius: 1.5 } }}
          />
          <List disablePadding sx={listScrollSx}>
            {leftItems.length === 0 ? (
              <ListItem>
                <ListItemText primary="No tests here" secondary="Adjust filter or move tests back from the right." />
              </ListItem>
            ) : (
              leftItems.map((o) => (
                <ListItem key={o.id} disablePadding>
                  <ListItemButton
                    disabled={disabled}
                    onClick={() => setLeftSel((s) => toggleId(s, o.id))}
                    selected={leftSel.includes(o.id)}
                    sx={{ alignItems: "flex-start", py: 0.5 }}
                  >
                    <ListItemIcon sx={{ minWidth: 40, mt: 0.25 }}>
                      <Checkbox
                        edge="start"
                        size="small"
                        tabIndex={-1}
                        disableRipple
                        checked={leftSel.includes(o.id)}
                        disabled={disabled}
                        inputProps={{ "aria-labelledby": `lab-pkg-left-${o.id}` }}
                      />
                    </ListItemIcon>
                    <ListItemText id={`lab-pkg-left-${o.id}`} primary={o.label} primaryTypographyProps={{ variant: "body2" }} />
                  </ListItemButton>
                </ListItem>
              ))
            )}
          </List>
        </Paper>

        <Stack
          direction={{ xs: "row", md: "column" }}
          justifyContent="center"
          alignItems="center"
          spacing={0.5}
          sx={{ py: { xs: 0, md: 2 }, px: { xs: 0, md: 0.5 } }}
        >
          <Tooltip title="Add all filtered">
            <span>
              <IconButton
                size="medium"
                onClick={moveAllFilteredRight}
                disabled={disabled || leftItems.length === 0}
                aria-label="Add all filtered available tests"
              >
                <KeyboardDoubleArrowRight fontSize="medium" />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="Add selected">
            <span>
              <IconButton
                size="medium"
                onClick={moveSelectedRight}
                disabled={disabled || leftSel.length === 0}
                aria-label="Add selected tests to package"
              >
                <ChevronRight fontSize="medium" />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="Remove selected">
            <span>
              <IconButton
                size="medium"
                onClick={moveSelectedLeft}
                disabled={disabled || rightSel.length === 0}
                aria-label="Remove selected tests from package"
              >
                <ChevronLeft fontSize="medium" />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="Remove all filtered from package">
            <span>
              <IconButton
                size="medium"
                onClick={moveAllFilteredLeft}
                disabled={disabled || rightItems.length === 0}
                aria-label="Remove all filtered tests from package"
              >
                <KeyboardDoubleArrowLeft fontSize="medium" />
              </IconButton>
            </span>
          </Tooltip>
        </Stack>

        <Paper variant="outlined" sx={listPaperSx}>
          <Typography variant="caption" color="text.secondary" sx={{ px: 1.5, pt: 1.25, display: "block" }}>
            In this package
          </Typography>
          <TextField
            size="medium"
            placeholder="Filter…"
            value={rightFilter}
            onChange={(e) => setRightFilter(e.target.value)}
            disabled={disabled}
            fullWidth
            sx={{ px: 1, pt: 0.5, pb: 0.5, "& .MuiOutlinedInput-root": { borderRadius: 1.5 } }}
          />
          <List disablePadding sx={listScrollSx}>
            {rightItems.length === 0 ? (
              <ListItem>
                <ListItemText primary="None yet" secondary="Pick tests on the left, then use the arrows." />
              </ListItem>
            ) : (
              rightItems.map((o) => (
                <ListItem key={o.id} disablePadding>
                  <ListItemButton
                    disabled={disabled}
                    onClick={() => setRightSel((s) => toggleId(s, o.id))}
                    selected={rightSel.includes(o.id)}
                    sx={{ alignItems: "flex-start", py: 0.5 }}
                  >
                    <ListItemIcon sx={{ minWidth: 40, mt: 0.25 }}>
                      <Checkbox
                        edge="start"
                        size="small"
                        tabIndex={-1}
                        disableRipple
                        checked={rightSel.includes(o.id)}
                        disabled={disabled}
                        inputProps={{ "aria-labelledby": `lab-pkg-right-${o.id}` }}
                      />
                    </ListItemIcon>
                    <ListItemText id={`lab-pkg-right-${o.id}`} primary={o.label} primaryTypographyProps={{ variant: "body2" }} />
                  </ListItemButton>
                </ListItem>
              ))
            )}
          </List>
        </Paper>
      </Stack>
    </Box>
  );
}

export default function SettingsLabPackagesPage() {
  const [packages, setPackages] = useState<LabPackageWithTests[]>([]);
  const [tests, setTests] = useState<LabTestCatalogItem[]>([]);
  const [categories, setCategories] = useState<LabCategoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState<PackageForm>(emptyForm());
  const [addSaving, setAddSaving] = useState(false);
  const [addError, setAddError] = useState("");

  const [editOpen, setEditOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<PackageForm>(emptyForm());
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState("");

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<LabPackageWithTests | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const categoryNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of categories) {
      const name = c.name?.trim();
      if (name) m.set(String(c.id), name);
    }
    return m;
  }, [categories]);

  const activePackageLabTestIds = useMemo(() => {
    const ids = new Set<string>();
    for (const id of addForm.lab_test_ids) ids.add(id);
    for (const id of editForm.lab_test_ids) ids.add(id);
    return ids;
  }, [addForm.lab_test_ids, editForm.lab_test_ids]);

  const packagePickerTests = useMemo(
    () =>
      tests.filter((t) => t.is_orderable !== false || activePackageLabTestIds.has(t.id)),
    [tests, activePackageLabTestIds],
  );

  const testOptions: TestOption[] = useMemo(
    () =>
      packagePickerTests.map((t) => ({
        id: t.id,
        label: labTestCategoryPickerLabel(t, categoryNameById),
      })),
    [packagePickerTests, categoryNameById],
  );

  const filteredPackages = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return packages;
    return packages.filter((p) => {
      const hay = [
        p.id,
        p.name,
        p.description,
        String(p.package_price),
        p.sort_order != null ? String(p.sort_order) : "",
        String(p.labTestIds?.length ?? 0),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [packages, searchQuery]);

  useEffect(() => {
    setPage(0);
  }, [searchQuery]);

  const pagedPackages = useMemo(
    () => filteredPackages.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage),
    [filteredPackages, page, rowsPerPage],
  );

  useEffect(() => {
    const last = Math.max(0, Math.ceil(filteredPackages.length / rowsPerPage) - 1);
    if (page > last) setPage(last);
  }, [filteredPackages.length, rowsPerPage, page]);

  const loadData = useCallback(async () => {
    setListError("");
    setLoading(true);
    try {
      const [pRes, tRes, cRes] = await Promise.all([
        authenticatedFetch("/api/settings/laboratory/packages"),
        authenticatedFetch("/api/settings/laboratory/lab-tests"),
        authenticatedFetch("/api/settings/laboratory/categories"),
      ]);
      const pJson = (await pRes.json().catch(() => null)) as
        | { packages?: LabPackageWithTests[]; error?: string }
        | null;
      const tJson = (await tRes.json().catch(() => null)) as
        | { tests?: LabTestCatalogItem[]; error?: string }
        | null;
      const cJson = (await cRes.json().catch(() => null)) as
        | { categories?: LabCategoryRow[]; error?: string }
        | null;

      let errMsg = "";
      if (!pRes.ok || pJson?.error) {
        errMsg = pJson?.error ?? "Failed to load packages.";
        setPackages([]);
      } else {
        setPackages(pJson?.packages ?? []);
      }

      if (!tRes.ok || tJson?.error) {
        errMsg = errMsg || (tJson?.error ?? "Failed to load lab tests.");
        setTests([]);
      } else {
        setTests(tJson?.tests ?? []);
      }

      if (!cRes.ok || cJson?.error) {
        errMsg = errMsg || (cJson?.error ?? "Failed to load categories.");
        setCategories([]);
      } else {
        setCategories(cJson?.categories ?? []);
      }
      setListError(errMsg);
    } catch {
      setListError("Failed to load data.");
      setPackages([]);
      setTests([]);
      setCategories([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const openAdd = () => {
    setAddForm(emptyForm());
    setAddError("");
    setAddOpen(true);
  };

  const openEdit = (r: LabPackageWithTests) => {
    setEditingId(r.id);
    const base = rowToForm(r);
    const lab_test_ids =
      tests.length > 0 ? collapseComponentsToPanel(base.lab_test_ids, tests) : base.lab_test_ids;
    setEditForm({ ...base, lab_test_ids });
    setEditError("");
    setEditOpen(true);
  };

  const openDelete = (r: LabPackageWithTests) => {
    setDeleteTarget(r);
    setDeleteError("");
    setDeleteOpen(true);
  };

  const validateForm = (f: PackageForm): { error: string } | { body: Record<string, unknown> } => {
    const name = f.name.trim();
    if (!name) return { error: "Name is required." };
    const sort_order = parseOptionalInt(f.sort_order);
    if (f.sort_order.trim() !== "" && sort_order === null) {
      return { error: "Sort order must be a whole number or empty." };
    }
    const { value: package_price, error: priceErr } = parsePrice(f.package_price);
    if (priceErr) return { error: priceErr };
    return {
      body: {
        name,
        description: f.description.trim() || null,
        package_price,
        sort_order,
        is_active: f.is_active,
        lab_test_ids: f.lab_test_ids,
      },
    };
  };

  const handleAddSave = async () => {
    const v = validateForm(addForm);
    if ("error" in v) {
      setAddError(v.error);
      return;
    }
    setAddSaving(true);
    setAddError("");
    try {
      const res = await authenticatedFetch("/api/settings/laboratory/packages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(v.body),
      });
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok || json?.error) {
        setAddError(json?.error ?? "Could not create package.");
        return;
      }
      setAddOpen(false);
      await loadData();
    } catch {
      setAddError("Could not create package.");
    } finally {
      setAddSaving(false);
    }
  };

  const handleEditSave = async () => {
    if (editingId == null) return;
    const pkgId = Number.parseInt(editingId, 10);
    if (!Number.isFinite(pkgId) || pkgId <= 0) {
      setEditError("Invalid package id.");
      return;
    }
    const v = validateForm(editForm);
    if ("error" in v) {
      setEditError(v.error);
      return;
    }
    setEditSaving(true);
    setEditError("");
    try {
      const res = await authenticatedFetch(`/api/settings/laboratory/packages/${pkgId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(v.body),
      });
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok || json?.error) {
        setEditError(json?.error ?? "Could not update package.");
        return;
      }
      setEditOpen(false);
      setEditingId(null);
      await loadData();
    } catch {
      setEditError("Could not update package.");
    } finally {
      setEditSaving(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (deleteTarget == null) return;
    const pkgId = Number.parseInt(deleteTarget.id, 10);
    if (!Number.isFinite(pkgId) || pkgId <= 0) return;
    setDeleteLoading(true);
    setDeleteError("");
    try {
      const res = await authenticatedFetch(`/api/settings/laboratory/packages/${pkgId}`, { method: "DELETE" });
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok || json?.error) {
        setDeleteError(json?.error ?? "Could not delete package.");
        return;
      }
      setDeleteOpen(false);
      setDeleteTarget(null);
      await loadData();
    } catch {
      setDeleteError("Could not delete package.");
    } finally {
      setDeleteLoading(false);
    }
  };

  const packageFormFields = (form: PackageForm, setForm: Dispatch<SetStateAction<PackageForm>>) => (
    <Stack spacing={2} sx={{ pt: 0.5 }}>
      <TextField
        label="Package name"
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
      <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
        <TextField
          label="Package price"
          type="number"
          inputProps={{ step: "0.01", min: 0 }}
          value={form.package_price}
          onChange={(e) => setForm((f) => ({ ...f, package_price: e.target.value }))}
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
          <Switch checked={form.is_active} onChange={(_, v) => setForm((f) => ({ ...f, is_active: v }))} />
        }
        label="Active"
      />
      <LabTestTransferList
        options={testOptions}
        value={form.lab_test_ids}
        onChange={(ids) => setForm((f) => ({ ...f, lab_test_ids: ids }))}
        disabled={tests.length === 0}
      />
    </Stack>
  );

  return (
    <>
      <Typography variant="h5" sx={{ mb: 2 }}>
        Laboratory — Packages
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Bundle catalog lab tests into named packages with a package price. Packages linked to existing lab
        requests cannot be deleted; deactivate them instead.
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
                Packages
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
                Add package
              </Button>
            </Stack>
            <TextField
              placeholder="Search name, description, id, price…"
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
                    <TableCell>Name</TableCell>
                    <TableCell>Description</TableCell>
                    <TableCell align="right">Price</TableCell>
                    <TableCell align="center">Tests</TableCell>
                    <TableCell align="right">Sort</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell align="right" width={100}>
                      Actions
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {packages.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7}>
                        <Typography variant="body2" color="text.secondary">
                          No packages yet. Add one and attach lab tests.
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ) : filteredPackages.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7}>
                        <Typography variant="body2" color="text.secondary">
                          No packages match your search.
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ) : (
                    pagedPackages.map((p) => (
                      <TableRow key={p.id} hover>
                        <TableCell sx={{ fontWeight: 600 }}>{p.name}</TableCell>
                        <TableCell sx={{ maxWidth: 280, color: "text.secondary" }}>
                          <Typography variant="body2" noWrap title={p.description ?? undefined}>
                            {p.description ?? "—"}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">
                          {Number.isFinite(p.package_price)
                            ? p.package_price.toLocaleString(undefined, {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })
                            : "—"}
                        </TableCell>
                        <TableCell align="center">
                          <Chip label={p.labTestIds?.length ?? 0} size="small" variant="outlined" />
                        </TableCell>
                        <TableCell align="right">{p.sort_order ?? "—"}</TableCell>
                        <TableCell>
                          {p.is_active !== false ? (
                            <Chip label="Active" size="small" color="success" variant="outlined" />
                          ) : (
                            <Chip label="Inactive" size="small" variant="outlined" />
                          )}
                        </TableCell>
                        <TableCell align="right">
                          <Tooltip title="Edit">
                            <IconButton size="small" onClick={() => openEdit(p)} aria-label="Edit">
                              <EditIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Delete">
                            <IconButton
                              size="small"
                              color="error"
                              onClick={() => openDelete(p)}
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
          {!loading && filteredPackages.length > 0 ? (
            <TablePagination
              component="div"
              count={filteredPackages.length}
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

      <Dialog open={addOpen} onClose={() => !addSaving && setAddOpen(false)} maxWidth="xl" fullWidth>
        <DialogTitle>Add package</DialogTitle>
        <DialogContent>{packageFormFields(addForm, setAddForm)}</DialogContent>
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

      <Dialog open={editOpen} onClose={() => !editSaving && setEditOpen(false)} maxWidth="xl" fullWidth>
        <DialogTitle>Edit package</DialogTitle>
        <DialogContent>{packageFormFields(editForm, setEditForm)}</DialogContent>
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
        <DialogTitle>Delete package</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            Delete{" "}
            <Typography component="span" fontWeight={700}>
              {deleteTarget?.name}
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
