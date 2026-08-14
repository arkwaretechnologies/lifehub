"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { LIFEHUB_LOGO_SRC } from "@/lib/lifehubLogo";
import { clinicAddDays, clinicDateYmd } from "@/lib/queueTicketDate";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Box,
  Card,
  CardContent,
  TextField,
  InputAdornment,
  Popover,
  List,
  ListItemButton,
  ListItemText,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  Typography,
  Alert,
  CircularProgress,
  Button,
  Tooltip,
  alpha,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import CalendarMonthOutlinedIcon from "@mui/icons-material/CalendarMonthOutlined";
import { FormFieldLabel } from "@/components/FormFieldLabel";
import { DatePickerField } from "@/components/DatePickerField";
import { commonFieldProps, fieldInputSx } from "@/components/fieldInputStyles";
import { supabase } from "@/lib/supabaseClient";
import { formatDateMMDDYYYY } from "@/lib/dateDisplay";
import {
  createEncounterForPatient,
  fetchConsultationPatientsPage,
  fetchEncountersForPatient,
  type ConsultationPatientListRow,
} from "@/lib/consultationData";
import { seedNewConsultationFromPreviousVisit } from "@/lib/consultationEncounterSeed";
import type { ConsultationEncounterSummary } from "./consultationTypes";
import { ConsultationSectionTitle } from "@/components/consultation/ConsultationSectionTitle";
import {
  consultBodyTypoSx,
  consultTableBodyCellSx,
  consultTableHeadCellSx,
  consultTableHeadRowSx,
  consultTableSx,
} from "@/components/consultation/consultListTableStyles";

const APP_USERS_TABLE = "users";

const PAGE_SIZE_OPTIONS = [20, 50, 100] as const;

type UserIdNameRow = { user_id: string | number; fullname: string | null };

type EncounterRangePreset =
  | "today"
  | "yesterday"
  | "last3"
  | "last7"
  | "last15"
  | "last30"
  | "custom"
  | "all";

function patientKey(p: ConsultationPatientListRow): string {
  return String(p.id);
}

/** Inclusive calendar-day span for `YYYY-MM-DD` From/To (null if invalid or To < From). */
function inclusiveEncounterRangeDays(fromYmd: string, toYmd: string): number | null {
  const from = (fromYmd ?? "").trim().slice(0, 10);
  const to = (toYmd ?? "").trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return null;
  const fromMs = Date.parse(`${from}T00:00:00`);
  const toMs = Date.parse(`${to}T00:00:00`);
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs < fromMs) return null;
  return Math.floor((toMs - fromMs) / 86_400_000) + 1;
}

function formatEncounterRangeDaysLabel(days: number | null): string {
  if (days == null) return "Invalid range";
  return days === 1 ? "1 day" : `${days} days`;
}

export default function ConsultationHome() {
  const router = useRouter();
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<number>(20);
  const [patients, setPatients] = useState<ConsultationPatientListRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState("");

  const [selectedPatient, setSelectedPatient] = useState<ConsultationPatientListRow | null>(null);
  const [encounters, setEncounters] = useState<ConsultationEncounterSummary[]>([]);
  const [encountersLoading, setEncountersLoading] = useState(false);
  const [encountersError, setEncountersError] = useState("");
  const [creatingEncounter, setCreatingEncounter] = useState(false);
  const [createEncounterError, setCreateEncounterError] = useState("");

  const [encounterRangeAnchor, setEncounterRangeAnchor] = useState<HTMLElement | null>(null);
  const [encounterRangePreset, setEncounterRangePreset] = useState<EncounterRangePreset>("last15");
  const [encounterFrom, setEncounterFrom] = useState("");
  const [encounterTo, setEncounterTo] = useState("");
  const [encounterChiefSearch, setEncounterChiefSearch] = useState("");
  const [encounterPage, setEncounterPage] = useState(0);
  const [encounterPageSize, setEncounterPageSize] = useState<number>(20);

  /** `user_id` → display name for numeric `patients.referring_physician` FKs (any role). */
  const [referringNameByUserId, setReferringNameByUserId] = useState<Map<string, string>>(() => new Map());

  const prevSearchRef = useRef(debouncedSearch);

  useEffect(() => {
    let cancelled = false;
    const ids = new Set<number>();
    for (const p of patients) {
      const v = p.referring_physician;
      if (v == null) continue;
      const s = String(v).trim();
      if (/^\d+$/.test(s)) {
        const n = Number.parseInt(s, 10);
        if (Number.isFinite(n)) ids.add(n);
      }
    }
    if (ids.size === 0) {
      setReferringNameByUserId(new Map());
      return;
    }
    void (async () => {
      const { data, error } = await supabase
        .from(APP_USERS_TABLE)
        .select("user_id, fullname")
        .in("user_id", [...ids]);
      if (cancelled) return;
      const m = new Map<string, string>();
      if (!error && data) {
        for (const row of data as UserIdNameRow[]) {
          if (row.user_id === null || row.user_id === undefined) continue;
          const name = (row.fullname ?? "").trim().toUpperCase();
          m.set(String(row.user_id), name || `USER ${row.user_id}`);
        }
      }
      setReferringNameByUserId(m);
    })();
    return () => {
      cancelled = true;
    };
  }, [patients]);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(searchInput), 400);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  const loadPatients = useCallback(
    async (pageIndex: number) => {
      setListError("");
      setListLoading(true);
      const res = await fetchConsultationPatientsPage(pageIndex, pageSize, debouncedSearch);
      setListLoading(false);
      if (res.error) {
        setListError(res.error);
        setPatients([]);
        setTotalCount(0);
        return;
      }
      setPatients(res.rows);
      setTotalCount(res.count);
    },
    [pageSize, debouncedSearch]
  );

  useEffect(() => {
    const searchChanged = prevSearchRef.current !== debouncedSearch;
    if (searchChanged) {
      prevSearchRef.current = debouncedSearch;
      setSelectedPatient(null);
      if (page !== 0) {
        setPage(0);
        return;
      }
    }
    prevSearchRef.current = debouncedSearch;
    void loadPatients(page);
  }, [page, pageSize, debouncedSearch, loadPatients]);

  useEffect(() => {
    if (!selectedPatient) {
      setEncounters([]);
      setEncountersError("");
      return;
    }
    let cancelled = false;
    const pid = Number(selectedPatient.id);
    if (!Number.isFinite(pid)) {
      setEncounters([]);
      return;
    }
    setEncountersLoading(true);
    setEncountersError("");
    void fetchEncountersForPatient(pid).then((res) => {
      if (cancelled) return;
      setEncountersLoading(false);
      if (res.error) {
        setEncountersError(res.error);
        setEncounters([]);
        return;
      }
      setEncounters(res.encounters);
    });
    return () => {
      cancelled = true;
    };
  }, [selectedPatient]);

  const applyEncounterPreset = useCallback((preset: EncounterRangePreset) => {
    if (preset === "custom") return;
    if (preset === "all") {
      setEncounterFrom("");
      setEncounterTo("");
      return;
    }
    const now = new Date();
    const today = clinicDateYmd(now);
    if (preset === "today") {
      setEncounterFrom(today);
      setEncounterTo(today);
      return;
    }
    if (preset === "yesterday") {
      const y = clinicAddDays(-1, now);
      setEncounterFrom(y);
      setEncounterTo(y);
      return;
    }
    const days =
      preset === "last3" ? 3 : preset === "last7" ? 7 : preset === "last15" ? 15 : 30;
    // Start Date = Today - (Total Days - 1); To = today (included).
    setEncounterFrom(clinicAddDays(-(days - 1), now));
    setEncounterTo(today);
  }, []);

  useEffect(() => {
    // Initialize default preset range.
    applyEncounterPreset(encounterRangePreset);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredEncounters = useMemo(() => {
    if (encounterRangePreset === "all" || !encounterFrom || !encounterTo) return encounters;
    const from = encounterFrom;
    const to = encounterTo;
    return encounters.filter((e) => {
      const d = (e.date ?? "").slice(0, 10);
      return d >= from && d <= to;
    });
  }, [encounters, encounterFrom, encounterTo, encounterRangePreset]);

  const visibleEncounters = useMemo(() => {
    const q = encounterChiefSearch.trim().toLowerCase();
    if (!q) return filteredEncounters;
    return filteredEncounters.filter((e) => (e.chiefComplaint ?? "").toLowerCase().includes(q));
  }, [filteredEncounters, encounterChiefSearch]);

  const pagedEncounters = useMemo(() => {
    const start = encounterPage * encounterPageSize;
    return visibleEncounters.slice(start, start + encounterPageSize);
  }, [visibleEncounters, encounterPage, encounterPageSize]);

  useEffect(() => {
    setEncounterPage(0);
  }, [selectedPatient, encounterRangePreset, encounterFrom, encounterTo, encounterChiefSearch, encounterPageSize]);

  const encounterRangeDays = useMemo(
    () =>
      encounterRangePreset === "all" ? null : inclusiveEncounterRangeDays(encounterFrom, encounterTo),
    [encounterFrom, encounterTo, encounterRangePreset],
  );

  const rangeLabel = useMemo(() => {
    if (encounterRangePreset === "all") return "All records";
    const dates = `${formatDateMMDDYYYY(encounterFrom)} – ${formatDateMMDDYYYY(encounterTo)}`;
    if (encounterRangePreset === "today") return `Today · ${dates}`;
    if (encounterRangePreset === "yesterday") return `Yesterday · ${dates}`;
    // Always derive "Last N days" from the actual From/To span (no duplicate count).
    const n = encounterRangeDays;
    if (n == null) return `Invalid range · ${dates}`;
    const lastLabel = n === 1 ? "Last 1 day" : `Last ${n} days`;
    return `${lastLabel} · ${dates}`;
  }, [encounterFrom, encounterTo, encounterRangePreset, encounterRangeDays]);

  useEffect(() => {
    setCreateEncounterError("");
  }, [selectedPatient]);

  async function handleNewConsultation() {
    if (!selectedPatient) return;
    const pid = Number(selectedPatient.id);
    if (!Number.isFinite(pid)) return;
    setCreateEncounterError("");
    setCreatingEncounter(true);
    const res = await createEncounterForPatient(pid);
    if (res.error || !res.transId) {
      setCreatingEncounter(false);
      setCreateEncounterError(res.error ?? "Could not create encounter.");
      return;
    }
    const seed = await seedNewConsultationFromPreviousVisit(res.transId);
    setCreatingEncounter(false);
    const seedQuery = seed.error ? "&seedFailed=1" : "";
    router.push(`/consultation/${res.transId}?new=1${seedQuery}`);
  }

  function formatReferringPhysicianCell(value: string | number | null): string {
    if (value === null || value === undefined || String(value).trim() === "") return "";
    const s = String(value).trim();
    if (/^\d+$/.test(s)) {
      return referringNameByUserId.get(s) ?? `USER ID ${s}`;
    }
    return s.toUpperCase();
  }

  const handlePageChange = (_: unknown, newPage: number) => {
    setPage(newPage);
  };

  const handleRowsPerPageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPageSize(Number.parseInt(e.target.value, 10));
    setPage(0);
  };

  const handleEncounterPageChange = (_: unknown, newPage: number) => {
    setEncounterPage(newPage);
  };

  const handleEncounterRowsPerPageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEncounterPageSize(Number.parseInt(e.target.value, 10));
    setEncounterPage(0);
  };

  const emptyPatientMessage =
    debouncedSearch.trim() !== "" ? "No patients match your search." : "No patients yet.";

  return (
    <>
      <Box
        sx={{
          mb: 3,
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 2,
          width: "100%",
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Box
            sx={{
              width: 40,
              height: 40,
              borderRadius: "12px",
              overflow: "hidden",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Image
              src={LIFEHUB_LOGO_SRC}
              alt="LifeHub logo"
              width={40}
              height={40}
              style={{ width: "100%", height: "100%", objectFit: "contain" }}
              priority
            />
          </Box>
          <Typography
            variant="subtitle1"
            fontWeight={800}
            letterSpacing="0.08em"
            color="info.main"
            sx={{ textTransform: "uppercase" }}
          >
            Consultation
          </Typography>
        </Box>
        <Tooltip
          title={
            selectedPatient
              ? "Create a new encounter for the selected patient and open the consultation form."
              : "Select a patient from the table first."
          }
          placement="left"
        >
          <span>
            <Button
              variant="contained"
              size="large"
              disabled={!selectedPatient || creatingEncounter}
              onClick={() => void handleNewConsultation()}
              sx={{ textTransform: "none", ml: "auto" }}
              startIcon={
                creatingEncounter ? <CircularProgress size={18} color="inherit" /> : undefined
              }
            >
              {creatingEncounter ? "Starting…" : "New Consultation"}
            </Button>
          </span>
        </Tooltip>
      </Box>

      {createEncounterError ? (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setCreateEncounterError("")}>
          {createEncounterError}
        </Alert>
      ) : null}

      <Card sx={{ mb: 3 }}>
        <CardContent sx={{ p: 3 }}>
          <ConsultationSectionTitle>Patient Records</ConsultationSectionTitle>
          <Typography variant="body2" color="text.primary" sx={{ ...consultBodyTypoSx, mb: 2, display: "block" }}>
            Search and select a patient to load their encounters.
          </Typography>

          <Box sx={{ mb: 2, maxWidth: 480 }}>
            <FormFieldLabel htmlFor="consultation-patient-search" variant="consultation">
              Search patients
            </FormFieldLabel>
            <TextField
              id="consultation-patient-search"
              hiddenLabel
              placeholder="Name, Contact, Email, Address, ID…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value.toUpperCase())}
              {...commonFieldProps}
              sx={fieldInputSx}
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
          </Box>

          {listError ? (
            <Alert severity="error" sx={{ mb: 2 }}>
              {listError}
            </Alert>
          ) : null}

          {listLoading ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
              <CircularProgress />
            </Box>
          ) : patients.length === 0 ? (
            <Typography variant="body2" color="text.primary" sx={consultBodyTypoSx}>
              {emptyPatientMessage}
            </Typography>
          ) : (
            <>
              <TableContainer>
                <Table size="small" sx={consultTableSx}>
                  <TableHead>
                    <TableRow sx={consultTableHeadRowSx}>
                      <TableCell sx={consultTableHeadCellSx}>ID</TableCell>
                      <TableCell sx={consultTableHeadCellSx}>Name</TableCell>
                      <TableCell sx={consultTableHeadCellSx}>Sex</TableCell>
                      <TableCell sx={consultTableHeadCellSx}>DOB</TableCell>
                      <TableCell sx={consultTableHeadCellSx}>Civil status</TableCell>
                      <TableCell sx={consultTableHeadCellSx}>Contact</TableCell>
                      <TableCell sx={consultTableHeadCellSx}>Email</TableCell>
                      <TableCell sx={consultTableHeadCellSx}>Referring physician</TableCell>
                      <TableCell sx={consultTableHeadCellSx}>PhilHealth</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {patients.map((p) => {
                      const selected = selectedPatient && patientKey(selectedPatient) === patientKey(p);
                      return (
                        <TableRow
                          key={patientKey(p)}
                          hover
                          selected={!!selected}
                          onClick={() => setSelectedPatient(p)}
                          sx={{
                            cursor: "pointer",
                            "&.Mui-selected": {
                              bgcolor: (theme) => alpha(theme.palette.info.main, 0.1),
                            },
                            "&.Mui-selected:hover": {
                              bgcolor: (theme) => alpha(theme.palette.info.main, 0.14),
                            },
                          }}
                        >
                          <TableCell sx={{ ...consultTableBodyCellSx, textTransform: "uppercase" }}>{p.id}</TableCell>
                          <TableCell sx={{ ...consultTableBodyCellSx, textTransform: "uppercase" }}>{p.name}</TableCell>
                          <TableCell sx={{ ...consultTableBodyCellSx, textTransform: "uppercase" }}>{p.sex}</TableCell>
                          <TableCell sx={{ ...consultTableBodyCellSx, textTransform: "uppercase" }}>
                            {formatDateMMDDYYYY(p.date_of_birth)}
                          </TableCell>
                          <TableCell sx={{ ...consultTableBodyCellSx, textTransform: "uppercase" }}>
                            {p.civil_status}
                          </TableCell>
                          <TableCell sx={{ ...consultTableBodyCellSx, textTransform: "uppercase" }}>
                            {p.contact_no}
                          </TableCell>
                          <TableCell sx={{ ...consultTableBodyCellSx, textTransform: "lowercase" }}>
                            {p.email_address}
                          </TableCell>
                          <TableCell sx={{ ...consultTableBodyCellSx, textTransform: "uppercase" }}>
                            {formatReferringPhysicianCell(p.referring_physician)}
                          </TableCell>
                          <TableCell sx={{ ...consultTableBodyCellSx, textTransform: "uppercase" }}>
                            {p.philhealth_no ?? ""}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
              <TablePagination
                component="div"
                count={totalCount}
                page={page}
                onPageChange={handlePageChange}
                rowsPerPage={pageSize}
                rowsPerPageOptions={[...PAGE_SIZE_OPTIONS]}
                onRowsPerPageChange={handleRowsPerPageChange}
                labelRowsPerPage="Rows per page"
                sx={{
                  "& .MuiTablePagination-toolbar": {
                    textTransform: "none",
                    ...consultBodyTypoSx,
                    color: "text.primary",
                  },
                  "& .MuiTablePagination-select": { textTransform: "none" },
                  "& .MuiTablePagination-selectLabel, & .MuiTablePagination-displayedRows": {
                    ...consultBodyTypoSx,
                    color: "text.primary",
                  },
                }}
              />
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent sx={{ p: 3 }}>
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2, flexWrap: "wrap" }}>
            <ConsultationSectionTitle>Encounters</ConsultationSectionTitle>
            <Button
              type="button"
              variant="outlined"
              size="small"
              startIcon={<CalendarMonthOutlinedIcon />}
              disabled={!selectedPatient}
              onClick={(e) => setEncounterRangeAnchor(e.currentTarget)}
              sx={{ textTransform: "none" }}
            >
              {rangeLabel}
            </Button>
          </Box>
          {selectedPatient ? (
            <Typography
              variant="body2"
              color="text.primary"
              sx={{ ...consultBodyTypoSx, mb: 2, display: "block", textTransform: "capitalize" }}
            >
              {selectedPatient.name?.toLowerCase() ?? "Patient"} · ID {selectedPatient.id}
            </Typography>
          ) : (
            <Typography variant="body2" color="text.primary" sx={{ ...consultBodyTypoSx, mb: 2, display: "block" }}>
              Select a patient above to view encounter history.
            </Typography>
          )}

          <Popover
            open={Boolean(encounterRangeAnchor)}
            anchorEl={encounterRangeAnchor}
            onClose={() => setEncounterRangeAnchor(null)}
            anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
            transformOrigin={{ vertical: "top", horizontal: "right" }}
            slotProps={{ paper: { sx: { p: 1.25, width: 320 } } }}
          >
            <List dense disablePadding sx={{ mb: 1 }}>
              {[
                { key: "all" as const, label: "All Records" },
                { key: "today" as const, label: "Today" },
                { key: "yesterday" as const, label: "Yesterday" },
                { key: "last3" as const, label: "Last 3 days" },
                { key: "last7" as const, label: "Last 7 days" },
                { key: "last15" as const, label: "Last 15 days" },
                { key: "last30" as const, label: "Last 30 days" },
              ].map((p) => (
                <ListItemButton
                  key={p.key}
                  selected={encounterRangePreset === p.key}
                  onClick={() => {
                    setEncounterRangePreset(p.key);
                    applyEncounterPreset(p.key);
                    setEncounterRangeAnchor(null);
                  }}
                >
                  <ListItemText primary={p.label} />
                </ListItemButton>
              ))}
            </List>
            {encounterRangePreset === "all" ? (
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ display: "block", mt: 0.5, px: 0.25, fontWeight: 600 }}
              >
                All records
              </Typography>
            ) : (
              <>
                <Box sx={{ display: "flex", gap: 1 }}>
                  <Box sx={{ flex: 1 }}>
                    <DatePickerField
                      id="consultation-encounter-from"
                      label="From"
                      value={encounterFrom}
                      onChange={(e) => {
                        setEncounterRangePreset("custom");
                        setEncounterFrom(e.target.value);
                      }}
                    />
                  </Box>
                  <Box sx={{ flex: 1 }}>
                    <DatePickerField
                      id="consultation-encounter-to"
                      label="To"
                      value={encounterTo}
                      onChange={(e) => {
                        setEncounterRangePreset("custom");
                        setEncounterTo(e.target.value);
                      }}
                    />
                  </Box>
                </Box>
                <Typography
                  variant="caption"
                  color={encounterRangeDays == null ? "error" : "text.secondary"}
                  sx={{ display: "block", mt: 1, px: 0.25, fontWeight: 600 }}
                >
                  {formatEncounterRangeDaysLabel(encounterRangeDays)}
                  {encounterRangeDays != null
                    ? ` (${formatDateMMDDYYYY(encounterFrom)} – ${formatDateMMDDYYYY(encounterTo)})`
                    : ""}
                </Typography>
              </>
            )}
          </Popover>

          {selectedPatient && filteredEncounters.length > 0 ? (
            <Box sx={{ mb: 2, maxWidth: 520 }}>
              <TextField
                size="small"
                fullWidth
                label="Search chief complaint"
                placeholder="Type to filter…"
                value={encounterChiefSearch}
                onChange={(e) => setEncounterChiefSearch(e.target.value)}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon fontSize="small" />
                    </InputAdornment>
                  ),
                }}
                sx={{
                  "& .MuiOutlinedInput-root": {
                    minHeight: 44,
                    alignItems: "center",
                    bgcolor: "background.paper",
                  },
                  "& .MuiOutlinedInput-input": {
                    py: 1.125,
                    lineHeight: 1.5,
                    height: "auto",
                  },
                  "& .MuiInputLabel-root": {
                    lineHeight: 1.3,
                  },
                }}
              />
            </Box>
          ) : null}

          {encountersError ? (
            <Alert severity="error" sx={{ mb: 2 }}>
              {encountersError}
            </Alert>
          ) : null}

          {!selectedPatient ? null : encountersLoading ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
              <CircularProgress size={28} />
            </Box>
          ) : visibleEncounters.length === 0 ? (
            <Typography variant="body2" color="text.primary" sx={consultBodyTypoSx}>
              {encounterChiefSearch.trim()
                ? "No encounters match this chief complaint."
                : encounterRangePreset === "all"
                  ? "No encounters for this patient."
                  : "No encounters in this date range."}
            </Typography>
          ) : (
            <>
              <TableContainer>
                <Table size="small" sx={consultTableSx}>
                  <TableHead>
                    <TableRow sx={consultTableHeadRowSx}>
                      <TableCell sx={consultTableHeadCellSx}>Date</TableCell>
                      <TableCell sx={consultTableHeadCellSx}>Time</TableCell>
                      <TableCell sx={consultTableHeadCellSx}>Queue</TableCell>
                      <TableCell sx={consultTableHeadCellSx}>Chief complaint</TableCell>
                      <TableCell align="right" sx={consultTableHeadCellSx}>
                        Action
                      </TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {pagedEncounters.map((e) => (
                      <TableRow key={e.id}>
                        <TableCell sx={{ ...consultTableBodyCellSx, textTransform: "uppercase" }}>
                          {formatDateMMDDYYYY(e.date)}
                        </TableCell>
                        <TableCell sx={{ ...consultTableBodyCellSx, textTransform: "uppercase" }}>
                          {e.time || "—"}
                        </TableCell>
                        <TableCell sx={{ ...consultTableBodyCellSx, textTransform: "uppercase" }}>
                          {e.queueNo ?? "—"}
                        </TableCell>
                        <TableCell sx={{ ...consultTableBodyCellSx, textTransform: "uppercase" }}>
                          {e.chiefComplaint ?? "—"}
                        </TableCell>
                        <TableCell align="right" sx={{ ...consultTableBodyCellSx, whiteSpace: "nowrap" }}>
                          <Button
                            component={Link}
                            href={`/consultation/${e.id}`}
                            variant="contained"
                            color="secondary"
                            size="small"
                            sx={{ textTransform: "uppercase" }}
                          >
                            Open
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
              <TablePagination
                component="div"
                count={visibleEncounters.length}
                page={encounterPage}
                onPageChange={handleEncounterPageChange}
                rowsPerPage={encounterPageSize}
                rowsPerPageOptions={[...PAGE_SIZE_OPTIONS]}
                onRowsPerPageChange={handleEncounterRowsPerPageChange}
                labelRowsPerPage="Rows per page"
                sx={{
                  "& .MuiTablePagination-toolbar": {
                    textTransform: "none",
                    ...consultBodyTypoSx,
                    color: "text.primary",
                  },
                  "& .MuiTablePagination-select": { textTransform: "none" },
                  "& .MuiTablePagination-selectLabel, & .MuiTablePagination-displayedRows": {
                    ...consultBodyTypoSx,
                    color: "text.primary",
                  },
                }}
              />
            </>
          )}
        </CardContent>
      </Card>
    </>
  );
}
