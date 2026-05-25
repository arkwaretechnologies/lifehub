"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
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
import { authenticatedFetch } from "@/lib/authenticatedFetch";
import {
  labImagingColumnLabel,
  labQueueDisplayChipColor,
  labSpecimenColumnLabel,
} from "@/lib/labQueuePresentation";
import {
  canLabCallPatient,
  canOpenLabQueueRequest,
  isSpecimenCollectedOnTicket,
  labCallButtonTooltip,
  labQueueRequestButtonTooltip,
} from "@/lib/labQueueUi";

const statusColor: Record<
  QueueTicketStatus,
  "default" | "warning" | "info" | "success"
> = {
  Waiting: "warning",
  Called: "info",
  Collected: "success",
  Serving: "info",
  Completed: "success",
  Skipped: "default",
  Cancelled: "default",
  "No Show": "default",
};

export default function LaboratoryPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const [rows, setRows] = useState<LabQueueRow[]>([]);
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);

  const load = async () => {
    setError("");
    setLoading(true);
    try {
      const res = await authenticatedFetch("/api/laboratory/lab-queue", { cache: "no-store" });
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

  const goToResults = (ticket: LabQueueRow) => {
    const labRequestId = (ticket.lab_request_id ?? "").trim();
    if (!labRequestId) {
      setError("No lab request is linked to this queue ticket.");
      return;
    }
    if (!canOpenLabQueueRequest(ticket.status, labRequestId, { labAnyCollected: ticket.lab_any_collected })) {
      setError("Call the patient before opening the lab request.");
      return;
    }
    router.push(`/laboratory/results?labRequestId=${encodeURIComponent(labRequestId)}`);
  };

  const callPatient = async (ticketId: string) => {
    const id = ticketId.trim();
    if (!id) return;
    setError("");
    setActionBusyId(id);
    try {
      const res = await authenticatedFetch("/api/reception/queue-ticket", {
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
                  <TableCell>Imaging</TableCell>
                  <TableCell>Specimen</TableCell>
                  <TableCell>Issued</TableCell>
                  <TableCell>Visit</TableCell>
                  <TableCell align="right">Action</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {sorted.map((t) => {
                  const imagingChip =
                    t.includes_imaging || t.imaging_request_id
                      ? labImagingColumnLabel({
                          imaging_all_captured: t.imaging_all_captured,
                          lab_partial_released: t.lab_partial_released,
                          active_dept: t.active_dept,
                          status: t.status,
                        })
                      : null;
                  const specimenChip = labSpecimenColumnLabel({
                    lab_any_collected: t.lab_any_collected,
                    lab_all_collected: t.lab_all_collected,
                    specimen_collected: isSpecimenCollectedOnTicket(t.notes),
                  });
                  return (
                  <TableRow key={t.id} hover>
                    <TableCell sx={{ fontFamily: "monospace" }}>{t.queue_display}</TableCell>
                    <TableCell>{t.patient_name ?? "—"}</TableCell>
                    <TableCell>
                      <Chip
                        label={t.lab_display_status ?? t.status}
                        color={labQueueDisplayChipColor(t.lab_display_status ?? t.status, t.status)}
                        size="small"
                      />
                    </TableCell>
                    <TableCell>
                      {imagingChip ? (
                        <Chip
                          label={imagingChip.label}
                          color={imagingChip.color}
                          size="small"
                          variant="outlined"
                        />
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={specimenChip.label}
                        color={specimenChip.color}
                        size="small"
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell>{new Date(t.issued_at).toLocaleTimeString()}</TableCell>
                    <TableCell sx={{ fontFamily: "monospace" }}>{t.encounter_id ?? "—"}</TableCell>
                    <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                      <Tooltip
                        title={labCallButtonTooltip(t.status, {
                          includesImaging: t.includes_imaging,
                          specimenCollected: isSpecimenCollectedOnTicket(t.notes),
                          labAllCollected: t.lab_all_collected,
                          imagingAllCaptured: t.imaging_all_captured,
                          activeDept: t.active_dept,
                        })}
                      >
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
                            disabled={
                              (t.can_lab_call ??
                                canLabCallPatient(t.status, {
                                  includesImaging: t.includes_imaging,
                                  specimenCollected: isSpecimenCollectedOnTicket(t.notes),
                                  labAnyCollected: t.lab_any_collected,
                                  labAllCollected: t.lab_all_collected,
                                  imagingAllCaptured: t.imaging_all_captured,
                                  activeDept: t.active_dept,
                                })) !== true || actionBusyId === t.id
                            }
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
                      <Tooltip
                        title={labQueueRequestButtonTooltip(t.status, t.lab_request_id, {
                          labAnyCollected: t.lab_any_collected,
                        })}
                      >
                        <Box component="span" sx={{ display: "inline-flex", ml: 1 }}>
                          <Button
                            variant="outlined"
                            size="small"
                            startIcon={<ScienceOutlinedIcon fontSize="small" />}
                            onClick={() => goToResults(t)}
                            disabled={
                              !canOpenLabQueueRequest(t.status, t.lab_request_id, {
                                labAnyCollected: t.lab_any_collected,
                              })
                            }
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
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
          )}
        </CardContent>
      </Card>
    </>
  );
}
