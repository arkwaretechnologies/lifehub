"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import UploadFileOutlinedIcon from "@mui/icons-material/UploadFileOutlined";
import { authenticatedFetch } from "@/lib/authenticatedFetch";
import type { LabResultTemplateRow } from "@/lib/labResultTemplates";
import {
  buildTemplateSignatureLayoutFromFormFields,
  buildResultDohLicensePrintFromFormFields,
  defaultLabResultTemplateFileName,
  dohLicensePrintFormFieldsFromDb,
  emptyDohLicensePrintFormFields,
  emptyTemplateSignatureLayoutFormFields,
  templateSignatureLayoutFormFieldsFromDb,
  type TemplateSignatureLayoutFormFields,
} from "@/lib/labResultTemplates";
import type { DohLicensePrintFormFields } from "@/lib/resultDohLicensePrint";
import { DohLicensePrintFields } from "@/components/laboratory/DohLicensePrintFields";
import type { PrintLayoutFormFields, ImageLayoutFormFields } from "@/lib/labResultsPrintLayout";

type ResultTemplateRow = LabResultTemplateRow & { has_file?: boolean };

type TemplateForm = {
  code: string;
  name: string;
  file_name: string;
  sort_order: string;
  is_active: boolean;
  signature: TemplateSignatureLayoutFormFields;
  doh_license: DohLicensePrintFormFields;
};

const fieldSx = {
  fullWidth: true as const,
  sx: { "& .MuiOutlinedInput-root": { minHeight: 44, borderRadius: 2 } },
};

const paginationSx = {
  "& .MuiTablePagination-toolbar": { textTransform: "none" as const },
  "& .MuiTablePagination-select": { textTransform: "none" as const },
  "& .MuiTablePagination-selectLabel, & .MuiTablePagination-displayedRows": {
    textTransform: "none" as const,
  },
};

function emptyForm(): TemplateForm {
  return {
    code: "",
    name: "",
    file_name: "",
    sort_order: "",
    is_active: true,
    signature: emptyTemplateSignatureLayoutFormFields(),
    doh_license: emptyDohLicensePrintFormFields(),
  };
}

function rowToForm(r: ResultTemplateRow): TemplateForm {
  return {
    code: r.code,
    name: r.name,
    file_name: r.file_name,
    sort_order: r.sort_order == null ? "" : String(r.sort_order),
    is_active: r.is_active !== false,
    signature: templateSignatureLayoutFormFieldsFromDb(r.signature_layout),
    doh_license: dohLicensePrintFormFieldsFromDb(r.doh_license_print),
  };
}

function SignatureSlotFields({
  title,
  fields,
  onChange,
}: {
  title: string;
  fields: PrintLayoutFormFields;
  onChange: (next: PrintLayoutFormFields) => void;
}) {
  return (
    <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2, p: 1.5 }}>
      <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>
        {title}
      </Typography>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
        <TextField
          label="X (refX)"
          type="number"
          value={fields.print_ref_x}
          onChange={(e) => onChange({ ...fields, print_ref_x: e.target.value })}
          {...fieldSx}
        />
        <TextField
          label="Y from top"
          type="number"
          value={fields.print_ref_from_top}
          onChange={(e) => onChange({ ...fields, print_ref_from_top: e.target.value })}
          {...fieldSx}
        />
        <TextField
          label="Font size"
          type="number"
          value={fields.print_font_size}
          onChange={(e) => onChange({ ...fields, print_font_size: e.target.value })}
          {...fieldSx}
        />
        <TextField
          label="Max width"
          type="number"
          value={fields.print_max_width}
          onChange={(e) => onChange({ ...fields, print_max_width: e.target.value })}
          {...fieldSx}
        />
      </Stack>
    </Box>
  );
}

function ImageSignatureSlotFields({
  title,
  fields,
  onChange,
}: {
  title: string;
  fields: ImageLayoutFormFields;
  onChange: (next: ImageLayoutFormFields) => void;
}) {
  return (
    <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2, p: 1.5 }}>
      <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>
        {title}
      </Typography>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
        <TextField
          label="X (refX)"
          type="number"
          value={fields.print_ref_x}
          onChange={(e) => onChange({ ...fields, print_ref_x: e.target.value })}
          {...fieldSx}
        />
        <TextField
          label="Y from top"
          type="number"
          value={fields.print_ref_from_top}
          onChange={(e) => onChange({ ...fields, print_ref_from_top: e.target.value })}
          {...fieldSx}
        />
        <TextField
          label="Width"
          type="number"
          value={fields.print_ref_width}
          onChange={(e) => onChange({ ...fields, print_ref_width: e.target.value })}
          {...fieldSx}
        />
        <TextField
          label="Height"
          type="number"
          value={fields.print_ref_height}
          onChange={(e) => onChange({ ...fields, print_ref_height: e.target.value })}
          {...fieldSx}
        />
      </Stack>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ mt: 1.5 }}>
        <TextField
          label="Page index"
          type="number"
          value={fields.print_page_index}
          onChange={(e) => onChange({ ...fields, print_page_index: e.target.value })}
          sx={[fieldSx.sx, { width: { xs: "100%", sm: "25%" } }]}
        />
      </Stack>
    </Box>
  );
}

export default function SettingsLabResultTemplatesPage() {
  const [templates, setTemplates] = useState<ResultTemplateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState("");
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState<TemplateForm>(emptyForm());
  const [addSaving, setAddSaving] = useState(false);
  const [addError, setAddError] = useState("");

  const [editOpen, setEditOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<TemplateForm>(emptyForm());
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState("");
  const [uploadingId, setUploadingId] = useState<string | null>(null);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ResultTemplateRow | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const loadData = useCallback(async () => {
    setListError("");
    setLoading(true);
    try {
      const res = await authenticatedFetch("/api/settings/laboratory/result-templates");
      const json = (await res.json().catch(() => null)) as {
        templates?: ResultTemplateRow[];
        error?: string;
      } | null;
      if (!res.ok || json?.error) {
        setTemplates([]);
        setListError(json?.error ?? "Failed to load result templates.");
      } else {
        setTemplates(json?.templates ?? []);
      }
    } catch {
      setTemplates([]);
      setListError("Failed to load result templates.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const paged = useMemo(() => {
    const start = page * rowsPerPage;
    return templates.slice(start, start + rowsPerPage);
  }, [templates, page, rowsPerPage]);

  const buildPayload = (f: TemplateForm) => {
    const code = f.code.trim().toUpperCase();
    const layoutBuilt = buildTemplateSignatureLayoutFromFormFields(f.signature);
    if (!layoutBuilt.ok) return { error: layoutBuilt.error } as const;
    const dohBuilt = buildResultDohLicensePrintFromFormFields(f.doh_license);
    if (!dohBuilt.ok) return { error: dohBuilt.error } as const;
    return {
      payload: {
        code,
        name: f.name.trim(),
        file_name: f.file_name.trim() || defaultLabResultTemplateFileName(code),
        sort_order: f.sort_order.trim() === "" ? null : Number(f.sort_order),
        is_active: f.is_active,
        signature_layout: layoutBuilt.value,
        doh_license_print: dohBuilt.value,
      },
    } as const;
  };

  const handleAdd = async () => {
    setAddError("");
    const built = buildPayload(addForm);
    if ("error" in built) {
      setAddError(built.error ?? "Invalid signature coordinates.");
      return;
    }
    setAddSaving(true);
    try {
      const res = await authenticatedFetch("/api/settings/laboratory/result-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(built.payload),
      });
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setAddError(json?.error ?? "Could not create template.");
        return;
      }
      setAddOpen(false);
      setAddForm(emptyForm());
      await loadData();
    } catch {
      setAddError("Could not create template.");
    } finally {
      setAddSaving(false);
    }
  };

  const handleEdit = async () => {
    if (!editingId) return;
    setEditError("");
    const built = buildPayload(editForm);
    if ("error" in built) {
      setEditError(built.error ?? "Invalid signature coordinates.");
      return;
    }
    setEditSaving(true);
    try {
      const res = await authenticatedFetch(
        `/api/settings/laboratory/result-templates/${encodeURIComponent(editingId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(built.payload),
        },
      );
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setEditError(json?.error ?? "Could not update template.");
        return;
      }
      setEditOpen(false);
      setEditingId(null);
      await loadData();
    } catch {
      setEditError("Could not update template.");
    } finally {
      setEditSaving(false);
    }
  };

  const handleUpload = async (templateId: string, file: File) => {
    setUploadingId(templateId);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await authenticatedFetch(
        `/api/settings/laboratory/result-templates/${encodeURIComponent(templateId)}/upload`,
        { method: "POST", body: fd },
      );
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setListError(json?.error ?? "Upload failed.");
        return;
      }
      await loadData();
    } catch {
      setListError("Upload failed.");
    } finally {
      setUploadingId(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleteError("");
    setDeleteLoading(true);
    try {
      const res = await authenticatedFetch(
        `/api/settings/laboratory/result-templates/${encodeURIComponent(deleteTarget.id)}`,
        { method: "DELETE" },
      );
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setDeleteError(json?.error ?? "Could not delete template.");
        return;
      }
      setDeleteOpen(false);
      setDeleteTarget(null);
      await loadData();
    } catch {
      setDeleteError("Could not delete template.");
    } finally {
      setDeleteLoading(false);
    }
  };

  const renderFormFields = (form: TemplateForm, setForm: (f: TemplateForm) => void, codeDisabled: boolean) => (
    <Stack spacing={2}>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
        <TextField
          label="Code"
          value={form.code}
          disabled={codeDisabled}
          onChange={(e) =>
            setForm({
              ...form,
              code: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ""),
            })
          }
          {...fieldSx}
        />
        <TextField
          label="Display name"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          {...fieldSx}
        />
      </Stack>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
        <TextField
          label="PDF file name"
          value={form.file_name}
          onChange={(e) => setForm({ ...form, file_name: e.target.value })}
          helperText="Under templates/Lab Results/ on the server"
          {...fieldSx}
        />
        <TextField
          label="Sort order"
          type="number"
          value={form.sort_order}
          onChange={(e) => setForm({ ...form, sort_order: e.target.value })}
          {...fieldSx}
        />
      </Stack>
      <FormControlLabel
        control={
          <Switch
            checked={form.is_active}
            onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
          />
        }
        label="Active (shown when assigning tests)"
      />
      <Typography variant="caption" color="text.secondary">
        Coordinates use US Letter 612×792 pt; refFromTop is distance from the top edge.
      </Typography>
      <SignatureSlotFields
        title="Medical Technologist — name"
        fields={form.signature.medtech_name}
        onChange={(medtech_name) => setForm({ ...form, signature: { ...form.signature, medtech_name } })}
      />
      <SignatureSlotFields
        title="Medical Technologist — license no."
        fields={form.signature.medtech_license}
        onChange={(medtech_license) => setForm({ ...form, signature: { ...form.signature, medtech_license } })}
      />
      <ImageSignatureSlotFields
        title="Medical Technologist — signature image"
        fields={form.signature.medtech_signature}
        onChange={(medtech_signature) =>
          setForm({ ...form, signature: { ...form.signature, medtech_signature } })
        }
      />
      <SignatureSlotFields
        title="Pathologist — name"
        fields={form.signature.pathologist_name}
        onChange={(pathologist_name) =>
          setForm({ ...form, signature: { ...form.signature, pathologist_name } })
        }
      />
      <SignatureSlotFields
        title="Pathologist — license no."
        fields={form.signature.pathologist_license}
        onChange={(pathologist_license) =>
          setForm({ ...form, signature: { ...form.signature, pathologist_license } })
        }
      />
      <ImageSignatureSlotFields
        title="Pathologist — signature image"
        fields={form.signature.pathologist_signature}
        onChange={(pathologist_signature) =>
          setForm({ ...form, signature: { ...form.signature, pathologist_signature } })
        }
      />
      <DohLicensePrintFields
        fields={form.doh_license}
        onChange={(doh_license) => setForm({ ...form, doh_license })}
      />
    </Stack>
  );

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1200, mx: "auto" }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Typography variant="h5" fontWeight={800}>
          Lab result templates
        </Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setAddOpen(true)}>
          Add template
        </Button>
      </Stack>

      {listError ? (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setListError("")}>
          {listError}
        </Alert>
      ) : null}

      <Card variant="outlined">
        <CardContent sx={{ p: 0, "&:last-child": { pb: 0 } }}>
          {loading ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
              <CircularProgress />
            </Box>
          ) : (
            <>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Code</TableCell>
                      <TableCell>Name</TableCell>
                      <TableCell>PDF file</TableCell>
                      <TableCell align="center">On disk</TableCell>
                      <TableCell align="right">Sort</TableCell>
                      <TableCell align="center">Active</TableCell>
                      <TableCell align="right">Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {paged.map((r) => (
                      <TableRow key={r.id} hover>
                        <TableCell sx={{ fontFamily: "monospace", fontWeight: 600 }}>{r.code}</TableCell>
                        <TableCell>{r.name}</TableCell>
                        <TableCell sx={{ fontSize: "0.8rem" }}>{r.file_name}</TableCell>
                        <TableCell align="center">
                          <Chip
                            size="small"
                            label={r.has_file ? "Yes" : "Missing"}
                            color={r.has_file ? "success" : "warning"}
                            variant="outlined"
                          />
                        </TableCell>
                        <TableCell align="right">{r.sort_order ?? "—"}</TableCell>
                        <TableCell align="center">
                          <Chip
                            size="small"
                            label={r.is_active ? "Yes" : "No"}
                            color={r.is_active ? "primary" : "default"}
                            variant="outlined"
                          />
                        </TableCell>
                        <TableCell align="right">
                          <Tooltip title="Upload PDF">
                            <span>
                              <IconButton
                                size="small"
                                component="label"
                                disabled={uploadingId === r.id}
                              >
                                {uploadingId === r.id ? (
                                  <CircularProgress size={18} />
                                ) : (
                                  <UploadFileOutlinedIcon fontSize="small" />
                                )}
                                <input
                                  type="file"
                                  accept="application/pdf,.pdf"
                                  hidden
                                  onChange={(e) => {
                                    const f = e.target.files?.[0];
                                    if (f) void handleUpload(r.id, f);
                                    e.target.value = "";
                                  }}
                                />
                              </IconButton>
                            </span>
                          </Tooltip>
                          <Tooltip title="Edit">
                            <IconButton
                              size="small"
                              onClick={() => {
                                setEditingId(r.id);
                                setEditForm(rowToForm(r));
                                setEditError("");
                                setEditOpen(true);
                              }}
                            >
                              <EditIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Delete">
                            <IconButton
                              size="small"
                              color="error"
                              onClick={() => {
                                setDeleteTarget(r);
                                setDeleteError("");
                                setDeleteOpen(true);
                              }}
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    ))}
                    {templates.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} align="center" sx={{ py: 4, color: "text.secondary" }}>
                          No result templates yet.
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </TableContainer>
              <TablePagination
                component="div"
                count={templates.length}
                page={page}
                onPageChange={(_, p) => setPage(p)}
                rowsPerPage={rowsPerPage}
                onRowsPerPageChange={(e) => {
                  setRowsPerPage(Number.parseInt(e.target.value, 10));
                  setPage(0);
                }}
                rowsPerPageOptions={[5, 10, 25]}
                sx={paginationSx}
              />
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={addOpen} onClose={() => !addSaving && setAddOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>Add result template</DialogTitle>
        <DialogContent dividers>{renderFormFields(addForm, setAddForm, false)}</DialogContent>
        {addError ? (
          <Alert severity="error" sx={{ mx: 3, mt: 1 }}>
            {addError}
          </Alert>
        ) : null}
        <DialogActions>
          <Button onClick={() => setAddOpen(false)} disabled={addSaving}>
            Cancel
          </Button>
          <Button variant="contained" onClick={() => void handleAdd()} disabled={addSaving}>
            {addSaving ? "Saving…" : "Save"}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={editOpen} onClose={() => !editSaving && setEditOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>Edit result template</DialogTitle>
        <DialogContent dividers>{renderFormFields(editForm, setEditForm, true)}</DialogContent>
        {editError ? (
          <Alert severity="error" sx={{ mx: 3, mt: 1 }}>
            {editError}
          </Alert>
        ) : null}
        <DialogActions>
          <Button onClick={() => setEditOpen(false)} disabled={editSaving}>
            Cancel
          </Button>
          <Button variant="contained" onClick={() => void handleEdit()} disabled={editSaving}>
            {editSaving ? "Saving…" : "Save"}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={deleteOpen} onClose={() => !deleteLoading && setDeleteOpen(false)}>
        <DialogTitle>Delete template</DialogTitle>
        <DialogContent>
          <Typography>
            Delete <strong>{deleteTarget?.code}</strong> ({deleteTarget?.name})? This does not remove the PDF file
            from disk.
          </Typography>
          {deleteError ? (
            <Alert severity="error" sx={{ mt: 2 }}>
              {deleteError}
            </Alert>
          ) : null}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteOpen(false)} disabled={deleteLoading}>
            Cancel
          </Button>
          <Button color="error" variant="contained" onClick={() => void handleDelete()} disabled={deleteLoading}>
            {deleteLoading ? "Deleting…" : "Delete"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
