"use client";

/**
 * Focused exam / further notes → `physical_examination.focused_exam_notes`.
 * Autosave while tab index 3 is active.
 */

import { useCallback, useEffect, useState } from "react";
import { Alert, Box, CircularProgress, TextField, Typography } from "@mui/material";
import { useConsultationSave } from "@/components/consultation/consultationSaveContext";
import { fetchFocusedExamNotes, persistFocusedExamNotes } from "@/lib/physicalExamination";

const tabPanelSx = {
  pt: 2,
  minHeight: 280,
};

export default function FocusedExamNotesPanel({ transId }: { transId: string }) {
  const [notes, setNotes] = useState("");
  const [rowId, setRowId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const { registerSaveHandler, setPanelDirty } = useConsultationSave();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError("");
    void (async () => {
      const { rowId: id, notes: text, error } = await fetchFocusedExamNotes(transId);
      if (cancelled) return;
      setLoading(false);
      if (error) {
        setLoadError(error);
        setNotes("");
        setRowId(null);
      } else {
        setNotes(text);
        setRowId(id);
      }
      setHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [transId]);

  const runPersist = useCallback(async () => {
    if (!hydrated) return;
    setSaveError("");
    setSaving(true);
    const { rowId: nextId, error } = await persistFocusedExamNotes(transId, rowId, notes);
    setSaving(false);
    if (error) setSaveError(error);
    if (nextId) setRowId(nextId);
    if (!error) setPanelDirty("focused-exam-notes", false);
  }, [hydrated, transId, rowId, notes, setPanelDirty]);

  useEffect(() => {
    if (!hydrated) return;
    return registerSaveHandler("focused-exam-notes", runPersist);
  }, [registerSaveHandler, runPersist, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    setPanelDirty("focused-exam-notes", true);
  }, [notes, hydrated, setPanelDirty]);

  return (
    <Box sx={tabPanelSx}>
      {loadError ? (
        <Alert severity="error" sx={{ mb: 2 }}>
          {loadError}
        </Alert>
      ) : null}
      {saveError ? (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setSaveError("")}>
          {saveError}
        </Alert>
      ) : null}
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1, minHeight: 22 }}>
        {loading ? (
          <CircularProgress size={18} />
        ) : saving ? (
          <Typography variant="caption" color="text.secondary">
            Saving…
          </Typography>
        ) : null}
      </Box>

      <Box
        sx={{
          border: "1px solid",
          borderColor: "grey.900",
          borderRadius: 1,
          overflow: "hidden",
          bgcolor: "background.paper",
        }}
      >
        <Box
          sx={{
            bgcolor: "info.main",
            color: "info.contrastText",
            py: 1.25,
            px: 2,
            textAlign: "center",
          }}
        >
          <Typography variant="subtitle1" fontWeight={800} letterSpacing="0.1em">
            FOCUSED PHYSICAL EXAM/ FURTHER NOTES
          </Typography>
        </Box>
        <TextField
          fullWidth
          multiline
          minRows={14}
          placeholder=" "
          hiddenLabel
          variant="outlined"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          disabled={loading}
          sx={{
            "& .MuiOutlinedInput-root": {
              borderRadius: 0,
              bgcolor: "background.paper",
              "& fieldset": { border: "none" },
              "&:hover fieldset": { border: "none" },
              "&.Mui-focused fieldset": { border: "none" },
            },
            "& .MuiInputBase-input": {
              py: 2,
              px: 2,
              alignItems: "flex-start",
            },
          }}
        />
      </Box>
    </Box>
  );
}
