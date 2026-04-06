"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  Grid,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import SaveOutlinedIcon from "@mui/icons-material/SaveOutlined";
import {
  PERMISSION_MODULES,
  leafKeysForModule,
  type PermissionModule,
} from "@/lib/navPermissionCatalog";

type RoleRow = {
  role_id: number;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
};

function modulesBySection(): { heading: string; modules: PermissionModule[] }[] {
  const map = new Map<string, PermissionModule[]>();
  for (const m of PERMISSION_MODULES) {
    const list = map.get(m.sectionHeading) ?? [];
    list.push(m);
    map.set(m.sectionHeading, list);
  }
  const order = ["OVERVIEW", "OPERATIONS", "MANAGEMENT"];
  return order
    .filter((h) => map.has(h))
    .map((heading) => ({ heading, modules: map.get(heading)! }));
}

export default function RolesPage() {
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState("");

  const [selectedId, setSelectedId] = useState<number | null>(null);

  const [pageKeysDraft, setPageKeysDraft] = useState<Set<string>>(new Set());
  const [pagesLoading, setPagesLoading] = useState(false);
  const [pagesError, setPagesError] = useState("");
  const [pagesDirty, setPagesDirty] = useState(false);
  const [pagesSaving, setPagesSaving] = useState(false);

  const [addOpen, setAddOpen] = useState(false);
  const [addName, setAddName] = useState("");
  const [addDescription, setAddDescription] = useState("");
  const [addSaving, setAddSaving] = useState(false);
  const [addError, setAddError] = useState("");

  const [editOpen, setEditOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<RoleRow | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState("");

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<RoleRow | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const sectionGroups = useMemo(() => modulesBySection(), []);

  const loadRoles = useCallback(async () => {
    setListError("");
    setListLoading(true);
    try {
      const res = await fetch("/api/roles");
      const json = (await res.json().catch(() => null)) as
        | { roles?: RoleRow[]; error?: string }
        | null;
      if (!res.ok || !json || json.error) {
        setListError(json?.error || "Failed to load roles.");
        setRoles([]);
        return;
      }
      setRoles(json.roles ?? []);
    } catch {
      setListError("Failed to load roles.");
      setRoles([]);
    } finally {
      setListLoading(false);
    }
  }, []);

  const loadPages = useCallback(async (roleId: number) => {
    setPagesError("");
    setPagesLoading(true);
    setPagesDirty(false);
    try {
      const res = await fetch(`/api/roles/${roleId}/pages`);
      const json = (await res.json().catch(() => null)) as
        | { pageKeys?: string[]; error?: string }
        | null;
      if (!res.ok || !json || json.error) {
        setPagesError(json?.error || "Failed to load menu access.");
        setPageKeysDraft(new Set());
        return;
      }
      setPageKeysDraft(new Set(json.pageKeys ?? []));
    } catch {
      setPagesError("Failed to load menu access.");
      setPageKeysDraft(new Set());
    } finally {
      setPagesLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRoles();
  }, [loadRoles]);

  useEffect(() => {
    if (selectedId !== null) {
      void loadPages(selectedId);
    } else {
      setPageKeysDraft(new Set());
      setPagesDirty(false);
      setPagesError("");
    }
  }, [selectedId, loadPages]);

  const toggleLeafKey = (key: string, checked: boolean) => {
    setPageKeysDraft((prev) => {
      const next = new Set(prev);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
    setPagesDirty(true);
  };

  const toggleGroupModule = (m: PermissionModule & { kind: "group" }) => {
    const keys = leafKeysForModule(m);
    const allOn = keys.length > 0 && keys.every((k) => pageKeysDraft.has(k));
    setPageKeysDraft((prev) => {
      const next = new Set(prev);
      if (allOn) {
        for (const k of keys) next.delete(k);
      } else {
        for (const k of keys) next.add(k);
      }
      return next;
    });
    setPagesDirty(true);
  };

  const handleSavePages = async () => {
    if (selectedId === null) return;
    setPagesSaving(true);
    setPagesError("");
    try {
      const res = await fetch(`/api/roles/${selectedId}/pages`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pageKeys: Array.from(pageKeysDraft) }),
      });
      const json = (await res.json().catch(() => null)) as
        | { pageKeys?: string[]; error?: string }
        | null;
      if (!res.ok || !json || json.error) {
        setPagesError(json?.error || "Failed to save menu access.");
        return;
      }
      setPageKeysDraft(new Set(json.pageKeys ?? []));
      setPagesDirty(false);
      void loadRoles();
    } catch {
      setPagesError("Failed to save menu access.");
    } finally {
      setPagesSaving(false);
    }
  };

  const openAdd = () => {
    setAddName("");
    setAddDescription("");
    setAddError("");
    setAddOpen(true);
  };

  const handleAddSave = async () => {
    const name = addName.trim();
    if (!name) {
      setAddError("Name is required.");
      return;
    }
    setAddSaving(true);
    setAddError("");
    try {
      const res = await fetch("/api/roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description: addDescription.trim() || null,
        }),
      });
      const json = (await res.json().catch(() => null)) as
        | { role?: RoleRow; error?: string }
        | null;
      if (!res.ok || !json || json.error) {
        setAddError(json?.error || "Failed to create role.");
        return;
      }
      setAddOpen(false);
      await loadRoles();
      if (json.role?.role_id != null) {
        setSelectedId(json.role.role_id);
      }
    } catch {
      setAddError("An unexpected error occurred.");
    } finally {
      setAddSaving(false);
    }
  };

  const openEdit = (r: RoleRow) => {
    setEditingRole(r);
    setEditName(r.name);
    setEditDescription(r.description ?? "");
    setEditError("");
    setEditOpen(true);
  };

  const handleEditSave = async () => {
    if (editingRole === null) return;
    const name = editName.trim();
    if (!name) {
      setEditError("Name is required.");
      return;
    }
    setEditSaving(true);
    setEditError("");
    try {
      const res = await fetch(`/api/roles/${editingRole.role_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description: editDescription.trim() || null,
        }),
      });
      const json = (await res.json().catch(() => null)) as
        | { role?: RoleRow; error?: string }
        | null;
      if (!res.ok || !json || json.error) {
        setEditError(json?.error || "Failed to update role.");
        return;
      }
      setEditOpen(false);
      setEditingRole(null);
      await loadRoles();
    } catch {
      setEditError("An unexpected error occurred.");
    } finally {
      setEditSaving(false);
    }
  };

  const openDelete = (r: RoleRow) => {
    setDeleteTarget(r);
    setDeleteError("");
    setDeleteOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    setDeleteError("");
    try {
      const res = await fetch(`/api/roles/${deleteTarget.role_id}`, { method: "DELETE" });
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok || json?.error) {
        setDeleteError(json?.error || "Failed to delete role.");
        return;
      }
      if (selectedId === deleteTarget.role_id) {
        setSelectedId(null);
      }
      setDeleteOpen(false);
      setDeleteTarget(null);
      await loadRoles();
    } finally {
      setDeleteLoading(false);
    }
  };

  const renderModuleRow = (m: PermissionModule) => {
    if (m.kind === "leaf") {
      const checked = pageKeysDraft.has(m.pageKey);
      return (
        <Box key={m.id} sx={{ py: 0.5 }}>
          <FormControlLabel
            control={
              <Checkbox
                size="small"
                checked={checked}
                onChange={(_, c) => toggleLeafKey(m.pageKey, c)}
                disabled={selectedId === null || pagesLoading}
              />
            }
            label={<Typography variant="body2">{m.label}</Typography>}
          />
        </Box>
      );
    }

    const keys = leafKeysForModule(m);
    const selectedCount = keys.filter((k) => pageKeysDraft.has(k)).length;
    const allOn = keys.length > 0 && selectedCount === keys.length;
    const someOn = selectedCount > 0 && !allOn;

    return (
      <Box key={m.id} sx={{ py: 0.75 }}>
        <FormControlLabel
          control={
            <Checkbox
              size="small"
              checked={allOn}
              indeterminate={someOn}
              onChange={() => toggleGroupModule(m)}
              disabled={selectedId === null || pagesLoading}
            />
          }
          label={
            <Typography variant="body2" fontWeight={600}>
              {m.label}
              <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                (all submenus)
              </Typography>
            </Typography>
          }
        />
        <Box sx={{ pl: 3.5, borderLeft: "2px solid", borderColor: "divider", ml: 1.25, mt: 0.5 }}>
          {m.children.map((c) => (
            <FormControlLabel
              key={c.pageKey}
              sx={{ display: "flex", ml: 0, py: 0.25 }}
              control={
                <Checkbox
                  size="small"
                  checked={pageKeysDraft.has(c.pageKey)}
                  onChange={(_, checked) => toggleLeafKey(c.pageKey, checked)}
                  disabled={selectedId === null || pagesLoading}
                />
              }
              label={<Typography variant="body2">{c.label}</Typography>}
            />
          ))}
        </Box>
      </Box>
    );
  };

  return (
    <>
      <Typography variant="h5" sx={{ mb: 3 }}>
        Roles
      </Typography>

      <Grid container spacing={3} alignItems="stretch">
        <Grid size={{ xs: 12, md: 5 }}>
          <Card sx={{ height: "100%" }}>
            <CardContent>
              <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 2 }}>
                <Typography variant="subtitle1" fontWeight={700}>
                  Role list
                </Typography>
                <Button variant="contained" size="small" startIcon={<AddIcon />} onClick={openAdd}>
                  Add role
                </Button>
              </Box>

              {listError ? (
                <Alert severity="error" sx={{ mb: 2 }}>
                  {listError}
                </Alert>
              ) : null}

              {listLoading ? (
                <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
                  <CircularProgress size={32} />
                </Box>
              ) : (
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Name</TableCell>
                        <TableCell align="right" width={96}>
                          Actions
                        </TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {roles.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={2}>
                            <Typography variant="body2" color="text.secondary">
                              No roles yet. Create one to assign menu access.
                            </Typography>
                          </TableCell>
                        </TableRow>
                      ) : (
                        roles.map((r) => {
                          const selected = r.role_id === selectedId;
                          return (
                            <TableRow
                              key={r.role_id}
                              hover
                              selected={selected}
                              sx={{ cursor: "pointer" }}
                              onClick={() => setSelectedId(r.role_id)}
                            >
                              <TableCell>
                                <Typography variant="body2" fontWeight={selected ? 700 : 500}>
                                  {r.name}
                                </Typography>
                                {r.description ? (
                                  <Typography variant="caption" color="text.secondary" display="block">
                                    {r.description}
                                  </Typography>
                                ) : null}
                              </TableCell>
                              <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                                <Tooltip title="Edit name / description">
                                  <IconButton size="small" onClick={() => openEdit(r)} aria-label="Edit role">
                                    <EditIcon fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                                <Tooltip title="Delete role">
                                  <IconButton
                                    size="small"
                                    color="error"
                                    onClick={() => openDelete(r)}
                                    aria-label="Delete role"
                                  >
                                    <DeleteIcon fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                              </TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, md: 7 }}>
          <Card sx={{ height: "100%" }}>
            <CardContent>
              <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 1, mb: 2 }}>
                <Typography variant="subtitle1" fontWeight={700}>
                  Menu access
                </Typography>
                <Button
                  variant="contained"
                  color="secondary"
                  size="small"
                  startIcon={pagesSaving ? <CircularProgress size={16} color="inherit" /> : <SaveOutlinedIcon />}
                  disabled={
                    selectedId === null || pagesLoading || !pagesDirty || pagesSaving
                  }
                  onClick={() => void handleSavePages()}
                >
                  Save access
                </Button>
              </Box>

              {!selectedId ? (
                <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
                  Select a role to configure which sidebar menus it can access.
                </Typography>
              ) : pagesLoading ? (
                <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
                  <CircularProgress size={32} />
                </Box>
              ) : (
                <>
                  {pagesError ? (
                    <Alert severity="error" sx={{ mb: 2 }}>
                      {pagesError}
                    </Alert>
                  ) : null}
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    Checking a module selects every submenu under it. You can then clear individual submenus. Single-page
                    items use one checkbox. Access is stored in <code>role_pages</code> as <code>page_key</code> values.
                  </Typography>
                  {sectionGroups.map(({ heading, modules }) => (
                    <Box key={heading} sx={{ mb: 2 }}>
                      <Typography
                        variant="caption"
                        fontWeight={700}
                        color="text.secondary"
                        sx={{ letterSpacing: "0.08em", display: "block", mb: 1 }}
                      >
                        {heading}
                      </Typography>
                      <Divider sx={{ mb: 1.5 }} />
                      {modules.map((m) => renderModuleRow(m))}
                    </Box>
                  ))}
                </>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Dialog open={addOpen} onClose={() => !addSaving && setAddOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add role</DialogTitle>
        <DialogContent
          sx={{
            pt: 2,
            display: "flex",
            flexDirection: "column",
            gap: 2.5,
          }}
        >
          {addError ? (
            <Alert severity="error" sx={{ mb: 0 }}>
              {addError}
            </Alert>
          ) : null}
          <TextField
            fullWidth
            label="Name"
            value={addName}
            onChange={(e) => setAddName(e.target.value)}
            required
            inputProps={{ maxLength: 50 }}
            sx={{
              "& .MuiOutlinedInput-root": {
                minHeight: 48,
              },
            }}
          />
          <TextField
            fullWidth
            label="Description"
            placeholder="Optional details for this role"
            value={addDescription}
            onChange={(e) => setAddDescription(e.target.value)}
            multiline
            minRows={4}
            maxRows={12}
            sx={{
              "& .MuiOutlinedInput-root": {
                alignItems: "flex-start",
                py: 1.25,
              },
            }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddOpen(false)} disabled={addSaving}>
            Cancel
          </Button>
          <Button variant="contained" onClick={() => void handleAddSave()} disabled={addSaving}>
            {addSaving ? "Saving…" : "Create"}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={editOpen}
        onClose={() => {
          if (!editSaving) {
            setEditOpen(false);
            setEditingRole(null);
          }
        }}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Edit role</DialogTitle>
        <DialogContent
          sx={{
            pt: 2,
            display: "flex",
            flexDirection: "column",
            gap: 2.5,
          }}
        >
          {editError ? (
            <Alert severity="error" sx={{ mb: 0 }}>
              {editError}
            </Alert>
          ) : null}
          <TextField
            fullWidth
            label="Name"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            required
            inputProps={{ maxLength: 50 }}
            sx={{
              "& .MuiOutlinedInput-root": {
                minHeight: 48,
              },
            }}
          />
          <TextField
            fullWidth
            label="Description"
            placeholder="Optional details for this role"
            value={editDescription}
            onChange={(e) => setEditDescription(e.target.value)}
            multiline
            minRows={4}
            maxRows={12}
            sx={{
              "& .MuiOutlinedInput-root": {
                alignItems: "flex-start",
                py: 1.25,
              },
            }}
          />
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setEditOpen(false);
              setEditingRole(null);
            }}
            disabled={editSaving}
          >
            Cancel
          </Button>
          <Button variant="contained" onClick={() => void handleEditSave()} disabled={editSaving}>
            {editSaving ? "Saving…" : "Save"}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={deleteOpen} onClose={() => !deleteLoading && setDeleteOpen(false)}>
        <DialogTitle>Delete role?</DialogTitle>
        <DialogContent>
          {deleteError ? (
            <Alert severity="error" sx={{ mb: 2 }}>
              {deleteError}
            </Alert>
          ) : null}
          <Typography variant="body2">
            This will remove <strong>{deleteTarget?.name}</strong> and its menu assignments. Users referencing this role
            may need updates separately.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteOpen(false)} disabled={deleteLoading}>
            Cancel
          </Button>
          <Button color="error" variant="contained" onClick={() => void handleDeleteConfirm()} disabled={deleteLoading}>
            {deleteLoading ? "Deleting…" : "Delete"}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
