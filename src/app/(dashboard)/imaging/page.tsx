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
import CameraAltOutlinedIcon from "@mui/icons-material/CameraAltOutlined";
import type { ImagingQueueRow } from "@/app/api/imaging/imaging-queue/route";
import { authenticatedFetch } from "@/lib/authenticatedFetch";
import { imagingDisplayStatusChipColor } from "@/lib/imagingQueueUi";

export default function ImagingAppointmentsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rows, setRows] = useState<ImagingQueueRow[]>([]);
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);

  const load = async () => {
    setError("");
    setLoading(true);
    try {
      const res = await authenticatedFetch("/api/imaging/imaging-queue", { cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as { error?: string; rows?: ImagingQueueRow[] };
      if (!res.ok) {
        setError(json.error ?? `Request failed (${res.status})`);
        setRows([]);
        return;
      }
      setRows(Array.isArray(json.rows) ? json.rows : []);
    } catch {
      setError("Failed to load imaging queue.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  const goToResults = (ticket: ImagingQueueRow) => {
    const imagingRequestId = (ticket.imaging_request_id ?? "").trim();
    if (!imagingRequestId) {
      setError("No imaging request is linked to this queue ticket.");
      return;
    }
    if (!ticket.can_open_imaging) {
      setError("Call the patient before opening the imaging request.");
      return;
    }
    router.push(`/imaging/results?imagingRequestId=${encodeURIComponent(imagingRequestId)}`);
  };

  const callPatient = async (ticketId: string) => {
    const id = ticketId.trim();
    if (!id) return;
    setError("");
    setActionBusyId(id);
    try {
      const res = await authenticatedFetch("/api/imaging/call-patient", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticketId: id }),
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

  const sorted = useMemo(() => rows.slice().sort((a, b) => a.issued_at.localeCompare(b.issued_at)), [rows]);

  return (
    <>
      <Typography variant="h5" sx={{ mb: 3 }}>
        Imaging
      </Typography>

      <Card>
        <CardContent sx={{ p: 3 }}>
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 2, gap: 2, flexWrap: "wrap" }}>
            <Typography variant="subtitle1" fontWeight={700}>
              Imaging queue
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Today · Active tickets · Shared number with lab when both ordered
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
          ) : sorted.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              No active imaging queue tickets for today.
            </Typography>
          ) : (
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Queue #</TableCell>
                    <TableCell>Patient</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Lab</TableCell>
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
                          label={t.imaging_display_status ?? t.status}
                          color={imagingDisplayStatusChipColor(t.imaging_display_status ?? t.status)}
                          size="small"
                        />
                      </TableCell>
                      <TableCell>
                        {t.includes_lab ? (
                          <Chip
                            label={t.lab_all_collected ? "Collected" : "Pending"}
                            color={t.lab_all_collected ? "success" : "default"}
                            size="small"
                            variant="outlined"
                          />
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell>{new Date(t.issued_at).toLocaleTimeString()}</TableCell>
                      <TableCell sx={{ fontFamily: "monospace" }}>{t.encounter_id ?? "—"}</TableCell>
                      <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                        <Tooltip title={t.can_imaging_call ? "Call patient to imaging" : "Patient already called or not available"}>
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
                              disabled={!t.can_imaging_call || actionBusyId === t.id}
                              sx={{ minWidth: 108, borderRadius: 999, textTransform: "none", fontWeight: 700 }}
                            >
                              Call
                            </Button>
                          </Box>
                        </Tooltip>
                        <Tooltip
                          title={
                            t.can_open_imaging
                              ? "Open imaging request"
                              : "Call the patient first"
                          }
                        >
                          <Box component="span" sx={{ display: "inline-flex", ml: 1 }}>
                            <Button
                              variant="outlined"
                              size="small"
                              startIcon={<CameraAltOutlinedIcon fontSize="small" />}
                              onClick={() => goToResults(t)}
                              disabled={!t.can_open_imaging}
                              sx={{ minWidth: 120, borderRadius: 999, textTransform: "none", fontWeight: 700 }}
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
    </>
  );
}
