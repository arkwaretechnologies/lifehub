import { parseActiveDeptFromNotes, type QueueActiveDept } from "@/lib/queueActiveDept";
import type { QueueTicketStatus } from "@/lib/queueReception";

/**
 * Must stay in sync with lifehub-queuing `src/queue/queueRecall.ts` (TV announce contract).
 * Recall bumps `queue_tickets.called_at` without changing status so lobby boards re-announce.
 */
export const RECALLABLE_QUEUE_STATUSES: QueueTicketStatus[] = ["Called", "Serving", "Collected"];

/** Statuses that may trigger a voice announcement when `called_at` changes on the TV. */
export const ANNOUNCE_ON_CALLED_AT_STATUSES: QueueTicketStatus[] = [
  "Called",
  "Serving",
  "Collected",
  "Captured",
];

export type ActiveDeptSnap = QueueActiveDept;

export type TicketSnapshot = {
  status: string;
  called_at: string | null;
  active_dept: ActiveDeptSnap;
};

export type QueueTicketForAnnounce = {
  id: string;
  status: QueueTicketStatus;
  called_at: string | null;
  issued_at: string;
  notes?: string | null;
};

export function snapshotActiveDept(notes: string | null | undefined): ActiveDeptSnap {
  return parseActiveDeptFromNotes(notes);
}

export function ticketSnapshotFromTicket(
  ticket: Pick<QueueTicketForAnnounce, "status" | "called_at" | "notes">,
): TicketSnapshot {
  return {
    status: ticket.status,
    called_at: ticket.called_at ?? null,
    active_dept: snapshotActiveDept(ticket.notes),
  };
}

export function canRecallQueueTicket(status: QueueTicketStatus): boolean {
  return RECALLABLE_QUEUE_STATUSES.includes(status);
}

export function isRecallableQueueStatus(status: QueueTicketStatus): boolean {
  return RECALLABLE_QUEUE_STATUSES.includes(status);
}

export function shouldAnnounceOnCalledAtChange(status: QueueTicketStatus): boolean {
  return ANNOUNCE_ON_CALLED_AT_STATUSES.includes(status);
}

export function recallQueueButtonTooltip(status: QueueTicketStatus): string {
  if (canRecallQueueTicket(status)) return "Re-announce on queue displays (no status change)";
  if (status === "Waiting") return "Call the patient first";
  if (status === "Completed") return "Visit completed";
  return "Recall is only available after the patient has been called";
}

/** Compare timestamps even when formatting differs (+00:00 vs Z). */
export function calledAtTimestampChanged(
  prev: string | null | undefined,
  next: string | null | undefined,
): boolean {
  if (prev === next) return false;
  if (!prev || !next) return Boolean(prev) !== Boolean(next);
  const p = Date.parse(prev);
  const n = Date.parse(next);
  if (!Number.isNaN(p) && !Number.isNaN(n)) return p !== n;
  return prev !== next;
}

/**
 * True when LifeHub called the patient, bumped `called_at` for recall, or routed LAB↔IMAG.
 * TV app mirrors this logic for lobby announcements.
 */
export function ticketNeedsAnnouncement(
  ticket: Pick<QueueTicketForAnnounce, "called_at" | "status" | "notes">,
  prev: TicketSnapshot | undefined,
  options?: { fromRealtime?: boolean },
): boolean {
  if (!shouldAnnounceOnCalledAtChange(ticket.status)) return false;

  const activeDept = snapshotActiveDept(ticket.notes);

  if (!prev) {
    return Boolean(options?.fromRealtime && ticket.status === "Called");
  }

  if (prev.active_dept !== activeDept) return true;

  if (!ticket.called_at) {
    return (
      !shouldAnnounceOnCalledAtChange(prev.status as QueueTicketStatus) &&
      shouldAnnounceOnCalledAtChange(ticket.status)
    );
  }

  if (calledAtTimestampChanged(prev.called_at, ticket.called_at)) return true;
  return (
    !shouldAnnounceOnCalledAtChange(prev.status as QueueTicketStatus) &&
    shouldAnnounceOnCalledAtChange(ticket.status)
  );
}

export function pickTicketToAnnounce(
  tickets: QueueTicketForAnnounce[],
  snapshot: Map<string, TicketSnapshot>,
): QueueTicketForAnnounce | null {
  const candidates = tickets.filter((t) => ticketNeedsAnnouncement(t, snapshot.get(t.id)));
  if (!candidates.length) return null;
  return (
    candidates.sort((a, b) => {
      const aKey = a.called_at ?? a.issued_at;
      const bKey = b.called_at ?? b.issued_at;
      return String(bKey).localeCompare(String(aKey));
    })[0] ?? null
  );
}

export function announcementSpeakKey(
  ticketId: string,
  calledAt: string | null | undefined,
  activeDept: ActiveDeptSnap,
): string {
  return `${ticketId}:${calledAt ?? ""}:${activeDept ?? ""}`;
}