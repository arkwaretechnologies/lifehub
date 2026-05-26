"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  TextField,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  CircularProgress,
  IconButton,
  Tooltip,
  Grid,
  MenuItem,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/components/AuthProvider";
import { authenticatedFetch } from "@/lib/authenticatedFetch";
import { isLabSignatureRole } from "@/lib/labResultSignatures";

type AppUserRow = {
  user_id: number | string;
  username: string;
  fullname: string;
  address: string | null;
  email_address: string | null;
  phone_no: string | null;
  role: string;
  branch_code: string | null;
  specialty: string | null;
  license_no: string | null;
  s2_no: string | null;
  ptr_no: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type UserForm = {
  username: string;
  fullname: string;
  email_address: string;
  phone_no: string;
  role: string;
  branch_code: string;
  address: string;
  specialty: string;
  license_no: string;
  s2_no: string;
  ptr_no: string;
  password: string;
};

const emptyForm: UserForm = {
  username: "",
  fullname: "",
  email_address: "",
  phone_no: "",
  role: "",
  branch_code: "",
  address: "",
  specialty: "",
  license_no: "",
  s2_no: "",
  ptr_no: "",
  password: "",
};

/** Add/Edit user dialogs: medium inputs with consistent min height (matches Role select). */
const dialogFieldProps = {
  fullWidth: true as const,
  sx: {
    "& .MuiOutlinedInput-root": {
      minHeight: 44,
      borderRadius: 10,
    },
    "& .MuiOutlinedInput-root.MuiInputBase-multiline": {
      alignItems: "flex-start",
      py: 1.25,
      minHeight: 88,
    },
  },
};

type RoleOptionRow = { role_id: number; name: string };

/** Matches `roles.name` case-insensitively (e.g. PHYSICIAN, Physician). */
function isPhysicianRole(roleName: string): boolean {
  return roleName.trim().toUpperCase() === "PHYSICIAN";
}

function clearsLabSignatureFields(roleName: string): boolean {
  return !isLabSignatureRole(roleName);
}

function clearsPhysicianOnlyFields(roleName: string): boolean {
  return !isPhysicianRole(roleName);
}

function rowToForm(r: AppUserRow): UserForm {
  return {
    username: r.username ?? "",
    fullname: r.fullname ?? "",
    email_address: r.email_address ?? "",
    phone_no: r.phone_no ?? "",
    role: r.role ?? "",
    branch_code: r.branch_code ?? "",
    address: r.address ?? "",
    specialty: r.specialty ?? "",
    license_no: r.license_no ?? "",
    s2_no: r.s2_no ?? "",
    ptr_no: r.ptr_no ?? "",
    password: "",
  };
}

function formToUpdatePayload(f: UserForm) {
  const labSig = isLabSignatureRole(f.role);
  const ph = isPhysicianRole(f.role);
  return {
    username: f.username.trim(),
    fullname: f.fullname.trim(),
    email_address: f.email_address.trim() || null,
    phone_no: f.phone_no.trim() || null,
    role: f.role.trim(),
    branch_code: f.branch_code.trim() || null,
    address: f.address.trim() || null,
    specialty: labSig ? f.specialty.trim() || null : null,
    license_no: labSig ? f.license_no.trim() || null : null,
    s2_no: ph ? f.s2_no.trim() || null : null,
    ptr_no: ph ? f.ptr_no.trim() || null : null,
  };
}

export default function UsersPage() {
  const { profile } = useAuth();
  const myUserId = profile?.user_id;

  const [users, setUsers] = useState<AppUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState("");

  const [rolesForSelect, setRolesForSelect] = useState<RoleOptionRow[]>([]);
  const [rolesLoading, setRolesLoading] = useState(false);

  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState<UserForm>(emptyForm);
  const [addSaving, setAddSaving] = useState(false);
  const [addError, setAddError] = useState("");

  const [editOpen, setEditOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | number | null>(null);
  const [editForm, setEditForm] = useState<UserForm>(emptyForm);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState("");

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AppUserRow | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const loadUsers = useCallback(async () => {
    setListError("");
    setLoading(true);
    const { data, error } = await supabase
      .from("users")
      .select("*")
      .order("user_id", { ascending: true });
    setLoading(false);
    if (error) {
      setListError(error.message);
      setUsers([]);
      return;
    }
    setUsers((data ?? []) as AppUserRow[]);
  }, []);

  const loadRolesForSelect = useCallback(async () => {
    setRolesLoading(true);
    try {
      const res = await authenticatedFetch("/api/roles");
      const json = (await res.json().catch(() => null)) as
        | { roles?: RoleOptionRow[]; error?: string }
        | null;
      if (res.ok && json?.roles) {
        setRolesForSelect(json.roles);
      } else {
        setRolesForSelect([]);
      }
    } catch {
      setRolesForSelect([]);
    } finally {
      setRolesLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  useEffect(() => {
    void loadRolesForSelect();
  }, [loadRolesForSelect]);

  const roleNamesSet = new Set(rolesForSelect.map((r) => r.name));

  const openAdd = () => {
    setAddForm(emptyForm);
    setAddError("");
    void loadRolesForSelect();
    setAddOpen(true);
  };

  const handleAddSave = async () => {
    if (!addForm.username.trim() || !addForm.fullname.trim() || !addForm.role.trim()) {
      setAddError("Username, full name, and role are required.");
      return;
    }
    if (!addForm.password.trim() || addForm.password.trim().length < 6) {
      setAddError("Initial password is required (minimum 6 characters).");
      return;
    }
    setAddSaving(true);
    setAddError("");
    try {
      const res = await authenticatedFetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formToUpdatePayload(addForm),
          password: addForm.password.trim(),
        }),
      });
      const json = (await res.json().catch(() => null)) as
        | { user?: unknown; error?: string; warning?: string }
        | null;
      if (!res.ok || !json || json.error) {
        setAddError(json?.error || "Failed to create user.");
        setAddSaving(false);
        return;
      }
      setAddOpen(false);
      setAddForm(emptyForm);
      await loadUsers();
    } catch {
      setAddError("An unexpected error occurred.");
    } finally {
      setAddSaving(false);
    }
  };

  const openEdit = (row: AppUserRow) => {
    setEditingId(row.user_id);
    setEditForm(rowToForm(row));
    setEditError("");
    void loadRolesForSelect();
    setEditOpen(true);
  };

  const handleEditSave = async () => {
    if (editingId == null) return;
    if (!editForm.username.trim() || !editForm.fullname.trim() || !editForm.role.trim()) {
      setEditError("Username, full name, and role are required.");
      return;
    }
    setEditSaving(true);
    setEditError("");
    const payload = formToUpdatePayload(editForm);
    const { error } = await supabase.from("users").update(payload).eq("user_id", editingId);
    if (error) {
      setEditError(error.message);
      setEditSaving(false);
      return;
    }
    if (editForm.password.trim()) {
      if (editForm.password.length < 6) {
        setEditError("New password must be at least 6 characters.");
        setEditSaving(false);
        return;
      }
      const res = await authenticatedFetch(`/api/users/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: editForm.password }),
      });
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok || json?.error) {
        setEditError(json?.error || "Profile saved but password update failed.");
        setEditSaving(false);
        await loadUsers();
        return;
      }
    }
    setEditOpen(false);
    setEditingId(null);
    setEditForm(emptyForm);
    setEditSaving(false);
    await loadUsers();
  };

  const openDelete = (row: AppUserRow) => {
    setDeleteTarget(row);
    setDeleteOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    if (String(deleteTarget.user_id) === String(myUserId)) {
      return;
    }
    setDeleteLoading(true);
    const { error } = await supabase.from("users").delete().eq("user_id", deleteTarget.user_id);
    setDeleteLoading(false);
    if (error) {
      setListError(error.message);
      setDeleteOpen(false);
      setDeleteTarget(null);
      return;
    }
    setDeleteOpen(false);
    setDeleteTarget(null);
    await loadUsers();
  };

  return (
    <>
      <Box
        sx={{
          mb: 3,
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 2,
        }}
      >
        <Typography variant="h5">Users</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={openAdd}>
          Add user
        </Button>
      </Box>

      {listError ? (
        <Alert severity="error" sx={{ mb: 2 }}>
          {listError}
        </Alert>
      ) : null}

      <Card>
        <CardContent sx={{ p: 3 }}>
          {loading ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
              <CircularProgress />
            </Box>
          ) : users.length === 0 ? (
            <Typography color="text.secondary">No users found.</Typography>
          ) : (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>ID</TableCell>
                    <TableCell>Username</TableCell>
                    <TableCell>Full name</TableCell>
                    <TableCell>Role</TableCell>
                    <TableCell>Branch</TableCell>
                    <TableCell>Email</TableCell>
                    <TableCell>Phone</TableCell>
                    <TableCell align="right">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {users.map((u) => {
                    const isSelf = String(u.user_id) === String(myUserId);
                    return (
                      <TableRow key={String(u.user_id)}>
                        <TableCell>{u.user_id}</TableCell>
                        <TableCell>{u.username}</TableCell>
                        <TableCell>{u.fullname}</TableCell>
                        <TableCell sx={{ textTransform: "capitalize" }}>{u.role}</TableCell>
                        <TableCell>{u.branch_code}</TableCell>
                        <TableCell>{u.email_address}</TableCell>
                        <TableCell>{u.phone_no}</TableCell>
                        <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                          <Tooltip title="Edit">
                            <IconButton size="small" color="primary" onClick={() => openEdit(u)}>
                              <EditIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title={isSelf ? "You cannot delete your own account" : "Delete"}>
                            <span>
                              <IconButton
                                size="small"
                                color="error"
                                disabled={isSelf}
                                onClick={() => openDelete(u)}
                              >
                                <DeleteIcon fontSize="small" />
                              </IconButton>
                            </span>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </CardContent>
      </Card>

      <Dialog open={addOpen} onClose={() => (addSaving ? null : setAddOpen(false))} maxWidth="sm" fullWidth>
        <DialogTitle>Add user</DialogTitle>
        <DialogContent>
          {addError ? (
            <Alert severity="error" sx={{ mb: 2, mt: 1 }} onClose={() => setAddError("")}>
              {addError}
            </Alert>
          ) : null}
          <Box sx={{ pt: 1 }}>
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, sm: 6 }}>
                <Typography variant="caption" color="text.secondary" fontWeight={600} display="block" sx={{ mb: 0.75 }}>
                  Username *
                </Typography>
                <TextField
                  {...dialogFieldProps}
                  value={addForm.username}
                  onChange={(e) => setAddForm((p) => ({ ...p, username: e.target.value }))}
                  required
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <Typography variant="caption" color="text.secondary" fontWeight={600} display="block" sx={{ mb: 0.75 }}>
                  Full name *
                </Typography>
                <TextField
                  {...dialogFieldProps}
                  value={addForm.fullname}
                  onChange={(e) => setAddForm((p) => ({ ...p, fullname: e.target.value }))}
                  required
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <Typography variant="caption" color="text.secondary" fontWeight={600} display="block" sx={{ mb: 0.75 }}>
                  Role *
                </Typography>
                <TextField
                  {...dialogFieldProps}
                  select
                  value={addForm.role}
                  onChange={(e) => {
                    const next = e.target.value;
                    setAddForm((p) => ({
                      ...p,
                      role: next,
                      ...(clearsLabSignatureFields(next)
                        ? { specialty: "", license_no: "" }
                        : {}),
                      ...(clearsPhysicianOnlyFields(next) ? { s2_no: "", ptr_no: "" } : {}),
                    }));
                  }}
                  required
                  disabled={rolesLoading}
                  SelectProps={{ displayEmpty: true }}
                  helperText={
                    rolesForSelect.length === 0 && !rolesLoading
                      ? "No roles defined yet. Create them under User management → Roles."
                      : undefined
                  }
                >
                  <MenuItem value="">
                    <em>Select a role</em>
                  </MenuItem>
                  {rolesForSelect.map((r) => (
                    <MenuItem key={r.role_id} value={r.name}>
                      {r.name}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <Typography variant="caption" color="text.secondary" fontWeight={600} display="block" sx={{ mb: 0.75 }}>
                  Branch code
                </Typography>
                <TextField
                  {...dialogFieldProps}
                  value={addForm.branch_code}
                  onChange={(e) => setAddForm((p) => ({ ...p, branch_code: e.target.value }))}
                />
              </Grid>
              <Grid size={{ xs: 12 }}>
                <Typography variant="caption" color="text.secondary" fontWeight={600} display="block" sx={{ mb: 0.75 }}>
                  Initial password *
                </Typography>
                <TextField
                  {...dialogFieldProps}
                  type="password"
                  value={addForm.password}
                  onChange={(e) => setAddForm((p) => ({ ...p, password: e.target.value }))}
                  required
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <Typography variant="caption" color="text.secondary" fontWeight={600} display="block" sx={{ mb: 0.75 }}>
                  Email
                </Typography>
                <TextField
                  {...dialogFieldProps}
                  type="email"
                  value={addForm.email_address}
                  onChange={(e) => setAddForm((p) => ({ ...p, email_address: e.target.value }))}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <Typography variant="caption" color="text.secondary" fontWeight={600} display="block" sx={{ mb: 0.75 }}>
                  Phone
                </Typography>
                <TextField
                  {...dialogFieldProps}
                  value={addForm.phone_no}
                  onChange={(e) => setAddForm((p) => ({ ...p, phone_no: e.target.value }))}
                />
              </Grid>
              <Grid size={{ xs: 12 }}>
                <Typography variant="caption" color="text.secondary" fontWeight={600} display="block" sx={{ mb: 0.75 }}>
                  Address
                </Typography>
                <TextField
                  {...dialogFieldProps}
                  value={addForm.address}
                  onChange={(e) => setAddForm((p) => ({ ...p, address: e.target.value }))}
                />
              </Grid>
              {isLabSignatureRole(addForm.role) ? (
                <Grid size={{ xs: 12 }}>
                  <Grid container spacing={2}>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <Typography variant="caption" color="text.secondary" fontWeight={600} display="block" sx={{ mb: 0.75 }}>
                        Specialty
                      </Typography>
                      <TextField
                        {...dialogFieldProps}
                        value={addForm.specialty}
                        onChange={(e) => setAddForm((p) => ({ ...p, specialty: e.target.value }))}
                        placeholder="Medical Technologist or Pathologist"
                      />
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <Typography variant="caption" color="text.secondary" fontWeight={600} display="block" sx={{ mb: 0.75 }}>
                        License no.
                      </Typography>
                      <TextField
                        {...dialogFieldProps}
                        value={addForm.license_no}
                        onChange={(e) => setAddForm((p) => ({ ...p, license_no: e.target.value }))}
                      />
                    </Grid>
                  </Grid>
                </Grid>
              ) : null}
              {isPhysicianRole(addForm.role) ? (
                <Grid size={{ xs: 12 }}>
                  <Grid container spacing={2}>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <Typography variant="caption" color="text.secondary" fontWeight={600} display="block" sx={{ mb: 0.75 }}>
                        S2 no.
                      </Typography>
                      <TextField
                        {...dialogFieldProps}
                        value={addForm.s2_no}
                        onChange={(e) => setAddForm((p) => ({ ...p, s2_no: e.target.value }))}
                      />
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <Typography variant="caption" color="text.secondary" fontWeight={600} display="block" sx={{ mb: 0.75 }}>
                        PTR no.
                      </Typography>
                      <TextField
                        {...dialogFieldProps}
                        value={addForm.ptr_no}
                        onChange={(e) => setAddForm((p) => ({ ...p, ptr_no: e.target.value }))}
                      />
                    </Grid>
                  </Grid>
                </Grid>
              ) : null}
            </Grid>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setAddOpen(false)} disabled={addSaving}>
            Cancel
          </Button>
          <Button variant="contained" onClick={() => void handleAddSave()} disabled={addSaving}>
            {addSaving ? <CircularProgress size={20} color="inherit" /> : "Save"}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={editOpen} onClose={() => (editSaving ? null : setEditOpen(false))} maxWidth="sm" fullWidth>
        <DialogTitle>Edit user</DialogTitle>
        <DialogContent>
          {editError ? (
            <Alert severity="error" sx={{ mb: 2, mt: 1 }} onClose={() => setEditError("")}>
              {editError}
            </Alert>
          ) : null}
          <Box sx={{ pt: 1 }}>
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, sm: 6 }}>
                <Typography variant="caption" color="text.secondary" fontWeight={600} display="block" sx={{ mb: 0.75 }}>
                  Username *
                </Typography>
                <TextField
                  {...dialogFieldProps}
                  value={editForm.username}
                  onChange={(e) => setEditForm((p) => ({ ...p, username: e.target.value }))}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <Typography variant="caption" color="text.secondary" fontWeight={600} display="block" sx={{ mb: 0.75 }}>
                  Full name *
                </Typography>
                <TextField
                  {...dialogFieldProps}
                  value={editForm.fullname}
                  onChange={(e) => setEditForm((p) => ({ ...p, fullname: e.target.value }))}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <Typography variant="caption" color="text.secondary" fontWeight={600} display="block" sx={{ mb: 0.75 }}>
                  Role *
                </Typography>
                <TextField
                  {...dialogFieldProps}
                  select
                  value={editForm.role}
                  onChange={(e) => {
                    const next = e.target.value;
                    setEditForm((p) => ({
                      ...p,
                      role: next,
                      ...(clearsLabSignatureFields(next)
                        ? { specialty: "", license_no: "" }
                        : {}),
                      ...(clearsPhysicianOnlyFields(next) ? { s2_no: "", ptr_no: "" } : {}),
                    }));
                  }}
                  SelectProps={{ displayEmpty: true }}
                >
                  {rolesLoading && editForm.role ? (
                    <MenuItem value={editForm.role}>{editForm.role}</MenuItem>
                  ) : null}
                  {!rolesLoading && editForm.role && !roleNamesSet.has(editForm.role) ? (
                    <MenuItem value={editForm.role}>
                      {editForm.role} (not in roles list)
                    </MenuItem>
                  ) : null}
                  {!rolesLoading &&
                    rolesForSelect.map((r) => (
                      <MenuItem key={r.role_id} value={r.name}>
                        {r.name}
                      </MenuItem>
                    ))}
                </TextField>
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <Typography variant="caption" color="text.secondary" fontWeight={600} display="block" sx={{ mb: 0.75 }}>
                  Branch code
                </Typography>
                <TextField
                  {...dialogFieldProps}
                  value={editForm.branch_code}
                  onChange={(e) => setEditForm((p) => ({ ...p, branch_code: e.target.value }))}
                />
              </Grid>
              <Grid size={{ xs: 12 }}>
                <Typography variant="caption" color="text.secondary" fontWeight={600} display="block" sx={{ mb: 0.75 }}>
                  New password
                </Typography>
                <TextField
                  {...dialogFieldProps}
                  type="password"
                  value={editForm.password}
                  onChange={(e) => setEditForm((p) => ({ ...p, password: e.target.value }))}
                  helperText="Leave blank to keep current password."
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <Typography variant="caption" color="text.secondary" fontWeight={600} display="block" sx={{ mb: 0.75 }}>
                  Email
                </Typography>
                <TextField
                  {...dialogFieldProps}
                  type="email"
                  value={editForm.email_address}
                  onChange={(e) => setEditForm((p) => ({ ...p, email_address: e.target.value }))}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <Typography variant="caption" color="text.secondary" fontWeight={600} display="block" sx={{ mb: 0.75 }}>
                  Phone
                </Typography>
                <TextField
                  {...dialogFieldProps}
                  value={editForm.phone_no}
                  onChange={(e) => setEditForm((p) => ({ ...p, phone_no: e.target.value }))}
                />
              </Grid>
              <Grid size={{ xs: 12 }}>
                <Typography variant="caption" color="text.secondary" fontWeight={600} display="block" sx={{ mb: 0.75 }}>
                  Address
                </Typography>
                <TextField
                  {...dialogFieldProps}
                  value={editForm.address}
                  onChange={(e) => setEditForm((p) => ({ ...p, address: e.target.value }))}
                />
              </Grid>
              {isLabSignatureRole(editForm.role) ? (
                <Grid size={{ xs: 12 }}>
                  <Grid container spacing={2}>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <Typography variant="caption" color="text.secondary" fontWeight={600} display="block" sx={{ mb: 0.75 }}>
                        Specialty
                      </Typography>
                      <TextField
                        {...dialogFieldProps}
                        value={editForm.specialty}
                        onChange={(e) => setEditForm((p) => ({ ...p, specialty: e.target.value }))}
                        placeholder="Medical Technologist or Pathologist"
                      />
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <Typography variant="caption" color="text.secondary" fontWeight={600} display="block" sx={{ mb: 0.75 }}>
                        License no.
                      </Typography>
                      <TextField
                        {...dialogFieldProps}
                        value={editForm.license_no}
                        onChange={(e) => setEditForm((p) => ({ ...p, license_no: e.target.value }))}
                      />
                    </Grid>
                  </Grid>
                </Grid>
              ) : null}
              {isPhysicianRole(editForm.role) ? (
                <Grid size={{ xs: 12 }}>
                  <Grid container spacing={2}>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <Typography variant="caption" color="text.secondary" fontWeight={600} display="block" sx={{ mb: 0.75 }}>
                        S2 no.
                      </Typography>
                      <TextField
                        {...dialogFieldProps}
                        value={editForm.s2_no}
                        onChange={(e) => setEditForm((p) => ({ ...p, s2_no: e.target.value }))}
                      />
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <Typography variant="caption" color="text.secondary" fontWeight={600} display="block" sx={{ mb: 0.75 }}>
                        PTR no.
                      </Typography>
                      <TextField
                        {...dialogFieldProps}
                        value={editForm.ptr_no}
                        onChange={(e) => setEditForm((p) => ({ ...p, ptr_no: e.target.value }))}
                      />
                    </Grid>
                  </Grid>
                </Grid>
              ) : null}
            </Grid>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setEditOpen(false)} disabled={editSaving}>
            Cancel
          </Button>
          <Button variant="contained" onClick={() => void handleEditSave()} disabled={editSaving}>
            {editSaving ? <CircularProgress size={20} color="inherit" /> : "Save changes"}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={deleteOpen} onClose={() => (deleteLoading ? null : setDeleteOpen(false))}>
        <DialogTitle>Delete user?</DialogTitle>
        <DialogContent>
          <Typography>
            Remove <strong>{deleteTarget?.username}</strong> ({deleteTarget?.fullname})? This cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteOpen(false)} disabled={deleteLoading}>
            Cancel
          </Button>
          <Button
            color="error"
            variant="contained"
            onClick={() => void handleDeleteConfirm()}
            disabled={deleteLoading}
          >
            {deleteLoading ? <CircularProgress size={20} color="inherit" /> : "Delete"}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
