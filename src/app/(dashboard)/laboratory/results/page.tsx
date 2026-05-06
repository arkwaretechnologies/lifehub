"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import CampaignOutlinedIcon from "@mui/icons-material/CampaignOutlined";
import ScienceOutlinedIcon from "@mui/icons-material/ScienceOutlined";
import SaveOutlinedIcon from "@mui/icons-material/SaveOutlined";
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
  Divider,
  FormControl,
  FormControlLabel,
  InputAdornment,
  MenuItem,
  Select,
  Snackbar,
  TextField,
  TablePagination,
  Tooltip,
  Typography,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";

function formatLabRequestDateTime(requestDate: string, requestTime: string | null): string {
  const d = formatDateMMDDYYYY(requestDate);
  const t = formatLabTime(requestTime);
  if (!d) return t === "—" ? "—" : t;
  return t === "—" ? d : `${d} · ${t}`;
}
import { commonFieldProps, fieldInputSx } from "@/components/fieldInputStyles";
import { FormFieldLabel } from "@/components/FormFieldLabel";
import type { QueueTicketStatus } from "@/lib/queueReception";
import type { LabQueueRow } from "@/app/api/laboratory/lab-queue/route";
import type { LabRequestHeaderView, LabRequestItemView } from "@/app/api/laboratory/lab-request/route";
import { formatDateMMDDYYYY, formatLabTime } from "@/lib/dateDisplay";

export default function LabResultsPage() {
  const theme = useTheme();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [queueSearch, setQueueSearch] = useState("");
  const [debouncedQueueSearch, setDebouncedQueueSearch] = useState("");
  const [queueSearchLoading, setQueueSearchLoading] = useState(false);
  const [queueSearchError, setQueueSearchError] = useState("");
  const [queueSearchRows, setQueueSearchRows] = useState<LabQueueRow[]>([]);
  const [queueSearchCount, setQueueSearchCount] = useState(0);
  const [queueSearchPage, setQueueSearchPage] = useState(0);
  const [queueSearchPageSize, setQueueSearchPageSize] = useState(10);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rows, setRows] = useState<LabQueueRow[]>([]);
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);

  const [selectedRequestId, setSelectedRequestId] = useState<string>("");
  const [reqLoading, setReqLoading] = useState(false);
  const [reqError, setReqError] = useState("");
  const [reqItems, setReqItems] = useState<LabRequestItemView[]>([]);
  const [reqHeader, setReqHeader] = useState<LabRequestHeaderView | null>(null);
  const [itemSavingId, setItemSavingId] = useState<string | null>(null);
  const [toastOpen, setToastOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [toastSeverity, setToastSeverity] = useState<"success" | "error">("success");

  const statusColor: Record<QueueTicketStatus, "default" | "warning" | "info" | "success"> = {
    Waiting: "warning",
    Called: "info",
    Serving: "info",
    Completed: "success",
    Skipped: "default",
    Cancelled: "default",
    "No Show": "default",
  };

  const loadQueue = async () => {
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/laboratory/lab-queue", { cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as { error?: string; rows?: LabQueueRow[] };
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

  const loadRequest = async (labRequestIdRaw: string) => {
    const labRequestId = (labRequestIdRaw ?? "").trim();
    setReqItems([]);
    setReqHeader(null);
    setReqError("");
    setSelectedRequestId(labRequestId);
    if (!labRequestId) return;
    setReqLoading(true);
    try {
      const res = await fetch(`/api/laboratory/lab-request?labRequestId=${encodeURIComponent(labRequestId)}`, {
        cache: "no-store",
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        items?: LabRequestItemView[];
        header?: LabRequestHeaderView;
      };
      if (!res.ok) {
        setReqError(json.error ?? `Request failed (${res.status})`);
        return;
      }
      setReqHeader(json.header ?? null);
      setReqItems(Array.isArray(json.items) ? json.items : []);
    } catch {
      setReqError("Failed to load lab request details.");
    } finally {
      setReqLoading(false);
    }
  };

  useEffect(() => {
    void loadQueue();
  }, []);

  // URL-driven selection
  useEffect(() => {
    const id = (searchParams.get("labRequestId") ?? "").trim();
    if (id && id !== selectedRequestId) {
      void loadRequest(id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const sorted = useMemo(() => rows.slice().sort((a, b) => a.issued_at.localeCompare(b.issued_at)), [rows]);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQueueSearch(queueSearch), 400);
    return () => window.clearTimeout(t);
  }, [queueSearch]);

  useEffect(() => {
    const q = debouncedQueueSearch.trim();
    // For very short queries, fall back to the in-memory list (no pagination).
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
        const url = `/api/laboratory/lab-queue?q=${encodeURIComponent(q)}&scope=all&days=90&page=${queueSearchPage}&pageSize=${queueSearchPageSize}`;
        const res = await fetch(url, { cache: "no-store" });
        const json = (await res.json().catch(() => ({}))) as { error?: string; rows?: LabQueueRow[]; count?: number };
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
        setQueueSearchError("Failed to search LAB queue.");
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
    if (!q) return sorted;
    return sorted.filter((t) => {
      const hay = [t.queue_display, t.patient_name, t.encounter_id, t.lab_request_id, t.status]
        .map((v) => String(v ?? "").trim().toLowerCase())
        .filter(Boolean)
        .join(" | ");
      return hay.includes(q);
    });
  }, [queueSearch, sorted]);

  const showPaginatedSearch = debouncedQueueSearch.trim().length >= 2;
  const queueListRows = showPaginatedSearch ? queueSearchRows : filteredSorted;

  const selectedTicket = useMemo(() => {
    if (!selectedRequestId) return null;
    const match = (t: LabQueueRow) => (t.lab_request_id ?? "").trim() === selectedRequestId;
    return sorted.find(match) ?? queueSearchRows.find(match) ?? null;
  }, [selectedRequestId, sorted, queueSearchRows]);

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
      await loadQueue();
    } catch {
      setError("Failed to call patient.");
    } finally {
      setActionBusyId(null);
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
      const json = (await res.json().catch(() => ({}))) as { error?: string; collected?: boolean };
      if (!res.ok) {
        setReqError(json.error ?? `Request failed (${res.status})`);
        return;
      }
      setReqItems((prev) =>
        prev.map((it) => (it.id === id ? { ...it, collected_item: json.collected ? "Y" : null } : it)),
      );
      await loadQueue();
    } catch {
      setReqError("Failed to save specimen status.");
    } finally {
      setItemSavingId(null);
    }
  };

  const saveResult = async (it: LabRequestItemView) => {
    const id = it.id.trim();
    if (!id) return;
    if ((it.collected_item ?? "").trim().toUpperCase() !== "Y") return;
    setReqError("");
    setItemSavingId(id);
    try {
      const res = await fetch("/api/laboratory/lab-results", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          labRequestItemId: id,
          result_value: it.result_value ?? null,
          result_unit: it.result_unit ?? null,
          reference_range: it.reference_range ?? null,
          flag: it.flag ?? null,
          remarks: it.remarks ?? null,
          status: it.result_status ?? "Pending",
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        row?: {
          lab_request_item_id?: string;
          result_value?: string | null;
          result_unit?: string | null;
          reference_range?: string | null;
          flag?: string | null;
          remarks?: string | null;
          status?: string | null;
        };
      };
      if (!res.ok) {
        const msg = json.error ?? `Request failed (${res.status})`;
        setReqError(msg);
        setToastSeverity("error");
        setToastMessage(msg);
        setToastOpen(true);
        return;
      }
      const rid = json.row?.lab_request_item_id?.trim();
      if (rid) {
        setReqItems((prev) =>
          prev.map((x) =>
            x.id === rid
              ? {
                  ...x,
                  result_value: json.row!.result_value ?? null,
                  result_unit: json.row!.result_unit ?? null,
                  reference_range: json.row!.reference_range ?? null,
                  flag: json.row!.flag ?? null,
                  remarks: json.row!.remarks ?? null,
                  result_status: json.row!.status ?? x.result_status,
                }
              : x,
          ),
        );
      }
      void loadQueue();
      setReqError("");
      setToastSeverity("success");
      setToastMessage("Result saved.");
      setToastOpen(true);
    } catch {
      const msg = "Failed to save result.";
      setReqError(msg);
      setToastSeverity("error");
      setToastMessage(msg);
      setToastOpen(true);
    } finally {
      setItemSavingId(null);
    }
  };

  const flagOptions = ["Normal", "High", "Low", "Critical", "Abnormal"] as const;
  const statusOptions = ["Pending", "In Progress", "Completed", "Cancelled"] as const;

  /** Match Medical History / consultation outlined fields: light grey border, modest radius, white fill. */
  const fieldSx = useMemo(() => {
    const outlineBorder = "#ced4da";
    const outlineBorderHover = "#adb5bd";
    return {
      ...fieldInputSx,
      // Match consultation fields (`fieldInputSx` height: 40)
      "& .MuiInputBase-root": { height: 40 },
      "& .MuiOutlinedInput-root": {
        borderRadius: 8,
        bgcolor: "#fff",
        boxShadow: "none",
      },
      "& .MuiOutlinedInput-notchedOutline": {
        borderRadius: 8,
        borderWidth: 1,
        borderColor: outlineBorder,
      },
      "&:hover:not(.Mui-disabled) .MuiOutlinedInput-notchedOutline": { borderColor: outlineBorderHover },
      "& .Mui-focused .MuiOutlinedInput-notchedOutline": {
        borderColor: theme.palette.primary.main,
        borderWidth: 1,
      },
      "& .MuiInputBase-input, & .MuiSelect-select": {
        color: theme.palette.text.primary,
        fontWeight: 500,
      },
      "& .MuiSelect-select": {
        height: "100%",
        display: "flex",
        alignItems: "center",
        textTransform: "none",
      },
      "& .Mui-disabled .MuiOutlinedInput-notchedOutline": {
        borderColor: alpha(theme.palette.action.disabled, 0.35),
      },
      "& .Mui-disabled .MuiInputBase-input, & .Mui-disabled .MuiSelect-select": {
        color: theme.palette.text.disabled,
      },
    };
  }, [theme]);

  return (
    <>
      <Snackbar
        open={toastOpen}
        autoHideDuration={3500}
        onClose={() => setToastOpen(false)}
        anchorOrigin={{ vertical: "top", horizontal: "center" }}
      >
        <Alert severity={toastSeverity} variant="filled" onClose={() => setToastOpen(false)} sx={{ width: "100%" }}>
          {toastMessage}
        </Alert>
      </Snackbar>

      <Typography variant="h5" sx={{ mb: 3 }}>
        Lab Results
      </Typography>

      {error ? (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
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
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  mb: 2,
                  gap: 2,
                  flexWrap: "wrap",
                }}
              >
                <Typography variant="subtitle1" fontWeight={700}>
                  Today’s LAB queue
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Active tickets only
                </Typography>
              </Box>

              {loading ? (
                <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
                  <CircularProgress size={32} />
                </Box>
              ) : sorted.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  No active LAB queue tickets for today.
                </Typography>
              ) : (
                <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                  {sorted.map((t) => {
                    const active = (t.lab_request_id ?? "").trim() === selectedRequestId;
                    return (
                      <Card
                        key={t.id}
                        variant="outlined"
                        sx={{
                          borderRadius: 2,
                          cursor: t.lab_request_id ? "pointer" : "default",
                          borderColor: active ? "secondary.main" : "divider",
                          bgcolor: active ? "action.hover" : "background.paper",
                        }}
                        onClick={() => {
                          const lr = (t.lab_request_id ?? "").trim();
                          if (!lr) return;
                          router.replace(`/laboratory/results?labRequestId=${encodeURIComponent(lr)}`);
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
                              <Chip label={t.status} color={statusColor[t.status]} size="small" />
                              <Typography variant="caption" color="text.secondary">
                                {new Date(t.issued_at).toLocaleTimeString()}
                              </Typography>
                            </Box>
                          </Box>
                          <Box sx={{ mt: 1, display: "flex", justifyContent: "flex-end", gap: 1, flexWrap: "wrap" }}>
                            <Tooltip title={t.status === "Waiting" ? "Call patient" : "Only waiting tickets can be called"}>
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
                                  disabled={t.status !== "Waiting" || actionBusyId === t.id}
                                  sx={{ borderRadius: 999, textTransform: "none", fontWeight: 700 }}
                                >
                                  Call
                                </Button>
                              </span>
                            </Tooltip>
                            <Tooltip title={t.lab_request_id ? "Open request" : "No lab request linked"}>
                              <span>
                                <Button
                                  variant="outlined"
                                  size="small"
                                  startIcon={<ScienceOutlinedIcon fontSize="small" />}
                                  disabled={!t.lab_request_id}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const lr = (t.lab_request_id ?? "").trim();
                                    if (!lr) return;
                                    router.replace(`/laboratory/results?labRequestId=${encodeURIComponent(lr)}`);
                                  }}
                                  sx={{ borderRadius: 999, textTransform: "none", fontWeight: 700 }}
                                >
                                  Request
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
                <FormFieldLabel htmlFor="lab-results-queue-search" variant="consultation">
                  Find patient / encounter
                </FormFieldLabel>
                <TextField
                  id="lab-results-queue-search"
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
                    Showing {queueListRows.length} of {showPaginatedSearch ? queueSearchCount : sorted.length} ticket
                    {(showPaginatedSearch ? queueSearchCount : sorted.length) === 1 ? "" : "s"}
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
                    const active = (t.lab_request_id ?? "").trim() === selectedRequestId;
                    return (
                      <Card
                        key={t.id}
                        variant="outlined"
                        sx={{
                          borderRadius: 2,
                          cursor: t.lab_request_id ? "pointer" : "default",
                          borderColor: active ? "secondary.main" : "divider",
                          bgcolor: active ? "action.hover" : "background.paper",
                        }}
                        onClick={() => {
                          const lr = (t.lab_request_id ?? "").trim();
                          if (!lr) return;
                          router.replace(`/laboratory/results?labRequestId=${encodeURIComponent(lr)}`);
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
                              <Chip label={t.status} color={statusColor[t.status]} size="small" />
                              <Typography variant="caption" color="text.secondary">
                                {new Date(t.issued_at).toLocaleTimeString()}
                              </Typography>
                            </Box>
                          </Box>
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

        <Card>
          <CardContent sx={{ p: 3 }}>
            <Typography variant="subtitle1" fontWeight={800} sx={{ mb: 1 }}>
              Request details
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Select a ticket on the left to view requested tests. Mark each item as collected to enable result entry.
            </Typography>

            {reqHeader ? (
              <Box
                sx={{
                  mb: 2,
                  p: 1.5,
                  borderRadius: 2,
                  border: "1px solid",
                  borderColor: "divider",
                  bgcolor: alpha(theme.palette.primary.main, 0.04),
                  display: "grid",
                  gap: 1.25,
                  gridTemplateColumns: { xs: "1fr", sm: "repeat(2, minmax(0, 1fr))" },
                }}
              >
                <Box>
                  <Typography variant="caption" color="text.secondary" fontWeight={700} display="block">
                    Patient ID
                  </Typography>
                  <Typography variant="body2" sx={{ fontFamily: "monospace" }}>
                    {reqHeader.patient_id != null ? String(reqHeader.patient_id) : "—"}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary" fontWeight={700} display="block">
                    Name
                  </Typography>
                  <Typography variant="body2">{reqHeader.patient_name ?? selectedTicket?.patient_name ?? "—"}</Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary" fontWeight={700} display="block">
                    Date / time
                  </Typography>
                  <Typography variant="body2">
                    {formatLabRequestDateTime(reqHeader.request_date, reqHeader.request_time)}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary" fontWeight={700} display="block">
                    Queue No
                  </Typography>
                  <Typography variant="body2" sx={{ fontFamily: "monospace" }}>
                    {reqHeader.queue_display ?? selectedTicket?.queue_display ?? "—"}
                  </Typography>
                </Box>
              </Box>
            ) : null}

            <Divider sx={{ mb: 2 }} />

            {reqError ? (
              <Alert severity="error" sx={{ mb: 2 }}>
                {reqError}
              </Alert>
            ) : null}

            {!selectedRequestId ? (
              <Typography variant="body2" color="text.secondary">
                No request selected.
              </Typography>
            ) : reqLoading ? (
              <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
                <CircularProgress size={28} />
              </Box>
            ) : reqItems.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                No items found.
              </Typography>
            ) : (
              <Box sx={{ display: "flex", flexDirection: "column", gap: 1.25 }}>
                {reqItems.map((it) => {
                  const collected = (it.collected_item ?? "").trim().toUpperCase() === "Y";
                  const busy = itemSavingId === it.id;
                  return (
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
                        flexDirection: "column",
                        gap: 1.25,
                      }}
                    >
                      <Box sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 2 }}>
                        <Box sx={{ minWidth: 0 }}>
                          <Typography variant="body2" fontWeight={800} noWrap>
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
                              checked={collected}
                              onChange={(_, checked) => void saveItemCollected(it.id, checked)}
                              disabled={busy}
                            />
                          }
                          label={
                            <Typography variant="caption" fontWeight={800}>
                              Collected
                            </Typography>
                          }
                          labelPlacement="start"
                        />
                      </Box>

                      <Box
                        sx={{
                          display: "grid",
                          gridTemplateColumns: { xs: "1fr", sm: "1.2fr 0.8fr" },
                          gap: 1.5,
                        }}
                      >
                        <Box>
                          <FormFieldLabel htmlFor={`lab-res-${it.id}-value`} variant="consultation">
                            Result
                          </FormFieldLabel>
                          <TextField
                            id={`lab-res-${it.id}-value`}
                            hiddenLabel
                            {...commonFieldProps}
                            value={it.result_value ?? ""}
                            onChange={(e) =>
                              setReqItems((prev) => prev.map((x) => (x.id === it.id ? { ...x, result_value: e.target.value } : x)))
                            }
                            disabled={!collected || busy}
                            sx={fieldSx}
                          />
                        </Box>
                        <Box>
                          <FormFieldLabel htmlFor={`lab-res-${it.id}-unit`} variant="consultation">
                            Unit
                          </FormFieldLabel>
                          <TextField
                            id={`lab-res-${it.id}-unit`}
                            hiddenLabel
                            {...commonFieldProps}
                            value={it.result_unit ?? ""}
                            onChange={(e) =>
                              setReqItems((prev) => prev.map((x) => (x.id === it.id ? { ...x, result_unit: e.target.value } : x)))
                            }
                            disabled={!collected || busy}
                            sx={fieldSx}
                          />
                        </Box>
                        <Box>
                          <FormFieldLabel htmlFor={`lab-res-${it.id}-ref`} variant="consultation">
                            Reference range
                          </FormFieldLabel>
                          <TextField
                            id={`lab-res-${it.id}-ref`}
                            hiddenLabel
                            {...commonFieldProps}
                            value={it.reference_range ?? ""}
                            onChange={(e) =>
                              setReqItems((prev) =>
                                prev.map((x) => (x.id === it.id ? { ...x, reference_range: e.target.value } : x)),
                              )
                            }
                            disabled={!collected || busy}
                            sx={fieldSx}
                          />
                        </Box>
                        <Box>
                          <FormFieldLabel htmlFor={`lab-res-${it.id}-flag`} variant="consultation">
                            Flag
                          </FormFieldLabel>
                          <FormControl size="small" disabled={!collected || busy} sx={fieldSx} fullWidth>
                            <Select
                              id={`lab-res-${it.id}-flag`}
                              displayEmpty
                              value={(it.flag ?? "").trim()}
                              renderValue={(v) => (v ? String(v) : "—")}
                              onChange={(e) =>
                                setReqItems((prev) =>
                                  prev.map((x) => (x.id === it.id ? { ...x, flag: String(e.target.value || "") } : x)),
                                )
                              }
                            >
                              <MenuItem value="" sx={{ textTransform: "none" }}>
                                —
                              </MenuItem>
                              {flagOptions.map((f) => (
                                <MenuItem key={f} value={f} sx={{ textTransform: "none" }}>
                                  {f}
                                </MenuItem>
                              ))}
                            </Select>
                          </FormControl>
                        </Box>
                        <Box>
                          <FormFieldLabel htmlFor={`lab-res-${it.id}-status`} variant="consultation">
                            Status
                          </FormFieldLabel>
                          <FormControl size="small" disabled={!collected || busy} sx={fieldSx} fullWidth>
                            <Select
                              id={`lab-res-${it.id}-status`}
                              value={(it.result_status ?? "Pending").trim()}
                              onChange={(e) =>
                                setReqItems((prev) =>
                                  prev.map((x) => (x.id === it.id ? { ...x, result_status: String(e.target.value || "Pending") } : x)),
                                )
                              }
                            >
                              {statusOptions.map((s) => (
                                <MenuItem key={s} value={s} sx={{ textTransform: "none" }}>
                                  {s}
                                </MenuItem>
                              ))}
                            </Select>
                          </FormControl>
                        </Box>
                        <Box>
                          <FormFieldLabel htmlFor={`lab-res-${it.id}-remarks`} variant="consultation">
                            Remarks
                          </FormFieldLabel>
                          <TextField
                            id={`lab-res-${it.id}-remarks`}
                            hiddenLabel
                            {...commonFieldProps}
                            value={it.remarks ?? ""}
                            onChange={(e) =>
                              setReqItems((prev) => prev.map((x) => (x.id === it.id ? { ...x, remarks: e.target.value } : x)))
                            }
                            disabled={!collected || busy}
                            sx={fieldSx}
                          />
                        </Box>
                      </Box>

                      <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
                        <Button
                          variant="contained"
                          color="secondary"
                          size="small"
                          startIcon={busy ? <CircularProgress size={16} color="inherit" /> : <SaveOutlinedIcon fontSize="small" />}
                          disabled={!collected || busy}
                          onClick={() => void saveResult(it)}
                          sx={{ borderRadius: 999, textTransform: "none", fontWeight: 800 }}
                        >
                          Save result
                        </Button>
                      </Box>
                    </Box>
                  );
                })}
              </Box>
            )}
          </CardContent>
        </Card>
      </Box>
    </>
  );
}

