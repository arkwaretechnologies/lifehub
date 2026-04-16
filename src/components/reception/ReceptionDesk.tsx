"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
  Radio,
  RadioGroup,
  Stack,
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
import RefreshIcon from "@mui/icons-material/Refresh";
import VolumeUpOutlinedIcon from "@mui/icons-material/VolumeUpOutlined";
import {
  announceQueueNumber,
  createPatientFromApi,
  fetchReceptionQueueStateFromApi,
  finalizeReceptionLabCheckinFromApi,
  getEntranceCounterCode,
  parseReceptionRouteFromNotes,
  patchReceptionQueueTicket,
  prepareReceptionLabCheckinFromApi,
  searchPatientsFromApi,
  subscribeQueueTickets,
  type QueueCounterRow,
  type QueuePriorityRow,
  type ReceptionPatientSearchRow,
  type QueueTicketRow,
  type QueueTicketStatus,
  type ReceptionTriageRoute,
} from "@/lib/queueReception";
import PatientAddDialog from "@/components/patient/PatientAddDialog";
import { fetchLabCatalogGrouped, fetchLabTestUnitPricesByIds, fetchLabTestsByIds, type LabCatalogSection } from "@/lib/labTests";
import { PaymentModal, type PaymentModalSummaryRow } from "@/components/cashier/PaymentModal";
import { createLabSaleWithItems, generateNextDailyOrNumber } from "@/lib/cashierPayments";
import { fetchActivePaymentMethods, type PaymentMethodRow } from "@/lib/paymentMethods";
import { fetchActiveDiscountTypes, type DiscountTypeRow } from "@/lib/discountTypes";
import { openReceptionQueueReceiptPrint } from "@/lib/receptionQueueReceiptPrint";
import { sanitizePatientSearchQuery } from "@/lib/patientsCatalog";

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

type LabCheckoutPending = {
  entranceTicketId: string;
  transId: string;
  labRequestId: string;
  patient: { id: number; name: string; contact_no: string | null };
  patientDisplayName: string;
  labTestIds: string[];
  /** Line items for PaymentModal (matches consultation lab_service_prices). */
  paymentSummaryRows: PaymentModalSummaryRow[];
};

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
  onOpenTriage,
  onComplete,
  onAnnounceOnly,
  busyId,
  entranceHighlight,
}: {
  counter: QueueCounterRow;
  tickets: QueueTicketRow[];
  priorityLabel: (priorityId: number) => string;
  onCall: (t: QueueTicketRow) => void;
  onOpenTriage: (t: QueueTicketRow) => void;
  onComplete: (t: QueueTicketRow) => void;
  onAnnounceOnly: (t: QueueTicketRow) => void;
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
        {entranceHighlight ? (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
            Kiosk numbers for today. Click a <strong>Waiting</strong> row to call them forward; when they are at the desk,
            use <strong>Check in &amp; triage</strong> for mini triage and doctor vs lab routing.
          </Typography>
        ) : counter.description ? (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
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
                      <Tooltip title="Announce again">
                        <span>
                          <IconButton
                            size="small"
                            onClick={() => onAnnounceOnly(t)}
                            disabled={busyId !== null}
                            color="default"
                          >
                            <VolumeUpOutlinedIcon fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
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
            {entranceHighlight ? `Waiting at entrance (${waiting.length})` : `Waiting (${waiting.length})`}
          </Typography>
          {waiting.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 2, textAlign: "center" }}>
              {entranceHighlight ? "No entrance tickets waiting — new numbers appear when issued at the kiosk." : "Queue is clear"}
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
  const [labLoading, setLabLoading] = useState(false);
  const [selectedLabTestIds, setSelectedLabTestIds] = useState<Set<string>>(new Set());
  const doctorQueueOptions = useMemo(() => parseReceptionDoctorQueueOptions(), []);
  const [doctorCounterCode, setDoctorCounterCode] = useState(() => doctorQueueOptions[0]?.code ?? "CLINIC 1");
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodRow[]>([]);
  const [discountTypes, setDiscountTypes] = useState<DiscountTypeRow[]>([]);
  const [labCheckout, setLabCheckout] = useState<LabCheckoutPending | null>(null);
  const [labPayOpen, setLabPayOpen] = useState(false);
  const [labPayModalKey, setLabPayModalKey] = useState(0);
  const [labPayBusy, setLabPayBusy] = useState(false);
  const [labPayError, setLabPayError] = useState("");
  const [labTotalDue, setLabTotalDue] = useState(0);
  const [labTotalLoading, setLabTotalLoading] = useState(false);

  const priorityLabel = useCallback(
    (id: number) => {
      const p = priorities.find((x) => x.id === id);
      return p?.name ?? p?.code ?? `Priority ${id}`;
    },
    [priorities],
  );

  const refresh = useCallback(async () => {
    const data = await fetchReceptionQueueStateFromApi();
    setLoadError(data.error);
    setApiWarnings(data.warnings);
    setCounters(data.counters);
    setEntranceCounter(data.entranceCounter);
    setPriorities(data.priorities);
    setTickets(data.tickets);
  }, []);

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
    let cancelled = false;
    void (async () => {
      const [pm, dt] = await Promise.all([fetchActivePaymentMethods(), fetchActiveDiscountTypes()]);
      if (cancelled) return;
      if (!pm.error) setPaymentMethods(pm.methods);
      if (!dt.error) setDiscountTypes(dt.discounts);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const ids = new Set<string>(counters.map((c) => String(c.id)));
    if (entranceCounter) ids.add(String(entranceCounter.id));
    const idList = [...ids];
    if (idList.length === 0) return () => {};

    const unsub = subscribeQueueTickets(
      idList,
      () => {
        void refresh();
      },
      (subscribed) => setRtConnected(subscribed),
    );

    const poll = window.setInterval(() => {
      void refresh();
    }, 45_000);

    return () => {
      unsub();
      window.clearInterval(poll);
    };
  }, [counters, entranceCounter, refresh]);

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

  const handleCall = (counter: QueueCounterRow, t: QueueTicketRow) => {
    void (async () => {
      setBusyId(t.id);
      try {
        const { error } = await patchReceptionQueueTicket(t.id, "call");
        if (error) setLoadError(error);
        else announceQueueNumber(t.queue_display, counter.name, t.patient_name);
        await refresh();
      } finally {
        setBusyId(null);
      }
    })();
  };

  const handleAnnounceOnly = (_counter: QueueCounterRow, t: QueueTicketRow) => {
    announceQueueNumber(t.queue_display, _counter.name, t.patient_name);
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
    setDoctorCounterCode(doctorQueueOptions[0]?.code ?? "CLINIC 1");
  };

  const closeTriage = () => {
    if (triageSaving) return;
    setTriageTicket(null);
  };

  useEffect(() => {
    if (triageTicket && triageRoute === "laboratory" && labSections.length === 0) {
      void (async () => {
        setLabLoading(true);
        const { sections, error } = await fetchLabCatalogGrouped();
        if (!error) setLabSections(sections);
        setLabLoading(false);
      })();
    }
  }, [triageTicket, triageRoute, labSections.length]);

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
          if (selectedLabTestIds.size === 0) {
            setPatientError("Select at least one laboratory test.");
            return;
          }
          const labTestIds = [...selectedLabTestIds];
          const prep = await prepareReceptionLabCheckinFromApi({
            ticketId: triageTicket.id,
            triageNotes: triageComplaint.trim(),
            priorNotes: triageTicket.notes,
            patient: {
              id: selectedPatient.id,
              name: selectedPatient.name ?? "",
              contact_no: selectedPatient.contact_no,
            },
            labTestIds,
          });
          if (prep.error) {
            setLoadError(prep.error);
            return;
          }
          if (!prep.transId || !prep.labRequestId) {
            setLoadError("Server did not return lab checkout identifiers.");
            return;
          }
          setLabTotalLoading(true);
          const pr = await fetchLabTestUnitPricesByIds(labTestIds);
          setLabTotalLoading(false);
          if (pr.error) {
            setLoadError(pr.error);
            return;
          }
          let sum = 0;
          for (const id of labTestIds) {
            sum += pr.unitPriceById.get(id) ?? 0;
          }
          setLabTotalDue(sum);
          setLabPayError("");
          const namesRes = await fetchLabTestsByIds(labTestIds);
          const paymentSummaryRows: PaymentModalSummaryRow[] = labTestIds.map((id) => ({
            label: namesRes.error ? `Lab test (${id.slice(0, 8)}…)` : (namesRes.testsById.get(id)?.name ?? "Lab test"),
            amount: pr.unitPriceById.get(id) ?? 0,
          }));
          setLabCheckout({
            entranceTicketId: triageTicket.id,
            transId: prep.transId,
            labRequestId: prep.labRequestId,
            patient: {
              id: selectedPatient.id,
              name: selectedPatient.name ?? "",
              contact_no: selectedPatient.contact_no,
            },
            patientDisplayName: selectedPatient.name ?? "Patient",
            labTestIds,
            paymentSummaryRows,
          });
          setLabPayModalKey((k) => k + 1);
          setLabPayOpen(true);
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

  const handleLabPaymentConfirm = async (args: {
    paymentMethod: PaymentMethodRow;
    orNumber: string;
    discountType: DiscountTypeRow | null;
    discountMode: "pct" | "amount";
    discountPct: number;
    discountAmount: number;
    amountTendered: number | null;
    changeAmount: number | null;
  }) => {
    const pending = labCheckout;
    if (!pending) return;
    setLabPayBusy(true);
    setLabPayError("");
    try {
      const priceRes = await fetchLabTestUnitPricesByIds(pending.labTestIds);
      if (priceRes.error) throw new Error(priceRes.error);
      const items = pending.labTestIds.map((id) => ({
        lab_test_id: id,
        quantity: 1,
        unit_price: priceRes.unitPriceById.get(id) ?? 0,
        discount: 0,
        notes: null as string | null,
      }));
      const grandSubtotal = items.reduce((s, it) => s + it.quantity * it.unit_price - it.discount, 0);
      const totalDiscount =
        args.discountMode === "amount"
          ? Math.min(Math.max(0, args.discountAmount), grandSubtotal)
          : Math.min(Math.max(0, (grandSubtotal * Math.max(0, args.discountPct)) / 100), grandSubtotal);

      const saleRes = await createLabSaleWithItems({
        labRequestId: pending.labRequestId,
        patientId: pending.patient.id,
        orNumber: args.orNumber.trim(),
        paymentMethodId: args.paymentMethod.id,
        amountTendered: args.amountTendered,
        changeAmount: args.changeAmount,
        discountTypeId: args.discountMode === "pct" ? args.discountType?.id ?? null : null,
        discountAmount: totalDiscount,
        items,
      });
      if (saleRes.error) throw new Error(saleRes.error);

      const fin = await finalizeReceptionLabCheckinFromApi({
        entranceTicketId: pending.entranceTicketId,
        transId: pending.transId,
        labRequestId: pending.labRequestId,
        patient: pending.patient,
      });
      if (fin.error) throw new Error(fin.error);

      const tid = fin.transId ?? pending.transId;
      const qd = fin.destinationQueueDisplay ?? "";
      if (tid && qd) {
        await openReceptionQueueReceiptPrint({
          patientName: pending.patientDisplayName,
          destinationLabel: fin.destinationCounterCode ?? "Laboratory",
          queueDisplay: qd,
          transId: tid,
        });
      }

      setLabPayOpen(false);
      setLabCheckout(null);
      await refresh();
    } catch (e) {
      setLabPayError(e instanceof Error ? e.message : "Payment or finalize failed.");
    } finally {
      setLabPayBusy(false);
    }
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
              <Typography sx={{ opacity: 0.88, mt: 0.5, maxWidth: 800, lineHeight: 1.65 }}>
                <strong>Where to call numbers:</strong> use the sidebar <strong>Operations → Reception</strong> (this
                page). In <strong>Entrance — available to call</strong>, click any <strong>Waiting</strong> row to call
                that queue number to the desk. When the patient arrives, click <strong>Check in &amp; triage</strong> to
                record mini triage and send them to <strong>Consultation</strong> or <strong>Laboratory</strong>. Click{" "}
                <strong>Done</strong> when they leave reception.
              </Typography>
              <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mt: 1.5 }} useFlexGap>
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

      {labCheckout && !labPayOpen ? (
        <Alert
          severity="warning"
          sx={{ mb: 2 }}
          action={
            <Button
              color="inherit"
              size="small"
              disabled={paymentMethods.length === 0 || labTotalLoading}
              onClick={() => {
                setLabPayError("");
                setLabPayModalKey((k) => k + 1);
                setLabPayOpen(true);
              }}
            >
              Pay now
            </Button>
          }
        >
          Laboratory order is saved for this visit. Complete payment to issue the lab queue ticket and close the entrance
          ticket.
        </Alert>
      ) : null}

      <PaymentModal
        key={labPayModalKey}
        open={labPayOpen}
        title="Pay — laboratory check-in"
        paymentMethods={paymentMethods}
        discountTypes={discountTypes}
        busy={labPayBusy || labTotalLoading}
        errorText={labPayError}
        onGenerateOrNumber={async () => {
          const res = await generateNextDailyOrNumber();
          if (res.error || !res.orNumber) throw new Error(res.error ?? "Could not generate OR number.");
          return res.orNumber;
        }}
        onClose={() => setLabPayOpen(false)}
        totalDue={labTotalDue}
        summaryRows={
          labCheckout && labCheckout.paymentSummaryRows.length > 0
            ? labCheckout.paymentSummaryRows
            : [{ label: "Laboratory tests", amount: labTotalDue }]
        }
        onConfirm={(args) => handleLabPaymentConfirm(args)}
      />

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
                    <TextField
                      label="Search patient (name or contact no)"
                      value={patientQuery}
                      onChange={(e) => {
                        setPatientQuery(e.target.value);
                        setPatientError(null);
                      }}
                      fullWidth
                      placeholder="e.g. JUAN DELA CRUZ or 09xxxxxxxxx"
                      slotProps={{
                        input: {
                          sx: {
                            "& .MuiInputBase-input": {
                              paddingTop: "16px",
                              paddingBottom: "16px",
                            },
                          },
                        },
                      }}
                    />
                    {patientLoading ? (
                      <Typography variant="caption" color="text.secondary">
                        Searching…
                      </Typography>
                    ) : (
                      <Typography variant="caption" color="text.secondary">
                        Type at least <strong>2 characters</strong> to search by name, contact, or id (up to 80 matches).
                        Results appear only after you search.
                      </Typography>
                    )}
                    {patientError ? <Alert severity="warning">{patientError}</Alert> : null}
                    {patientResults.length > 0 ? (
                      <Stack spacing={0.75}>
                        {patientResults.map((p) => (
                          <Button
                            key={p.id}
                            variant="outlined"
                            onClick={() => {
                              setSelectedPatient(p);
                              setPatientResults([]);
                              setPatientQuery("");
                              setPatientError(null);
                            }}
                            sx={{ justifyContent: "space-between" }}
                          >
                            <span style={{ fontWeight: 700, textAlign: "left" }}>
                              {(p.name ?? "Unnamed").toUpperCase()}
                            </span>
                            <span style={{ opacity: 0.72 }}>
                              #{p.id}{p.contact_no ? ` · ${p.contact_no}` : ""}
                            </span>
                          </Button>
                        ))}
                      </Stack>
                    ) : null}
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
                  onChange={(e) => setTriageRoute(e.target.value as ReceptionTriageRoute)}
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
                      <TextField
                        label="BP"
                        value={vitals.bp}
                        onChange={(e) => setVitals((v) => ({ ...v, bp: e.target.value }))}
                        fullWidth
                        placeholder="120/80"
                        slotProps={{
                          input: {
                            sx: {
                              "& .MuiInputBase-input": {
                                paddingTop: "16px",
                                paddingBottom: "16px",
                              },
                            },
                          },
                        }}
                      />
                    </Grid>
                    <Grid size={{ xs: 6, md: 4 }}>
                      <TextField
                        label="HR"
                        value={vitals.hr}
                        onChange={(e) => setVitals((v) => ({ ...v, hr: e.target.value }))}
                        fullWidth
                        placeholder="bpm"
                        slotProps={{
                          input: {
                            sx: {
                              "& .MuiInputBase-input": {
                                paddingTop: "16px",
                                paddingBottom: "16px",
                              },
                            },
                          },
                        }}
                      />
                    </Grid>
                    <Grid size={{ xs: 6, md: 4 }}>
                      <TextField
                        label="RR"
                        value={vitals.rr}
                        onChange={(e) => setVitals((v) => ({ ...v, rr: e.target.value }))}
                        fullWidth
                        placeholder="breaths/min"
                        slotProps={{
                          input: {
                            sx: {
                              "& .MuiInputBase-input": {
                                paddingTop: "16px",
                                paddingBottom: "16px",
                              },
                            },
                          },
                        }}
                      />
                    </Grid>
                    <Grid size={{ xs: 6, md: 4 }}>
                      <TextField
                        label="Temp"
                        value={vitals.temp}
                        onChange={(e) => setVitals((v) => ({ ...v, temp: e.target.value }))}
                        fullWidth
                        placeholder="°C"
                        slotProps={{
                          input: {
                            sx: {
                              "& .MuiInputBase-input": {
                                paddingTop: "16px",
                                paddingBottom: "16px",
                              },
                            },
                          },
                        }}
                      />
                    </Grid>
                    <Grid size={{ xs: 6, md: 4 }}>
                      <TextField
                        label="O2 Sat"
                        value={vitals.o2}
                        onChange={(e) => setVitals((v) => ({ ...v, o2: e.target.value }))}
                        fullWidth
                        placeholder="%"
                        slotProps={{
                          input: {
                            sx: {
                              "& .MuiInputBase-input": {
                                paddingTop: "16px",
                                paddingBottom: "16px",
                              },
                            },
                          },
                        }}
                      />
                    </Grid>
                    <Grid size={{ xs: 6, md: 4 }} />

                    <Grid size={{ xs: 6, md: 4 }}>
                      <TextField
                        label="Weight"
                        value={vitals.weight_kg}
                        onChange={(e) => setVitals((v) => ({ ...v, weight_kg: e.target.value }))}
                        fullWidth
                        placeholder="kg"
                        slotProps={{
                          input: {
                            sx: {
                              "& .MuiInputBase-input": {
                                paddingTop: "16px",
                                paddingBottom: "16px",
                              },
                            },
                          },
                        }}
                      />
                    </Grid>
                    <Grid size={{ xs: 6, md: 4 }}>
                      <TextField
                        label="Height"
                        value={vitals.height_cm}
                        onChange={(e) => setVitals((v) => ({ ...v, height_cm: e.target.value }))}
                        fullWidth
                        placeholder="cm"
                        slotProps={{
                          input: {
                            sx: {
                              "& .MuiInputBase-input": {
                                paddingTop: "16px",
                                paddingBottom: "16px",
                              },
                            },
                          },
                        }}
                      />
                    </Grid>
                    <Grid size={{ xs: 6, md: 4 }}>
                      <TextField
                        label="BMI"
                        value={vitals.bmi}
                        fullWidth
                        InputProps={{ readOnly: true }}
                        slotProps={{
                          input: {
                            sx: {
                              "& .MuiInputBase-input": {
                                paddingTop: "16px",
                                paddingBottom: "16px",
                              },
                            },
                          },
                        }}
                      />
                    </Grid>
                  </Grid>
                </Box>
              ) : null}
              {triageRoute === "laboratory" ? (
                <Box sx={{ mt: 1 }}>
                  <Typography variant="subtitle2" fontWeight={800} sx={{ mb: 1 }}>
                    Laboratory tests
                  </Typography>
                  {labLoading ? (
                    <CircularProgress size={24} />
                  ) : (
                    <Box sx={{ maxHeight: 300, overflow: "auto", border: "1px solid", borderColor: "divider", borderRadius: 1, p: 1 }}>
                      {labSections.map((section) => (
                        <Box key={String(section.category.id)} sx={{ mb: 2 }}>
                          <Typography variant="caption" fontWeight={700} color="primary" sx={{ display: "block", mb: 0.5, textTransform: "uppercase" }}>
                            {section.category.name}
                          </Typography>
                          <Grid container spacing={1}>
                            {section.tests.map((test) => (
                              <Grid size={{ xs: 12, sm: 6 }} key={test.id}>
                                <FormControlLabel
                                  control={
                                    <Checkbox
                                      size="small"
                                      checked={selectedLabTestIds.has(test.id)}
                                      onChange={() => {
                                        setSelectedLabTestIds((prev) => {
                                          const next = new Set(prev);
                                          if (next.has(test.id)) next.delete(test.id);
                                          else next.add(test.id);
                                          return next;
                                        });
                                      }}
                                    />
                                  }
                                  label={<Typography variant="body2">{test.name}</Typography>}
                                  sx={{ ml: 0 }}
                                />
                              </Grid>
                            ))}
                          </Grid>
                        </Box>
                      ))}
                    </Box>
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
            onCall={(t) => handleCall(entranceCounter, t)}
            onOpenTriage={openTriage}
            onComplete={handleComplete}
            onAnnounceOnly={(t) => handleAnnounceOnly(entranceCounter, t)}
            busyId={busyId}
            entranceHighlight
          />
        </Box>
      ) : !loadError ? (
        <Alert severity="info">
          Reception is focused on a single queue list + mini triage. We couldn&apos;t identify which{" "}
          <code>queue_counters</code> row is used for kiosk tickets. If your counter code isn&apos;t{" "}
          <code>{getEntranceCounterCode()}</code>, set <code>NEXT_PUBLIC_RECEPTION_ENTRANCE_COUNTER_CODE</code> in{" "}
          <code>.env.local</code> to the correct code (commonly <code>RECEPTION</code>), then restart{" "}
          <code>npm run dev</code>.
        </Alert>
      ) : null}
    </Box>
  );
}
