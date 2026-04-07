"use client";

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
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
import {
  fetchLabCatalogGrouped,
  type LabCatalogSection,
} from "@/lib/labTests";

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

  const [labsModalOpen, setLabsModalOpen] = useState(false);
  const [labSections, setLabSections] = useState<LabCatalogSection[]>([]);
  const [labTestsLoading, setLabTestsLoading] = useState(false);
  const [labTestsError, setLabTestsError] = useState("");
  const [selectedLabTestIds, setSelectedLabTestIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    setSelectedLabTestIds(new Set());
  }, [transId]);

  useEffect(() => {
    if (!labsModalOpen) return;
    let cancelled = false;
    setLabTestsLoading(true);
    setLabTestsError("");
    void (async () => {
      const { sections, error } = await fetchLabCatalogGrouped();
      if (cancelled) return;
      setLabTestsLoading(false);
      if (error) {
        setLabTestsError(error);
        setLabSections([]);
      } else {
        setLabSections(sections);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [labsModalOpen]);

  const toggleLabTestSelection = useCallback((testId: string) => {
    setSelectedLabTestIds((prev) => {
      const next = new Set(prev);
      if (next.has(testId)) next.delete(testId);
      else next.add(testId);
      return next;
    });
  }, []);

  const visibleLabSections = useMemo(
    () => labSections.filter((s) => s.tests.length > 0),
    [labSections]
  );

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
              <Box sx={{ display: "flex", alignItems: "center", flexWrap: "wrap", columnGap: 0.5 }}>
                <FormControlLabel
                  control={
                    <Checkbox
                      size="small"
                      checked={form.plan_labs}
                      disabled={loading}
                      onChange={(_, c) => {
                        setForm((f) => ({ ...f, plan_labs: c }));
                        if (c) setLabsModalOpen(true);
                        else setLabsModalOpen(false);
                      }}
                    />
                  }
                  label="LABS"
                  sx={consultFormControlLabelSx}
                />
                {form.plan_labs && !loading ? (
                  <Button
                    type="button"
                    variant="text"
                    size="small"
                    onClick={() => setLabsModalOpen(true)}
                    sx={{ textTransform: "uppercase", minWidth: "auto", py: 0.25, px: 0.75 }}
                  >
                    View catalog
                  </Button>
                ) : null}
              </Box>
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

      <Dialog
        open={labsModalOpen}
        onClose={() => setLabsModalOpen(false)}
        maxWidth="lg"
        fullWidth
        aria-labelledby="plans-labs-dialog-title"
        slotProps={{
          paper: {
            sx: { maxHeight: "92vh" },
          },
        }}
      >
        <DialogTitle
          id="plans-labs-dialog-title"
          sx={{
            fontWeight: 800,
            textAlign: "center",
            letterSpacing: "0.08em",
            bgcolor: "info.main",
            color: "info.contrastText",
            py: 1.5,
          }}
        >
          LABORATORY REQUEST
        </DialogTitle>
        <DialogContent
          dividers
          sx={{
            px: { xs: 2, sm: 2.5 },
            py: 2,
            maxHeight: { xs: "70vh", md: "calc(92vh - 140px)" },
            overflow: "auto",
          }}
        >
          {labTestsLoading ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
              <CircularProgress size={32} />
            </Box>
          ) : labTestsError ? (
            <Alert severity="error">{labTestsError}</Alert>
          ) : visibleLabSections.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              No lab tests found in the catalog.
            </Typography>
          ) : (
            <Box
              sx={{
                columnCount: { xs: 1, sm: 2, md: 3 },
                columnGap: 2.5,
              }}
            >
              {visibleLabSections.map((section) => (
                <Box
                  key={String(section.category.id)}
                  sx={{
                    breakInside: "avoid",
                    pageBreakInside: "avoid",
                    mb: 2.5,
                    border: "1px solid",
                    borderColor: "divider",
                    borderRadius: 1,
                    p: 1.5,
                    bgcolor: "background.paper",
                  }}
                >
                  <Typography
                    component="h3"
                    variant="subtitle2"
                    fontWeight={800}
                    color="info.main"
                    sx={{
                      letterSpacing: "0.06em",
                      mb: 1.25,
                      display: "block",
                    }}
                  >
                    {section.category.name.toUpperCase()}
                  </Typography>
                  <Box sx={{ display: "flex", flexDirection: "column", gap: 0.25 }}>
                    {section.tests.map((test) => (
                      <FormControlLabel
                        key={test.id}
                        sx={{ ...consultFormControlLabelSx, alignItems: "flex-start", ml: 0, mr: 0 }}
                        control={
                          <Checkbox
                            size="small"
                            checked={selectedLabTestIds.has(test.id)}
                            onChange={() => toggleLabTestSelection(test.id)}
                            sx={{ pt: 0.25 }}
                          />
                        }
                        label={
                          <Typography component="span" variant="body2" sx={{ textTransform: "uppercase", lineHeight: 1.35 }}>
                            {test.name}
                          </Typography>
                        }
                      />
                    ))}
                  </Box>
                </Box>
              ))}
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 2, py: 1.5, justifyContent: "space-between", flexWrap: "wrap", gap: 1 }}>
          <Typography variant="caption" color="text.secondary" sx={{ mr: "auto" }}>
            {selectedLabTestIds.size > 0
              ? `${selectedLabTestIds.size} test${selectedLabTestIds.size === 1 ? "" : "s"} selected`
              : "Select tests to request"}
          </Typography>
          <Button onClick={() => setLabsModalOpen(false)} color="inherit" variant="text" sx={{ textTransform: "uppercase" }}>
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
