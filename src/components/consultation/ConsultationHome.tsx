"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Box,
  Card,
  CardContent,
  TextField,
  InputAdornment,
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
import { FormFieldLabel } from "@/components/FormFieldLabel";
import { commonFieldProps, fieldInputSx } from "@/components/fieldInputStyles";
import { supabase } from "@/lib/supabaseClient";
import {
  createEncounterForPatient,
  fetchConsultationPatientsPage,
  fetchEncountersForPatient,
  type ConsultationPatientListRow,
} from "@/lib/consultationData";
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

function formatDateDisplay(iso: string | null): string {
  if (!iso) return "";
  return iso.length >= 10 ? iso.slice(0, 10) : iso;
}

function patientKey(p: ConsultationPatientListRow): string {
  return String(p.id);
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
    setCreatingEncounter(false);
    if (res.error || !res.transId) {
      setCreateEncounterError(res.error ?? "Could not create encounter.");
      return;
    }
    router.push(`/consultation/${res.transId}`);
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
              src="/lifehub-logo.png"
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
              sx={{ textTransform: "uppercase", ml: "auto" }}
              startIcon={
                creatingEncounter ? <CircularProgress size={18} color="inherit" /> : undefined
              }
            >
              {creatingEncounter ? "Starting…" : "New consultation"}
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
          <ConsultationSectionTitle>Patient records</ConsultationSectionTitle>
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
              placeholder="NAME, CONTACT, EMAIL, ADDRESS, ID…"
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
                            {formatDateDisplay(p.date_of_birth)}
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
                    textTransform: "uppercase",
                    ...consultBodyTypoSx,
                    color: "text.primary",
                  },
                  "& .MuiTablePagination-select": { textTransform: "uppercase" },
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
          <ConsultationSectionTitle>Encounters</ConsultationSectionTitle>
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

          {encountersError ? (
            <Alert severity="error" sx={{ mb: 2 }}>
              {encountersError}
            </Alert>
          ) : null}

          {!selectedPatient ? null : encountersLoading ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
              <CircularProgress size={28} />
            </Box>
          ) : encounters.length === 0 ? (
            <Typography variant="body2" color="text.primary" sx={consultBodyTypoSx}>
              No encounters for this patient.
            </Typography>
          ) : (
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
                  {encounters.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell sx={{ ...consultTableBodyCellSx, textTransform: "uppercase" }}>{e.date}</TableCell>
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
          )}
        </CardContent>
      </Card>
    </>
  );
}
