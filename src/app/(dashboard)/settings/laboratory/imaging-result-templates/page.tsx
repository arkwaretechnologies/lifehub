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
import type { ImagingResultTemplateRow } from "@/lib/imagingResultTemplates";
import {
  buildTemplateResultLayoutFromFormFields,
  buildTemplateSignatureLayoutFromFormFields,
  defaultImagingResultTemplateFileName,
  emptyTemplateResultLayoutFormFields,
  emptyTemplateSignatureLayoutFormFields,
  templateResultLayoutFormFieldsFromDb,
  templateSignatureLayoutFormFieldsFromDb,
  type TemplateResultLayoutFormFields,
  type TemplateSignatureLayoutFormFields,
} from "@/lib/imagingResultTemplates";
import type { ImageLayoutFormFields, PrintLayoutFormFields } from "@/lib/labResultsPrintLayout";

type ResultTemplateRow = ImagingResultTemplateRow & { has_file?: boolean };

type TemplateForm = {
  code: string;
  name: string;
  file_name: string;
  sort_order: string;
  is_active: boolean;
  layout: TemplateResultLayoutFormFields;
  signature: TemplateSignatureLayoutFormFields;
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
    layout: emptyTemplateResultLayoutFormFields(),
    signature: emptyTemplateSignatureLayoutFormFields(),
  };
}

function rowToForm(r: ResultTemplateRow): TemplateForm {
  return {
    code: r.code,
    name: r.name,
    file_name: r.file_name,
    sort_order: r.sort_order == null ? "" : String(r.sort_order),
    is_active: r.is_active !== false,
    layout: templateResultLayoutFormFieldsFromDb(r.result_layout),
    signature: templateSignatureLayoutFormFieldsFromDb(r.signature_layout),
  };
}

function TextSlotFields({
  title,
  fields,
  onChange,
}: {
  title: string;
  fields: PrintLayoutFormFields;
  onChange: (next: PrintLayoutFormFields) => void;
}) {
  return (
    <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2, p: 2 }}>
      <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 2 }}>
        {title}
      </Typography>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
          gap: 2,
        }}
      >
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
        <TextField
          label="Line height"
          type="number"
          value={fields.print_line_height}
          onChange={(e) => onChange({ ...fields, print_line_height: e.target.value })}
          {...fieldSx}
        />
        <TextField
          label="Page index"
          type="number"
          value={fields.print_page_index}
          onChange={(e) => onChange({ ...fields, print_page_index: e.target.value })}
          {...fieldSx}
        />
      </Box>
    </Box>
  );
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

export default function SettingsImagingResultTemplatesPage() {
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
      const res = await authenticatedFetch("/api/settings/laboratory/imaging-result-templates");
      const json = (await res.json().catch(() => null)) as {
        templates?: ResultTemplateRow[];
        error?: string;
      } | null;
      if (!res.ok || json?.error) {
        setTemplates([]);
        setListError(json?.error ?? "Failed to load imaging result templates.");
      } else {
        setTemplates(json?.templates ?? []);
      }
    } catch {
      setTemplates([]);
      setListError("Failed to load imaging result templates.");
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
    const layoutBuilt = buildTemplateResultLayoutFromFormFields(f.layout);
    if (!layoutBuilt.ok) return { error: layoutBuilt.error } as const;
    const signatureBuilt = buildTemplateSignatureLayoutFromFormFields(f.signature);
    if (!signatureBuilt.ok) return { error: signatureBuilt.error } as const;
    return {
      payload: {
        code,
        name: f.name.trim(),
        file_name: f.file_name.trim() || defaultImagingResultTemplateFileName(code),
        sort_order: f.sort_order.trim() === "" ? null : Number(f.sort_order),
        is_active: f.is_active,
        result_layout: layoutBuilt.value,
        signature_layout: signatureBuilt.value,
      },
    } as const;
  };

  const handleAdd = async () => {
    setAddError("");
    const built = buildPayload(addForm);
    if ("error" in built) {
      setAddError(built.error ?? "Invalid print coordinates.");
      return;
    }
    setAddSaving(true);
    try {
      const res = await authenticatedFetch("/api/settings/laboratory/imaging-result-templates", {
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
      setEditError(built.error ?? "Invalid print coordinates.");
      return;
    }
    setEditSaving(true);
    try {
      const res = await authenticatedFetch(
        `/api/settings/laboratory/imaging-result-templates/${encodeURIComponent(editingId)}`,
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
    setListError("");
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await authenticatedFetch(
        `/api/settings/laboratory/imaging-result-templates/${encodeURIComponent(templateId)}/upload`,
        { method: "POST", body: form },
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
    setDeleteLoading(true);
    setDeleteError("");
    try {
      const res = await authenticatedFetch(
        `/api/settings/laboratory/imaging-result-templates/${encodeURIComponent(deleteTarget.id)}`,
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

  const formBody = (form: TemplateForm, setForm: (next: TemplateForm) => void) => (
    <Stack spacing={3} sx={{ mt: 1 }}>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
        <TextField label="Code" required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} {...fieldSx} />
        <TextField label="Name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} {...fieldSx} />
      </Stack>
      <TextField
        label="PDF file name"
        value={form.file_name}
        onChange={(e) => setForm({ ...form, file_name: e.target.value })}
        helperText="Under templates/Imaging Results/ on the server"
        {...fieldSx}
      />
      <TextField label="Sort order" type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: e.target.value })} {...fieldSx} />
      <FormControlLabel
        control={<Switch checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />}
        label="Active"
      />
      <Typography variant="caption" color="text.secondary">
        Coordinates use US Letter 612×792 pt; refFromTop is distance from the top edge.
      </Typography>
      <TextSlotFields
        title="Examination name"
        fields={form.layout.examination_name}
        onChange={(examination_name) => setForm({ ...form, layout: { ...form.layout, examination_name } })}
      />
      <TextSlotFields
        title="Findings"
        fields={form.layout.findings}
        onChange={(findings) => setForm({ ...form, layout: { ...form.layout, findings } })}
      />
      <TextSlotFields
        title="Impression"
        fields={form.layout.impression}
        onChange={(impression) => setForm({ ...form, layout: { ...form.layout, impression } })}
      />
      <Typography variant="subtitle1" fontWeight={800} sx={{ pt: 1 }}>
        Signatories
      </Typography>
      <SignatureSlotFields
        title="Radiologic Technologist — name"
        fields={form.signature.radtech_name}
        onChange={(radtech_name) => setForm({ ...form, signature: { ...form.signature, radtech_name } })}
      />
      <SignatureSlotFields
        title="Radiologic Technologist — license no."
        fields={form.signature.radtech_license}
        onChange={(radtech_license) => setForm({ ...form, signature: { ...form.signature, radtech_license } })}
      />
      <ImageSignatureSlotFields
        title="Radiologic Technologist — signature image"
        fields={form.signature.radtech_signature}
        onChange={(radtech_signature) =>
          setForm({ ...form, signature: { ...form.signature, radtech_signature } })
        }
      />
      <SignatureSlotFields
        title="Radiologist — name"
        fields={form.signature.radiologist_name}
        onChange={(radiologist_name) =>
          setForm({ ...form, signature: { ...form.signature, radiologist_name } })
        }
      />
      <SignatureSlotFields
        title="Radiologist — license no."
        fields={form.signature.radiologist_license}
        onChange={(radiologist_license) =>
          setForm({ ...form, signature: { ...form.signature, radiologist_license } })
        }
      />
      <ImageSignatureSlotFields
        title="Radiologist — signature image"
        fields={form.signature.radiologist_signature}
        onChange={(radiologist_signature) =>
          setForm({ ...form, signature: { ...form.signature, radiologist_signature } })
        }
      />
    </Stack>
  );

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1200, mx: "auto" }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Typography variant="h5" fontWeight={800}>
          Imaging result templates
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
                          <Chip size="small" label={r.has_file ? "Yes" : "Missing"} color={r.has_file ? "success" : "warning"} variant="outlined" />
                        </TableCell>
                        <TableCell align="right">{r.sort_order ?? "—"}</TableCell>
                        <TableCell align="center">
                          <Chip size="small" label={r.is_active ? "Yes" : "No"} color={r.is_active ? "primary" : "default"} variant="outlined" />
                        </TableCell>
                        <TableCell align="right">
                          <Tooltip title="Upload PDF">
                            <span>
                              <IconButton size="small" component="label" disabled={uploadingId === r.id}>
                                {uploadingId === r.id ? <CircularProgress size={18} /> : <UploadFileOutlinedIcon fontSize="small" />}
                                <input type="file" accept="application/pdf,.pdf" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleUpload(r.id, f); e.target.value = ""; }} />
                              </IconButton>
                            </span>
                          </Tooltip>
                          <Tooltip title="Edit">
                            <IconButton size="small" onClick={() => { setEditingId(r.id); setEditForm(rowToForm(r)); setEditError(""); setEditOpen(true); }}>
                              <EditIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Delete">
                            <IconButton size="small" color="error" onClick={() => { setDeleteTarget(r); setDeleteError(""); setDeleteOpen(true); }}>
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    ))}
                    {templates.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} align="center" sx={{ py: 4, color: "text.secondary" }}>
                          No imaging result templates yet.
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
                onRowsPerPageChange={(e) => { setRowsPerPage(Number(e.target.value)); setPage(0); }}
                sx={paginationSx}
              />
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={addOpen} onClose={() => setAddOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>Add imaging result template</DialogTitle>
        <DialogContent sx={{ pt: 3 }}>{formBody(addForm, setAddForm)}</DialogContent>
        <DialogActions>
          <Button onClick={() => setAddOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={() => void handleAdd()} disabled={addSaving}>
            {addSaving ? <CircularProgress size={20} color="inherit" /> : "Save"}
          </Button>
        </DialogActions>
        {addError ? <Alert severity="error" sx={{ mx: 3, mb: 2 }}>{addError}</Alert> : null}
      </Dialog>

      <Dialog open={editOpen} onClose={() => setEditOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>Edit imaging result template</DialogTitle>
        <DialogContent sx={{ pt: 3 }}>{formBody(editForm, setEditForm)}</DialogContent>
        <DialogActions>
          <Button onClick={() => setEditOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={() => void handleEdit()} disabled={editSaving}>
            {editSaving ? <CircularProgress size={20} color="inherit" /> : "Save"}
          </Button>
        </DialogActions>
        {editError ? <Alert severity="error" sx={{ mx: 3, mb: 2 }}>{editError}</Alert> : null}
      </Dialog>

      <Dialog open={deleteOpen} onClose={() => setDeleteOpen(false)}>
        <DialogTitle>Delete template?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            Delete <strong>{deleteTarget?.code}</strong> — {deleteTarget?.name}?
          </Typography>
          {deleteError ? <Alert severity="error" sx={{ mt: 2 }}>{deleteError}</Alert> : null}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteOpen(false)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={() => void handleDelete()} disabled={deleteLoading}>
            {deleteLoading ? <CircularProgress size={20} color="inherit" /> : "Delete"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
