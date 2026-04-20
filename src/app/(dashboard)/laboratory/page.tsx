"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  CircularProgress,
  Tooltip,
} from "@mui/material";
import CampaignOutlinedIcon from "@mui/icons-material/CampaignOutlined";
import ScienceOutlinedIcon from "@mui/icons-material/ScienceOutlined";
import type { QueueTicketStatus } from "@/lib/queueReception";
import type { LabQueueRow } from "@/app/api/laboratory/lab-queue/route";
import type { LabRequestItemView } from "@/app/api/laboratory/lab-request/route";

const statusColor: Record<
  QueueTicketStatus,
  "default" | "warning" | "info" | "success"
> = {
  Waiting: "warning",
  Called: "info",
  Serving: "info",
  Completed: "success",
  Skipped: "default",
  Cancelled: "default",
  "No Show": "default",
};

export default function LaboratoryPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const [rows, setRows] = useState<LabQueueRow[]>([]);
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogTicket, setDialogTicket] = useState<LabQueueRow | null>(null);
  const [reqLoading, setReqLoading] = useState(false);
  const [reqError, setReqError] = useState("");
  const [reqItems, setReqItems] = useState<LabRequestItemView[]>([]);
  const [itemSavingId, setItemSavingId] = useState<string | null>(null);

  const load = async () => {
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/laboratory/lab-queue", { cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        rows?: LabQueueRow[];
      };
      if (!res.ok) {
        setError(json.error ?? `Request failed (${res.status})`);
        setRows([]);
        return;
      }
      setRows(Array.isArray(json.rows) ? json.rows : []);
    } catch {
      setError("Failed to load LAB queue.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  const openRequestDialog = async (ticket: LabQueueRow) => {
    setDialogTicket(ticket);
    setDialogOpen(true);
    setReqItems([]);
    setReqError("");
    setReqLoading(true);

    const labRequestId = (ticket.lab_request_id ?? "").trim();
    if (!labRequestId) {
      setReqError("No lab request is linked to this queue ticket.");
      setReqLoading(false);
      return;
    }

    try {
      const res = await fetch(
        `/api/laboratory/lab-request?labRequestId=${encodeURIComponent(labRequestId)}`,
        { cache: "no-store" },
      );
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        items?: LabRequestItemView[];
      };
      if (!res.ok) {
        setReqError(json.error ?? `Request failed (${res.status})`);
        setReqItems([]);
        return;
      }
      setReqItems(Array.isArray(json.items) ? json.items : []);
    } catch {
      setReqError("Failed to load lab request details.");
      setReqItems([]);
    } finally {
      setReqLoading(false);
    }
  };

  const saveItemCollected = async (labRequestItemId: string, collected: boolean) => {
    const id = labRequestItemId.trim();
    if (!id) return;
    setReqError("");
    setItemSavingId(id);
    try {
      const res = await fetch("/api/laboratory/specimen-item", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ labRequestItemId: id, collected }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setReqError(json.error ?? `Request failed (${res.status})`);
        return;
      }
      setReqItems((prev) =>
        prev.map((it) => {
          if (it.id !== id) return it;
          const now = new Date().toISOString();
          const tag = collected ? `[SpecimenItem] collected_at=${now}` : "[SpecimenItem] collected_at=";
          const base = (it.notes ?? "").split("\n").filter((l) => !l.startsWith("[SpecimenItem]"));
          const nextNotes = [...base, tag].filter(Boolean).join("\n").trim() || null;
          return { ...it, notes: nextNotes };
        }),
      );
      await load();
    } catch {
      setReqError("Failed to save specimen status.");
    } finally {
      setItemSavingId(null);
    }
  };

  const callPatient = async (ticketId: string) => {
    const id = ticketId.trim();
    if (!id) return;
    setError("");
    setActionBusyId(id);
    try {
      const res = await fetch("/api/reception/queue-ticket", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticketId: id, action: "call" }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(json.error ?? `Request failed (${res.status})`);
        return;
      }
      await load();
    } catch {
      setError("Failed to call patient.");
    } finally {
      setActionBusyId(null);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const hasRows = rows.length > 0;
  const sorted = useMemo(() => rows.slice().sort((a, b) => a.issued_at.localeCompare(b.issued_at)), [rows]);

  return (
    <>
      <Typography variant="h5" sx={{ mb: 3 }}>
        Laboratory
      </Typography>

      <Card>
        <CardContent sx={{ p: 3 }}>
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 2, gap: 2, flexWrap: "wrap" }}>
            <Typography variant="subtitle1" fontWeight={700}>
              Lab queue (counter code: LAB)
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Today · Active tickets only
            </Typography>
          </Box>

          {error ? (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          ) : null}

          {loading ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
              <CircularProgress size={32} />
            </Box>
          ) : !hasRows ? (
            <Typography variant="body2" color="text.secondary">
              No active LAB queue tickets for today.
            </Typography>
          ) : (
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Queue #</TableCell>
                  <TableCell>Patient</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Specimen</TableCell>
                  <TableCell>Issued</TableCell>
                  <TableCell>Visit</TableCell>
                  <TableCell align="right">Action</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {sorted.map((t) => (
                  <TableRow key={t.id} hover>
                    <TableCell sx={{ fontFamily: "monospace" }}>{t.queue_display}</TableCell>
                    <TableCell>{t.patient_name ?? "—"}</TableCell>
                    <TableCell>
                      <Chip
                        label={t.status}
                        color={statusColor[t.status]}
                        size="small"
                      />
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={/^\[Specimen\]\s+collected_at=.+/m.test(t.notes ?? "") ? "Collected" : "Pending"}
                        color={/^\[Specimen\]\s+collected_at=.+/m.test(t.notes ?? "") ? "success" : "default"}
                        size="small"
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell>{new Date(t.issued_at).toLocaleTimeString()}</TableCell>
                    <TableCell sx={{ fontFamily: "monospace" }}>{t.encounter_id ?? "—"}</TableCell>
                    <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                      <Tooltip title={t.status === "Waiting" ? "Call patient" : "Only waiting tickets can be called"}>
                        <Box component="span" sx={{ display: "inline-flex" }}>
                          <Button
                            variant="contained"
                            color="secondary"
                            size="small"
                            startIcon={
                              actionBusyId === t.id ? (
                                <CircularProgress size={16} color="inherit" />
                              ) : (
                                <CampaignOutlinedIcon fontSize="small" />
                              )
                            }
                            onClick={() => void callPatient(t.id)}
                            disabled={t.status !== "Waiting" || actionBusyId === t.id}
                            sx={{
                              minWidth: 108,
                              borderRadius: 999,
                              textTransform: "none",
                              fontWeight: 700,
                              px: 1.5,
                              py: 0.75,
                              boxShadow: "none",
                              "&:hover": { boxShadow: "none" },
                            }}
                          >
                            Call
                          </Button>
                        </Box>
                      </Tooltip>
                      <Tooltip title="View requested tests & specimen status">
                        <Box component="span" sx={{ display: "inline-flex", ml: 1 }}>
                          <Button
                            variant="outlined"
                            size="small"
                            startIcon={<ScienceOutlinedIcon fontSize="small" />}
                            onClick={() => void openRequestDialog(t)}
                            sx={{
                              minWidth: 120,
                              borderRadius: 999,
                              textTransform: "none",
                              fontWeight: 700,
                              px: 1.25,
                              py: 0.75,
                            }}
                          >
                            Request
                          </Button>
                        </Box>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={dialogOpen}
        onClose={() => {
          if (!itemSavingId) {
            setDialogOpen(false);
            setDialogTicket(null);
          }
        }}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Lab request</DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          {dialogTicket ? (
            <Box sx={{ mb: 2 }}>
              <Typography variant="body2" color="text.secondary">
                Queue:&nbsp;
                <Box component="span" sx={{ fontFamily: "monospace" }}>
                  {dialogTicket.queue_display}
                </Box>
                &nbsp;· Patient: {dialogTicket.patient_name ?? "—"}
              </Typography>
            </Box>
          ) : null}

          <Divider sx={{ mb: 2 }} />

          {reqError ? (
            <Alert severity="error" sx={{ mb: 2 }}>
              {reqError}
            </Alert>
          ) : null}

          <Box sx={{ mt: 2 }}>
            <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>
              Requested tests
            </Typography>

            {reqLoading ? (
              <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
                <CircularProgress size={28} />
              </Box>
            ) : reqItems.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                No items found.
              </Typography>
            ) : (
              <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                {reqItems.map((it) => (
                  <Box
                    key={it.id}
                    sx={{
                      border: "1px solid",
                      borderColor: "divider",
                      borderRadius: 2,
                      px: 1.5,
                      py: 1.25,
                      bgcolor: "background.paper",
                      display: "flex",
                      alignItems: "flex-start",
                      justifyContent: "space-between",
                      gap: 2,
                    }}
                  >
                    <Box sx={{ minWidth: 0 }}>
                      <Typography variant="body2" fontWeight={700} noWrap>
                        {it.test_name ?? it.lab_test_id}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Specimen: {it.specimen_type ?? "—"}
                        {it.priority ? ` · Priority: ${it.priority}` : ""}
                      </Typography>
                    </Box>

                    <FormControlLabel
                      sx={{ m: 0, alignItems: "center" }}
                      control={
                        <Checkbox
                          checked={/^\[SpecimenItem\]\s+collected_at=.+/m.test(it.notes ?? "")}
                          onChange={(_, checked) => void saveItemCollected(it.id, checked)}
                          disabled={itemSavingId === it.id}
                        />
                      }
                      label={
                        <Typography variant="caption" fontWeight={700}>
                          Collected
                        </Typography>
                      }
                      labelPlacement="start"
                    />
                  </Box>
                ))}
              </Box>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setDialogOpen(false);
              setDialogTicket(null);
            }}
            disabled={!!itemSavingId}
          >
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
