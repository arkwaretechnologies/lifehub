"use client";

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Checkbox,
  CircularProgress,
  FormControl,
  FormControlLabel,
  Grid,
  Radio,
  RadioGroup,
  TextField,
  Typography,
} from "@mui/material";
import { consultFormControlLabelSx } from "@/components/consultation/ConsultationSectionTitle";
import { useConsultationDebouncedSave } from "@/components/consultation/useConsultationDebouncedSave";
import {
  ENCOUNTER_DISPOSITION_VALUES,
  fetchEncounterPlansTreatment,
  persistEncounterPlansTreatment,
  type EncounterDisposition,
  type EncounterPlansTreatmentForm,
} from "@/lib/consultationData";

const tabPanelSx = { pt: 2, minHeight: 280 };

const cardOuterSx = {
  border: "1px solid",
  borderColor: "grey.900",
  borderRadius: 1,
  overflow: "hidden",
  bgcolor: "background.paper",
} as const;

const sectionLabelProps = {
  component: "h3" as const,
  variant: "body2" as const,
  fontWeight: 700,
  color: "info.main" as const,
  sx: {
    letterSpacing: "0.02em",
    display: "block",
    mb: 1.5,
    textTransform: "uppercase" as const,
  },
};

const notesFieldSx = {
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
  },
} as const;

const DISPOSITION_LABELS: Record<EncounterDisposition, string> = {
  Home: "HOME",
  "Medico Legal": "MEDICO LEGAL",
  "Advise Admission": "ADVISE ADMISSION",
  Absconded: "ABSCONDED",
  DAMA: "DAMA",
};

const emptyPlansForm: EncounterPlansTreatmentForm = {
  plan_labs: false,
  plan_imaging: false,
  plan_medications: false,
  plan_referral: false,
  plan_notes: "",
  disposition: null,
};

export default function PlansTreatmentPanel({ transId }: { transId: string }) {
  const dispositionLabelId = `plans-disp-${useId().replace(/\W/g, "")}`;
  const [form, setForm] = useState<EncounterPlansTreatmentForm>(emptyPlansForm);
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
      const { form: next, error } = await fetchEncounterPlansTreatment(transId);
      if (cancelled) return;
      setLoading(false);
      if (error) {
        setLoadError(error);
        setForm(emptyPlansForm);
      } else {
        setForm(next);
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
    const { error } = await persistEncounterPlansTreatment(transId, form);
    setSaving(false);
    if (error) setSaveError(error);
  }, [hydrated, transId, form]);

  const saveTrigger = useMemo(() => form, [form]);

  useConsultationDebouncedSave({
    ownTabIndex: 5,
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

      <Box sx={cardOuterSx}>
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
            PLANS/TREATMENT
          </Typography>
        </Box>

        <Box sx={{ p: { xs: 2, sm: 2.5 } }}>
          <Typography {...sectionLabelProps}>PLAN/TREATMENT:</Typography>

          <Grid container spacing={{ xs: 0.5, sm: 1 }} sx={{ mb: 2, alignItems: "center" }}>
            <Grid size={{ xs: "auto" }}>
              <FormControlLabel
                control={
                  <Checkbox
                    size="small"
                    checked={form.plan_labs}
                    disabled={loading}
                    onChange={(_, c) => setForm((f) => ({ ...f, plan_labs: c }))}
                  />
                }
                label="LABS"
                sx={consultFormControlLabelSx}
              />
            </Grid>
            <Grid size={{ xs: "auto" }}>
              <FormControlLabel
                control={
                  <Checkbox
                    size="small"
                    checked={form.plan_imaging}
                    disabled={loading}
                    onChange={(_, c) => setForm((f) => ({ ...f, plan_imaging: c }))}
                  />
                }
                label="IMAGING"
                sx={consultFormControlLabelSx}
              />
            </Grid>
            <Grid size={{ xs: "auto" }}>
              <FormControlLabel
                control={
                  <Checkbox
                    size="small"
                    checked={form.plan_medications}
                    disabled={loading}
                    onChange={(_, c) => setForm((f) => ({ ...f, plan_medications: c }))}
                  />
                }
                label="MEDICATIONS"
                sx={consultFormControlLabelSx}
              />
            </Grid>
          </Grid>
          <Box sx={{ mb: 2 }}>
            <FormControlLabel
              control={
                <Checkbox
                  size="small"
                  checked={form.plan_referral}
                  disabled={loading}
                  onChange={(_, c) => setForm((f) => ({ ...f, plan_referral: c }))}
                />
              }
              label="REFERRAL"
              sx={consultFormControlLabelSx}
            />
          </Box>

          <TextField
            fullWidth
            multiline
            minRows={10}
            placeholder=" "
            hiddenLabel
            variant="outlined"
            value={form.plan_notes}
            disabled={loading}
            onChange={(e) => setForm((f) => ({ ...f, plan_notes: e.target.value }))}
            sx={[notesFieldSx, { mb: 3 }]}
          />

          <Typography {...sectionLabelProps} id={dispositionLabelId}>
            DISPOSITION:
          </Typography>
          <FormControl
            component="fieldset"
            variant="standard"
            disabled={loading}
            aria-labelledby={dispositionLabelId}
            sx={{ width: "100%" }}
          >
            <RadioGroup
              value={form.disposition ?? ""}
              onChange={(_, v) =>
                setForm((f) => ({
                  ...f,
                  disposition: v === "" ? null : (v as EncounterDisposition),
                }))
              }
              sx={{
                display: "flex",
                flexDirection: "row",
                flexWrap: "wrap",
                columnGap: { xs: 1, sm: 2 },
                rowGap: 1,
              }}
            >
              <FormControlLabel
                value=""
                control={<Radio size="small" />}
                label="NONE"
                sx={consultFormControlLabelSx}
              />
              {ENCOUNTER_DISPOSITION_VALUES.map((value) => (
                <FormControlLabel
                  key={value}
                  value={value}
                  control={<Radio size="small" />}
                  label={DISPOSITION_LABELS[value]}
                  sx={consultFormControlLabelSx}
                />
              ))}
            </RadioGroup>
          </FormControl>
        </Box>
      </Box>
    </Box>
  );
}
