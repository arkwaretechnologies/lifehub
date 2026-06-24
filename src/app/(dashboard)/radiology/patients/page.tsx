"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Collapse,
  FormControl,
  MenuItem,
  Select,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { commonFieldProps, fieldInputSx, imagingReportFieldSx, menuItemSx } from "@/components/fieldInputStyles";
import { FormFieldLabel } from "@/components/FormFieldLabel";
import { DatePickerField } from "@/components/DatePickerField";
import ImagingStudyImageUpload from "@/components/imaging/ImagingStudyImageUpload";
import { authenticatedFetch } from "@/lib/authenticatedFetch";
import { formatDateMMDDYYYY, formatLabTime } from "@/lib/dateDisplay";
import { isImagingItemInterpreted, isImagingItemResultReceived, imagingItemStatusLabel } from "@/lib/imagingQueueSync";
import type { ImagingRequestItemRow } from "@/lib/imagingRequests";
import type { RadiologyPatientRequestRow, RadiologyPatientSummaryRow } from "@/lib/radiologyAssignments";

type RadiologistOption = { user_id: number; fullname: string };
type RadiologistFilter = "all" | number;
type QueueDateScope = "today" | "all";

function appendQueueFilterParams(params: URLSearchParams, scope: QueueDateScope, date: string) {
  params.set("scope", scope);
  if (scope === "today") params.set("date", date);
}

function radiologistFilterParam(filter: RadiologistFilter | null): string | null {
  if (filter == null) return null;
  return filter === "all" ? "all" : String(filter);
}

function formatRequestWhen(date: string, time: string | null): string {
  const d = formatDateMMDDYYYY(date);
  const t = formatLabTime(time);
  if (!d) return t;
  return t === "—" ? d : `${d} · ${t}`;
}

function localDateYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function paginationRangeLabel(from: number, to: number, count: number): string {
  if (count === 0) return "0–0 of 0";
  return `${from}–${to} of ${count}`;
}

export default function RadiologyPatientsPage() {
  const [canFilterRadiologists, setCanFilterRadiologists] = useState(false);
  const [radiologists, setRadiologists] = useState<RadiologistOption[]>([]);
  const [radiologistFilter, setRadiologistFilter] = useState<RadiologistFilter | null>(null);
  const [queueDate, setQueueDate] = useState(localDateYmd(new Date()));
  const [queueScope, setQueueScope] = useState<QueueDateScope>("today");
  const [filterReady, setFilterReady] = useState(false);

  const [rows, setRows] = useState<RadiologyPatientSummaryRow[]>([]);
  const [total, setTotal] = useState(0);
  const [totalStudies, setTotalStudies] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [selectedPatientId, setSelectedPatientId] = useState<number | null>(null);
  const [patientRequests, setPatientRequests] = useState<RadiologyPatientRequestRow[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(false);

  const [selectedRequestId, setSelectedRequestId] = useState("");
  const [reqLoading, setReqLoading] = useState(false);
  const [reqError, setReqError] = useState("");
  const [items, setItems] = useState<ImagingRequestItemRow[]>([]);
  const [assignedItemIds, setAssignedItemIds] = useState<Set<string>>(new Set());
  const [patientName, setPatientName] = useState("");
  const [drafts, setDrafts] = useState<Record<string, { findings: string; remarks: string }>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [markingDoneId, setMarkingDoneId] = useState<string | null>(null);

  const loadRadiologists = useCallback(async () => {
    try {
      const res = await authenticatedFetch("/api/radiology/radiologists", { cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as { error?: string; rows?: RadiologistOption[] };
      if (!res.ok) return [];
      return Array.isArray(json.rows) ? json.rows : [];
    } catch {
      return [];
    }
  }, []);

  const clearPatientSelection = () => {
    setSelectedPatientId(null);
    setSelectedRequestId("");
    setItems([]);
    setDrafts({});
    setPatientRequests([]);
    setReqError("");
  };

  const loadPatients = useCallback(async () => {
    if (!filterReady) return;
    setError("");
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      appendQueueFilterParams(params, queueScope, queueDate);
      const radParam = radiologistFilterParam(radiologistFilter);
      if (radParam) params.set("radiologistUserId", radParam);
      const res = await authenticatedFetch(`/api/radiology/patients?${params.toString()}`, { cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        rows?: RadiologyPatientSummaryRow[];
        total?: number;
        totalStudies?: number;
        canFilterRadiologists?: boolean;
        radiologistUserId?: number;
      };
      if (!res.ok) {
        setError(json.error ?? `Request failed (${res.status})`);
        setRows([]);
        setTotal(0);
        setTotalStudies(0);
        return;
      }
      setCanFilterRadiologists(Boolean(json.canFilterRadiologists));
      setRows(Array.isArray(json.rows) ? json.rows : []);
      setTotal(typeof json.total === "number" ? json.total : 0);
      setTotalStudies(typeof json.totalStudies === "number" ? json.totalStudies : 0);
    } catch {
      setError("Failed to load reading queue.");
      setRows([]);
      setTotal(0);
      setTotalStudies(0);
    } finally {
      setLoading(false);
    }
  }, [filterReady, radiologistFilter, queueScope, queueDate, page, pageSize]);

  useEffect(() => {
    void (async () => {
      const res = await authenticatedFetch("/api/radiology/patients", { cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as {
        canFilterRadiologists?: boolean;
        radiologistUserId?: number;
      };
      const canFilter = Boolean(json.canFilterRadiologists);
      setCanFilterRadiologists(canFilter);
      if (canFilter) {
        const rads = await loadRadiologists();
        setRadiologists(rads);
        setRadiologistFilter("all");
      } else if (typeof json.radiologistUserId === "number") {
        setRadiologistFilter(json.radiologistUserId);
      }
      setFilterReady(true);
    })();
  }, [loadRadiologists]);

  useEffect(() => {
    void loadPatients();
  }, [loadPatients]);

  const loadPatientRequests = async (patientId: number) => {
    setRequestsLoading(true);
    setPatientRequests([]);
    try {
      const params = new URLSearchParams({ patientId: String(patientId) });
      appendQueueFilterParams(params, queueScope, queueDate);
      const radParam = radiologistFilterParam(radiologistFilter);
      if (radParam) params.set("radiologistUserId", radParam);
      const res = await authenticatedFetch(`/api/radiology/patients?${params.toString()}`, { cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        requests?: RadiologyPatientRequestRow[];
        patient?: { patient_name?: string };
      };
      if (!res.ok) {
        setReqError(json.error ?? `Request failed (${res.status})`);
        return;
      }
      setPatientRequests(Array.isArray(json.requests) ? json.requests : []);
      setPatientName(String(json.patient?.patient_name ?? ""));
    } catch {
      setReqError("Failed to load patient imaging orders.");
    } finally {
      setRequestsLoading(false);
    }
  };

  const loadRequestDetail = async (imagingRequestId: string) => {
    setReqError("");
    setItems([]);
    setDrafts({});
    setAssignedItemIds(new Set());
    setSelectedRequestId(imagingRequestId);
    if (!imagingRequestId) return;

    setReqLoading(true);
    try {
      const params = new URLSearchParams({ imagingRequestId });
      appendQueueFilterParams(params, queueScope, queueDate);
      const radParam = radiologistFilterParam(radiologistFilter);
      if (radParam) params.set("radiologistUserId", radParam);
      const res = await authenticatedFetch(`/api/radiology/patients?${params.toString()}`, { cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        items?: ImagingRequestItemRow[];
        patient_name?: string | null;
        is_assigned?: boolean;
        assigned_item_ids?: string[];
      };
      if (!res.ok) {
        setReqError(json.error ?? `Request failed (${res.status})`);
        return;
      }
      const loadedItems = Array.isArray(json.items) ? json.items : [];
      setItems(loadedItems);
      setAssignedItemIds(new Set(Array.isArray(json.assigned_item_ids) ? json.assigned_item_ids : []));
      if (json.patient_name) setPatientName(json.patient_name);
      const next: Record<string, { findings: string; remarks: string }> = {};
      for (const it of loadedItems) {
        next[it.id] = { findings: it.findings ?? "", remarks: it.remarks ?? "" };
      }
      setDrafts(next);
    } catch {
      setReqError("Failed to load imaging request.");
    } finally {
      setReqLoading(false);
    }
  };

  const openPatient = (patientId: number) => {
    if (selectedPatientId === patientId) {
      setSelectedPatientId(null);
      setSelectedRequestId("");
      setItems([]);
      setDrafts({});
      setPatientRequests([]);
      setReqError("");
      return;
    }
    setSelectedPatientId(patientId);
    setSelectedRequestId("");
    setItems([]);
    setDrafts({});
    setReqError("");
    void loadPatientRequests(patientId);
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
      if (selectedRequestId) await loadRequestDetail(selectedRequestId);
    } catch {
      setReqError("Failed to save findings.");
    } finally {
      setSavingId(null);
    }
  };

  const markItemDone = async (itemId: string) => {
    const d = drafts[itemId];
    if (!d) return;
    setMarkingDoneId(itemId);
    setReqError("");
    try {
      const res = await authenticatedFetch("/api/imaging/imaging-request", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imagingRequestItemId: itemId,
          findings: d.findings,
          remarks: d.remarks,
          markReadingDone: true,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setReqError(json.error ?? `Mark done failed (${res.status})`);
        return;
      }
      if (selectedRequestId) await loadRequestDetail(selectedRequestId);
    } catch {
      setReqError("Failed to mark study as done.");
    } finally {
      setMarkingDoneId(null);
    }
  };

  const filterIsAll = radiologistFilter === "all";
  const dateScopeIsAll = queueScope === "all";

  const queueDateFilters = (
    <Box sx={{ display: "flex", flexWrap: "wrap", gap: 2, alignItems: "flex-end" }}>
      <Box sx={{ minWidth: 140 }}>
        <FormFieldLabel htmlFor="radiology-patients-scope">Scope</FormFieldLabel>
        <FormControl fullWidth size="small">
          <Select
            id="radiology-patients-scope"
            value={queueScope}
            onChange={(e) => {
              setQueueScope(e.target.value as QueueDateScope);
              setPage(0);
              clearPatientSelection();
            }}
            sx={fieldInputSx}
          >
            <MenuItem value="today" sx={menuItemSx}>
              Today
            </MenuItem>
            <MenuItem value="all" sx={menuItemSx}>
              All
            </MenuItem>
          </Select>
        </FormControl>
      </Box>
      <DatePickerField
        id="radiology-patients-date"
        label="Date"
        width={180}
        value={queueDate}
        disabled={dateScopeIsAll}
        onChange={(e) => {
          setQueueDate(e.target.value);
          setPage(0);
          clearPatientSelection();
        }}
      />
    </Box>
  );

  return (
    <>
      <Typography variant="h5" sx={{ mb: 3 }}>
        Reading Queue
      </Typography>

      {error ? (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      ) : null}

      {canFilterRadiologists ? (
        <Card sx={{ mb: 2 }}>
          <CardContent sx={{ p: 3 }}>
            <Box
              sx={{
                display: "flex",
                flexWrap: "wrap",
                gap: 2,
                alignItems: "flex-end",
                justifyContent: "space-between",
              }}
            >
              <Box sx={{ minWidth: 240, maxWidth: 360, flex: "1 1 240px" }}>
                <FormFieldLabel htmlFor="radiology-patients-radiologist">Radiologist</FormFieldLabel>
                <FormControl fullWidth size="small">
                  <Select
                    id="radiology-patients-radiologist"
                    value={radiologistFilter === "all" ? "all" : radiologistFilter != null ? String(radiologistFilter) : ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      setRadiologistFilter(v === "all" ? "all" : Number.parseInt(v, 10));
                      setPage(0);
                      clearPatientSelection();
                    }}
                    sx={fieldInputSx}
                  >
                    <MenuItem value="all" sx={menuItemSx}>
                      All
                    </MenuItem>
                    {radiologists.map((r) => (
                      <MenuItem key={r.user_id} value={String(r.user_id)} sx={menuItemSx}>
                        {r.fullname}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                {radiologists.length === 0 ? (
                  <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: "block" }}>
                    Create users with role RADIOLOGIST in User Management to populate this filter.
                  </Typography>
                ) : null}
              </Box>
              <Box sx={{ ml: { sm: "auto" } }}>{queueDateFilters}</Box>
            </Box>
          </CardContent>
        </Card>
      ) : (
        <Card sx={{ mb: 2 }}>
          <CardContent sx={{ p: 3 }}>
            <Box sx={{ display: "flex", justifyContent: "flex-end" }}>{queueDateFilters}</Box>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent sx={{ p: 3 }}>
          {loading ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
              <CircularProgress />
            </Box>
          ) : (
            <>
              {rows.length === 0 && total === 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  {dateScopeIsAll
                    ? filterIsAll
                      ? "No patients assigned to any radiologist."
                      : "No patients assigned to this radiologist."
                    : filterIsAll
                      ? `No patients assigned to any radiologist on ${formatDateMMDDYYYY(queueDate)}.`
                      : `No patients assigned to this radiologist on ${formatDateMMDDYYYY(queueDate)}.`}
                </Typography>
              ) : (
                <>
                  {total > 0 ? (
                    <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, mb: 2 }}>
                      <Chip
                        label={paginationRangeLabel(
                          rows.length === 0 ? 0 : page * pageSize + 1,
                          page * pageSize + rows.length,
                          total,
                        )}
                        color="secondary"
                        variant="outlined"
                      />
                      <Chip
                        label={`${totalStudies} stud${totalStudies === 1 ? "y" : "ies"} total`}
                        color="secondary"
                        variant="outlined"
                      />
                    </Box>
                  ) : null}
                  <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Patient</TableCell>
                    <TableCell>Contact</TableCell>
                    <TableCell>Patient ID</TableCell>
                    {filterIsAll ? <TableCell>Radiologist(s)</TableCell> : null}
                    <TableCell align="center">Studies</TableCell>
                    <TableCell>Latest request</TableCell>
                    <TableCell align="right">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rows.map((row) => {
                    const expanded = row.patient_id === selectedPatientId;
                    return (
                      <Fragment key={row.patient_id}>
                        <TableRow hover selected={expanded}>
                          <TableCell sx={{ fontWeight: expanded ? 700 : 400 }}>{row.patient_name}</TableCell>
                          <TableCell>{row.contact_no ?? "—"}</TableCell>
                          <TableCell>{row.patient_id}</TableCell>
                          {filterIsAll ? <TableCell>{row.radiologist_names ?? "—"}</TableCell> : null}
                          <TableCell align="center">{row.assigned_request_count}</TableCell>
                          <TableCell>{formatDateMMDDYYYY(row.latest_request_date)}</TableCell>
                          <TableCell align="right">
                            <Button
                              size="small"
                              variant={expanded ? "contained" : "outlined"}
                              color="secondary"
                              sx={{ textTransform: "none" }}
                              onClick={() => openPatient(row.patient_id)}
                            >
                              {expanded ? "Close" : "View"}
                            </Button>
                          </TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell colSpan={filterIsAll ? 7 : 6} sx={{ py: 0, borderBottom: expanded ? undefined : 0 }}>
                            <Collapse in={expanded} timeout="auto" unmountOnExit>
                              <Box sx={{ py: 3 }}>
                                {reqError ? (
                                  <Alert severity="error" sx={{ mb: 2 }}>
                                    {reqError}
                                  </Alert>
                                ) : null}

                                <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 2 }}>
                                  {patientName || row.patient_name} — imaging orders
                                </Typography>

                                {requestsLoading ? (
                                  <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
                                    <CircularProgress size={28} />
                                  </Box>
                                ) : patientRequests.length === 0 ? (
                                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                                    No imaging orders with studies assigned to this radiologist.
                                  </Typography>
                                ) : (
                                  <TableContainer sx={{ mb: 3 }}>
                                    <Table size="small">
                                      <TableHead>
                                        <TableRow>
                                          <TableCell>Request date / time</TableCell>
                                          <TableCell align="center">Studies</TableCell>
                                          <TableCell>Status</TableCell>
                                          <TableCell>Assignment</TableCell>
                                          <TableCell align="right">Actions</TableCell>
                                        </TableRow>
                                      </TableHead>
                                      <TableBody>
                                        {patientRequests.map((req) => {
                                          const active = req.imaging_request_id === selectedRequestId;
                                          return (
                                            <TableRow
                                              key={req.imaging_request_id}
                                              hover
                                              selected={active}
                                            >
                                              <TableCell>
                                                {formatRequestWhen(req.request_date, req.request_time)}
                                              </TableCell>
                                              <TableCell align="center">{req.study_count}</TableCell>
                                              <TableCell>
                                                <Chip size="small" label={req.status} variant="outlined" />
                                              </TableCell>
                                              <TableCell>
                                                {req.is_assigned_to_filter ? (
                                                  req.radiologist_name ? (
                                                    <Chip size="small" label={req.radiologist_name} color="secondary" />
                                                  ) : (
                                                    <Chip size="small" label="Assigned" color="secondary" />
                                                  )
                                                ) : (
                                                  <Typography variant="caption" color="text.secondary">
                                                    —
                                                  </Typography>
                                                )}
                                              </TableCell>
                                              <TableCell align="right">
                                                <Button
                                                  size="small"
                                                  variant={active ? "contained" : "outlined"}
                                                  color="secondary"
                                                  sx={{ textTransform: "none" }}
                                                  onClick={() => void loadRequestDetail(req.imaging_request_id)}
                                                >
                                                  {active ? "Selected" : "Open studies"}
                                                </Button>
                                              </TableCell>
                                            </TableRow>
                                          );
                                        })}
                                      </TableBody>
                                    </Table>
                                  </TableContainer>
                                )}

                                {reqLoading ? (
                                  <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
                                    <CircularProgress size={28} />
                                  </Box>
                                ) : selectedRequestId && items.length > 0 ? (
                                  <>
                                    <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>
                                      Studies
                                    </Typography>

                                    <TableContainer sx={{ overflowX: "auto" }}>
                                      <Table size="small">
                                        <TableHead>
                                          <TableRow>
                                            <TableCell>Study</TableCell>
                                            <TableCell>Status</TableCell>
                                            <TableCell>Image</TableCell>
                                            <TableCell sx={{ minWidth: 220 }}>Findings</TableCell>
                                            <TableCell sx={{ minWidth: 180 }}>Impression</TableCell>
                                            <TableCell align="right" />
                                          </TableRow>
                                        </TableHead>
                                        <TableBody>
                                          {items.map((it) => {
                                            const itemAssigned = assignedItemIds.has(it.id);
                                            const editable =
                                              itemAssigned && isImagingItemResultReceived(it.status);
                                            const readingDone = isImagingItemInterpreted(it.status);
                                            const rowBusy = savingId != null || markingDoneId != null;
                                            const hasImage = Boolean(String(it.image_storage_path ?? "").trim());
                                            return (
                                              <TableRow key={it.id}>
                                                <TableCell>
                                                  {it.study_name}
                                                  {it.view_text ? ` (${it.view_text})` : ""}
                                                </TableCell>
                                                <TableCell>
                                                  <Chip
                                                    size="small"
                                                    label={imagingItemStatusLabel(it.status)}
                                                    variant="outlined"
                                                    color={readingDone ? "success" : "default"}
                                                  />
                                                </TableCell>
                                                <TableCell>
                                                  <ImagingStudyImageUpload
                                                    itemId={it.id}
                                                    resultReceived={
                                                      isImagingItemResultReceived(it.status) || hasImage
                                                    }
                                                    readOnly
                                                    hasImage={hasImage}
                                                    originalFilename={it.image_original_filename}
                                                    onError={(msg) => setReqError(msg)}
                                                  />
                                                </TableCell>
                                                <TableCell>
                                                  <TextField
                                                    {...commonFieldProps}
                                                    multiline
                                                    minRows={2}
                                                    disabled={!editable || rowBusy}
                                                    value={drafts[it.id]?.findings ?? ""}
                                                    onChange={(e) =>
                                                      setDrafts((prev) => ({
                                                        ...prev,
                                                        [it.id]: {
                                                          findings: e.target.value,
                                                          remarks: prev[it.id]?.remarks ?? "",
                                                        },
                                                      }))
                                                    }
                                                    sx={imagingReportFieldSx}
                                                  />
                                                </TableCell>
                                                <TableCell>
                                                  <TextField
                                                    {...commonFieldProps}
                                                    multiline
                                                    minRows={2}
                                                    disabled={!editable || rowBusy}
                                                    value={drafts[it.id]?.remarks ?? ""}
                                                    onChange={(e) =>
                                                      setDrafts((prev) => ({
                                                        ...prev,
                                                        [it.id]: {
                                                          findings: prev[it.id]?.findings ?? "",
                                                          remarks: e.target.value,
                                                        },
                                                      }))
                                                    }
                                                    sx={imagingReportFieldSx}
                                                  />
                                                </TableCell>
                                                <TableCell align="right" sx={{ minWidth: 160 }}>
                                                  {editable ? (
                                                    <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5, alignItems: "flex-end" }}>
                                                      <Button
                                                        size="small"
                                                        variant="contained"
                                                        color="secondary"
                                                        disabled={rowBusy}
                                                        onClick={() => void saveItem(it.id)}
                                                        sx={{ textTransform: "none", whiteSpace: "nowrap", minWidth: 88 }}
                                                      >
                                                        {savingId === it.id ? (
                                                          <CircularProgress size={18} color="inherit" />
                                                        ) : (
                                                          "Save"
                                                        )}
                                                      </Button>
                                                      <Button
                                                        size="small"
                                                        variant="outlined"
                                                        color="secondary"
                                                        disabled={rowBusy || readingDone}
                                                        onClick={() => void markItemDone(it.id)}
                                                        sx={{ textTransform: "none", whiteSpace: "nowrap", minWidth: 88 }}
                                                      >
                                                        {markingDoneId === it.id ? (
                                                          <CircularProgress size={18} color="inherit" />
                                                        ) : readingDone ? (
                                                          "Done"
                                                        ) : (
                                                          "Mark done"
                                                        )}
                                                      </Button>
                                                    </Box>
                                                  ) : null}
                                                </TableCell>
                                              </TableRow>
                                            );
                                          })}
                                        </TableBody>
                                      </Table>
                                    </TableContainer>
                                  </>
                                ) : selectedRequestId ? (
                                  <Typography variant="body2" color="text.secondary">
                                    No studies assigned to this radiologist on this request.
                                  </Typography>
                                ) : null}
                              </Box>
                            </Collapse>
                          </TableCell>
                        </TableRow>
                      </Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
                </>
              )}
            <TablePagination
              component="div"
              count={total}
              page={page}
              onPageChange={(_, p) => {
                setPage(p);
                clearPatientSelection();
              }}
              rowsPerPage={pageSize}
              rowsPerPageOptions={[10, 20, 50]}
              onRowsPerPageChange={(e) => {
                const n = Number.parseInt(String(e.target.value ?? "20"), 10);
                setPageSize(Number.isFinite(n) && n > 0 ? n : 20);
                setPage(0);
                clearPatientSelection();
              }}
              labelRowsPerPage="Rows per page"
              labelDisplayedRows={({ from, to, count }) => paginationRangeLabel(from, to, count)}
              sx={{
                "& .MuiTablePagination-toolbar": { textTransform: "none" },
                "& .MuiTablePagination-selectLabel, & .MuiTablePagination-displayedRows": { textTransform: "none" },
              }}
            />
            </>
          )}
        </CardContent>
      </Card>
    </>
  );
}
