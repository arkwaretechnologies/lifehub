"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";

type SaveHandler = () => void | Promise<void>;

type ConsultationSaveContextValue = {
  /** True when any panel reports unsaved changes. */
  dirty: boolean;
  /** Panels call this when their local form becomes dirty/clean. */
  setPanelDirty: (panelKey: string, dirty: boolean) => void;
  /** Panels register a persist function called on "Save consultation". */
  registerSaveHandler: (panelKey: string, handler: SaveHandler) => () => void;
  /** Runs dirty panels' persist functions; clears dirty flags on success. */
  runSaveAll: () => Promise<{ ok: boolean; error: string | null; savedPanelKeys: string[] }>;
  saving: boolean;
};

const ConsultationSaveContext = createContext<ConsultationSaveContextValue | null>(null);

export function ConsultationSaveProvider({ children }: { children: React.ReactNode }) {
  const [saving, setSaving] = useState(false);
  const dirtyByPanelRef = useRef<Record<string, boolean>>({});
  const handlersRef = useRef<Record<string, SaveHandler>>({});
  const [dirtyTick, setDirtyTick] = useState(0);

  const dirty = useMemo(() => {
    // re-evaluate when dirtyTick changes
    void dirtyTick;
    return Object.values(dirtyByPanelRef.current).some(Boolean);
  }, [dirtyTick]);

  const setPanelDirty = useCallback((panelKey: string, isDirty: boolean) => {
    dirtyByPanelRef.current[panelKey] = isDirty;
    setDirtyTick((n) => n + 1);
  }, []);

  const registerSaveHandler = useCallback((panelKey: string, handler: SaveHandler) => {
    handlersRef.current[panelKey] = handler;
    return () => {
      delete handlersRef.current[panelKey];
    };
  }, []);

  const runSaveAll = useCallback(async () => {
    setSaving(true);
    try {
      const savedPanelKeys: string[] = [];
      const entries = Object.entries(handlersRef.current);
      for (const [panelKey, handler] of entries) {
        if (!dirtyByPanelRef.current[panelKey]) continue;
        await handler();
        savedPanelKeys.push(panelKey);
      }
      // If all saves completed, clear dirty flags.
      for (const k of Object.keys(dirtyByPanelRef.current)) {
        dirtyByPanelRef.current[k] = false;
      }
      setDirtyTick((n) => n + 1);
      return { ok: true, error: null, savedPanelKeys };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to save consultation.";
      return { ok: false, error: msg, savedPanelKeys: [] };
    } finally {
      setSaving(false);
    }
  }, []);

  const value = useMemo(
    () => ({ dirty, setPanelDirty, registerSaveHandler, runSaveAll, saving }),
    [dirty, registerSaveHandler, runSaveAll, saving, setPanelDirty],
  );

  return <ConsultationSaveContext.Provider value={value}>{children}</ConsultationSaveContext.Provider>;
}

export function useConsultationSave() {
  const ctx = useContext(ConsultationSaveContext);
  if (!ctx) {
    throw new Error("useConsultationSave must be used within ConsultationSaveProvider");
  }
  return ctx;
}

