"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { LIFEHUB_LOGO_SRC } from "@/lib/lifehubLogo";
import { authenticatedFetch } from "@/lib/authenticatedFetch";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
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
  Tab,
  Tabs,
  alpha,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import CalendarMonthOutlinedIcon from "@mui/icons-material/CalendarMonthOutlined";
import RefreshIcon from "@mui/icons-material/Refresh";
import { FormFieldLabel } from "@/components/FormFieldLabel";
import { DatePickerField } from "@/components/DatePickerField";
import { commonFieldProps, fieldInputSx } from "@/components/fieldInputStyles";
import { supabase } from "@/lib/supabaseClient";
import { formatDateMMDDYYYY } from "@/lib/dateDisplay";
import {
  fetchCashierEncountersSearchPage,
  fetchEncounterSummaryByTransId,
  type CashierEncounterSearchRow,
  type ConsultationPatientListRow,
} from "@/lib/consultationData";
import type { ConsultationEncounterSummary } from "@/components/consultation/consultationTypes";
import { ConsultationSectionTitle } from "@/components/consultation/ConsultationSectionTitle";
import {
  consultBodyTypoSx,
  consultTableBodyCellSx,
  consultTableHeadCellSx,
  consultTableHeadRowSx,
  consultTableSx,
} from "@/components/consultation/consultListTableStyles";
import type { EncounterLabRequestSummary } from "@/lib/labRequests";
import {
  fetchCashierUnpaidPhysicianFeeEncounterCounts,
  fetchEncounterTransIdsWithPendingDiagnosticAmendments,
  fetchEncounterTransIdsWithUnpaidImagingRequests,
  fetchEncounterTransIdsWithUnpaidLabRequests,
  fetchLabRequestsWithoutLabSaleForEncounters,
  fetchStandaloneLabRequestsWithoutLabSaleForPatient,
} from "@/lib/cashierLabQueue";
import type { CashierLabQueueReprintStored } from "@/lib/receptionQueueReceiptPrint";
import {
  clearCashierLabQueueReprintOffer,
  openCashierQueueReceiptReprintByTicketId,
  peekCashierLabQueueReprintOffer,
} from "@/lib/receptionQueueReceiptPrint";

const APP_USERS_TABLE = "users";

const PAGE_SIZE_OPTIONS = [20, 50, 100] as const;

type UserIdNameRow = { user_id: string | number; fullname: string | null };

function encounterRowKey(r: CashierEncounterSearchRow): string {
  return r.encounter.id;
}

/** Full encounter `trans_id` (UUID) — same shape as `consultationData` `isUuid`. */
function isFullEncounterTransIdQuery(s: string): boolean {
  const t = s.trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(t);
}

const CASHIER_AUTONAV_SUPPRESS_KEY = "cashier_autonav_suppress";

async function tryNavigateFromScannedUuid(qRaw: string, router: ReturnType<typeof useRouter>): Promise<void> {
  const q = qRaw.trim();
  const ql = q.toLowerCase();
  const res = await authenticatedFetch(`/api/cashier/lab-request-exists?id=${encodeURIComponent(q)}`, { cache: "no-store" });
  if (!res.ok) return;
  const j = (await res.json().catch(() => ({}))) as { ok?: boolean };
  if (!j.ok) return;
  try {
    const suppress = sessionStorage.getItem(CASHIER_AUTONAV_SUPPRESS_KEY);
    if (suppress === ql) return;
    sessionStorage.setItem(CASHIER_AUTONAV_SUPPRESS_KEY, ql);
  } catch {
    /* still navigate */
  }
  router.push(`/cashier/lab-request/${encodeURIComponent(q)}`);
}

export default function CashierHome() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<number>(20);
  const [searchRows, setSearchRows] = useState<CashierEncounterSearchRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState("");

  const [selectedContext, setSelectedContext] = useState<{
    encounterId: string;
    patient: ConsultationPatientListRow;
  } | null>(null);
  const selectedPatient = selectedContext?.patient ?? null;
  const [encounters, setEncounters] = useState<ConsultationEncounterSummary[]>([]);
  const [encountersLoading, setEncountersLoading] = useState(false);
  const [encountersError, setEncountersError] = useState("");

  const [pendingByEncounterId, setPendingByEncounterId] = useState<Map<string, number>>(() => new Map());
  const [openLabRequestsByEncounter, setOpenLabRequestsByEncounter] = useState<
    Map<string, EncounterLabRequestSummary[]>
  >(() => new Map());
  const [amendmentDueByEncounterId, setAmendmentDueByEncounterId] = useState<Map<string, number>>(() => new Map());
  const [queueLoading, setQueueLoading] = useState(true);
  const [queueError, setQueueError] = useState("");

  const [cashierTab, setCashierTab] = useState(0);
  const [walkInRequests, setWalkInRequests] = useState<EncounterLabRequestSummary[]>([]);
  const [walkInLoading, setWalkInLoading] = useState(false);
  const [walkInError, setWalkInError] = useState("");

  const [labQueueReprintOffer, setLabQueueReprintOffer] = useState<CashierLabQueueReprintStored | null>(null);
  const [labQueueReprintBusy, setLabQueueReprintBusy] = useState(false);
  const [labQueueReprintErr, setLabQueueReprintErr] = useState("");

  const [encounterRangeAnchor, setEncounterRangeAnchor] = useState<HTMLElement | null>(null);
  const [encounterRangePreset, setEncounterRangePreset] = useState<
    "today" | "yesterday" | "last3" | "last7" | "last15" | "last30"
  >("last15");
  const [encounterFrom, setEncounterFrom] = useState("");
  const [encounterTo, setEncounterTo] = useState("");
  const [encounterChiefSearch, setEncounterChiefSearch] = useState("");
  const visitSearchInputRef = useRef<HTMLInputElement>(null);

  const [referringNameByUserId, setReferringNameByUserId] = useState<Map<string, string>>(() => new Map());

  const prevSearchRef = useRef(debouncedSearch);
  const prevSearchInputForAutonavRef = useRef<string | null>(null);

  const loadQueue = useCallback(async () => {
    setQueueError("");
    setQueueLoading(true);
    const res = await fetchCashierUnpaidPhysicianFeeEncounterCounts();
    if (res.error) {
      setQueueLoading(false);
      setQueueError(res.error);
      setPendingByEncounterId(new Map());
      setOpenLabRequestsByEncounter(new Map());
      setAmendmentDueByEncounterId(new Map());
      return;
    }
    setPendingByEncounterId(res.pendingByEncounterId);

    const [labEncRes, amendEncRes, imagingEncRes] = await Promise.all([
      fetchEncounterTransIdsWithUnpaidLabRequests(),
      fetchEncounterTransIdsWithPendingDiagnosticAmendments(),
      fetchEncounterTransIdsWithUnpaidImagingRequests(),
    ]);
    if (labEncRes.error) {
      setQueueLoading(false);
      setQueueError(labEncRes.error);
      setOpenLabRequestsByEncounter(new Map());
      setAmendmentDueByEncounterId(new Map());
      return;
    }
    if (amendEncRes.error) {
      setQueueLoading(false);
      setQueueError(amendEncRes.error);
      setOpenLabRequestsByEncounter(new Map());
      setAmendmentDueByEncounterId(new Map());
      return;
    }
    if (imagingEncRes.error) {
      setQueueLoading(false);
      setQueueError(imagingEncRes.error);
      setOpenLabRequestsByEncounter(new Map());
      setAmendmentDueByEncounterId(new Map());
      return;
    }

    setAmendmentDueByEncounterId(amendEncRes.amountDueByEncounterId);

    const encKeys = [
      ...new Set<string>([
        ...res.pendingByEncounterId.keys(),
        ...[...labEncRes.ids].map((k) => String(k).trim()).filter(Boolean),
        ...[...amendEncRes.ids].map((k) => String(k).trim()).filter(Boolean),
        ...[...imagingEncRes.ids].map((k) => String(k).trim()).filter(Boolean),
      ]),
    ];
    const labRes = await fetchLabRequestsWithoutLabSaleForEncounters(encKeys);
    setQueueLoading(false);
    if (labRes.error) {
      setQueueError(labRes.error);
      setOpenLabRequestsByEncounter(new Map());
      setAmendmentDueByEncounterId(new Map());
      return;
    }
    setOpenLabRequestsByEncounter(labRes.byEncounter);
  }, []);

  function formatMoneyShort(v: number): string {
    return v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  useEffect(() => {
    void loadQueue();
  }, [loadQueue]);

  useEffect(() => {
    setLabQueueReprintOffer(peekCashierLabQueueReprintOffer());
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => visitSearchInputRef.current?.focus(), 150);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    const t = searchParams.get("tab");
    setCashierTab(t === "walkin" ? 1 : 0);
  }, [searchParams]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      await Promise.resolve();
      if (cancelled) return;

      if (!selectedPatient) {
        setWalkInRequests([]);
        setWalkInError("");
        setWalkInLoading(false);
        return;
      }

      const pid = Number(selectedPatient.id);
      if (!Number.isFinite(pid)) {
        setWalkInRequests([]);
        setWalkInError("");
        setWalkInLoading(false);
        return;
      }

      setWalkInLoading(true);
      setWalkInError("");
      const res = await fetchStandaloneLabRequestsWithoutLabSaleForPatient(pid);
      if (cancelled) return;
      setWalkInLoading(false);
      if (res.error) {
        setWalkInError(res.error);
        setWalkInRequests([]);
        return;
      }
      setWalkInRequests(res.requests);
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedPatient]);

  const handleCashierTabChange = (_: React.SyntheticEvent, value: number) => {
    setCashierTab(value);
    router.replace(value === 1 ? "/cashier?tab=walkin" : "/cashier?tab=visit", { scroll: false });
  };

  useEffect(() => {
    let cancelled = false;
    const ids = new Set<number>();
    for (const r of searchRows) {
      const v = r.patient.referring_physician;
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
  }, [searchRows]);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(searchInput), 400);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    const prev = prevSearchInputForAutonavRef.current;
    if (prev !== null && prev !== searchInput) {
      try {
        sessionStorage.removeItem(CASHIER_AUTONAV_SUPPRESS_KEY);
      } catch {
        /* ignore */
      }
    }
    prevSearchInputForAutonavRef.current = searchInput;
  }, [searchInput]);

  useEffect(() => {
    if (listLoading || listError) return;
    const q = debouncedSearch.trim();
    if (!isFullEncounterTransIdQuery(q)) return;
    const ql = q.toLowerCase();
    const hit = searchRows.find((r) => r.encounter.id.toLowerCase() === ql);
    if (hit) {
      try {
        const suppress = sessionStorage.getItem(CASHIER_AUTONAV_SUPPRESS_KEY);
        if (suppress === ql) return;
        sessionStorage.setItem(CASHIER_AUTONAV_SUPPRESS_KEY, ql);
      } catch {
        /* still navigate */
      }
      router.push(`/cashier/${hit.encounter.id}`);
      return;
    }
    // Full encounter UUID: open visit checkout even when search index omits this visit.
    try {
      const suppress = sessionStorage.getItem(CASHIER_AUTONAV_SUPPRESS_KEY);
      if (suppress !== ql) {
        sessionStorage.setItem(CASHIER_AUTONAV_SUPPRESS_KEY, ql);
        router.push(`/cashier/${ql}`);
        return;
      }
    } catch {
      router.push(`/cashier/${ql}`);
      return;
    }
    void tryNavigateFromScannedUuid(q, router);
  }, [debouncedSearch, searchRows, listLoading, listError, router]);

  const loadEncounterSearch = useCallback(
    async (pageIndex: number) => {
      setListError("");
      if (!debouncedSearch.trim()) {
        setListLoading(false);
        setSearchRows([]);
        setTotalCount(0);
        return;
      }
      setListLoading(true);
      const res = await fetchCashierEncountersSearchPage(pageIndex, pageSize, debouncedSearch);
      setListLoading(false);
      if (res.error) {
        setListError(res.error);
        setSearchRows([]);
        setTotalCount(0);
        return;
      }
      setSearchRows(res.rows);
      setTotalCount(res.count);
    },
    [pageSize, debouncedSearch],
  );

  useEffect(() => {
    const searchChanged = prevSearchRef.current !== debouncedSearch;
    if (searchChanged) {
      prevSearchRef.current = debouncedSearch;
      setSelectedContext(null);
      if (page !== 0) {
        setPage(0);
        return;
      }
    }
    prevSearchRef.current = debouncedSearch;
    void loadEncounterSearch(page);
  }, [page, pageSize, debouncedSearch, loadEncounterSearch]);

  useEffect(() => {
    if (!selectedPatient || !selectedContext?.encounterId) {
      setEncounters([]);
      setEncountersError("");
      return;
    }
    let cancelled = false;
    const tid = selectedContext.encounterId;
    setEncountersLoading(true);
    setEncountersError("");
    void fetchEncounterSummaryByTransId(tid).then((res) => {
      if (cancelled) return;
      setEncountersLoading(false);
      if (res.error) {
        setEncountersError(res.error);
        setEncounters([]);
        return;
      }
      if (!res.encounter) {
        setEncounters([]);
        setEncountersError("");
        return;
      }
      const pid = Number(selectedPatient.id);
      if (Number.isFinite(pid) && Number(res.encounter.patientId) !== pid) {
        setEncounters([]);
        setEncountersError("Selected visit does not match this patient.");
        return;
      }
      setEncounters([res.encounter]);
    });
    return () => {
      cancelled = true;
    };
  }, [selectedPatient, selectedContext?.encounterId]);

  function isoToday(): string {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function isoAddDays(base: Date, days: number): string {
    const d = new Date(base);
    d.setDate(d.getDate() + days);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  const applyEncounterPreset = useCallback((preset: typeof encounterRangePreset) => {
    const now = new Date();
    const today = isoToday();
    if (preset === "today") {
      setEncounterFrom(today);
      setEncounterTo(today);
      return;
    }
    if (preset === "yesterday") {
      const y = isoAddDays(now, -1);
      setEncounterFrom(y);
      setEncounterTo(y);
      return;
    }
    const days =
      preset === "last3" ? 3 : preset === "last7" ? 7 : preset === "last15" ? 15 : 30;
    setEncounterFrom(isoAddDays(now, -(days - 1)));
    setEncounterTo(today);
  }, []);

  useEffect(() => {
    applyEncounterPreset(encounterRangePreset);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const unpaidFeeEncounters = useMemo(() => {
    return encounters;
  }, [encounters]);

  const filteredEncounters = useMemo(() => {
    if (selectedContext?.encounterId) return unpaidFeeEncounters;
    if (!encounterFrom || !encounterTo) return unpaidFeeEncounters;
    const from = encounterFrom;
    const to = encounterTo;
    return unpaidFeeEncounters.filter((e) => {
      const d = (e.date ?? "").slice(0, 10);
      return d >= from && d <= to;
    });
  }, [unpaidFeeEncounters, encounterFrom, encounterTo, selectedContext?.encounterId]);

  const visibleEncounters = useMemo(() => {
    if (selectedContext?.encounterId) return filteredEncounters;
    const q = encounterChiefSearch.trim().toLowerCase();
    if (!q) return filteredEncounters;
    return filteredEncounters.filter((e) => (e.chiefComplaint ?? "").toLowerCase().includes(q));
  }, [filteredEncounters, encounterChiefSearch, selectedContext?.encounterId]);

  const visibleOpenLabRows = useMemo(() => {
    const rows: Array<{ encounter: ConsultationEncounterSummary; lab: EncounterLabRequestSummary }> = [];
    for (const e of visibleEncounters) {
      const list = openLabRequestsByEncounter.get(e.id) ?? [];
      for (const lab of list) {
        rows.push({ encounter: e, lab });
      }
    }
    return rows;
  }, [visibleEncounters, openLabRequestsByEncounter]);

  function formatLabTime(value: string | null | undefined): string {
    if (value == null || String(value).trim() === "") return "—";
    const s = String(value);
    if (s.length >= 5 && s[4] === ":") return s.slice(0, 5);
    const m = s.match(/(\d{1,2}:\d{2})/);
    return m?.[1] ?? "—";
  }

  const rangeLabel = useMemo(() => {
    const label =
      encounterRangePreset === "today"
        ? "Today"
        : encounterRangePreset === "yesterday"
          ? "Yesterday"
          : encounterRangePreset === "last3"
            ? "Last 3 days"
            : encounterRangePreset === "last7"
              ? "Last 7 days"
              : encounterRangePreset === "last15"
                ? "Last 15 days"
                : "Last 30 days";
    return `${label} · ${formatDateMMDDYYYY(encounterFrom)} – ${formatDateMMDDYYYY(encounterTo)}`;
  }, [encounterFrom, encounterTo, encounterRangePreset]);

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

  const emptySearchMessage =
    debouncedSearch.trim() === ""
      ? "Type encounter id or patient name keywords to search visits."
      : "No visits match your search.";

  const dismissLabQueueReprintOffer = () => {
    clearCashierLabQueueReprintOffer();
    setLabQueueReprintOffer(null);
    setLabQueueReprintErr("");
  };

  const handleLabQueueReprint = async () => {
    if (!labQueueReprintOffer) return;
    setLabQueueReprintBusy(true);
    setLabQueueReprintErr("");
    const r = await openCashierQueueReceiptReprintByTicketId(labQueueReprintOffer.ticketId);
    setLabQueueReprintBusy(false);
    if (!r.ok) {
      setLabQueueReprintErr(r.error ?? "Could not reprint.");
      return;
    }
    dismissLabQueueReprintOffer();
  };

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
            Cashier
          </Typography>
        </Box>
        <Tooltip title="Reload visits that still need payment (consultation charges and lab orders).">
          <span>
            <Button
              variant="outlined"
              size="large"
              disabled={queueLoading}
              onClick={() => void loadQueue()}
              sx={{ textTransform: "none", ml: "auto" }}
              startIcon={queueLoading ? <CircularProgress size={18} /> : <RefreshIcon />}
            >
              {queueLoading ? "Refreshing…" : "Refresh queue"}
            </Button>
          </span>
        </Tooltip>
      </Box>

      {labQueueReprintOffer ? (
        <Alert severity="info" sx={{ mb: 2 }} onClose={dismissLabQueueReprintOffer}>
          <Typography variant="body2" sx={{ mb: 1 }}>
            Laboratory queue{" "}
            <Box component="span" fontWeight={800}>
              {labQueueReprintOffer.queueDisplay.trim() || "—"}
            </Box>{" "}
            — you can reprint the thermal laboratory queue slip (the visit already had a reception queue number, so the
            slip was not printed automatically).
          </Typography>
          {labQueueReprintErr ? (
            <Typography variant="caption" color="error" sx={{ display: "block", mb: 1 }}>
              {labQueueReprintErr}
            </Typography>
          ) : null}
          <Button
            variant="contained"
            color="info"
            size="small"
            disabled={labQueueReprintBusy}
            onClick={() => void handleLabQueueReprint()}
            sx={{ textTransform: "none" }}
            startIcon={labQueueReprintBusy ? <CircularProgress size={16} color="inherit" /> : null}
          >
            {labQueueReprintBusy ? "Printing…" : "Reprint laboratory queue slip"}
          </Button>
        </Alert>
      ) : null}

      {queueError ? (
        <Alert severity="warning" sx={{ mb: 2 }} onClose={() => setQueueError("")}>
          {queueError}
        </Alert>
      ) : null}

      <Card sx={{ mb: 3 }}>
        <CardContent sx={{ p: 3 }}>
          <ConsultationSectionTitle>Find visit</ConsultationSectionTitle>
          <Typography variant="body2" color="text.primary" sx={{ ...consultBodyTypoSx, mb: 2, display: "block" }}>
            Search by encounter id and patient name (keywords). Select a row to load that patient for visit checkout or
            walk-in laboratory orders below. Paste or scan a full UUID: if it matches a visit you will jump to that visit;
            if it matches a laboratory order id (from the reception slip QR) you will open payment for that order.
          </Typography>

          <Box
            component="form"
            autoComplete="off"
            onSubmit={(e) => e.preventDefault()}
            sx={{ mb: 2, maxWidth: 480 }}
          >
            <FormFieldLabel htmlFor="cashier-patient-search" variant="consultation">
              Search visits
            </FormFieldLabel>
            <TextField
              id="cashier-patient-search"
              name="cashier_visit_search"
              inputRef={visitSearchInputRef}
              hiddenLabel
              placeholder="Encounter ID, lab order QR code, or patient name…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              {...commonFieldProps}
              sx={[fieldInputSx, { "& .MuiInputBase-input": { textTransform: "none" } }]}
              slotProps={{
                htmlInput: { autoComplete: "off" },
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
          ) : searchRows.length === 0 ? (
            <Typography variant="body2" color="text.primary" sx={consultBodyTypoSx}>
              {emptySearchMessage}
            </Typography>
          ) : (
            <>
              <TableContainer>
                <Table size="small" sx={consultTableSx}>
                  <TableHead>
                    <TableRow sx={consultTableHeadRowSx}>
                      <TableCell sx={consultTableHeadCellSx}>Encounter ID</TableCell>
                      <TableCell sx={consultTableHeadCellSx}>Patient ID</TableCell>
                      <TableCell sx={consultTableHeadCellSx}>Patient name</TableCell>
                      <TableCell sx={consultTableHeadCellSx}>Visit date</TableCell>
                      <TableCell sx={consultTableHeadCellSx}>Time</TableCell>
                      <TableCell sx={consultTableHeadCellSx}>Queue</TableCell>
                      <TableCell sx={consultTableHeadCellSx}>Chief complaint</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {searchRows.map((row) => {
                      const e = row.encounter;
                      const p = row.patient;
                      const selected = selectedContext?.encounterId === e.id;
                      return (
                        <TableRow
                          key={encounterRowKey(row)}
                          hover
                          selected={!!selected}
                          onClick={() => setSelectedContext({ encounterId: e.id, patient: p })}
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
                          <TableCell
                            sx={{
                              ...consultTableBodyCellSx,
                              fontFamily: "monospace",
                              fontSize: "0.75rem",
                              wordBreak: "break-all",
                            }}
                          >
                            {e.id}
                          </TableCell>
                          <TableCell sx={{ ...consultTableBodyCellSx, textTransform: "uppercase" }}>{p.id}</TableCell>
                          <TableCell sx={{ ...consultTableBodyCellSx, textTransform: "uppercase" }}>{p.name}</TableCell>
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

      <Tabs value={cashierTab} onChange={handleCashierTabChange} sx={{ mb: 2 }}>
        <Tab label="Visit checkout" />
        <Tab label="Laboratory only (walk-in)" />
      </Tabs>

      {cashierTab === 0 ? (
        <Card>
          <CardContent sx={{ p: 3 }} role="tabpanel">
          <Box
            sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2, flexWrap: "wrap" }}
          >
            <ConsultationSectionTitle>Visits — payment due</ConsultationSectionTitle>
            {selectedPatient && !selectedContext?.encounterId ? (
              <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
                <Button
                  type="button"
                  variant="outlined"
                  size="small"
                  startIcon={<CalendarMonthOutlinedIcon />}
                  onClick={(e) => setEncounterRangeAnchor(e.currentTarget)}
                  sx={{ textTransform: "none" }}
                >
                  {rangeLabel}
                </Button>
              </Box>
            ) : null}
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
              Select a visit above. That visit loads here for consultation checkout (unpaid counts come from the
              queue).
            </Typography>
          )}

          <Popover
            open={Boolean(encounterRangeAnchor) && !selectedContext?.encounterId}
            anchorEl={encounterRangeAnchor}
            onClose={() => setEncounterRangeAnchor(null)}
            anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
            transformOrigin={{ vertical: "top", horizontal: "right" }}
            slotProps={{ paper: { sx: { p: 1.25, width: 320 } } }}
          >
            <List dense disablePadding sx={{ mb: 1 }}>
              {[
                { key: "today", label: "Today" },
                { key: "yesterday", label: "Yesterday" },
                { key: "last3", label: "Last 3 days" },
                { key: "last7", label: "Last 7 days" },
                { key: "last15", label: "Last 15 days" },
                { key: "last30", label: "Last 30 days" },
              ].map((p) => (
                <ListItemButton
                  key={p.key}
                  selected={encounterRangePreset === (p.key as typeof encounterRangePreset)}
                  onClick={() => {
                    const k = p.key as typeof encounterRangePreset;
                    setEncounterRangePreset(k);
                    applyEncounterPreset(k);
                    setEncounterRangeAnchor(null);
                  }}
                >
                  <ListItemText primary={p.label} />
                </ListItemButton>
              ))}
            </List>
            <Box sx={{ display: "flex", gap: 1 }}>
              <Box sx={{ flex: 1 }}>
                <DatePickerField
                  id="cashier-encounter-from"
                  label="From"
                  value={encounterFrom}
                  onChange={(e) => {
                    setEncounterRangePreset("last15");
                    setEncounterFrom(e.target.value);
                  }}
                />
              </Box>
              <Box sx={{ flex: 1 }}>
                <DatePickerField
                  id="cashier-encounter-to"
                  label="To"
                  value={encounterTo}
                  onChange={(e) => {
                    setEncounterRangePreset("last15");
                    setEncounterTo(e.target.value);
                  }}
                />
              </Box>
            </Box>
          </Popover>

          {selectedPatient && !selectedContext?.encounterId && filteredEncounters.length > 0 ? (
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

          {!selectedPatient ? null : encountersLoading || queueLoading ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
              <CircularProgress size={28} />
            </Box>
          ) : visibleEncounters.length === 0 ? (
            <Typography variant="body2" color="text.primary" sx={consultBodyTypoSx}>
              {selectedContext?.encounterId
                ? "Could not load the selected visit."
                : encounterChiefSearch.trim()
                  ? "No matching visits in this range."
                  : unpaidFeeEncounters.length === 0
                    ? "No visits with unpaid consultation charges for this patient, or the queue is empty."
                    : "No visits in this date range."}
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
                      Unpaid sales
                    </TableCell>
                    <TableCell align="right" sx={consultTableHeadCellSx}>
                      Lab orders due
                    </TableCell>
                    <TableCell align="right" sx={consultTableHeadCellSx}>
                      Amendment due
                    </TableCell>
                    <TableCell align="right" sx={consultTableHeadCellSx}>
                      Action
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {visibleEncounters.map((e) => (
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
                      <TableCell align="right" sx={{ ...consultTableBodyCellSx, textTransform: "uppercase" }}>
                        {pendingByEncounterId.get(e.id) ?? 0}
                      </TableCell>
                      <TableCell align="right" sx={{ ...consultTableBodyCellSx, textTransform: "uppercase" }}>
                        {openLabRequestsByEncounter.get(e.id)?.length ?? 0}
                      </TableCell>
                      <TableCell
                        align="right"
                        sx={{
                          ...consultTableBodyCellSx,
                          fontWeight: (amendmentDueByEncounterId.get(e.id.toLowerCase()) ?? 0) > 0 ? 700 : 400,
                          color: (amendmentDueByEncounterId.get(e.id.toLowerCase()) ?? 0) > 0 ? "warning.dark" : "text.primary",
                        }}
                      >
                        {formatMoneyShort(amendmentDueByEncounterId.get(e.id.toLowerCase()) ?? 0)}
                      </TableCell>
                      <TableCell align="right" sx={{ ...consultTableBodyCellSx, whiteSpace: "nowrap" }}>
                        <Button
                          component={Link}
                          href={`/cashier/${e.id}`}
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

          {selectedPatient && !encountersLoading && !queueLoading && visibleEncounters.length > 0 ? (
            <Box sx={{ mt: 3 }}>
              <ConsultationSectionTitle>Laboratory orders to be paid</ConsultationSectionTitle>
              {visibleOpenLabRows.length === 0 ? (
                <Typography variant="body2" color="text.primary" sx={consultBodyTypoSx}>
                  None for the visits listed above.
                </Typography>
              ) : (
                <TableContainer>
                  <Table size="small" sx={consultTableSx}>
                    <TableHead>
                      <TableRow sx={consultTableHeadRowSx}>
                        <TableCell sx={consultTableHeadCellSx}>Visit date</TableCell>
                        <TableCell sx={consultTableHeadCellSx}>Queue</TableCell>
                        <TableCell sx={consultTableHeadCellSx}>Order reference</TableCell>
                        <TableCell sx={consultTableHeadCellSx}>Request date</TableCell>
                        <TableCell sx={consultTableHeadCellSx}>Time</TableCell>
                        <TableCell sx={consultTableHeadCellSx}>Priority</TableCell>
                        <TableCell align="right" sx={consultTableHeadCellSx}>
                          Tests
                        </TableCell>
                        <TableCell sx={consultTableHeadCellSx}>Remarks</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {visibleOpenLabRows.map(({ encounter: enc, lab }) => (
                        <TableRow key={`${enc.id}-${lab.id}`}>
                          <TableCell sx={{ ...consultTableBodyCellSx, textTransform: "uppercase" }}>
                            {formatDateMMDDYYYY(enc.date)}
                          </TableCell>
                          <TableCell sx={{ ...consultTableBodyCellSx, textTransform: "uppercase" }}>
                            {enc.queueNo ?? "—"}
                          </TableCell>
                          <TableCell
                            sx={{
                              ...consultTableBodyCellSx,
                              fontFamily: "monospace",
                              fontSize: "0.8rem",
                              wordBreak: "break-all",
                            }}
                          >
                            {lab.id}
                          </TableCell>
                          <TableCell sx={{ ...consultTableBodyCellSx, textTransform: "uppercase" }}>
                            {formatDateMMDDYYYY(lab.request_date)}
                          </TableCell>
                          <TableCell sx={{ ...consultTableBodyCellSx, textTransform: "uppercase" }}>
                            {formatLabTime(lab.request_time)}
                          </TableCell>
                          <TableCell sx={{ ...consultTableBodyCellSx, textTransform: "uppercase" }}>
                            {lab.priority ?? "—"}
                          </TableCell>
                          <TableCell align="right" sx={consultTableBodyCellSx}>
                            {lab.labTestIds.length}
                          </TableCell>
                          <TableCell sx={consultTableBodyCellSx}>{lab.remarks?.trim() || "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </Box>
          ) : null}
        </CardContent>
      </Card>
      ) : (
        <Card>
          <CardContent sx={{ p: 3 }} id="cashier-panel-walkin" role="tabpanel">
            <ConsultationSectionTitle>Walk-in laboratory orders</ConsultationSectionTitle>
            <Typography variant="body2" color="text.primary" sx={{ ...consultBodyTypoSx, mb: 2, display: "block" }}>
              Orders with no linked visit, still waiting to be paid. Reception laboratory intake creates a visit — use{" "}
              <strong>Visit checkout</strong> after searching the patient, or scan the slip QR.
            </Typography>

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
                Select a visit above to load the patient and list their walk-in lab orders.
              </Typography>
            )}

            {walkInError ? (
              <Alert severity="error" sx={{ mb: 2 }} onClose={() => setWalkInError("")}>
                {walkInError}
              </Alert>
            ) : null}

            {!selectedPatient ? null : walkInLoading ? (
              <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
                <CircularProgress size={28} />
              </Box>
            ) : walkInRequests.length === 0 ? (
              <Typography variant="body2" color="text.primary" sx={consultBodyTypoSx}>
                No walk-in laboratory orders waiting for payment for this patient.
              </Typography>
            ) : (
              <TableContainer>
                <Table size="small" sx={consultTableSx}>
                  <TableHead>
                    <TableRow sx={consultTableHeadRowSx}>
                      <TableCell sx={consultTableHeadCellSx}>Request date</TableCell>
                      <TableCell sx={consultTableHeadCellSx}>Time</TableCell>
                      <TableCell sx={consultTableHeadCellSx}>Priority</TableCell>
                      <TableCell sx={consultTableHeadCellSx}>Order reference</TableCell>
                      <TableCell align="right" sx={consultTableHeadCellSx}>
                        Tests
                      </TableCell>
                      <TableCell sx={consultTableHeadCellSx}>Remarks</TableCell>
                      <TableCell align="right" sx={consultTableHeadCellSx}>
                        Action
                      </TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {walkInRequests.map((lab) => (
                      <TableRow key={lab.id}>
                        <TableCell sx={{ ...consultTableBodyCellSx, textTransform: "uppercase" }}>
                          {formatDateMMDDYYYY(lab.request_date)}
                        </TableCell>
                        <TableCell sx={{ ...consultTableBodyCellSx, textTransform: "uppercase" }}>
                          {formatLabTime(lab.request_time)}
                        </TableCell>
                        <TableCell sx={{ ...consultTableBodyCellSx, textTransform: "uppercase" }}>
                          {lab.priority ?? "—"}
                        </TableCell>
                        <TableCell
                          sx={{
                            ...consultTableBodyCellSx,
                            fontFamily: "monospace",
                            fontSize: "0.8rem",
                            wordBreak: "break-all",
                          }}
                        >
                          {lab.id}
                        </TableCell>
                        <TableCell align="right" sx={consultTableBodyCellSx}>
                          {lab.labTestIds.length}
                        </TableCell>
                        <TableCell sx={consultTableBodyCellSx}>{lab.remarks?.trim() || "—"}</TableCell>
                        <TableCell align="right" sx={{ ...consultTableBodyCellSx, whiteSpace: "nowrap" }}>
                          <Button
                            component={Link}
                            href={`/cashier/lab-request/${lab.id}`}
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
      )}
    </>
  );
}
