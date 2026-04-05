"use client";

/**
 * Assessment / clinical diagnosis → `encounters.clinical_diagnosis`.
 * Autosave while tab index 4 is active.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Box, CircularProgress, TextField, Typography } from "@mui/material";
import { useConsultationDebouncedSave } from "@/components/consultation/useConsultationDebouncedSave";
import {
  fetchEncounterClinicalDiagnosis,
  persistEncounterClinicalDiagnosis,
} from "@/lib/consultationData";

const tabPanelSx = {
  pt: 2,
  minHeight: 280,
};

export default function AssessmentDiagnosisPanel({ transId }: { transId: string }) {
  const [clinicalDiagnosis, setClinicalDiagnosis] = useState("");
  const [loadError, setLoadError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError("");
    void (async () => {
      const { form, error } = await fetchEncounterClinicalDiagnosis(transId);
      if (cancelled) return;
      setLoading(false);
      if (error) {
        setLoadError(error);
        setClinicalDiagnosis("");
      } else {
        setClinicalDiagnosis(form.clinical_diagnosis);
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
    const { error } = await persistEncounterClinicalDiagnosis(transId, {
      clinical_diagnosis: clinicalDiagnosis,
    });
    setSaving(false);
    if (error) setSaveError(error);
  }, [hydrated, transId, clinicalDiagnosis]);

  const saveTrigger = useMemo(() => ({ clinicalDiagnosis }), [clinicalDiagnosis]);

  useConsultationDebouncedSave({
    ownTabIndex: 4,
    hydrated,
    runPersist,
    trigger: saveTrigger,
  });

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
            ASSESSMENT/ CLINICAL DIAGNOSIS
          </Typography>
        </Box>
        <TextField
          fullWidth
          multiline
          minRows={14}
          placeholder=" "
          hiddenLabel
          variant="outlined"
          value={clinicalDiagnosis}
          onChange={(e) => setClinicalDiagnosis(e.target.value)}
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
