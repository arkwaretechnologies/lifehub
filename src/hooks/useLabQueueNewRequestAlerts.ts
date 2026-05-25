"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { LabQueueRow } from "@/app/api/laboratory/lab-queue/route";
import { labQueueCode } from "@/lib/diagnosticQueueServer";
import {
  playNotificationChime,
  primeNotificationSound,
} from "@/lib/notificationSound";
import { fetchReceptionQueueStateFromApi, subscribeQueueTickets } from "@/lib/queueReception";

const POLL_MS = 8000;

export type LabQueueNewRequestAlert = {
  ticketId: string;
  queueDisplay: string;
  patientName: string;
  /** When multiple tickets arrive in one refresh. */
  count: number;
};

export function useLabQueueNewRequestAlerts(args: {
  rows: LabQueueRow[];
  refresh: () => Promise<void>;
  enabled?: boolean;
  /** When false, skip detection until the initial queue fetch has finished. */
  ready?: boolean;
}): {
  newRequestAlert: LabQueueNewRequestAlert | null;
  clearNewRequestAlert: () => void;
} {
  const { rows, refresh, enabled = true, ready = true } = args;
  const [newRequestAlert, setNewRequestAlert] = useState<LabQueueNewRequestAlert | null>(null);
  /** null = first rows snapshot (no chime); then tracks known ticket ids. */
  const seenTicketIdsRef = useRef<Set<string> | null>(null);

  const clearNewRequestAlert = useCallback(() => {
    setNewRequestAlert(null);
  }, []);

  useEffect(() => {
    if (!enabled || !ready) return;

    const currentIds = new Set(rows.map((r) => r.id));
    if (seenTicketIdsRef.current === null) {
      seenTicketIdsRef.current = currentIds;
      return;
    }

    const newRows = rows.filter((r) => !seenTicketIdsRef.current!.has(r.id));
    seenTicketIdsRef.current = currentIds;

    if (newRows.length === 0) return;

    void playNotificationChime();
    const primary = newRows[newRows.length - 1]!;
    setNewRequestAlert({
      ticketId: primary.id,
      queueDisplay: (primary.queue_display ?? "—").trim() || "—",
      patientName: (primary.patient_name ?? "—").trim() || "—",
      count: newRows.length,
    });
  }, [rows, enabled, ready]);

  useEffect(() => {
    if (!enabled) return;

    primeNotificationSound();

    let cancelled = false;
    let unsub: (() => void) | undefined;
    let poll: ReturnType<typeof setInterval> | undefined;

    void (async () => {
      const data = await fetchReceptionQueueStateFromApi();
      if (cancelled) return;

      const code = labQueueCode();
      const labCounter = data.counters.find(
        (c) => String(c.code ?? "").trim().toUpperCase() === code,
      );
      const counterId = labCounter?.id;
      if (counterId == null) return;

      unsub = subscribeQueueTickets([String(counterId)], () => {
        void refresh();
      });

      poll = setInterval(() => {
        void refresh();
      }, POLL_MS);
    })();

    return () => {
      cancelled = true;
      unsub?.();
      if (poll != null) clearInterval(poll);
    };
  }, [enabled, refresh]);

  return { newRequestAlert, clearNewRequestAlert };
}
