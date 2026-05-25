"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import CampaignOutlinedIcon from "@mui/icons-material/CampaignOutlined";
import CameraAltOutlinedIcon from "@mui/icons-material/CameraAltOutlined";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  CircularProgress,
  TextField,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from "@mui/material";
import type { ImagingQueueRow } from "@/app/api/imaging/imaging-queue/route";
import { authenticatedFetch } from "@/lib/authenticatedFetch";
import { formatQueueTicketWhen } from "@/lib/dateDisplay";
import { canOpenImagingResultsQueueTicket } from "@/lib/diagnosticQueueUi";
import { imagingDisplayStatusChipColor } from "@/lib/imagingQueueUi";
import { isImagingItemCaptured, isImagingItemResultReceived } from "@/lib/imagingQueueSync";
import ImagingStudyImageUpload from "@/components/imaging/ImagingStudyImageUpload";
import type { ImagingRequestItemRow } from "@/lib/imagingRequests";

type ImagingRequestHeader = {
  id: string;
  request_date: string;
  request_time: string | null;
  priority: string;
  remarks: string | null;
  status: string;
};

export default function ImagingResultsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [queueLoading, setQueueLoading] = useState(true);
  const [queueError, setQueueError] = useState("");
  const [queueRows, setQueueRows] = useState<ImagingQueueRow[]>([]);
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);

  const [selectedRequestId, setSelectedRequestId] = useState("");
  const [reqLoading, setReqLoading] = useState(false);
  const [reqError, setReqError] = useState("");
  const [header, setHeader] = useState<ImagingRequestHeader | null>(null);
  const [items, setItems] = useState<ImagingRequestItemRow[]>([]);
  const [queueDisplay, setQueueDisplay] = useState("");
  const [patientName, setPatientName] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { findings: string; remarks: string }>>({});

  const loadQueue = async () => {
    setQueueError("");
    setQueueLoading(true);
    try {
      const res = await authenticatedFetch("/api/imaging/imaging-queue", { cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as { error?: string; rows?: ImagingQueueRow[] };
      if (!res.ok) {
        setQueueError(json.error ?? `Request failed (${res.status})`);
        setQueueRows([]);
        return;
      }
      setQueueRows(Array.isArray(json.rows) ? json.rows : []);
    } catch {
      setQueueError("Failed to load imaging queue.");
      setQueueRows([]);
    } finally {
      setQueueLoading(false);
    }
  };

  const loadRequest = useCallback(async (imagingRequestIdRaw: string) => {
    const imagingRequestId = imagingRequestIdRaw.trim();
    setReqError("");
    setHeader(null);
    setItems([]);
    setQueueDisplay("");
    setPatientName("");
    setDrafts({});
    setSelectedRequestId(imagingRequestId);
    if (!imagingRequestId) return;

    setReqLoading(true);
    try {
      const res = await authenticatedFetch(
        `/api/imaging/imaging-request?imagingRequestId=${encodeURIComponent(imagingRequestId)}`,
        { cache: "no-store" },
      );
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        request?: ImagingRequestHeader;
        items?: ImagingRequestItemRow[];
        queue_display?: string | null;
        patient_name?: string | null;
      };
      if (!res.ok) {
        setReqError(json.error ?? `Request failed (${res.status})`);
        return;
      }
      setHeader(json.request ?? null);
      const list = Array.isArray(json.items) ? json.items : [];
      setItems(list);
      setQueueDisplay((json.queue_display ?? "").trim());
      setPatientName((json.patient_name ?? "").trim());
      const next: Record<string, { findings: string; remarks: string }> = {};
      for (const it of list) {
        next[it.id] = { findings: it.findings ?? "", remarks: it.remarks ?? "" };
      }
      setDrafts(next);
    } catch {
      setReqError("Failed to load imaging request.");
    } finally {
      setReqLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadQueue();
  }, []);

  useEffect(() => {
    const id = (searchParams.get("imagingRequestId") ?? "").trim();
    if (id && id !== selectedRequestId) {
      void loadRequest(id);
    }
  }, [searchParams, selectedRequestId, loadRequest]);

  const sortedQueue = useMemo(
    () => queueRows.slice().sort((a, b) => a.issued_at.localeCompare(b.issued_at)),
    [queueRows],
  );

  const selectedTicket = useMemo(() => {
    if (!selectedRequestId) return null;
    return sortedQueue.find((t) => (t.imaging_request_id ?? "").trim() === selectedRequestId) ?? null;
  }, [selectedRequestId, sortedQueue]);

  const canOpenRequest = selectedTicket?.can_open_imaging === true;
  const canMarkCaptured =
    canOpenRequest &&
    (selectedTicket?.active_dept === "IMAG" ||
      selectedTicket?.status === "Serving" ||
      selectedTicket?.status === "Collected" ||
      selectedTicket?.status === "Completed" ||
      (selectedTicket?.status === "Called" && selectedTicket?.active_dept !== "LAB"));
  const [itemBusyId, setItemBusyId] = useState<string | null>(null);

  const openImagingRequestFromTicket = (imagingRequestId: string) => {
    const rid = imagingRequestId.trim();
    if (!rid) return;
    router.replace(`/imaging/results?imagingRequestId=${encodeURIComponent(rid)}`);
    void loadRequest(rid);
  };

  const formatTicketWhen = (t: ImagingQueueRow) =>
    formatQueueTicketWhen(t.issued_at, {
      ticketDate: t.ticket_date,
      requestDate: t.request_date,
      requestTime: t.request_time,
    });

  const callPatient = async (ticketId: string) => {
    const id = ticketId.trim();
    if (!id) return;
    setQueueError("");
    setActionBusyId(id);
    try {
      const res = await authenticatedFetch("/api/imaging/call-patient", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticketId: id }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setQueueError(json.error ?? `Request failed (${res.status})`);
        return;
      }
      await loadQueue();
    } catch {
      setQueueError("Failed to call patient.");
    } finally {
      setActionBusyId(null);
    }
  };

  const patchImagingItem = async (
    itemId: string,
    flags: { captured?: boolean; received?: boolean },
  ) => {
    setItemBusyId(itemId);
    setReqError("");
    try {
      const res = await authenticatedFetch("/api/imaging/imaging-item", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imagingRequestItemId: itemId, ...flags }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setReqError(json.error ?? `Request failed (${res.status})`);
        return;
      }
      await loadRequest(selectedRequestId);
      await loadQueue();
    } catch {
      setReqError("Failed to update study status.");
    } finally {
      setItemBusyId(null);
    }
  };

  const saveItem = async (itemId: string) => {
    const d = drafts[itemId];
    if (!d) return;
    setSavingId(itemId);
    setReqError("");
    try {
      const res = await authenticatedFetch("/api/imaging/imaging-request", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imagingRequestItemId: itemId,
          findings: d.findings,
          remarks: d.remarks,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setReqError(json.error ?? `Save failed (${res.status})`);
        return;
      }
      await loadRequest(selectedRequestId);
      await loadQueue();
    } catch {
      setReqError("Failed to save findings.");
    } finally {
      setSavingId(null);
    }
  };

  return (
    <>
      <Typography variant="h5" sx={{ mb: 3 }}>
        Imaging results
      </Typography>

      {queueError ? (
        <Alert severity="error" sx={{ mb: 2 }}>
          {queueError}
        </Alert>
      ) : null}

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", md: "minmax(280px, 400px) minmax(0, 1fr)" },
          gap: 2,
          alignItems: "start",
        }}
      >
        <Card>
          <CardContent sx={{ p: 3 }}>
            <Box sx={{ display: "flex", justifyContent: "space-between", mb: 2, gap: 2, flexWrap: "wrap" }}>
              <Typography variant="subtitle1" fontWeight={700}>
                Today&apos;s imaging queue
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Active tickets only
              </Typography>
            </Box>

            {queueLoading ? (
              <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
                <CircularProgress size={32} />
              </Box>
            ) : sortedQueue.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                No active imaging queue tickets for today. Patients appear here after cashier payment.
              </Typography>
            ) : (
              <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                {sortedQueue.map((t) => {
                  const imgId = (t.imaging_request_id ?? "").trim();
                  const active = imgId === selectedRequestId;
                  const canOpen = canOpenImagingResultsQueueTicket(t.status, imgId) && t.can_open_imaging !== false;
                  const displayStatus = t.imaging_display_status ?? t.status;
                  return (
                    <Card
                      key={t.id}
                      variant="outlined"
                      sx={{
                        borderRadius: 2,
                        cursor: canOpen ? "pointer" : "default",
                        borderColor: active ? "secondary.main" : "divider",
                        bgcolor: active ? "action.hover" : "background.paper",
                      }}
                      onClick={() => {
                        if (!imgId || !canOpen) return;
                        openImagingRequestFromTicket(imgId);
                      }}
                    >
                      <CardContent sx={{ p: 1.5, "&:last-child": { pb: 1.5 } }}>
                        <Box sx={{ display: "flex", justifyContent: "space-between", gap: 2 }}>
                          <Box sx={{ minWidth: 0 }}>
                            <Typography variant="body2" fontWeight={800} sx={{ fontFamily: "monospace" }}>
                              {t.queue_display}
                            </Typography>
                            <Typography variant="caption" color="text.secondary" noWrap>
                              {t.patient_name ?? "—"}
                            </Typography>
                          </Box>
                          <Box sx={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 0.75 }}>
                            <Chip
                              label={t.imaging_display_status ?? displayStatus}
                              color={imagingDisplayStatusChipColor(
                                t.imaging_display_status ?? displayStatus,
                              )}
                              size="small"
                            />
                            <Typography variant="caption" color="text.secondary" sx={{ textAlign: "right" }}>
                              {formatTicketWhen(t)}
                            </Typography>
                          </Box>
                        </Box>
                        <Box sx={{ mt: 1, display: "flex", justifyContent: "flex-end", gap: 1, flexWrap: "wrap" }}>
                          <Tooltip
                            title={
                              t.can_imaging_call
                                ? "Call patient to imaging"
                                : "Complete laboratory collection first, or patient already called"
                            }
                          >
                            <span>
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
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void callPatient(t.id);
                                }}
                                disabled={!t.can_imaging_call || actionBusyId === t.id}
                                sx={{ borderRadius: 999, textTransform: "none", fontWeight: 700 }}
                              >
                                Call
                              </Button>
                            </span>
                          </Tooltip>
                          <Tooltip
                            title={
                              canOpen ? "Open imaging request" : "Call the patient first (after lab collection when both ordered)"
                            }
                          >
                            <span>
                              <Button
                                variant="outlined"
                                size="small"
                                startIcon={<CameraAltOutlinedIcon fontSize="small" />}
                                disabled={!canOpen}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (!imgId || !canOpen) return;
                                  openImagingRequestFromTicket(imgId);
                                }}
                                sx={{ borderRadius: 999, textTransform: "none", fontWeight: 700 }}
                              >
                                Open
                              </Button>
                            </span>
                          </Tooltip>
                        </Box>
                      </CardContent>
                    </Card>
                  );
                })}
              </Box>
            )}
          </CardContent>
        </Card>

        <Card sx={{ minWidth: 0, overflow: "hidden" }}>
          <CardContent sx={{ p: 3, minWidth: 0 }}>
            {reqError ? (
              <Alert severity="error" sx={{ mb: 2 }}>
                {reqError}
              </Alert>
            ) : null}

            {reqLoading ? (
              <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
                <CircularProgress />
              </Box>
            ) : !selectedRequestId || !header ? (
              <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
                Select a patient from the imaging queue, or open a request from{" "}
                <Button variant="text" size="small" sx={{ p: 0, minWidth: 0, verticalAlign: "baseline" }} onClick={() => router.push("/imaging")}>
                  Imaging Appointments
                </Button>
                .
              </Typography>
            ) : (
              <>
                <Typography variant="subtitle1" fontWeight={700} gutterBottom>
                  {patientName || "Patient"} · Queue {queueDisplay || "—"}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Request {header.request_date}
                  {header.request_time ? ` ${header.request_time}` : ""} · {header.priority} · {header.status}
                </Typography>

                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Mark <strong>Captured</strong> when the study is performed (like laboratory{" "}
                  <strong>Collected</strong>). Mark <strong>Received</strong> when the result or film is ready to upload,
                  then enter findings. Scroll horizontally if needed to reach <strong>Save</strong>.
                </Typography>

                {(() => {
                  const editable = items.filter((it) => isImagingItemResultReceived(it.status));
                  if (!canOpenRequest || editable.length !== 1) return null;
                  const onlyId = editable[0]!.id;
                  return (
                    <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 2 }}>
                      <Button
                        variant="contained"
                        color="secondary"
                        disabled={savingId != null}
                        onClick={() => void saveItem(onlyId)}
                        sx={{ textTransform: "none", fontWeight: 700 }}
                      >
                        {savingId ? <CircularProgress size={20} color="inherit" /> : "Save findings"}
                      </Button>
                    </Box>
                  );
                })()}

                <TableContainer
                  sx={{
                    width: "100%",
                    maxWidth: "100%",
                    overflowX: "auto",
                    WebkitOverflowScrolling: "touch",
                    border: 1,
                    borderColor: "divider",
                    borderRadius: 1,
                  }}
                >
                <Table size="small" sx={{ minWidth: 960 }}>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ minWidth: 120 }}>Study</TableCell>
                      <TableCell sx={{ minWidth: 72 }}>View</TableCell>
                      <TableCell align="center" sx={{ minWidth: 72, px: 0.5 }}>
                        Captured
                      </TableCell>
                      <TableCell align="center" sx={{ minWidth: 72, px: 0.5 }}>
                        Received
                      </TableCell>
                      <TableCell align="center" sx={{ minWidth: 88, px: 0.5 }}>
                        Image
                      </TableCell>
                      <TableCell sx={{ minWidth: 200 }}>Findings</TableCell>
                      <TableCell sx={{ minWidth: 160 }}>Remarks</TableCell>
                      <TableCell sx={{ minWidth: 88 }}>Status</TableCell>
                      <TableCell
                        align="right"
                        sx={{
                          position: "sticky",
                          right: 0,
                          zIndex: 3,
                          minWidth: 88,
                          bgcolor: "background.paper",
                          boxShadow: (t) => `-6px 0 8px -6px ${t.palette.divider}`,
                        }}
                      >
                        Save
                      </TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {items.map((it) => {
                      const captured = isImagingItemCaptured(it.status);
                      const resultReceived = isImagingItemResultReceived(it.status);
                      const canEditFindings = canOpenRequest && resultReceived;
                      const rowBusy = itemBusyId === it.id;
                      return (
                      <TableRow key={it.id}>
                        <TableCell>{it.study_name}</TableCell>
                        <TableCell>{it.view_text ?? "—"}</TableCell>
                        <TableCell align="center" sx={{ px: 0.5 }}>
                          <Tooltip title="Captured — study performed">
                            <span>
                              <Checkbox
                                size="small"
                                checked={captured}
                                disabled={!canMarkCaptured || rowBusy}
                                onChange={(_, checked) => void patchImagingItem(it.id, { captured: checked })}
                              />
                            </span>
                          </Tooltip>
                        </TableCell>
                        <TableCell align="center" sx={{ px: 0.5 }}>
                          <Tooltip title="Received — result ready to upload">
                            <span>
                              <Checkbox
                                size="small"
                                checked={resultReceived}
                                disabled={!canMarkCaptured || rowBusy || !captured}
                                onChange={(_, checked) => void patchImagingItem(it.id, { received: checked })}
                              />
                            </span>
                          </Tooltip>
                        </TableCell>
                        <TableCell align="center" sx={{ verticalAlign: "top" }}>
                          <ImagingStudyImageUpload
                            itemId={it.id}
                            resultReceived={resultReceived}
                            disabled={!canOpenRequest || rowBusy}
                            hasImage={Boolean((it.image_storage_path ?? "").trim())}
                            originalFilename={it.image_original_filename}
                            onUploaded={() => void loadRequest(selectedRequestId)}
                            onError={(msg) => setReqError(msg)}
                          />
                        </TableCell>
                        <TableCell sx={{ minWidth: 200, maxWidth: 280 }}>
                          <TextField
                            size="small"
                            fullWidth
                            multiline
                            minRows={2}
                            maxRows={8}
                            value={drafts[it.id]?.findings ?? ""}
                            disabled={!canEditFindings}
                            onChange={(e) =>
                              setDrafts((prev) => ({
                                ...prev,
                                [it.id]: {
                                  ...prev[it.id],
                                  findings: e.target.value,
                                  remarks: prev[it.id]?.remarks ?? "",
                                },
                              }))
                            }
                          />
                        </TableCell>
                        <TableCell sx={{ minWidth: 160, maxWidth: 220 }}>
                          <TextField
                            size="small"
                            fullWidth
                            multiline
                            minRows={2}
                            maxRows={6}
                            value={drafts[it.id]?.remarks ?? ""}
                            disabled={!canEditFindings}
                            onChange={(e) =>
                              setDrafts((prev) => ({
                                ...prev,
                                [it.id]: { findings: prev[it.id]?.findings ?? "", remarks: e.target.value },
                              }))
                            }
                          />
                        </TableCell>
                        <TableCell sx={{ whiteSpace: "nowrap" }}>{it.status}</TableCell>
                        <TableCell
                          align="right"
                          sx={{
                            position: "sticky",
                            right: 0,
                            zIndex: 2,
                            bgcolor: "background.paper",
                            boxShadow: (t) => `-6px 0 8px -6px ${t.palette.divider}`,
                            whiteSpace: "nowrap",
                          }}
                        >
                          <Button
                            size="small"
                            variant="contained"
                            disabled={!canEditFindings || savingId === it.id}
                            onClick={() => void saveItem(it.id)}
                            sx={{ textTransform: "none", fontWeight: 700, minWidth: 72 }}
                          >
                            {savingId === it.id ? <CircularProgress size={18} /> : "Save"}
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                    })}
                  </TableBody>
                </Table>
                </TableContainer>
              </>
            )}
          </CardContent>
        </Card>
      </Box>
    </>
  );
}
