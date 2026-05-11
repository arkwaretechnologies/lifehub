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
  InputAdornment,
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
} from "@mui/material";
import SearchOutlinedIcon from "@mui/icons-material/SearchOutlined";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import SaveOutlinedIcon from "@mui/icons-material/SaveOutlined";
import CloseOutlinedIcon from "@mui/icons-material/CloseOutlined";
import VisibilityOffOutlinedIcon from "@mui/icons-material/VisibilityOffOutlined";
import { insertSupplier, listSuppliers, updateSupplier, type SupplierRow } from "@/lib/pharmacyPosDb";

const ROW_FIELD_SX = {
  "& .MuiOutlinedInput-root": { minHeight: 40, alignItems: "center" },
  "& .MuiInputBase-input": { py: 1, fontSize: "0.875rem", lineHeight: 1.43 },
} as const;

const ROWS_PER_PAGE_OPTIONS = [5, 10, 25] as const;

function supplierSearchHaystack(s: SupplierRow): string {
  return [
    s.name,
    s.phone,
    s.email,
    s.contact_person,
    s.address,
    s.tin_no,
    s.notes,
    s.terms_days != null ? String(s.terms_days) : "",
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

type Props = {
  open: boolean;
  onClose: () => void;
  /** Called after a supplier is successfully created (e.g. parent can select it in a dropdown). */
  onSupplierAdded?: (id: number) => void;
};

export default function PharmacySuppliersModal({ open, onClose, onSupplierAdded }: Props) {
  const [rows, setRows] = useState<SupplierRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [msgIsError, setMsgIsError] = useState(false);

  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newContact, setNewContact] = useState("");
  const [newAddress, setNewAddress] = useState("");
  const [newTin, setNewTin] = useState("");
  const [newTerms, setNewTerms] = useState("");
  const [newNotes, setNewNotes] = useState("");

  const [editingId, setEditingId] = useState<number | null>(null);
  const [eName, setEName] = useState("");
  const [ePhone, setEPhone] = useState("");
  const [eEmail, setEEmail] = useState("");
  const [eContact, setEContact] = useState("");
  const [eAddress, setEAddress] = useState("");
  const [eTin, setETin] = useState("");
  const [eTerms, setETerms] = useState("");
  const [eNotes, setENotes] = useState("");

  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadErr(null);
    const { rows: r, error } = await listSuppliers();
    setLoading(false);
    if (error) {
      setLoadErr(error);
      setRows([]);
      return;
    }
    setLoadErr(null);
    setRows(r);
  }, []);

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((s) => supplierSearchHaystack(s).includes(q));
  }, [rows, searchQuery]);

  const maxPageIndex = Math.max(0, Math.ceil(filteredRows.length / rowsPerPage) - 1);
  const pageClamped = Math.min(page, maxPageIndex);

  const paginatedRows = useMemo(() => {
    const start = pageClamped * rowsPerPage;
    return filteredRows.slice(start, start + rowsPerPage);
  }, [filteredRows, pageClamped, rowsPerPage]);

  useEffect(() => {
    if (!open) return;
    void load();
  }, [open, load]);

  useEffect(() => {
    const maxPage = Math.max(0, Math.ceil(filteredRows.length / rowsPerPage) - 1);
    setPage((p) => (p > maxPage ? maxPage : p));
  }, [filteredRows.length, rowsPerPage]);

  useEffect(() => {
    if (!open) {
      setMsg(null);
      setMsgIsError(false);
      setLoadErr(null);
      setNewName("");
      setNewPhone("");
      setNewEmail("");
      setNewContact("");
      setNewAddress("");
      setNewTin("");
      setNewTerms("");
      setNewNotes("");
      setEditingId(null);
      setSearchQuery("");
      setPage(0);
      setRowsPerPage(10);
    }
  }, [open]);

  const addSupplier = async () => {
    if (!newName.trim()) {
      setMsgIsError(true);
      setMsg("Supplier name is required.");
      return;
    }
    const terms = newTerms.trim() === "" ? null : Number(newTerms);
    const { id: newId, error } = await insertSupplier({
      name: newName.trim(),
      phone: newPhone.trim() || null,
      email: newEmail.trim() || null,
      contactPerson: newContact.trim() || null,
      address: newAddress.trim() || null,
      tinNo: newTin.trim() || null,
      termsDays: terms != null && Number.isFinite(terms) ? terms : null,
      notes: newNotes.trim() || null,
    });
    if (error) {
      setMsgIsError(true);
      setMsg(error);
    } else {
      setMsgIsError(false);
      setMsg("Supplier added.");
      if (newId != null) onSupplierAdded?.(newId);
    }
    if (!error) {
      setNewName("");
      setNewPhone("");
      setNewEmail("");
      setNewContact("");
      setNewAddress("");
      setNewTin("");
      setNewTerms("");
      setNewNotes("");
      await load();
    }
  };

  const startEdit = (s: SupplierRow) => {
    setEditingId(s.id);
    setEName(s.name);
    setEPhone(s.phone ?? "");
    setEEmail(s.email ?? "");
    setEContact(s.contact_person ?? "");
    setEAddress(s.address ?? "");
    setETin(s.tin_no ?? "");
    setETerms(s.terms_days != null ? String(s.terms_days) : "");
    setENotes(s.notes ?? "");
  };

  const saveEdit = async () => {
    if (editingId == null) return;
    const terms = eTerms.trim() === "" ? null : Number(eTerms);
    const { error } = await updateSupplier(editingId, {
      name: eName,
      phone: ePhone.trim() || null,
      email: eEmail.trim() || null,
      contactPerson: eContact.trim() || null,
      address: eAddress.trim() || null,
      tinNo: eTin.trim() || null,
      termsDays: terms != null && Number.isFinite(terms) ? terms : null,
      notes: eNotes.trim() || null,
    });
    if (error) {
      setMsgIsError(true);
      setMsg(error);
    } else {
      setMsgIsError(false);
      setMsg("Updated.");
    }
    setEditingId(null);
    await load();
  };

  const deactivate = async (s: SupplierRow) => {
    const { error } = await updateSupplier(s.id, { isActive: false });
    if (error) {
      setMsgIsError(true);
      setMsg(error);
    } else {
      setMsgIsError(false);
      setMsg("Supplier deactivated.");
    }
    await load();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Suppliers</DialogTitle>
      <DialogContent sx={{ overflow: "visible", pt: 1 }}>
        <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>
          New supplier
        </Typography>
        <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1.5 }}>
          Fields: name, address, contact person, email, phone, TIN, payment terms (days), notes.
        </Typography>
        <Stack spacing={1.5} sx={{ mb: 3 }}>
          <TextField
            required
            label="Name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            fullWidth
            size="small"
            InputLabelProps={{ shrink: true }}
            sx={ROW_FIELD_SX}
          />
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
            <TextField
              label="Phone"
              value={newPhone}
              onChange={(e) => setNewPhone(e.target.value)}
              fullWidth
              size="small"
              InputLabelProps={{ shrink: true }}
              sx={ROW_FIELD_SX}
            />
            <TextField
              label="Email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              fullWidth
              size="small"
              InputLabelProps={{ shrink: true }}
              sx={ROW_FIELD_SX}
            />
          </Stack>
          <TextField
            label="Contact person"
            value={newContact}
            onChange={(e) => setNewContact(e.target.value)}
            fullWidth
            size="small"
            InputLabelProps={{ shrink: true }}
            sx={ROW_FIELD_SX}
          />
          <TextField
            label="Address"
            value={newAddress}
            onChange={(e) => setNewAddress(e.target.value)}
            fullWidth
            size="small"
            multiline
            minRows={2}
            InputLabelProps={{ shrink: true }}
            sx={ROW_FIELD_SX}
          />
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
            <TextField
              label="TIN no."
              value={newTin}
              onChange={(e) => setNewTin(e.target.value)}
              fullWidth
              size="small"
              InputLabelProps={{ shrink: true }}
              sx={ROW_FIELD_SX}
            />
            <TextField
              label="Terms (days)"
              value={newTerms}
              onChange={(e) => setNewTerms(e.target.value.replace(/[^\d]/g, ""))}
              fullWidth
              size="small"
              InputLabelProps={{ shrink: true }}
              sx={ROW_FIELD_SX}
            />
          </Stack>
          <TextField
            label="Notes"
            value={newNotes}
            onChange={(e) => setNewNotes(e.target.value)}
            fullWidth
            size="small"
            multiline
            minRows={2}
            InputLabelProps={{ shrink: true }}
            sx={ROW_FIELD_SX}
          />
          <Button variant="contained" onClick={() => void addSupplier()}>
            Add supplier
          </Button>
        </Stack>

        {loadErr && (
          <Alert severity="error" onClose={() => setLoadErr(null)} sx={{ mb: 2 }}>
            Could not load suppliers: {loadErr}
          </Alert>
        )}
        {msg && (
          <Alert severity={msgIsError ? "error" : "success"} sx={{ mb: 2 }} onClose={() => setMsg(null)}>
            {msg}
          </Alert>
        )}

        <TextField
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setPage(0);
          }}
          placeholder="Search suppliers…"
          fullWidth
          size="small"
          InputLabelProps={{ shrink: true }}
          label="Search"
          sx={{ ...ROW_FIELD_SX, mb: 1.5 }}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchOutlinedIcon fontSize="small" color="action" />
                </InputAdornment>
              ),
            },
          }}
        />

        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Phone</TableCell>
                <TableCell>Email</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading && (
                <TableRow>
                  <TableCell colSpan={4} align="center" sx={{ py: 3 }}>
                    <CircularProgress size={28} />
                  </TableCell>
                </TableRow>
              )}
              {!loading &&
                paginatedRows.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell sx={{ maxWidth: 200 }}>
                      {editingId === s.id ? (
                        <TextField
                          size="small"
                          hiddenLabel
                          placeholder="Name"
                          value={eName}
                          onChange={(e) => setEName(e.target.value)}
                          fullWidth
                          sx={ROW_FIELD_SX}
                        />
                      ) : (
                        <>
                          {s.name}
                          {s.is_active === false && (
                            <Typography variant="caption" color="text.secondary" display="block">
                              (inactive)
                            </Typography>
                          )}
                        </>
                      )}
                    </TableCell>
                    <TableCell>
                      {editingId === s.id ? (
                        <TextField
                          size="small"
                          hiddenLabel
                          placeholder="Phone"
                          value={ePhone}
                          onChange={(e) => setEPhone(e.target.value)}
                          fullWidth
                          sx={ROW_FIELD_SX}
                        />
                      ) : (
                        s.phone ?? "—"
                      )}
                    </TableCell>
                    <TableCell>
                      {editingId === s.id ? (
                        <TextField
                          size="small"
                          hiddenLabel
                          placeholder="Email"
                          value={eEmail}
                          onChange={(e) => setEEmail(e.target.value)}
                          fullWidth
                          sx={ROW_FIELD_SX}
                        />
                      ) : (
                        s.email ?? "—"
                      )}
                    </TableCell>
                    <TableCell align="right">
                      {editingId === s.id ? (
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
                          <IconButton size="small" onClick={() => startEdit(s)} disabled={s.is_active === false}>
                            <EditOutlinedIcon fontSize="small" />
                          </IconButton>
                          <IconButton
                            size="small"
                            color="warning"
                            onClick={() => void deactivate(s)}
                            disabled={s.is_active === false}
                            title="Deactivate"
                          >
                            <VisibilityOffOutlinedIcon fontSize="small" />
                          </IconButton>
                        </Stack>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              {!loading && rows.length === 0 && !loadErr && (
                <TableRow>
                  <TableCell colSpan={4}>
                    <Typography variant="body2" color="text.secondary">
                      No suppliers — add one above.
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
              {!loading && rows.length > 0 && filteredRows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4}>
                    <Typography variant="body2" color="text.secondary">
                      No suppliers match your search.
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination
          component="div"
          count={filteredRows.length}
          page={pageClamped}
          onPageChange={(_, newPage) => setPage(newPage)}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={(e) => {
            setRowsPerPage(Number.parseInt(e.target.value, 10));
            setPage(0);
          }}
          rowsPerPageOptions={[...ROWS_PER_PAGE_OPTIONS]}
          labelRowsPerPage="Rows per page"
        />
        {editingId != null && (
          <Stack spacing={1.5} sx={{ mt: 2 }}>
            <Typography variant="caption" color="text.secondary">
              Edit details (expanded row)
            </Typography>
            <TextField
              label="Contact person"
              size="small"
              value={eContact}
              onChange={(e) => setEContact(e.target.value)}
              fullWidth
              InputLabelProps={{ shrink: true }}
              sx={ROW_FIELD_SX}
            />
            <TextField
              label="Address"
              size="small"
              value={eAddress}
              onChange={(e) => setEAddress(e.target.value)}
              fullWidth
              multiline
              minRows={2}
              InputLabelProps={{ shrink: true }}
              sx={ROW_FIELD_SX}
            />
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
              <TextField
                label="TIN no."
                size="small"
                value={eTin}
                onChange={(e) => setETin(e.target.value)}
                fullWidth
                InputLabelProps={{ shrink: true }}
                sx={ROW_FIELD_SX}
              />
              <TextField
                label="Terms (days)"
                size="small"
                value={eTerms}
                onChange={(e) => setETerms(e.target.value.replace(/[^\d]/g, ""))}
                fullWidth
                InputLabelProps={{ shrink: true }}
                sx={ROW_FIELD_SX}
              />
            </Stack>
            <TextField
              label="Notes"
              size="small"
              value={eNotes}
              onChange={(e) => setENotes(e.target.value)}
              fullWidth
              multiline
              minRows={2}
              InputLabelProps={{ shrink: true }}
              sx={ROW_FIELD_SX}
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
