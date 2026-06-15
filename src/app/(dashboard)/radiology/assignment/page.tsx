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
import { commonFieldProps, fieldInputSx, menuItemSx } from "@/components/fieldInputStyles";
import { FormFieldLabel } from "@/components/FormFieldLabel";
import { authenticatedFetch } from "@/lib/authenticatedFetch";
import { formatDateMMDDYYYY, formatLabTime } from "@/lib/dateDisplay";
import { imagingItemStatusLabel } from "@/lib/imagingQueueSync";
import type { RadiologyAssignmentPatientRow } from "@/lib/radiologyAssignments";

type RadiologistOption = { user_id: number; fullname: string };

function localDateYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatRequestWhen(date: string, time: string | null): string {
  const d = formatDateMMDDYYYY(date);
  const t = formatLabTime(time);
  if (!d) return t;
  return t === "—" ? d : `${d} · ${t}`;
}

export default function RadiologyAssignmentPage() {
  const [date, setDate] = useState(localDateYmd(new Date()));
  const [scope, setScope] = useState<"today" | "all">("today");
  const [rows, setRows] = useState<RadiologyAssignmentPatientRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [radiologists, setRadiologists] = useState<RadiologistOption[]>([]);
  const [assignBusyId, setAssignBusyId] = useState<string | null>(null);
  const [expandedPatientId, setExpandedPatientId] = useState<number | null>(null);

  const loadRadiologists = useCallback(async () => {
    try {
      const res = await authenticatedFetch("/api/radiology/radiologists", { cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as { error?: string; rows?: RadiologistOption[] };
      if (!res.ok) return;
      setRadiologists(Array.isArray(json.rows) ? json.rows : []);
    } catch {
      setRadiologists([]);
    }
  }, []);

  const loadRows = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      const params = new URLSearchParams({
        scope,
        page: String(page),
        pageSize: String(pageSize),
      });
      if (scope === "today") params.set("date", date);
      const res = await authenticatedFetch(`/api/radiology/assignments?${params.toString()}`, { cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        rows?: RadiologyAssignmentPatientRow[];
        total?: number;
      };
      if (!res.ok) {
        setError(json.error ?? `Request failed (${res.status})`);
        setRows([]);
        setTotal(0);
        return;
      }
      setRows(Array.isArray(json.rows) ? json.rows : []);
      setTotal(typeof json.total === "number" ? json.total : 0);
    } catch {
      setError("Failed to load imaging requests.");
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [date, scope, page, pageSize]);

  useEffect(() => {
    void loadRadiologists();
  }, [loadRadiologists]);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  const assignRadiologist = async (imagingRequestItemId: string, radiologistUserId: number | null) => {
    setAssignBusyId(imagingRequestItemId);
    setError("");
    try {
      const res = await authenticatedFetch("/api/radiology/assignments", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imagingRequestItemId, radiologistUserId }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(json.error ?? `Assign failed (${res.status})`);
        return;
      }
      await loadRows();
    } catch {
      setError("Failed to assign radiologist.");
    } finally {
      setAssignBusyId(null);
    }
  };

  const togglePatient = (patientId: number) => {
    setExpandedPatientId((prev) => (prev === patientId ? null : patientId));
  };

  return (
    <>
      <Typography variant="h5" sx={{ mb: 3 }}>
        Reading Assignment
      </Typography>

      {error ? (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      ) : null}

      <Card sx={{ mb: 2 }}>
        <CardContent sx={{ p: 3 }}>
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 2, alignItems: "flex-end" }}>
            <Box sx={{ minWidth: 180 }}>
              <FormFieldLabel htmlFor="radiology-assignment-date">Date</FormFieldLabel>
              <TextField
                {...commonFieldProps}
                id="radiology-assignment-date"
                type="date"
                value={date}
                disabled={scope === "all"}
                onChange={(e) => {
                  setDate(e.target.value);
                  setPage(0);
                }}
                sx={{ ...fieldInputSx, "& .MuiInputBase-input": { textTransform: "none" } }}
              />
            </Box>
            <Box sx={{ minWidth: 160 }}>
              <FormFieldLabel htmlFor="radiology-assignment-scope">Scope</FormFieldLabel>
              <FormControl fullWidth size="small">
                <Select
                  id="radiology-assignment-scope"
                  value={scope}
                  onChange={(e) => {
                    setScope(e.target.value as "today" | "all");
                    setPage(0);
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
          </Box>
        </CardContent>
      </Card>

      <Card>
        <CardContent sx={{ p: 3 }}>
          {loading ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
              <CircularProgress />
            </Box>
          ) : rows.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              No patients with imaging studies found for the selected filters.
            </Typography>
          ) : (
            <>
              <TableContainer>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>Patient</TableCell>
                      <TableCell align="center">Studies</TableCell>
                      <TableCell>Latest request</TableCell>
                      <TableCell align="right">Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {rows.map((row) => {
                      const expanded = expandedPatientId === row.patient_id;
                      return (
                        <Fragment key={row.patient_id}>
                          <TableRow hover selected={expanded}>
                            <TableCell sx={{ fontWeight: expanded ? 700 : 400 }}>{row.patient_name}</TableCell>
                            <TableCell align="center">{row.study_count}</TableCell>
                            <TableCell>{formatDateMMDDYYYY(row.latest_request_date)}</TableCell>
                            <TableCell align="right">
                              <Button
                                size="small"
                                variant={expanded ? "contained" : "outlined"}
                                color="secondary"
                                sx={{ textTransform: "none" }}
                                onClick={() => togglePatient(row.patient_id)}
                              >
                                {expanded ? "Close" : "View studies"}
                              </Button>
                            </TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell colSpan={4} sx={{ py: 0, borderBottom: expanded ? undefined : 0 }}>
                              <Collapse in={expanded} timeout="auto" unmountOnExit>
                                <Box sx={{ py: 2 }}>
                                  <TableContainer>
                                    <Table size="small">
                                      <TableHead>
                                        <TableRow>
                                          <TableCell>Study</TableCell>
                                          <TableCell>Request date / time</TableCell>
                                          <TableCell>Status</TableCell>
                                          <TableCell>Assigned radiologist</TableCell>
                                          <TableCell sx={{ minWidth: 200 }}>Assign</TableCell>
                                        </TableRow>
                                      </TableHead>
                                      <TableBody>
                                        {row.studies.map((study) => (
                                          <TableRow key={study.imaging_request_item_id} hover>
                                            <TableCell>
                                              {study.study_name}
                                              {study.view_text ? ` (${study.view_text})` : ""}
                                            </TableCell>
                                            <TableCell>
                                              {formatRequestWhen(study.request_date, study.request_time)}
                                            </TableCell>
                                            <TableCell>
                                              <Chip
                                                size="small"
                                                label={imagingItemStatusLabel(study.item_status)}
                                                variant="outlined"
                                              />
                                            </TableCell>
                                            <TableCell>{study.radiologist_name ?? "—"}</TableCell>
                                            <TableCell>
                                              <FormControl
                                                fullWidth
                                                size="small"
                                                disabled={assignBusyId === study.imaging_request_item_id}
                                              >
                                                <Select
                                                  displayEmpty
                                                  value={
                                                    study.radiologist_user_id != null
                                                      ? String(study.radiologist_user_id)
                                                      : ""
                                                  }
                                                  onChange={(e) => {
                                                    const v = e.target.value;
                                                    void assignRadiologist(
                                                      study.imaging_request_item_id,
                                                      v === "" ? null : Number.parseInt(v, 10),
                                                    );
                                                  }}
                                                  sx={fieldInputSx}
                                                >
                                                  <MenuItem value="" sx={menuItemSx}>
                                                    Unassigned
                                                  </MenuItem>
                                                  {radiologists.map((r) => (
                                                    <MenuItem
                                                      key={r.user_id}
                                                      value={String(r.user_id)}
                                                      sx={menuItemSx}
                                                    >
                                                      {r.fullname}
                                                    </MenuItem>
                                                  ))}
                                                </Select>
                                              </FormControl>
                                            </TableCell>
                                          </TableRow>
                                        ))}
                                      </TableBody>
                                    </Table>
                                  </TableContainer>
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
              <TablePagination
                component="div"
                count={total}
                page={page}
                onPageChange={(_, p) => setPage(p)}
                rowsPerPage={pageSize}
                rowsPerPageOptions={[10, 20, 50]}
                onRowsPerPageChange={(e) => {
                  const n = Number.parseInt(String(e.target.value ?? "20"), 10);
                  setPageSize(Number.isFinite(n) && n > 0 ? n : 20);
                  setPage(0);
                }}
                labelRowsPerPage="Rows per page"
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
