"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  FormControlLabel,
  FormLabel,
  Grid,
  IconButton,
  InputBase,
  ListItemButton,
  Paper,
  Popper,
  Radio,
  RadioGroup,
  Stack,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
  alpha,
  useTheme,
} from "@mui/material";
import Link from "next/link";
import CampaignOutlinedIcon from "@mui/icons-material/CampaignOutlined";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import MeetingRoomOutlinedIcon from "@mui/icons-material/MeetingRoomOutlined";
import PlayCircleOutlineIcon from "@mui/icons-material/PlayCircleOutline";
import ReplayIcon from "@mui/icons-material/Replay";
import RefreshIcon from "@mui/icons-material/Refresh";
import SearchIcon from "@mui/icons-material/Search";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import {
  completeEntranceAfterLabIntakeFromApi,
  createPatientFromApi,
  fetchReceptionQueueStateFromApi,
  fetchReceptionQueueTicketsFromApi,
  getEntranceCounterCode,
  parseReceptionRouteFromNotes,
  patchReceptionQueueTicket,
  prepareReceptionLabCheckinFromApi,
  recallQueueTicketAnnounce,
  searchPatientsFromApi,
  subscribeQueueTickets,
  type QueueCounterRow,
  type QueuePriorityRow,
  type ReceptionPatientSearchRow,
  type QueueTicketRow,
  type QueueTicketStatus,
  type ReceptionTriageRoute,
} from "@/lib/queueReception";
import { canRecallQueueTicket, recallQueueButtonTooltip } from "@/lib/queueRecall";
import PatientAddDialog from "@/components/patient/PatientAddDialog";
import { LabOrderCatalogSections } from "@/components/laboratory/LabOrderCatalogSections";
import {
  applyPanelLabTestToggle,
  collapseComponentsToPanel,
  expandPanelTestIds,
  fetchLabCatalogGrouped,
  getComponentTestIds,
  testHasPanelComponents,
  type LabCatalogSection,
  type LabTestCatalogItem,
} from "@/lib/labTests";
import { fetchActiveLabPricesByTestIds } from "@/lib/labServicePrices";
import {
  applyPackageImagingSelection,
  fetchActiveLabPackagesWithTests,
  imagingCatalogCodesCoveredByPackages,
  labPackageHasMembers,
  type LabPackageWithTests,
} from "@/lib/labPackages";
import {
  buildImagingRequestLinesFromCatalog,
  emptyImagingSelection,
  fetchActiveImagingCatalog,
  IMAGING_NOTES_END,
  IMAGING_NOTES_START,
  type ImagingCatalogRow,
  type ImagingLineSelection,
} from "@/lib/imagingCatalog";
import { openReceptionQueueReceiptPrint } from "@/lib/receptionQueueReceiptPrint";
import { sanitizePatientSearchQuery } from "@/lib/patientsCatalog";
import { BpSplitInput } from "@/components/BpSplitInput";

/** `NEXT_PUBLIC_RECEPTION_DOCTOR_QUEUES`: segments `CODE|Label` separated by `;` (e.g. `CLINIC 1|Dr. Mark;CLINIC 2|Dr. Ralph`). */
function parseReceptionDoctorQueueOptions(): { code: string; label: string }[] {
  const raw = process.env.NEXT_PUBLIC_RECEPTION_DOCTOR_QUEUES?.trim() ?? "";
  if (!raw) {
    return [{ code: "CLINIC 1", label: "Dr. Mark Loid Anlap" }];
  }
  const out: { code: string; label: string }[] = [];
  for (const part of raw.split(";")) {
    const seg = part.trim();
    if (!seg) continue;
    const pipe = seg.indexOf("|");
    const code = (pipe >= 0 ? seg.slice(0, pipe) : seg).trim();
    const label = (pipe >= 0 ? seg.slice(pipe + 1) : code).trim();
    if (code) out.push({ code, label: label || code });
  }
  return out.length > 0 ? out : [{ code: "CLINIC 1", label: "Dr. Mark Loid Anlap" }];
}

function formatMoney2(n: number): string {
  return new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
    Number.isFinite(n) ? n : 0,
  );
}

function TicketDetails({
  t,
  priorityLabel,
  nameVariant = "body2",
}: {
  t: QueueTicketRow;
  priorityLabel: (priorityId: number) => string;
  nameVariant?: "body2" | "subtitle1";
}) {
  const name = t.patient_name?.trim();
  const contact = t.contact_no?.trim();
  const reason = t.reason?.trim();
  const notes = t.notes?.trim();

  return (
    <Stack spacing={0.35} sx={{ flex: 1, minWidth: 0, textAlign: "left" }}>
      <Typography
        variant={nameVariant}
        fontWeight={name ? 600 : 400}
        color={name ? "text.primary" : "text.secondary"}
        sx={{ lineHeight: 1.35 }}
        noWrap
      >
        {name || "No name on ticket"}
      </Typography>
      <Stack direction="row" alignItems="center" gap={0.75} flexWrap="wrap" useFlexGap>
        <Typography variant="caption" color="text.secondary" noWrap component="span">
          {priorityLabel(t.priority_id)}
          {t.registration_type ? ` · ${t.registration_type}` : ""}
          {t.patient_id != null ? ` · Patient #${t.patient_id}` : ""}
        </Typography>
        {parseReceptionRouteFromNotes(t.notes) === "consultation" ? (
          <Chip size="small" label="→ Consultation" color="primary" variant="outlined" sx={{ height: 22 }} />
        ) : null}
        {parseReceptionRouteFromNotes(t.notes) === "laboratory" ? (
          <Chip size="small" label="→ Laboratory" color="secondary" variant="outlined" sx={{ height: 22 }} />
        ) : null}
      </Stack>
      {contact ? (
        <Typography variant="caption" color="text.secondary" noWrap>
          {contact}
        </Typography>
      ) : null}
      {reason ? (
        <Typography variant="caption" color="text.disabled" sx={{ display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {reason}
        </Typography>
      ) : null}
      {notes ? (
        <Typography variant="caption" color="text.disabled" sx={{ display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          Note: {notes}
        </Typography>
      ) : null}
      {t.encounter_id?.trim() ? (
        <Box sx={{ mt: 0.35 }}>
          <Link
            href={`/consultation/${encodeURIComponent(t.encounter_id.trim())}`}
            prefetch={false}
            style={{ fontWeight: 700, fontSize: "0.75rem", textDecoration: "underline" }}
          >
            Open visit
          </Link>
          <Typography component="span" variant="caption" color="text.disabled" sx={{ ml: 1, fontFamily: "monospace" }}>
            {t.encounter_id.trim().slice(0, 8)}…
          </Typography>
        </Box>
      ) : null}
      <Typography variant="caption" color="text.disabled">
        Issued {new Date(t.issued_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
      </Typography>
    </Stack>
  );
}

function sortTicketsForDisplay(tickets: QueueTicketRow[]): QueueTicketRow[] {
  const rank = (s: QueueTicketStatus) => {
    if (s === "Serving") return 0;
    if (s === "Called") return 1;
    if (s === "Waiting") return 2;
    return 3;
  };
  return [...tickets].sort((a, b) => {
    const dr = rank(a.status) - rank(b.status);
    if (dr !== 0) return dr;
    return a.issued_at.localeCompare(b.issued_at);
  });
}

function CounterQueueCard({
  counter,
  tickets,
  priorityLabel,
  onCall,
  onRecall,
  onOpenTriage,
  onComplete,
  busyId,
  entranceHighlight,
}: {
  counter: QueueCounterRow;
  tickets: QueueTicketRow[];
  priorityLabel: (priorityId: number) => string;
  onCall: (t: QueueTicketRow) => void;
  onRecall: (t: QueueTicketRow) => void;
  onOpenTriage: (t: QueueTicketRow) => void;
  onComplete: (t: QueueTicketRow) => void;
  busyId: string | null;
  /** Entrance kiosk queue: larger “available to call” list for reception. */
  entranceHighlight?: boolean;
}) {
  const theme = useTheme();
  const sorted = useMemo(() => sortTicketsForDisplay(tickets), [tickets]);
  const active = sorted.filter((t) => t.status === "Serving" || t.status === "Called");
  const waiting = sorted.filter((t) => t.status === "Waiting");

  return (
    <Card
      elevation={0}
      sx={{
        height: "100%",
        border: `1px solid ${alpha(theme.palette.primary.main, 0.12)}`,
        borderRadius: 2,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <Box
        sx={{
          px: 2.5,
          py: 2,
          background: `linear-gradient(90deg, ${alpha(theme.palette.primary.main, 0.08)} 0%, transparent 100%)`,
          borderBottom: `1px solid ${alpha(theme.palette.divider, 0.08)}`,
        }}
      >
        <Typography variant="overline" sx={{ color: "text.secondary", letterSpacing: 1.2 }}>
          {counter.code}
        </Typography>
        <Stack direction="row" alignItems="center" gap={1} flexWrap="wrap">
          <Typography variant="h6" fontWeight={700}>
            {entranceHighlight ? "Entrance — available to call" : counter.name ?? counter.code}
          </Typography>
          {entranceHighlight ? (
            <Chip size="small" label={`Counter ${counter.code}`} sx={{ fontWeight: 600 }} />
          ) : null}
        </Stack>
        {!entranceHighlight && counter.description ? (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
            {counter.description}
          </Typography>
        ) : null}
      </Box>

      <CardContent sx={{ flex: 1, pt: 2, display: "flex", flexDirection: "column", gap: 2 }}>
        <Box>
          <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ textTransform: "uppercase" }}>
            Now serving
          </Typography>
          {active.length === 0 ? (
            <Box
              sx={{
                mt: 1,
                py: 2,
                px: 2,
                borderRadius: 1.5,
                bgcolor: alpha(theme.palette.text.primary, 0.04),
                textAlign: "center",
              }}
            >
              <Typography variant="body2" color="text.secondary">
                No active ticket — call the next waiting number
              </Typography>
            </Box>
          ) : (
            <Stack spacing={1} sx={{ mt: 1 }}>
              {active.map((t) => (
                <Box
                  key={t.id}
                  sx={{
                    py: 1.25,
                    px: 1.5,
                    borderRadius: 1.5,
                    bgcolor:
                      t.status === "Serving"
                        ? alpha(theme.palette.success.main, 0.1)
                        : alpha(theme.palette.info.main, 0.08),
                    border: `1px solid ${
                      t.status === "Serving"
                        ? alpha(theme.palette.success.main, 0.35)
                        : alpha(theme.palette.info.main, 0.25)
                    }`,
                  }}
                >
                  <Stack direction="row" alignItems="flex-start" gap={1} flexWrap="wrap">
                    <Typography variant="h5" fontWeight={800} sx={{ fontVariantNumeric: "tabular-nums", minWidth: 88 }}>
                      {t.queue_display}
                    </Typography>
                    <Chip
                      size="small"
                      label={t.status}
                      color={t.status === "Serving" ? "success" : "info"}
                      sx={{ fontWeight: 600 }}
                    />
                    <Chip size="small" variant="outlined" label={priorityLabel(t.priority_id)} />
                    <Box sx={{ flex: 1, minWidth: 120 }} />
                    <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                      {canRecallQueueTicket(t.status) ? (
                        <Tooltip title={recallQueueButtonTooltip(t.status)}>
                          <span>
                            <Button
                              size="small"
                              variant="outlined"
                              color="secondary"
                              startIcon={<ReplayIcon />}
                              onClick={() => onRecall(t)}
                              disabled={busyId !== null}
                              sx={{ textTransform: "none", fontWeight: 700 }}
                            >
                              Recall
                            </Button>
                          </span>
                        </Tooltip>
                      ) : null}
                      {t.status === "Called" ? (
                        <Button
                          size="small"
                          variant="contained"
                          color="success"
                          startIcon={<PlayCircleOutlineIcon />}
                          onClick={() => onOpenTriage(t)}
                          disabled={busyId !== null}
                        >
                          Check in &amp; triage
                        </Button>
                      ) : null}
                      <Button
                        size="small"
                        variant="outlined"
                        color="inherit"
                        startIcon={<CheckCircleOutlineIcon />}
                        onClick={() => onComplete(t)}
                        disabled={busyId !== null}
                      >
                        Done
                      </Button>
                    </Stack>
                  </Stack>
                  <Box sx={{ mt: 1.25, pl: 0.25 }}>
                    <TicketDetails t={t} priorityLabel={priorityLabel} />
                  </Box>
                </Box>
              ))}
            </Stack>
          )}
        </Box>

        <Divider />

        <Box sx={{ flex: 1, minHeight: 120 }}>
          <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ textTransform: "uppercase" }}>
            {entranceHighlight ? `Waiting at lobby (${waiting.length})` : `Waiting (${waiting.length})`}
          </Typography>
          {waiting.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 2, textAlign: "center" }}>
              {entranceHighlight
                ? "No lobby tickets waiting — new numbers appear when issued at the kiosk."
                : "Queue is clear"}
            </Typography>
          ) : (
            <Stack spacing={entranceHighlight ? 1.25 : 1} sx={{ mt: 1 }}>
              {waiting.map((t) => (
                <Box
                  key={t.id}
                  onClick={() => {
                    if (!busyId) onCall(t);
                  }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if ((e.key === "Enter" || e.key === " ") && !busyId) {
                      e.preventDefault();
                      onCall(t);
                    }
                  }}
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1.5,
                    py: entranceHighlight ? 2 : 1.5,
                    px: entranceHighlight ? 2 : 1.5,
                    borderRadius: 1.5,
                    cursor: busyId ? "default" : "pointer",
                    opacity: busyId ? 0.65 : 1,
                    border: `1px solid ${alpha(theme.palette.divider, 0.12)}`,
                    transition: "background-color 0.15s ease, border-color 0.15s ease",
                    "&:hover": busyId
                      ? {}
                      : {
                          bgcolor: alpha(theme.palette.primary.main, 0.06),
                          borderColor: alpha(theme.palette.primary.main, 0.25),
                        },
                  }}
                >
                  <Typography
                    variant={entranceHighlight ? "h4" : "h5"}
                    fontWeight={800}
                    sx={{
                      minWidth: entranceHighlight ? 140 : 100,
                      fontVariantNumeric: "tabular-nums",
                      color: "primary.main",
                      alignSelf: "flex-start",
                    }}
                  >
                    {t.queue_display}
                  </Typography>
                  <TicketDetails
                    t={t}
                    priorityLabel={priorityLabel}
                    nameVariant={entranceHighlight ? "subtitle1" : "body2"}
                  />
                  <Chip
                    size={entranceHighlight ? "medium" : "small"}
                    label="Click to call"
                    color="primary"
                    variant="outlined"
                    sx={{ fontWeight: 600 }}
                  />
                </Box>
              ))}
            </Stack>
          )}
        </Box>
      </CardContent>
    </Card>
  );
}

export default function ReceptionDesk() {
  const theme = useTheme();
  const [counters, setCounters] = useState<QueueCounterRow[]>([]);
  const [entranceCounter, setEntranceCounter] = useState<QueueCounterRow | null>(null);
  const [priorities, setPriorities] = useState<QueuePriorityRow[]>([]);
  const [tickets, setTickets] = useState<QueueTicketRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rtConnected, setRtConnected] = useState(false);
  const [apiWarnings, setApiWarnings] = useState<string[]>([]);
  const [triageTicket, setTriageTicket] = useState<QueueTicketRow | null>(null);
  const [triageComplaint, setTriageComplaint] = useState("");
  const [triageRoute, setTriageRoute] = useState<ReceptionTriageRoute>("consultation");
  const [triageSaving, setTriageSaving] = useState(false);
  const [patientQuery, setPatientQuery] = useState("");
  const [patientLoading, setPatientLoading] = useState(false);
  const [patientError, setPatientError] = useState<string | null>(null);
  const [patientResults, setPatientResults] = useState<ReceptionPatientSearchRow[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<ReceptionPatientSearchRow | null>(null);
  const [addPatientOpen, setAddPatientOpen] = useState(false);
  const [vitals, setVitals] = useState({
    bp: "",
    hr: "",
    rr: "",
    temp: "",
    o2: "",
    weight_kg: "",
    height_cm: "",
    bmi: "",
  });
  const [labSections, setLabSections] = useState<LabCatalogSection[]>([]);
  const [labPriceByTestId, setLabPriceByTestId] = useState<Map<string, number>>(() => new Map());
  const [labLoading, setLabLoading] = useState(false);
  const [selectedLabTestIds, setSelectedLabTestIds] = useState<Set<string>>(new Set());
  const [labSubTab, setLabSubTab] = useState(0);
  const [labPackages, setLabPackages] = useState<LabPackageWithTests[]>([]);
  const [selectedLabPackageIds, setSelectedLabPackageIds] = useState<Set<string>>(() => new Set());
  const [imagingCatalog, setImagingCatalog] = useState<ImagingCatalogRow[]>([]);
  const [imagingForm, setImagingForm] = useState<Record<string, ImagingLineSelection>>({});
  const [imagingCatalogError, setImagingCatalogError] = useState("");
  const labDataLoadedTicketIdRef = useRef<string | null>(null);
  const labCatalogTests = useMemo(
    (): LabTestCatalogItem[] => labSections.flatMap((s) => s.tests),
    [labSections],
  );
  const testsCoveredBySelectedPackages = useMemo(() => {
    const s = new Set<string>();
    for (const pkg of labPackages) {
      if (!selectedLabPackageIds.has(pkg.id)) continue;
      for (const tid of pkg.labTestIds) {
        s.add(tid);
        for (const t of expandPanelTestIds([tid], labCatalogTests)) s.add(t);
      }
    }
    return s;
  }, [labPackages, selectedLabPackageIds, labCatalogTests]);

  const imagingCoveredByPackages = useMemo(
    () => imagingCatalogCodesCoveredByPackages(labPackages, selectedLabPackageIds, imagingCatalog),
    [labPackages, selectedLabPackageIds, imagingCatalog],
  );

  const toggleLabTestSelection = useCallback(
    (testId: string) => {
      setSelectedLabTestIds((prev) => {
        if (testHasPanelComponents(labCatalogTests, testId)) {
          return applyPanelLabTestToggle(testId, labCatalogTests, prev);
        }
        const next = new Set(prev);
        if (next.has(testId)) next.delete(testId);
        else next.add(testId);
        return next;
      });
    },
    [labCatalogTests],
  );

  const toggleLabPackageSelection = useCallback(
    (pkg: LabPackageWithTests) => {
      if (!labPackageHasMembers(pkg)) return;
      const wasOn = selectedLabPackageIds.has(pkg.id);
      setSelectedLabPackageIds((prev) => {
        const next = new Set(prev);
        if (wasOn) next.delete(pkg.id);
        else next.add(pkg.id);
        return next;
      });
      if (pkg.labTestIds.length > 0) {
        setSelectedLabTestIds((sel) => {
          const n2 = new Set(sel);
          if (wasOn) {
            for (const tid of pkg.labTestIds) {
              n2.delete(tid);
              if (testHasPanelComponents(labCatalogTests, tid)) {
                for (const cid of getComponentTestIds(labCatalogTests, tid)) n2.delete(cid);
              }
            }
          } else {
            for (const tid of pkg.labTestIds) {
              n2.add(tid);
              if (testHasPanelComponents(labCatalogTests, tid)) {
                for (const cid of getComponentTestIds(labCatalogTests, tid)) n2.delete(cid);
              }
            }
          }
          return n2;
        });
      }
      setImagingForm((prev) =>
        applyPackageImagingSelection(pkg.imagingCatalogIds, imagingCatalog, prev, !wasOn),
      );
    },
    [selectedLabPackageIds, labCatalogTests, imagingCatalog],
  );

  const clearLaboratoryTriageSelections = useCallback(() => {
    setSelectedLabTestIds(new Set());
    setSelectedLabPackageIds(new Set());
    setImagingForm(imagingCatalog.length > 0 ? emptyImagingSelection(imagingCatalog) : {});
    setLabSubTab(0);
  }, [imagingCatalog]);

  const handleTriageRouteChange = useCallback(
    (route: ReceptionTriageRoute) => {
      if (route === "consultation" && triageRoute === "laboratory") {
        clearLaboratoryTriageSelections();
      }
      setTriageRoute(route);
    },
    [triageRoute, clearLaboratoryTriageSelections],
  );

  const doctorQueueOptions = useMemo(() => parseReceptionDoctorQueueOptions(), []);
  const [doctorCounterCode, setDoctorCounterCode] = useState(() => doctorQueueOptions[0]?.code ?? "CLINIC 1");
  const patientSearchAnchorRef = useRef<HTMLDivElement | null>(null);
  const [patientSearchDropdownWidth, setPatientSearchDropdownWidth] = useState(0);

  useLayoutEffect(() => {
    const el = patientSearchAnchorRef.current;
    if (!el) return;
    const measure = () => setPatientSearchDropdownWidth(el.offsetWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [triageTicket]);

  const priorityLabel = useCallback(
    (id: number) => {
      const p = priorities.find((x) => x.id === id);
      return p?.name ?? p?.code ?? `Priority ${id}`;
    },
    [priorities],
  );

  const applyTickets = useCallback((next: QueueTicketRow[]) => {
    setTickets(next);
    setTriageTicket((prev) => {
      if (!prev) return null;
      return next.find((t) => t.id === prev.id) ?? prev;
    });
  }, []);

  const refresh = useCallback(async () => {
    const data = await fetchReceptionQueueStateFromApi();
    setLoadError(data.error);
    setApiWarnings(data.warnings);
    setCounters(data.counters);
    setEntranceCounter(data.entranceCounter);
    setPriorities(data.priorities);
    applyTickets(data.tickets);
  }, [applyTickets]);

  /** Background refresh: updates lobby list only; leaves triage dialog and form fields intact. */
  const refreshTicketsOnly = useCallback(async () => {
    const data = await fetchReceptionQueueTicketsFromApi();
    if (data.error) return;
    applyTickets(data.tickets);
  }, [applyTickets]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      await refresh();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  useEffect(() => {
    const ids = new Set<string>(counters.map((c) => String(c.id)));
    if (entranceCounter) ids.add(String(entranceCounter.id));
    const idList = [...ids];
    if (idList.length === 0) return () => {};

    return subscribeQueueTickets(
      idList,
      () => {
        void refreshTicketsOnly();
      },
      (subscribed) => setRtConnected(subscribed),
    );
  }, [counters, entranceCounter, refreshTicketsOnly]);

  useEffect(() => {
    const pollMs = rtConnected ? 60_000 : 8_000;
    const poll = window.setInterval(() => {
      void refreshTicketsOnly();
    }, pollMs);
    return () => window.clearInterval(poll);
  }, [rtConnected, refreshTicketsOnly]);

  const ticketsByCounter = useMemo(() => {
    const m = new Map<string, QueueTicketRow[]>();
    for (const t of tickets) {
      const k = String(t.counter_id);
      const arr = m.get(k) ?? [];
      arr.push(t);
      m.set(k, arr);
    }
    return m;
  }, [tickets]);

  const runTicketAction = async (ticketId: string, action: "complete") => {
    setBusyId(ticketId);
    try {
      const { error } = await patchReceptionQueueTicket(ticketId, action);
      if (error) setLoadError(error);
      await refresh();
    } finally {
      setBusyId(null);
    }
  };

  const handleCall = (t: QueueTicketRow) => {
    void (async () => {
      setBusyId(t.id);
      try {
        const { error } = await patchReceptionQueueTicket(t.id, "call");
        if (error) setLoadError(error);
        await refresh();
      } finally {
        setBusyId(null);
      }
    })();
  };

  const handleRecall = (t: QueueTicketRow) => {
    void (async () => {
      setBusyId(t.id);
      try {
        const { error } = await recallQueueTicketAnnounce(t.id);
        if (error) setLoadError(error);
      } finally {
        setBusyId(null);
      }
    })();
  };

  const openTriage = (t: QueueTicketRow) => {
    setTriageTicket(t);
    setTriageComplaint(t.reason?.trim() ?? "");
    setTriageRoute("consultation");
    setPatientQuery("");
    setPatientResults([]);
    setSelectedPatient(null);
    setPatientError(null);
    setAddPatientOpen(false);
    setVitals({
      bp: "",
      hr: "",
      rr: "",
      temp: "",
      o2: "",
      weight_kg: "",
      height_cm: "",
      bmi: "",
    });
    setSelectedLabTestIds(new Set());
    setLabPriceByTestId(new Map());
    setLabSubTab(0);
    setLabPackages([]);
    setSelectedLabPackageIds(new Set());
    setImagingCatalog([]);
    setImagingForm({});
    setImagingCatalogError("");
    labDataLoadedTicketIdRef.current = null;
    setLabSections([]);
    setDoctorCounterCode(doctorQueueOptions[0]?.code ?? "CLINIC 1");
  };

  const closeTriage = () => {
    if (triageSaving) return;
    setTriageTicket(null);
  };

  useEffect(() => {
    if (!triageTicket || triageRoute !== "laboratory") return;
    if (labDataLoadedTicketIdRef.current === triageTicket.id) return;
    let cancelled = false;
    void (async () => {
      setLabLoading(true);
      setImagingCatalogError("");
      try {
        const [catRes, pkgRes, imgRes] = await Promise.all([
          fetchLabCatalogGrouped(),
          fetchActiveLabPackagesWithTests(),
          fetchActiveImagingCatalog(),
        ]);
        if (cancelled) return;
        if (!catRes.error) {
          setLabSections(catRes.sections);
          const allTestIds = catRes.sections.flatMap((s) => s.tests.map((t) => t.id));
          const pricesAll = await fetchActiveLabPricesByTestIds(allTestIds);
          if (!cancelled && !pricesAll.error) {
            setLabPriceByTestId(pricesAll.pricesByTestId);
          }
        }
        if (!pkgRes.error) setLabPackages(pkgRes.packages);
        else setLabPackages([]);
        if (!imgRes.error) {
          setImagingCatalog(imgRes.rows);
          setImagingForm(emptyImagingSelection(imgRes.rows));
        } else {
          setImagingCatalog([]);
          setImagingForm({});
          setImagingCatalogError(imgRes.error);
        }
        labDataLoadedTicketIdRef.current = triageTicket.id;
      } finally {
        if (!cancelled) setLabLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      setLabLoading(false);
    };
  }, [triageTicket, triageRoute]);

  useEffect(() => {
    if (!triageTicket) return;
    const safe = sanitizePatientSearchQuery(patientQuery);
    if (safe.length < 2) {
      setPatientResults([]);
      setPatientError(null);
      setPatientLoading(false);
      return;
    }
    let cancelled = false;
    const handle = window.setTimeout(() => {
      void (async () => {
        setPatientLoading(true);
        try {
          const { rows, error } = await searchPatientsFromApi(safe);
          if (cancelled) return;
          setPatientResults(rows);
          setPatientError(error);
        } finally {
          if (!cancelled) setPatientLoading(false);
        }
      })();
    }, 280);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [patientQuery, triageTicket]);

  useEffect(() => {
    const w = Number.parseFloat(String(vitals.weight_kg).trim().replace(",", "."));
    const h = Number.parseFloat(String(vitals.height_cm).trim().replace(",", "."));
    if (!Number.isFinite(w) || !Number.isFinite(h) || h <= 0) return;
    const m = h / 100;
    const bmi = w / (m * m);
    if (!Number.isFinite(bmi)) return;
    const rounded = String(Math.round(bmi * 10) / 10);
    if (rounded !== vitals.bmi) {
      setVitals((v) => ({ ...v, bmi: rounded }));
    }
  }, [vitals.weight_kg, vitals.height_cm, vitals.bmi]);

  const submitTriage = () => {
    if (!triageTicket) return;
    void (async () => {
      if (!selectedPatient) {
        setPatientError("Select an existing patient, or add a new one.");
        return;
      }
      setTriageSaving(true);
      setBusyId(triageTicket.id);
      setPatientError(null);
      try {
        if (triageRoute === "laboratory") {
          const merged = new Set<string>([...selectedLabTestIds]);
          for (const pkgId of selectedLabPackageIds) {
            const pkg = labPackages.find((p) => p.id === pkgId);
            if (pkg) {
              for (const tid of pkg.labTestIds) {
                merged.add(tid);
                if (testHasPanelComponents(labCatalogTests, tid)) {
                  for (const cid of getComponentTestIds(labCatalogTests, tid)) merged.delete(cid);
                }
              }
            }
          }
          const hasImaging = Object.values(imagingForm).some((r) => r?.checked);
          const hasSelectedPackage = selectedLabPackageIds.size > 0;
          if (merged.size === 0 && !hasImaging && !hasSelectedPackage) {
            setPatientError("Select at least one laboratory test, package, or imaging study.");
            return;
          }
          const labTestIds = collapseComponentsToPanel(merged, labCatalogTests).sort((a, b) =>
            a.localeCompare(b),
          );
          const labPackageIds = [...selectedLabPackageIds]
            .map((sid) => Number.parseInt(sid, 10))
            .filter((n) => Number.isFinite(n) && n > 0);

          const imagingLines = buildImagingRequestLinesFromCatalog(imagingCatalog, imagingForm);
          const imagingBlock =
            imagingLines.length > 0
              ? [IMAGING_NOTES_START, "IMAGING REQUEST:", ...imagingLines, IMAGING_NOTES_END].join("\n")
              : "";
          const complaint = triageComplaint.trim();
          const triageNotesCombined =
            complaint && imagingBlock ? `${complaint}\n\n${imagingBlock}\n` : imagingBlock ? `${imagingBlock}\n` : complaint;

          const prep = await prepareReceptionLabCheckinFromApi({
            ticketId: triageTicket.id,
            triageNotes: triageNotesCombined,
            priorNotes: triageTicket.notes,
            patient: {
              id: selectedPatient.id,
              name: selectedPatient.name ?? "",
              contact_no: selectedPatient.contact_no,
            },
            labTestIds,
            labPackageIds,
            imagingSelection: imagingForm,
          });
          if (prep.error) {
            setLoadError(prep.error);
            return;
          }
          if (!prep.transId || (!prep.includesLab && !prep.includesImaging)) {
            setLoadError("Server did not return checkout identifiers.");
            return;
          }

          const entranceTicketId = triageTicket.id;

          const completeRes = await completeEntranceAfterLabIntakeFromApi({
            entranceTicketId,
            transId: prep.transId,
            labRequestId: prep.labRequestId ?? null,
            imagingRequestId: prep.imagingRequestId ?? null,
            includesLab: prep.includesLab,
            includesImaging: prep.includesImaging,
            patient: {
              id: selectedPatient.id,
              name: selectedPatient.name ?? "",
              contact_no: selectedPatient.contact_no,
            },
          });
          if (completeRes.error) {
            setLoadError(completeRes.error);
            return;
          }

          const labQueueDisplay = (completeRes.labQueueDisplay ?? "").trim();
          const destLabel =
            prep.includesLab && prep.includesImaging
              ? "Laboratory & Imaging"
              : prep.includesImaging
                ? "Imaging"
                : "Laboratory";
          if (labQueueDisplay) {
            await openReceptionQueueReceiptPrint({
              patientName: selectedPatient.name ?? "Patient",
              destinationLabel: destLabel,
              queueDisplay: labQueueDisplay,
              transId: prep.transId,
              hideProceedTo: true,
              footerNote: `Pay at cashier before ${destLabel.toLowerCase()} queue display.`,
            });
          }

          setTriageTicket(null);
          await refresh();
          return;
        }

        const docCode = doctorCounterCode.trim();
        if (!docCode) {
          setPatientError("Select a doctor queue (counter).");
          return;
        }

        const res = await patchReceptionQueueTicket(triageTicket.id, "start_with_triage", {
          complaint: triageComplaint.trim(),
          triageNotes: "",
          route: "consultation",
          priorNotes: triageTicket.notes,
          patient: {
            id: selectedPatient.id,
            name: selectedPatient.name ?? "",
            contact_no: selectedPatient.contact_no,
          },
          doctorCounterCode: docCode,
          vitals,
        });
        if (res.error) {
          setLoadError(res.error);
          return;
        }
        const destLabel =
          doctorQueueOptions.find((d) => d.code === res.destinationCounterCode)?.label ??
          res.destinationCounterCode ??
          "Consultation";
        if (res.transId && res.destinationQueueDisplay) {
          await openReceptionQueueReceiptPrint({
            patientName: selectedPatient.name ?? "Patient",
            destinationLabel: destLabel,
            queueDisplay: res.destinationQueueDisplay,
            transId: res.transId,
          });
        }
        setTriageTicket(null);
        await refresh();
      } finally {
        setTriageSaving(false);
        setBusyId(null);
      }
    })();
  };

  const handleComplete = (t: QueueTicketRow) => {
    void runTicketAction(t.id, "complete");
  };

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 10 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Card
        elevation={0}
        sx={{
          mb: 3,
          overflow: "hidden",
          background: "linear-gradient(135deg, #1F4E79 0%, #2A6B9E 45%, #4CC9C0 100%)",
          color: "#fff",
          border: "none",
        }}
      >
        <CardContent sx={{ p: { xs: 2.5, md: 3.5 } }}>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems={{ xs: "flex-start", sm: "center" }}>
            <Box
              sx={{
                width: 56,
                height: 56,
                borderRadius: 2,
                bgcolor: alpha("#fff", 0.15),
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <MeetingRoomOutlinedIcon sx={{ fontSize: 32 }} />
            </Box>
            <Box sx={{ flex: 1 }}>
              <Typography variant="h4" fontWeight={800}>
                Reception desk
              </Typography>
              <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mt: 1 }} useFlexGap>
                <Chip
                  size="small"
                  icon={<CampaignOutlinedIcon sx={{ color: "#fff !important" }} />}
                  label={new Date().toLocaleDateString(undefined, {
                    weekday: "long",
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                  sx={{ bgcolor: alpha("#fff", 0.12), color: "#fff", border: `1px solid ${alpha("#fff", 0.2)}` }}
                />
                <Chip
                  size="small"
                  label={rtConnected ? "Live updates on" : "Polling backup"}
                  sx={{ bgcolor: alpha("#fff", 0.12), color: "#fff", border: `1px solid ${alpha("#fff", 0.2)}` }}
                />
              </Stack>
            </Box>
            <Tooltip title="Refresh queue">
              <IconButton
                onClick={() => void refresh()}
                sx={{ color: "#fff", bgcolor: alpha("#fff", 0.1), "&:hover": { bgcolor: alpha("#fff", 0.2) } }}
              >
                <RefreshIcon />
              </IconButton>
            </Tooltip>
          </Stack>
        </CardContent>
      </Card>

      {loadError ? (
        <Alert severity="warning" sx={{ mb: 3 }}>
          <Typography variant="body2" fontWeight={600} gutterBottom>
            Queue data could not be loaded
          </Typography>
          <Typography variant="body2" component="div" sx={{ mb: loadError.includes("SERVICE_ROLE") ? 1 : 0 }}>
            {loadError}
          </Typography>
          {loadError.includes("SERVICE_ROLE") ? (
            <Typography variant="body2" component="div">
              In Supabase: Project Settings → API → copy the <code>service_role</code> secret, add{" "}
              <code>SUPABASE_SERVICE_ROLE_KEY=…</code> to <code>.env.local</code> next to your{" "}
              <code>NEXT_PUBLIC_SUPABASE_*</code> values, then restart <code>npm run dev</code>. Reception reads queues
              on the server with this key so it still works when RLS blocks the browser anon key.
            </Typography>
          ) : (
            <Typography variant="body2" component="div">
              Confirm queuing tables exist (see{" "}
              <Box component="a" href="https://github.com/arkwaretechnologies/lifehub-queuing" sx={{ color: "inherit" }}>
                lifehub-queuing
              </Box>
              ).
            </Typography>
          )}
        </Alert>
      ) : null}

      {!loadError && apiWarnings.length > 0
        ? apiWarnings.map((w) => (
            <Alert key={w} severity="info" sx={{ mb: 2 }}>
              {w}
            </Alert>
          ))
        : null}

      <Dialog open={triageTicket !== null} onClose={closeTriage} fullWidth maxWidth="sm" disableEscapeKeyDown={triageSaving}>
        <DialogTitle>Mini triage &amp; routing</DialogTitle>
        <DialogContent>
          {triageTicket ? (
            <Stack spacing={2} sx={{ mt: 1 }}>
              <Typography variant="body2" color="text.secondary">
                Ticket <strong>{triageTicket.queue_display}</strong>
                {triageTicket.patient_name?.trim() ? ` · ${triageTicket.patient_name.trim()}` : ""}
              </Typography>

              <Box>
                <Stack direction="row" alignItems="center" justifyContent="space-between" gap={2} sx={{ mb: 1 }}>
                  <Typography variant="subtitle2" fontWeight={700}>
                    Patient
                  </Typography>
                  {!selectedPatient ? (
                    <Button
                      variant="contained"
                      color="primary"
                      onClick={() => setAddPatientOpen(true)}
                      disabled={triageSaving}
                      sx={{ fontWeight: 700, textTransform: "none" }}
                    >
                      Add new patient
                    </Button>
                  ) : null}
                </Stack>
                {selectedPatient ? (
                  <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                    <Chip
                      color="primary"
                      label={`${(selectedPatient.name ?? "Unnamed").toUpperCase()} · #${selectedPatient.id}`}
                      sx={{ fontWeight: 700 }}
                    />
                    {selectedPatient.contact_no ? <Chip variant="outlined" label={selectedPatient.contact_no} /> : null}
                    <Button size="small" onClick={() => setSelectedPatient(null)} disabled={triageSaving}>
                      Change
                    </Button>
                  </Stack>
                ) : (
                  <Stack spacing={1}>
                    <Box ref={patientSearchAnchorRef} sx={{ width: "100%" }}>
                      <Box
                        sx={{
                          display: "flex",
                          alignItems: "center",
                          gap: 1.25,
                          px: 2,
                          py: 1.15,
                          borderRadius: 999,
                          border: "1px solid",
                          borderColor: alpha(theme.palette.info.main, 0.4),
                          bgcolor: "background.paper",
                          transition: "box-shadow 0.2s ease, border-color 0.2s ease",
                          "&:focus-within": {
                            borderColor: "info.main",
                            boxShadow: `0 0 0 3px ${alpha(theme.palette.info.main, 0.18)}`,
                          },
                        }}
                      >
                        <SearchIcon sx={{ color: "text.secondary", fontSize: 22, flexShrink: 0 }} />
                        <InputBase
                          fullWidth
                          value={patientQuery}
                          onChange={(e) => {
                            setPatientQuery(e.target.value);
                            setPatientError(null);
                          }}
                          placeholder="Search patient…"
                          inputProps={{
                            "aria-label": "Search patient by name, contact number, or id",
                          }}
                          sx={{
                            fontSize: "0.875rem",
                            "& .MuiInputBase-input": { py: 0.5 },
                            "& .MuiInputBase-input::placeholder": { opacity: 0.55 },
                          }}
                        />
                      </Box>
                    </Box>

                    <Popper
                      open={patientResults.length > 0 && !patientLoading}
                      anchorEl={patientSearchAnchorRef.current}
                      placement="bottom-start"
                      sx={{ zIndex: (t) => t.zIndex.modal + 10 }}
                      modifiers={[{ name: "offset", options: { offset: [0, 10] } }]}
                    >
                      <Paper
                        elevation={8}
                        sx={{
                          width: patientSearchDropdownWidth || undefined,
                          minWidth: 260,
                          borderRadius: 2,
                          border: "1px solid",
                          borderColor: "divider",
                          overflow: "hidden",
                          maxHeight: 280,
                          overflowY: "auto",
                          boxShadow: "0 10px 28px rgba(31, 78, 121, 0.12)",
                          position: "relative",
                          mt: 0.5,
                          "&::before": {
                            content: '""',
                            position: "absolute",
                            top: -7,
                            left: "50%",
                            transform: "translateX(-50%)",
                            width: 0,
                            height: 0,
                            borderLeft: "7px solid transparent",
                            borderRight: "7px solid transparent",
                            borderBottom: `7px solid ${theme.palette.divider}`,
                          },
                          "&::after": {
                            content: '""',
                            position: "absolute",
                            top: -6,
                            left: "50%",
                            transform: "translateX(-50%)",
                            width: 0,
                            height: 0,
                            borderLeft: "6px solid transparent",
                            borderRight: "6px solid transparent",
                            borderBottom: `6px solid ${theme.palette.background.paper}`,
                          },
                        }}
                      >
                        {patientResults.map((p) => (
                          <ListItemButton
                            key={p.id}
                            onClick={() => {
                              setSelectedPatient(p);
                              setPatientResults([]);
                              setPatientQuery("");
                              setPatientError(null);
                            }}
                            sx={{
                              alignItems: "center",
                              gap: 1.25,
                              py: 1.35,
                              px: 2,
                              borderRadius: 0,
                              "&:hover": {
                                bgcolor: "info.main",
                                color: "common.white",
                              },
                              "&:hover .patient-search-title": { color: "common.white" },
                              "&:hover .patient-search-meta": {
                                color: alpha("#fff", 0.85),
                              },
                              "&:hover .patient-search-chevron": {
                                color: "common.white",
                              },
                            }}
                          >
                            <Box sx={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                              <Typography
                                className="patient-search-title"
                                fontWeight={800}
                                color="primary.main"
                                sx={{
                                  fontSize: "0.8125rem",
                                  letterSpacing: "0.02em",
                                  lineHeight: 1.35,
                                }}
                                noWrap
                              >
                                {(p.name ?? "Unnamed").toUpperCase()}
                              </Typography>
                              <Typography
                                className="patient-search-meta"
                                variant="caption"
                                color="text.secondary"
                                sx={{ display: "block", mt: 0.25 }}
                                noWrap
                              >
                                Patient #{p.id}
                                {p.contact_no ? ` · ${p.contact_no}` : ""}
                              </Typography>
                            </Box>
                            <ChevronRightIcon
                              className="patient-search-chevron"
                              sx={{ fontSize: 20, color: alpha(theme.palette.text.primary, 0.35), flexShrink: 0 }}
                            />
                          </ListItemButton>
                        ))}
                      </Paper>
                    </Popper>

                    {patientLoading ? (
                      <Typography variant="caption" color="text.secondary">
                        Searching…
                      </Typography>
                    ) : null}
                    {patientError ? <Alert severity="warning">{patientError}</Alert> : null}
                  </Stack>
                )}
              </Box>

              <PatientAddDialog
                open={addPatientOpen}
                onClose={() => setAddPatientOpen(false)}
                initial={{
                  name: triageTicket.patient_name?.trim() ?? "",
                  contactNo: triageTicket.contact_no?.trim() ?? "",
                }}
                createPatient={async (payload) => {
                  // Map to our service-role API (expects snake_case).
                  const { patient, error } = await createPatientFromApi({
                    name: String(payload.name ?? ""),
                    sex: String(payload.sex ?? ""),
                    date_of_birth: String(payload.date_of_birth ?? ""),
                    address: String(payload.address ?? ""),
                    contact_no: String(payload.contact_no ?? ""),
                    email_address: (payload.email_address as string | null) ?? null,
                    occupation: (payload.occupation as string | null) ?? null,
                  });
                  return { patient, error };
                }}
                onCreated={(patient) => {
                  setSelectedPatient(patient);
                  setAddPatientOpen(false);
                }}
              />

              <FormControl>
                <FormLabel id="reception-route-label">Send patient to</FormLabel>
                <RadioGroup
                  aria-labelledby="reception-route-label"
                  value={triageRoute}
                  onChange={(e) => handleTriageRouteChange(e.target.value as ReceptionTriageRoute)}
                >
                  <FormControlLabel value="consultation" control={<Radio />} label="Doctor consultation" />
                  <FormControlLabel value="laboratory" control={<Radio />} label="Laboratory only" />
                </RadioGroup>
              </FormControl>

              {triageRoute === "consultation" ? (
                <FormControl>
                  <FormLabel id="reception-doctor-label">Doctor queue (counter)</FormLabel>
                  <RadioGroup
                    aria-labelledby="reception-doctor-label"
                    value={doctorCounterCode}
                    onChange={(e) => setDoctorCounterCode(e.target.value)}
                  >
                    {doctorQueueOptions.map((d) => (
                      <FormControlLabel key={d.code} value={d.code} control={<Radio />} label={`${d.label} (${d.code})`} />
                    ))}
                  </RadioGroup>
                </FormControl>
              ) : null}

              {triageRoute === "consultation" ? (
                <TextField
                  label="Chief complaint"
                  value={triageComplaint}
                  onChange={(e) => setTriageComplaint(e.target.value)}
                  fullWidth
                  InputLabelProps={{ shrink: true }}
                  multiline
                  minRows={2}
                  placeholder="e.g. cough 3 days, request CBC"
                />
              ) : null}

              {triageRoute === "consultation" ? (
                <Box sx={{ mt: 1 }}>
                  <Typography variant="subtitle2" fontWeight={800} sx={{ mb: 1 }}>
                    Vital signs (consultation only)
                  </Typography>
                  <Grid container spacing={2}>
                    <Grid size={{ xs: 6, md: 4 }}>
                      <BpSplitInput
                        variant="reception"
                        value={vitals.bp}
                        onChange={(bp) => setVitals((v) => ({ ...v, bp }))}
                      />
                    </Grid>
                    <Grid size={{ xs: 6, md: 4 }}>
                      <TextField
                        label="HR"
                        value={vitals.hr}
                        onChange={(e) => setVitals((v) => ({ ...v, hr: e.target.value }))}
                        fullWidth
                        InputLabelProps={{ shrink: true }}
                        placeholder="bpm"
                      />
                    </Grid>
                    <Grid size={{ xs: 6, md: 4 }}>
                      <TextField
                        label="RR"
                        value={vitals.rr}
                        onChange={(e) => setVitals((v) => ({ ...v, rr: e.target.value }))}
                        fullWidth
                        InputLabelProps={{ shrink: true }}
                        placeholder="breaths/min"
                      />
                    </Grid>
                    <Grid size={{ xs: 6, md: 4 }}>
                      <TextField
                        label="Temp"
                        value={vitals.temp}
                        onChange={(e) => setVitals((v) => ({ ...v, temp: e.target.value }))}
                        fullWidth
                        InputLabelProps={{ shrink: true }}
                        placeholder="°C"
                      />
                    </Grid>
                    <Grid size={{ xs: 6, md: 4 }}>
                      <TextField
                        label="O2 Sat"
                        value={vitals.o2}
                        onChange={(e) => setVitals((v) => ({ ...v, o2: e.target.value }))}
                        fullWidth
                        InputLabelProps={{ shrink: true }}
                        placeholder="%"
                      />
                    </Grid>
                    <Grid size={{ xs: 6, md: 4 }} />

                    <Grid size={{ xs: 6, md: 4 }}>
                      <TextField
                        label="Weight"
                        value={vitals.weight_kg}
                        onChange={(e) => setVitals((v) => ({ ...v, weight_kg: e.target.value }))}
                        fullWidth
                        InputLabelProps={{ shrink: true }}
                        placeholder="kg"
                      />
                    </Grid>
                    <Grid size={{ xs: 6, md: 4 }}>
                      <TextField
                        label="Height"
                        value={vitals.height_cm}
                        onChange={(e) => setVitals((v) => ({ ...v, height_cm: e.target.value }))}
                        fullWidth
                        InputLabelProps={{ shrink: true }}
                        placeholder="cm"
                      />
                    </Grid>
                    <Grid size={{ xs: 6, md: 4 }}>
                      <TextField
                        label="BMI"
                        value={vitals.bmi}
                        fullWidth
                        InputLabelProps={{ shrink: true }}
                        InputProps={{ readOnly: true }}
                      />
                    </Grid>
                  </Grid>
                </Box>
              ) : null}
              {triageRoute === "laboratory" ? (
                <Box sx={{ mt: 1 }}>
                  <Typography variant="subtitle2" fontWeight={800} sx={{ mb: 1 }}>
                    Laboratory &amp; imaging
                  </Typography>
                  <TextField
                    label="Notes (optional)"
                    value={triageComplaint}
                    onChange={(e) => setTriageComplaint(e.target.value)}
                    fullWidth
                    InputLabelProps={{ shrink: true }}
                    multiline
                    minRows={2}
                    placeholder="e.g. fasting lipid panel, doctor request"
                    sx={{ mb: 1.5 }}
                  />
                  {labLoading ? (
                    <CircularProgress size={24} />
                  ) : (
                    <>
                      <Tabs
                        value={labSubTab}
                        onChange={(_, v) => setLabSubTab(v)}
                        variant="scrollable"
                        scrollButtons="auto"
                        sx={{ minHeight: 40, borderBottom: 1, borderColor: "divider" }}
                      >
                        <Tab label="Individual tests" sx={{ textTransform: "none", fontWeight: 700 }} />
                        <Tab label="Packages" sx={{ textTransform: "none", fontWeight: 700 }} />
                        <Tab label="Imaging" sx={{ textTransform: "none", fontWeight: 700 }} />
                      </Tabs>
                      <Box
                        sx={{
                          maxHeight: 300,
                          overflow: "auto",
                          border: "1px solid",
                          borderColor: "divider",
                          borderTop: "none",
                          borderRadius: "0 0 8px 8px",
                          p: 1,
                        }}
                      >
                        {labSubTab === 0 ? (
                          <LabOrderCatalogSections
                            layout="stack"
                            sections={labSections}
                            catalogTests={labCatalogTests}
                            selectedTestIds={selectedLabTestIds}
                            onToggleTest={toggleLabTestSelection}
                            priceByTestId={labPriceByTestId}
                            testsCoveredByPackages={testsCoveredBySelectedPackages}
                          />
                        ) : null}
                        {labSubTab === 1 ? (
                          <>
                            {labPackages.length === 0 ? (
                              <Typography variant="body2" color="text.secondary">
                                No active laboratory packages. Configure them under Settings → Laboratory → Packages.
                              </Typography>
                            ) : (
                              <Grid container spacing={1}>
                                {labPackages.map((pkg) => (
                                  <Grid size={{ xs: 12 }} key={pkg.id}>
                                    <FormControlLabel
                                      control={
                                        <Checkbox
                                          size="small"
                                          checked={selectedLabPackageIds.has(pkg.id)}
                                          onChange={() => toggleLabPackageSelection(pkg)}
                                        />
                                      }
                                      label={
                                        <Stack direction="row" alignItems="baseline" justifyContent="space-between" spacing={1} sx={{ width: "100%", pr: 1 }}>
                                          <Typography variant="body2" fontWeight={600}>
                                            {pkg.name}
                                          </Typography>
                                          <Typography variant="caption" fontWeight={800} color="text.secondary" sx={{ whiteSpace: "nowrap" }}>
                                            {formatMoney2(pkg.package_price)}
                                          </Typography>
                                        </Stack>
                                      }
                                      sx={{ ml: 0, alignItems: "flex-start", width: "100%", mr: 0 }}
                                    />
                                  </Grid>
                                ))}
                              </Grid>
                            )}
                          </>
                        ) : null}
                        {labSubTab === 2 ? (
                          <>
                            {imagingCatalogError ? (
                              <Alert severity="warning">{imagingCatalogError}</Alert>
                            ) : imagingCatalog.length === 0 ? (
                              <Typography variant="body2" color="text.secondary">
                                No imaging studies in the catalog. Add them under Settings → Laboratory → Imaging.
                              </Typography>
                            ) : (
                              <Stack spacing={1.5}>
                                {imagingCatalog.map((c) => {
                                  const row = imagingForm[c.code] ?? { checked: false, view: "" };
                                  const coveredByPackage = imagingCoveredByPackages.has(c.code);
                                  const label = (c.view_field_label ?? "VIEW").trim() || "VIEW";
                                  return (
                                    <Box key={c.code}>
                                      <FormControlLabel
                                        control={
                                          <Checkbox
                                            size="small"
                                            checked={row.checked}
                                            onChange={(_, checked) =>
                                              setImagingForm((prev) => ({
                                                ...prev,
                                                [c.code]: { ...(prev[c.code] ?? { checked: false, view: "" }), checked },
                                              }))
                                            }
                                          />
                                        }
                                        label={
                                          <Stack direction="row" alignItems="baseline" justifyContent="space-between" spacing={1} sx={{ flex: 1, pr: 0.5 }}>
                                            <Typography variant="body2" sx={{ textTransform: "uppercase" }}>
                                              {c.name}
                                            </Typography>
                                            <Typography
                                              variant="caption"
                                              fontWeight={800}
                                              color="text.secondary"
                                              sx={{
                                                whiteSpace: "nowrap",
                                                fontStyle: coveredByPackage ? "italic" : undefined,
                                              }}
                                            >
                                              {coveredByPackage
                                                ? "Included in package"
                                                : formatMoney2(c.default_price)}
                                            </Typography>
                                          </Stack>
                                        }
                                        sx={{ ml: 0, alignItems: "flex-start", width: "100%", mr: 0 }}
                                      />
                                      {c.requires_view_field ? (
                                        <TextField
                                          size="small"
                                          label={label}
                                          value={row.view}
                                          onChange={(e) =>
                                            setImagingForm((prev) => ({
                                              ...prev,
                                              [c.code]: { ...(prev[c.code] ?? { checked: false, view: "" }), view: e.target.value },
                                            }))
                                          }
                                          fullWidth
                                          sx={{ mt: 0.5, pl: { xs: 0, sm: 4 } }}
                                          InputLabelProps={{ shrink: true }}
                                        />
                                      ) : null}
                                    </Box>
                                  );
                                })}
                              </Stack>
                            )}
                          </>
                        ) : null}
                      </Box>
                      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
                        Imaging requests are stored with this check-in. You still need at least one test or package to bill
                        laboratory services.
                      </Typography>
                    </>
                  )}
                </Box>
              ) : null}

              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                <Typography variant="caption" color="text.secondary">
                  Next steps:
                </Typography>
                <Link href="/consultation" style={{ fontSize: "0.75rem" }}>
                  Open Consultation
                </Link>
                <Typography variant="caption" color="text.disabled">
                  ·
                </Typography>
                <Link href="/laboratory" style={{ fontSize: "0.75rem" }}>
                  Open Laboratory
                </Link>
                <Typography variant="caption" color="text.disabled">
                  ·
                </Typography>
                <Link href="/cashier" style={{ fontSize: "0.75rem" }}>
                  Cashier
                </Link>
                {triageRoute === "laboratory" ? (
                  <Typography variant="caption" color="text.secondary" sx={{ width: "100%", mt: 0.5 }}>
                    Laboratory walk-in: patient pays at cashier (scan slip QR). Lab queue shows after payment.
                  </Typography>
                ) : null}
              </Stack>
            </Stack>
          ) : null}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={closeTriage} disabled={triageSaving}>
            Cancel
          </Button>
          <Button variant="contained" onClick={submitTriage} disabled={triageSaving}>
            {triageSaving ? "Saving…" : "Confirm check-in"}
          </Button>
        </DialogActions>
      </Dialog>

      {entranceCounter ? (
        <Box>
          <CounterQueueCard
            counter={entranceCounter}
            tickets={ticketsByCounter.get(String(entranceCounter.id)) ?? []}
            priorityLabel={priorityLabel}
            onCall={handleCall}
            onRecall={handleRecall}
            onOpenTriage={openTriage}
            onComplete={handleComplete}
            busyId={busyId}
            entranceHighlight
          />
        </Box>
      ) : !loadError ? (
        <Alert severity="info">
          No entrance counter matched <code>{getEntranceCounterCode()}</code>. Set{" "}
          <code>NEXT_PUBLIC_RECEPTION_ENTRANCE_COUNTER_CODE</code> in <code>.env.local</code> if needed, then restart the
          dev server.
        </Alert>
      ) : null}
    </Box>
  );
}
