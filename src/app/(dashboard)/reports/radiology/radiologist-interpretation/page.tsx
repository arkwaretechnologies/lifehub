"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import FileDownloadOutlinedIcon from "@mui/icons-material/FileDownloadOutlined";
import RefreshOutlinedIcon from "@mui/icons-material/RefreshOutlined";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { authenticatedFetch } from "@/lib/authenticatedFetch";
import { formatDateMMDDYYYY } from "@/lib/dateDisplay";
import type {
  RadiologistInterpretationDetailRow,
  RadiologistInterpretationSummaryRow,
} from "@/lib/radiologyReports";
import { exportRowsToExcel } from "@/lib/reportExcelExport";

function localYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function studyLabel(row: { studyName: string; viewText: string | null }): string {
  const name = row.studyName.trim() || "—";
  const view = String(row.viewText ?? "").trim();
  return view ? `${name} (${view})` : name;
}

function safeFilenamePart(name: string): string {
  return name.replace(/[^\w\s-]/g, "").replace(/\s+/g, "_").slice(0, 40) || "radiologist";
}

export default function RadiologistInterpretationReportPage() {
  const todayYmd = useMemo(() => localYmd(new Date()), []);
  const [startDate, setStartDate] = useState(todayYmd);
  const [endDate, setEndDate] = useState(todayYmd);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rows, setRows] = useState<RadiologistInterpretationSummaryRow[]>([]);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [detailRows, setDetailRows] = useState<RadiologistInterpretationDetailRow[]>([]);
  const [selectedRad, setSelectedRad] = useState<RadiologistInterpretationSummaryRow | null>(null);

  const loadSummary = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ start: startDate, end: endDate });
      const res = await authenticatedFetch(
        `/api/reports/radiology/radiologist-interpretation?${params.toString()}`,
        { cache: "no-store" },
      );
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        rows?: RadiologistInterpretationSummaryRow[];
      };
      if (!res.ok) {
        setError(json.error ?? `Request failed (${res.status})`);
        setRows([]);
        return;
      }
      setRows(Array.isArray(json.rows) ? json.rows : []);
    } catch {
      setError("Failed to load report.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  const openDetail = async (row: RadiologistInterpretationSummaryRow) => {
    setSelectedRad(row);
    setDetailOpen(true);
    setDetailLoading(true);
    setDetailError("");
    setDetailRows([]);
    try {
      const params = new URLSearchParams({
        start: startDate,
        end: endDate,
        radiologistUserId: String(row.radiologistUserId),
      });
      const res = await authenticatedFetch(
        `/api/reports/radiology/radiologist-interpretation/detail?${params.toString()}`,
        { cache: "no-store" },
      );
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        rows?: RadiologistInterpretationDetailRow[];
        radiologistName?: string;
      };
      if (!res.ok) {
        setDetailError(json.error ?? `Request failed (${res.status})`);
        return;
      }
      setDetailRows(Array.isArray(json.rows) ? json.rows : []);
      if (json.radiologistName) {
        setSelectedRad((prev) =>
          prev ? { ...prev, radiologistName: json.radiologistName ?? prev.radiologistName } : prev,
        );
      }
    } catch {
      setDetailError("Failed to load detail.");
    } finally {
      setDetailLoading(false);
    }
  };

  const exportSummary = () => {
    exportRowsToExcel({
      filename: `radiologist-interpretation-summary_${startDate}.xlsx`,
      sheetName: "Summary",
      columns: [
        { key: "radiologistName", header: "Radiologist" },
        { key: "interpretedCount", header: "Interpreted" },
        { key: "notDoneCount", header: "Not done" },
        { key: "totalAssigned", header: "Total" },
      ],
      rows: rows.map((r) => ({
        radiologistName: r.radiologistName,
        interpretedCount: r.interpretedCount,
        notDoneCount: r.notDoneCount,
        totalAssigned: r.totalAssigned,
      })),
    });
  };

  const exportDetail = () => {
    if (!selectedRad) return;
    exportRowsToExcel({
      filename: `radiologist-interpretation_${safeFilenamePart(selectedRad.radiologistName)}_${startDate}.xlsx`,
      sheetName: "Detail",
      columns: [
        { key: "patientName", header: "Patient" },
        { key: "study", header: "Study" },
        { key: "requestDate", header: "Request date" },
        { key: "readingStatus", header: "Reading status" },
        { key: "interpretedDate", header: "Interpreted date" },
      ],
      rows: detailRows.map((r) => ({
        patientName: r.patientName,
        study: studyLabel(r),
        requestDate: formatDateMMDDYYYY(r.requestDate),
        readingStatus: r.readingStatus,
        interpretedDate: r.interpretedAt ? formatDateMMDDYYYY(r.interpretedAt.slice(0, 10)) : "—",
      })),
    });
  };

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1200, mx: "auto" }}>
      <Typography variant="h5" fontWeight={700} sx={{ mb: 1 }}>
        Radiologist Interpretation
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Studies interpreted by each radiologist in the selected date range, with pending assignments by request date.
      </Typography>

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 2, alignItems: "flex-end" }}>
            <TextField
              label="From"
              type="date"
              size="small"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              label="To"
              type="date"
              size="small"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              InputLabelProps={{ shrink: true }}
            />
            <Button
              variant="outlined"
              startIcon={<RefreshOutlinedIcon />}
              onClick={() => void loadSummary()}
              disabled={loading}
              sx={{ textTransform: "none" }}
            >
              Refresh
            </Button>
            <Button
              variant="contained"
              color="secondary"
              startIcon={<FileDownloadOutlinedIcon />}
              onClick={exportSummary}
              disabled={loading || rows.length === 0}
              sx={{ textTransform: "none" }}
            >
              Export to Excel
            </Button>
          </Box>
        </CardContent>
      </Card>

      {error ? (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      ) : null}

      <Card>
        <CardContent sx={{ p: 0 }}>
          {loading ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
              <CircularProgress />
            </Box>
          ) : rows.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ p: 3 }}>
              No radiologist activity for {formatDateMMDDYYYY(startDate)}
              {startDate !== endDate ? ` – ${formatDateMMDDYYYY(endDate)}` : ""}.
            </Typography>
          ) : (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Radiologist</TableCell>
                    <TableCell align="right">Interpreted</TableCell>
                    <TableCell align="right">Not done</TableCell>
                    <TableCell align="right">Total</TableCell>
                    <TableCell align="right">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow
                      key={row.radiologistUserId}
                      hover
                      sx={{ cursor: "pointer" }}
                      onClick={() => void openDetail(row)}
                    >
                      <TableCell sx={{ fontWeight: 500 }}>{row.radiologistName}</TableCell>
                      <TableCell align="right">{row.interpretedCount}</TableCell>
                      <TableCell align="right">{row.notDoneCount}</TableCell>
                      <TableCell align="right">{row.totalAssigned}</TableCell>
                      <TableCell align="right">
                        <Button
                          size="small"
                          variant="outlined"
                          color="secondary"
                          sx={{ textTransform: "none" }}
                          onClick={(e) => {
                            e.stopPropagation();
                            void openDetail(row);
                          }}
                        >
                          View detail
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </CardContent>
      </Card>

      <Dialog open={detailOpen} onClose={() => setDetailOpen(false)} maxWidth="lg" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>
          {selectedRad?.radiologistName ?? "Radiologist"} — interpretation detail
        </DialogTitle>
        <DialogContent dividers>
          {detailError ? (
            <Alert severity="error" sx={{ mb: 2 }}>
              {detailError}
            </Alert>
          ) : null}
          {detailLoading ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
              <CircularProgress />
            </Box>
          ) : detailRows.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              No studies in this date range.
            </Typography>
          ) : (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Patient</TableCell>
                    <TableCell>Study</TableCell>
                    <TableCell>Request date</TableCell>
                    <TableCell>Reading status</TableCell>
                    <TableCell>Interpreted date</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {detailRows.map((row, idx) => (
                    <TableRow key={`${row.patientName}-${row.studyName}-${row.requestDate}-${idx}`}>
                      <TableCell>{row.patientName}</TableCell>
                      <TableCell>{studyLabel(row)}</TableCell>
                      <TableCell>{formatDateMMDDYYYY(row.requestDate)}</TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          label={row.readingStatus}
                          color={row.readingStatus === "Interpreted" ? "success" : "warning"}
                          variant="outlined"
                        />
                      </TableCell>
                      <TableCell>
                        {row.interpretedAt ? formatDateMMDDYYYY(row.interpretedAt.slice(0, 10)) : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button
            startIcon={<FileDownloadOutlinedIcon />}
            onClick={exportDetail}
            disabled={detailLoading || detailRows.length === 0}
            sx={{ textTransform: "none" }}
          >
            Export to Excel
          </Button>
          <Button onClick={() => setDetailOpen(false)} sx={{ textTransform: "none" }}>
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
