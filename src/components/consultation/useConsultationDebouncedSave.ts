"use client";

import { useCallback, useEffect, useRef } from "react";
import { useConsultationActiveTab } from "./consultationTabContext";

const DEFAULT_DELAY_MS = 650;

type Options = {
  /** Tab index this form belongs to (0 = Medical history, 1 = Review of systems, …). */
  ownTabIndex: number;
  hydrated: boolean;
  runPersist: () => void | Promise<void>;
  /** Value that changes when local form state changes (e.g. `form` or `input`). */
  trigger: unknown;
  delayMs?: number;
};

/**
 * Debounced persist while this tab is active. Pauses (and flushes once) when user
 * switches away — e.g. no background autosave while on Physician's record (tab 2).
 */
export function useConsultationDebouncedSave({
  ownTabIndex,
  hydrated,
  runPersist,
  trigger,
  delayMs = DEFAULT_DELAY_MS,
}: Options) {
  const activeTab = useConsultationActiveTab();
  const paused = activeTab !== ownTabIndex;
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const runPersistRef = useRef(runPersist);
  runPersistRef.current = runPersist;

  const stableRun = useCallback(() => {
    void runPersistRef.current();
  }, []);

  const prevPaused = useRef(paused);
  useEffect(() => {
    if (prevPaused.current === false && paused === true && hydrated) {
      void stableRun();
    }
    prevPaused.current = paused;
  }, [paused, hydrated, stableRun]);

  useEffect(() => {
    if (!hydrated || paused) {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      return;
    }
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      void stableRun();
    }, delayMs);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [hydrated, paused, stableRun, delayMs, trigger]);
}
