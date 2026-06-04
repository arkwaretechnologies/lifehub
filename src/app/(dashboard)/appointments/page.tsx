"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Alert,
  alpha,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  IconButton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from "@mui/material";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import { formatDateMMDDYYYY } from "@/lib/dateDisplay";
import { numericSessionUserId } from "@/lib/sessionUserId";
import { fetchEncountersForPhysician, type PhysicianAppointmentRow } from "@/lib/consultationData";
import {
  callQueueForEncounterFromApi,
  fetchReceptionQueueStateFromApi,
  patchReceptionQueueTicket,
  recallQueueTicketAnnounce,
  subscribeQueueTickets,
} from "@/lib/queueReception";
import { canRecallQueueTicket, recallQueueButtonTooltip } from "@/lib/queueRecall";

const APPOINTMENTS_ENCOUNTER_LIMIT = 200;

export default function AppointmentsPage() {
  const router = useRouter();
  const { user, profile, loading: authLoading } = useAuth();
  const physicianUserId = numericSessionUserId(profile, user);

  const [appointmentRows, setAppointmentRows] = useState<PhysicianAppointmentRow[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState("");
  const [callingTransId, setCallingTransId] = useState<string | null>(null);
  const [recallingTicketId, setRecallingTicketId] = useState<string | null>(null);
  const [callError, setCallError] = useState("");

  const waitingRows = useMemo(
    () => appointmentRows.filter((r) => r.hasWaitingQueueToday),
    [appointmentRows],
  );
  const calledRows = useMemo(
    () => appointmentRows.filter((r) => r.hasCalledOrServingQueueToday),
    [appointmentRows],
  );
  const otherRows = useMemo(
    () =>
      appointmentRows.filter(
        (r) =>
          !r.hasWaitingQueueToday &&
          r.calledQueueTicketStatus === "Called" &&
          r.statusLabel.trim().toLowerCase() !== "completed",
      ),
    [appointmentRows],
  );

  const reloadEncounters = useCallback(async (): Promise<PhysicianAppointmentRow[]> => {
    if (physicianUserId == null) return [];
    const res = await fetchEncountersForPhysician(physicianUserId, { limit: APPOINTMENTS_ENCOUNTER_LIMIT });
    if (!res.error) {
      setAppointmentRows(res.rows);
      return res.rows;
    }
    return [];
  }, [physicianUserId]);

  useEffect(() => {
    if (authLoading) return;
    if (physicianUserId == null) {
      setListLoading(false);
      setAppointmentRows([]);
      setListError("");
      return;
    }
    let cancelled = false;
    setListLoading(true);
    setListError("");
    void fetchEncountersForPhysician(physicianUserId, { limit: APPOINTMENTS_ENCOUNTER_LIMIT }).then((res) => {
      if (cancelled) return;
      setListLoading(false);
      if (res.error) {
        setListError(res.error);
        setAppointmentRows([]);
        return;
      }
      setAppointmentRows(res.rows);
    });
    return () => {
      cancelled = true;
    };
  }, [authLoading, physicianUserId]);

  useEffect(() => {
    if (authLoading || physicianUserId == null) return;

    let cancelled = false;
    let unsub: (() => void) | undefined;
    let poll: number | undefined;

    void (async () => {
      const data = await fetchReceptionQueueStateFromApi();
      if (cancelled) return;
      const idSet = new Set<string>();
      for (const c of data.counters) {
        idSet.add(String(c.id));
      }
      if (data.entranceCounter) {
        idSet.add(String(data.entranceCounter.id));
      }
      const idList = [...idSet];
      if (idList.length === 0) return;

      unsub = subscribeQueueTickets(idList, () => {
        void reloadEncounters();
      });
      poll = window.setInterval(() => {
        void reloadEncounters();
      }, 45_000);
    })();

    return () => {
      cancelled = true;
      unsub?.();
      if (poll != null) window.clearInterval(poll);
    };
  }, [authLoading, physicianUserId, reloadEncounters]);

  async function handleRecall(row: PhysicianAppointmentRow) {
    const ticketId = row.calledQueueTicketId?.trim();
    if (!ticketId || !canRecallQueueTicket(row.calledQueueTicketStatus ?? "Waiting")) return;
    setCallError("");
    setRecallingTicketId(ticketId);
    try {
      const res = await recallQueueTicketAnnounce(ticketId);
      if (res.error) setCallError(res.error);
    } finally {
      setRecallingTicketId(null);
    }
  }

  async function handleClickToCall(row: PhysicianAppointmentRow) {
    if (physicianUserId == null) return;
    setCallError("");
    setCallingTransId(row.transId);
    try {
      if (row.waitingQueueTicketId) {
        const { error } = await patchReceptionQueueTicket(row.waitingQueueTicketId, "call");
        if (error) {
          setCallError(error);
          return;
        }
      } else {
        const res = await callQueueForEncounterFromApi(row.transId, physicianUserId);
        if (res.error) {
          setCallError(res.error);
          return;
        }
      }

      await reloadEncounters();
      router.push(`/consultation/${encodeURIComponent(row.transId)}`);
    } finally {
      setCallingTransId(null);
    }
  }

  const showAuthSpinner = authLoading;
  const showListSpinner = !authLoading && listLoading;
  const noUserId = !authLoading && physicianUserId == null;

  return (
    <>
      <Typography variant="h5" sx={{ mb: 3 }}>
        Appointments
      </Typography>

      {noUserId && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          Unable to determine your user account. Encounters cannot be loaded.
        </Alert>
      )}

      {listError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {listError}
        </Alert>
      )}

      {callError && (
        <Alert severity="warning" sx={{ mb: 2 }} onClose={() => setCallError("")}>
          {callError}
        </Alert>
      )}

      {(showAuthSpinner || showListSpinner) && (
        <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
          <CircularProgress size={36} />
        </Box>
      )}

      {physicianUserId != null && !showAuthSpinner && !showListSpinner ? (
        <Stack spacing={3}>
          <Card elevation={0} sx={{ border: (theme) => `1px solid ${alpha(theme.palette.divider, 0.12)}` }}>
            <CardContent sx={{ py: 2, px: 2.5 }}>
              <Typography variant="subtitle1" fontWeight={800} sx={{ mb: 0.5 }}>
                Queue — call first
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 2 }}>
                Today&apos;s numbers still in <strong>Waiting</strong>. After a successful call you are taken to the
                same consultation screen as <strong>Open visit</strong>. The visit also appears under{" "}
                <strong>Queue — patient called</strong> if you return here.
              </Typography>
              {waitingRows.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  No visits waiting to be called.
                </Typography>
              ) : (
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Name</TableCell>
                        <TableCell>Date</TableCell>
                        <TableCell>Time</TableCell>
                        <TableCell>Queue</TableCell>
                        <TableCell>Chief complaint</TableCell>
                        <TableCell>Visit</TableCell>
                        <TableCell align="right">Actions</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {waitingRows.map((row) => (
                        <TableRow key={row.transId}>
                          <TableCell>{row.patientName}</TableCell>
                          <TableCell>{formatDateMMDDYYYY(row.encounterDate) || "—"}</TableCell>
                          <TableCell>{row.encounterTime || "—"}</TableCell>
                          <TableCell>{row.waitingQueueDisplay ?? row.queueNo ?? "—"}</TableCell>
                          <TableCell>{row.chiefComplaint ?? "—"}</TableCell>
                          <TableCell>
                            <Chip
                              label={row.statusLabel}
                              color={row.statusChipColor}
                              size="small"
                              variant="outlined"
                            />
                          </TableCell>
                          <TableCell align="right">
                            <Button
                              variant="contained"
                              size="small"
                              disabled={physicianUserId == null || callingTransId !== null}
                              onClick={() => void handleClickToCall(row)}
                              sx={{ textTransform: "none", fontWeight: 700 }}
                            >
                              {callingTransId === row.transId ? "Calling…" : "Click to Call"}
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

          <Card elevation={0} sx={{ border: (theme) => `1px solid ${alpha(theme.palette.divider, 0.12)}` }}>
            <CardContent sx={{ py: 2, px: 2.5 }}>
              <Typography variant="subtitle1" fontWeight={800} sx={{ mb: 0.5 }}>
                Queue — patient called (open visit)
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 2 }}>
                Today&apos;s queue is <strong>Called</strong> or <strong>Serving</strong>. Open the visit from here.
              </Typography>
              {calledRows.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  No called visits yet. They appear here after you use Click to Call.
                </Typography>
              ) : (
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Name</TableCell>
                        <TableCell>Date</TableCell>
                        <TableCell>Time</TableCell>
                        <TableCell>Queue</TableCell>
                        <TableCell>Queue status</TableCell>
                        <TableCell>Chief complaint</TableCell>
                        <TableCell>Visit</TableCell>
                        <TableCell align="right">Actions</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {calledRows.map((row) => (
                        <TableRow key={row.transId}>
                          <TableCell>{row.patientName}</TableCell>
                          <TableCell>{formatDateMMDDYYYY(row.encounterDate) || "—"}</TableCell>
                          <TableCell>{row.encounterTime || "—"}</TableCell>
                          <TableCell>{row.calledQueueDisplay ?? row.queueNo ?? "—"}</TableCell>
                          <TableCell>
                            <Chip
                              label={row.calledQueueTicketStatus ?? "—"}
                              color={row.calledQueueTicketStatus === "Serving" ? "success" : "info"}
                              size="small"
                              sx={{ fontWeight: 600 }}
                            />
                          </TableCell>
                          <TableCell>{row.chiefComplaint ?? "—"}</TableCell>
                          <TableCell>
                            <Chip
                              label={row.statusLabel}
                              color={row.statusChipColor}
                              size="small"
                              variant="outlined"
                            />
                          </TableCell>
                          <TableCell align="right">
                            <Stack direction="row" spacing={1} justifyContent="flex-end" flexWrap="wrap" useFlexGap>
                              {row.calledQueueTicketId &&
                              row.calledQueueTicketStatus &&
                              canRecallQueueTicket(row.calledQueueTicketStatus) ? (
                                <Tooltip title={recallQueueButtonTooltip(row.calledQueueTicketStatus)}>
                                  <span>
                                    <Button
                                      size="small"
                                      variant="outlined"
                                      color="secondary"
                                      disabled={callingTransId !== null || recallingTicketId !== null}
                                      onClick={() => void handleRecall(row)}
                                      sx={{ textTransform: "none", fontWeight: 700 }}
                                    >
                                      {recallingTicketId === row.calledQueueTicketId ? "Recalling…" : "Recall"}
                                    </Button>
                                  </span>
                                </Tooltip>
                              ) : null}
                              <Button
                                component={Link}
                                href={`/consultation/${encodeURIComponent(row.transId)}`}
                                prefetch={false}
                                size="small"
                                variant="contained"
                                disabled={callingTransId !== null || recallingTicketId !== null}
                                sx={{ textTransform: "none", fontWeight: 700 }}
                              >
                                Open visit
                              </Button>
                            </Stack>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </CardContent>
          </Card>

          <Card elevation={0} sx={{ border: (theme) => `1px solid ${alpha(theme.palette.divider, 0.12)}` }}>
            <CardContent sx={{ py: 2, px: 2.5 }}>
              <Typography variant="subtitle1" fontWeight={800} sx={{ mb: 0.5 }}>
                Other assigned visits
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 2 }}>
                Encounters assigned to you with a <strong>today</strong> queue ticket in <strong>Called</strong>.
              </Typography>
              {otherRows.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  None in the last {APPOINTMENTS_ENCOUNTER_LIMIT} encounters.
                </Typography>
              ) : (
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Name</TableCell>
                        <TableCell>Date</TableCell>
                        <TableCell>Time</TableCell>
                        <TableCell>Chief complaint</TableCell>
                        <TableCell>Visit</TableCell>
                        <TableCell align="right">Actions</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {otherRows.map((row) => (
                        <TableRow key={row.transId}>
                          <TableCell>{row.patientName}</TableCell>
                          <TableCell>{formatDateMMDDYYYY(row.encounterDate) || "—"}</TableCell>
                          <TableCell>{row.encounterTime || "—"}</TableCell>
                          <TableCell>{row.chiefComplaint ?? "—"}</TableCell>
                          <TableCell>
                            <Chip
                              label={row.statusLabel}
                              color={row.statusChipColor}
                              size="small"
                              variant="outlined"
                            />
                          </TableCell>
                          <TableCell align="right">
                            <Button
                              component={Link}
                              href={`/consultation/${encodeURIComponent(row.transId)}`}
                              prefetch={false}
                              size="small"
                              variant="outlined"
                              disabled={callingTransId !== null}
                              sx={{ textTransform: "none", fontWeight: 700 }}
                            >
                              Open visit
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
        </Stack>
      ) : null}
    </>
  );
}
