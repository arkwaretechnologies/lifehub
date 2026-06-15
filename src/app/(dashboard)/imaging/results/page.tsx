"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import CampaignOutlinedIcon from "@mui/icons-material/CampaignOutlined";
import CameraAltOutlinedIcon from "@mui/icons-material/CameraAltOutlined";
import PrintOutlinedIcon from "@mui/icons-material/PrintOutlined";
import RefreshOutlinedIcon from "@mui/icons-material/RefreshOutlined";
import SearchIcon from "@mui/icons-material/Search";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  CircularProgress,
  InputAdornment,
  TextField,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  Tooltip,
  Typography,
} from "@mui/material";
import { commonFieldProps, fieldInputSx } from "@/components/fieldInputStyles";
import { FormFieldLabel } from "@/components/FormFieldLabel";
import type { ImagingQueueRow } from "@/app/api/imaging/imaging-queue/route";
import { authenticatedFetch } from "@/lib/authenticatedFetch";
import { formatQueueTicketWhen } from "@/lib/dateDisplay";
import { canOpenImagingResultsQueueTicket } from "@/lib/diagnosticQueueUi";
import { imagingDisplayStatusChipColor } from "@/lib/imagingQueueUi";
import { imagingItemStatusLabel, isImagingItemCaptured, isImagingItemResultReceived } from "@/lib/imagingQueueSync";
import ImagingStudyImageUpload from "@/components/imaging/ImagingStudyImageUpload";
import type { ImagingRequestHeaderView } from "@/app/api/imaging/imaging-request/route";
import type { ImagingRequestItemRow } from "@/lib/imagingRequests";
import { imagingItemHasPrintableResult, openImagingResultPrintWindow } from "@/lib/imagingResultsPrint";

type ImagingRequestHeader = ImagingRequestHeaderView;

export default function ImagingResultsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [queueSearch, setQueueSearch] = useState("");
  const [debouncedQueueSearch, setDebouncedQueueSearch] = useState("");
  const [queueSearchLoading, setQueueSearchLoading] = useState(false);
  const [queueSearchError, setQueueSearchError] = useState("");
  const [queueSearchRows, setQueueSearchRows] = useState<ImagingQueueRow[]>([]);
  const [queueSearchCount, setQueueSearchCount] = useState(0);
  const [queueSearchPage, setQueueSearchPage] = useState(0);
  const [queueSearchPageSize, setQueueSearchPageSize] = useState(10);

  const [queueLoading, setQueueLoading] = useState(true);
  const [queueError, setQueueError] = useState("");
  const [queueRows, setQueueRows] = useState<ImagingQueueRow[]>([]);
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);

  const [selectedRequestId, setSelectedRequestId] = useState("");
  const [reqLoading, setReqLoading] = useState(false);
  const [reqError, setReqError] = useState("");
  const [header, setHeader] = useState<ImagingRequestHeader | null>(null);
  const [items, setItems] = useState<ImagingRequestItemRow[]>([]);

  const loadQueue = async () => {
    setQueueError("");
    setQueueLoading(true);
    try {
      const res = await authenticatedFetch("/api/imaging/imaging-queue?scope=today_all", { cache: "no-store" });
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

  const loadRequest = useCallback(async (imagingRequestIdRaw: string, opts?: { silent?: boolean }) => {
    const imagingRequestId = imagingRequestIdRaw.trim();
    const silent = opts?.silent === true;
    setReqError("");
    if (!silent) {
      setHeader(null);
      setItems([]);
    }
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
        header?: ImagingRequestHeader;
        request?: ImagingRequestHeader;
        items?: ImagingRequestItemRow[];
      };
      if (!res.ok) {
        setReqError(json.error ?? `Request failed (${res.status})`);
        return;
      }
      setHeader(json.header ?? json.request ?? null);
      const list = Array.isArray(json.items) ? json.items : [];
      setItems(list);
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

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQueueSearch(queueSearch), 400);
    return () => window.clearTimeout(t);
  }, [queueSearch]);

  useEffect(() => {
    const q = debouncedQueueSearch.trim();
    if (q.length < 2) {
      setQueueSearchError("");
      setQueueSearchLoading(false);
      setQueueSearchRows([]);
      setQueueSearchCount(0);
      setQueueSearchPage(0);
      return;
    }
    let cancelled = false;
    void (async () => {
      setQueueSearchError("");
      setQueueSearchLoading(true);
      try {
        const url = `/api/imaging/imaging-queue?q=${encodeURIComponent(q)}&scope=all&days=90&page=${queueSearchPage}&pageSize=${queueSearchPageSize}`;
        const res = await authenticatedFetch(url, { cache: "no-store" });
        const json = (await res.json().catch(() => ({}))) as {
          error?: string;
          rows?: ImagingQueueRow[];
          count?: number;
        };
        if (cancelled) return;
        if (!res.ok) {
          setQueueSearchError(json.error ?? `Request failed (${res.status})`);
          setQueueSearchRows([]);
          setQueueSearchCount(0);
          return;
        }
        setQueueSearchRows(Array.isArray(json.rows) ? json.rows : []);
        setQueueSearchCount(Number.isFinite(Number(json.count)) ? Number(json.count) : 0);
      } catch {
        if (cancelled) return;
        setQueueSearchError("Failed to search imaging queue.");
        setQueueSearchRows([]);
        setQueueSearchCount(0);
      } finally {
        if (!cancelled) setQueueSearchLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [debouncedQueueSearch, queueSearchPage, queueSearchPageSize]);

  const filteredSorted = useMemo(() => {
    const q = queueSearch.trim().toLowerCase();
    if (!q) return sortedQueue;
    return sortedQueue.filter((t) => {
      const hay = [t.queue_display, t.patient_name, t.encounter_id, t.imaging_request_id, t.status]
        .map((v) => String(v ?? "").trim().toLowerCase())
        .filter(Boolean)
        .join(" | ");
      return hay.includes(q);
    });
  }, [queueSearch, sortedQueue]);

  const showPaginatedSearch = debouncedQueueSearch.trim().length >= 2;
  const queueListRows = showPaginatedSearch ? queueSearchRows : filteredSorted;

  const selectedTicket = useMemo(() => {
    if (!selectedRequestId) return null;
    const match = (t: ImagingQueueRow) => (t.imaging_request_id ?? "").trim() === selectedRequestId;
    return sortedQueue.find(match) ?? queueSearchRows.find(match) ?? null;
  }, [selectedRequestId, sortedQueue, queueSearchRows]);

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

  const refreshRequest = () => {
    if (!selectedRequestId) return;
    void loadRequest(selectedRequestId, { silent: true });
  };

  const handlePrintResult = (item: ImagingRequestItemRow) => {
    if (!header || !imagingItemHasPrintableResult(item)) return;
    void openImagingResultPrintWindow({ header, item });
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

  return (
    <>
      <Typography variant="h5" sx={{ mb: 3 }}>
        Imaging Results
      </Typography>

      {queueError ? (
        <Alert severity="error" sx={{ mb: 2 }}>
          {queueError}
        </Alert>
      ) : null}

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", md: "420px 1fr" },
          gap: 2,
          alignItems: "start",
        }}
      >
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <Card>
            <CardContent sx={{ p: 3 }}>
              <Box sx={{ display: "flex", justifyContent: "space-between", mb: 2, gap: 2, flexWrap: "wrap" }}>
                <Typography variant="subtitle1" fontWeight={700}>
                  Today&apos;s IMAGING queue
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  All tickets today
                </Typography>
              </Box>

              {queueLoading ? (
                <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
                  <CircularProgress size={32} />
                </Box>
              ) : sortedQueue.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  No IMAGING queue tickets for today.
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

          <Card>
            <CardContent sx={{ p: 3 }}>
              <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 2, gap: 2, flexWrap: "wrap" }}>
                <Typography variant="subtitle1" fontWeight={700}>
                  Search patient / encounter
                </Typography>
              </Box>

              <Box sx={{ mb: 2 }}>
                <FormFieldLabel htmlFor="imaging-results-queue-search" variant="consultation">
                  Find patient / encounter
                </FormFieldLabel>
                <TextField
                  id="imaging-results-queue-search"
                  hiddenLabel
                  placeholder="Patient name or encounter ID (trans_id)…"
                  value={queueSearch}
                  onChange={(e) => {
                    setQueueSearch(e.target.value);
                    setQueueSearchPage(0);
                  }}
                  {...commonFieldProps}
                  sx={[fieldInputSx, { "& .MuiInputBase-input": { textTransform: "none" } }]}
                  slotProps={{
                    input: {
                      startAdornment: (
                        <InputAdornment position="start">
                          <SearchIcon fontSize="small" sx={{ color: "info.main" }} />
                        </InputAdornment>
                      ),
                    },
                  }}
                />
                {queueSearchError ? (
                  <Alert severity="error" sx={{ mt: 1 }}>
                    {queueSearchError}
                  </Alert>
                ) : null}
                {queueSearch.trim() ? (
                  <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.75 }}>
                    Showing {queueListRows.length} of {showPaginatedSearch ? queueSearchCount : sortedQueue.length} ticket
                    {(showPaginatedSearch ? queueSearchCount : sortedQueue.length) === 1 ? "" : "s"}
                  </Typography>
                ) : (
                  <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.75 }}>
                    Type at least 2 characters to search.
                  </Typography>
                )}
              </Box>

              {showPaginatedSearch && queueSearchLoading ? (
                <Box sx={{ display: "flex", justifyContent: "center", py: 2 }}>
                  <CircularProgress size={24} />
                </Box>
              ) : queueListRows.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  No tickets match your search.
                </Typography>
              ) : (
                <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                  {queueListRows.map((t) => {
                    const imgId = (t.imaging_request_id ?? "").trim();
                    const active = imgId === selectedRequestId;
                    const canOpen = canOpenImagingResultsQueueTicket(t.status, imgId);
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
                          opacity: canOpen ? 1 : 0.72,
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
                                label={displayStatus}
                                color={imagingDisplayStatusChipColor(displayStatus)}
                                size="small"
                              />
                              <Typography variant="caption" color="text.secondary" sx={{ textAlign: "right" }}>
                                {formatTicketWhen(t)}
                              </Typography>
                            </Box>
                          </Box>
                          {canOpen ? (
                            <Typography variant="caption" color="primary.main" sx={{ display: "block", mt: 1, fontWeight: 700 }}>
                              Open imaging results
                            </Typography>
                          ) : null}
                        </CardContent>
                      </Card>
                    );
                  })}
                </Box>
              )}

              {showPaginatedSearch ? (
                <TablePagination
                  component="div"
                  count={queueSearchCount}
                  page={queueSearchPage}
                  onPageChange={(_, p) => setQueueSearchPage(p)}
                  rowsPerPage={queueSearchPageSize}
                  rowsPerPageOptions={[5, 10, 20, 50]}
                  onRowsPerPageChange={(e) => {
                    const n = Number.parseInt(String(e.target.value ?? "10"), 10);
                    setQueueSearchPageSize(Number.isFinite(n) && n > 0 ? n : 10);
                    setQueueSearchPage(0);
                  }}
                  labelRowsPerPage="Rows per page"
                  sx={{
                    mt: 1,
                    "& .MuiTablePagination-toolbar": { textTransform: "none" },
                    "& .MuiTablePagination-select": { textTransform: "none" },
                    "& .MuiTablePagination-selectLabel, & .MuiTablePagination-displayedRows": { textTransform: "none" },
                  }}
                />
              ) : null}
            </CardContent>
          </Card>
        </Box>

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
                  {(header.patient_name ?? "").trim() || "Patient"} · Queue {(header.queue_display ?? "").trim() || "—"}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Request {header.request_date}
                  {header.request_time ? ` ${header.request_time}` : ""} · {header.priority} · {header.status}
                </Typography>

                <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2, flexWrap: "wrap", mb: 2 }}>
                  <Typography variant="body2" color="text.secondary">
                    Mark <strong>Captured</strong> when the study is performed (like laboratory{" "}
                    <strong>Collected</strong>). Mark <strong>Received</strong> when the result or film is ready to upload.
                    Findings and impression are entered by radiology.
                  </Typography>
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={reqLoading ? <CircularProgress size={16} color="inherit" /> : <RefreshOutlinedIcon />}
                    disabled={!selectedRequestId || reqLoading}
                    onClick={refreshRequest}
                    sx={{ textTransform: "none", fontWeight: 700, flexShrink: 0 }}
                  >
                    Refresh
                  </Button>
                </Box>

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
                <Table size="small" sx={{ minWidth: 980 }}>
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
                      <TableCell sx={{ minWidth: 160 }}>Impression</TableCell>
                      <TableCell sx={{ minWidth: 88 }}>Status</TableCell>
                      <TableCell align="right" sx={{ minWidth: 120, whiteSpace: "nowrap" }}>
                        Actions
                      </TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {items.map((it) => {
                      const captured = isImagingItemCaptured(it.status);
                      const resultReceived = isImagingItemResultReceived(it.status);
                      const rowBusy = itemBusyId === it.id;
                      const canPrintResult = imagingItemHasPrintableResult(it);
                      return (
                      <TableRow key={it.id}>
                        <TableCell sx={{ verticalAlign: "middle" }}>{it.study_name}</TableCell>
                        <TableCell sx={{ verticalAlign: "middle" }}>{it.view_text ?? "—"}</TableCell>
                        <TableCell align="center" sx={{ px: 0.5, verticalAlign: "middle" }}>
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
                        <TableCell align="center" sx={{ px: 0.5, verticalAlign: "middle" }}>
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
                        <TableCell align="center" sx={{ px: 0.5, verticalAlign: "middle", whiteSpace: "nowrap" }}>
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
                        <TableCell sx={{ minWidth: 200, maxWidth: 280, verticalAlign: "top" }}>
                          <Typography
                            variant="body2"
                            sx={{ whiteSpace: "pre-wrap", wordBreak: "break-word", lineHeight: 1.45 }}
                          >
                            {(it.findings ?? "").trim() || "—"}
                          </Typography>
                        </TableCell>
                        <TableCell sx={{ minWidth: 160, maxWidth: 220, verticalAlign: "top" }}>
                          <Typography
                            variant="body2"
                            sx={{ whiteSpace: "pre-wrap", wordBreak: "break-word", lineHeight: 1.45 }}
                          >
                            {(it.remarks ?? "").trim() || "—"}
                          </Typography>
                        </TableCell>
                        <TableCell sx={{ whiteSpace: "nowrap" }}>{imagingItemStatusLabel(it.status)}</TableCell>
                        <TableCell align="right" sx={{ verticalAlign: "middle", whiteSpace: "nowrap" }}>
                          <Tooltip
                            title={
                              canPrintResult
                                ? "Print findings and impression"
                                : "Enter findings or impression in radiology before printing"
                            }
                          >
                            <span>
                              <Button
                                size="small"
                                variant="outlined"
                                startIcon={<PrintOutlinedIcon fontSize="small" />}
                                disabled={!canPrintResult}
                                onClick={() => handlePrintResult(it)}
                                sx={{ textTransform: "none", fontWeight: 700 }}
                              >
                                Print Result
                              </Button>
                            </span>
                          </Tooltip>
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
