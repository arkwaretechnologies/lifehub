/** Rows eligible for physician Appointments “call first” queue (minimal fields). */
export type WaitingQueueTicketCandidate = {
  id: string;
  counter_id?: string | number | null;
  issued_at?: string | null;
};

function issuedAtSortKey(issued_at?: string | null): string {
  return (issued_at ?? "").trim();
}

function compareByIssuedAt(a: WaitingQueueTicketCandidate, b: WaitingQueueTicketCandidate): number {
  return issuedAtSortKey(a.issued_at).localeCompare(issuedAtSortKey(b.issued_at));
}

/**
 * Prefer the physician's clinic counter; otherwise earliest non-diagnostic Waiting ticket.
 * Skips LAB/IMAG counters so Appointments does not call diagnostic queue numbers.
 */
export function pickPhysicianWaitingTicket(
  candidates: WaitingQueueTicketCandidate[],
  physicianCounterIds: Set<string>,
  diagnosticCounterIds: Set<string>,
): WaitingQueueTicketCandidate | null {
  if (candidates.length === 0) return null;

  const onPhysician = candidates.filter((c) => {
    const id = c.counter_id != null && c.counter_id !== "" ? String(c.counter_id) : "";
    return id && physicianCounterIds.has(id);
  });
  if (onPhysician.length > 0) {
    return onPhysician.sort(compareByIssuedAt)[0] ?? null;
  }

  const nonDiagnostic = candidates.filter((c) => {
    const id = c.counter_id != null && c.counter_id !== "" ? String(c.counter_id) : "";
    return !id || !diagnosticCounterIds.has(id);
  });
  if (nonDiagnostic.length > 0) {
    return nonDiagnostic.sort(compareByIssuedAt)[0] ?? null;
  }

  return null;
}