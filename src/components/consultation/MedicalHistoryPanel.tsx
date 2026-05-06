"use client";

import { useCallback, useEffect, useId, useState } from "react";
import {
  Alert,
  Box,
  Checkbox,
  CircularProgress,
  FormControlLabel,
  Grid,
  Radio,
  RadioGroup,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { BpSplitInput } from "@/components/BpSplitInput";
import { FormFieldLabel } from "@/components/FormFieldLabel";
import { useConsultationDebouncedSave } from "@/components/consultation/useConsultationDebouncedSave";
import {
  commonFieldProps,
  fieldInputSx,
  fieldMultilineInputSx,
} from "@/components/fieldInputStyles";
import {
  ConsultationSectionTitle,
  ConsultationSubsectionTitle,
  consultFormControlLabelSx,
} from "@/components/consultation/ConsultationSectionTitle";
import {
  emptyPastMedicalHistoryForm,
  fetchPastMedicalHistory,
  formFromRowOrDefault,
  persistPastMedicalHistory,
  type PastMedicalHistoryForm,
} from "@/lib/pastMedicalHistory";
import {
  anthropometricFromRowOrDefault,
  emptyAnthropometricInput,
  emptyVitalSignsInput,
  fetchVitalSigns,
  inputStateFromRowOrDefault,
  persistAnthropometrics,
  persistVitalSigns,
  type AnthropometricInputState,
  type VitalSignsInputState,
} from "@/lib/vitalSigns";
import {
  emptyFamilyHistoryForm,
  fetchFamilyHistory,
  formFromFamilyRowOrDefault,
  persistFamilyHistory,
  type FamilyHistoryForm,
} from "@/lib/familyHistory";
import {
  emptySurgicalHistoryForm,
  fetchSurgicalHistory,
  formFromSurgicalRowOrDefault,
  persistSurgicalHistory,
  type SurgicalHistoryForm,
} from "@/lib/surgicalHistory";
import {
  emptyPreviousHospitalizationForm,
  fetchPreviousHospitalization,
  formFromPreviousHospitalizationRowOrDefault,
  persistPreviousHospitalization,
  type PreviousHospitalizationForm,
} from "@/lib/previousHospitalizations";
import {
  emptyAllergiesForm,
  fetchAllergies,
  formFromAllergiesRowOrDefault,
  persistAllergies,
  type AllergiesForm,
} from "@/lib/allergies";
import {
  emptySocialHistoryForm,
  fetchSocialHistory,
  formFromSocialHistoryRowOrDefault,
  persistSocialHistory,
  type SocialHistoryForm,
} from "@/lib/socialHistory";
import {
  emptyObstetricHistoryForm,
  fetchObstetricHistory,
  formFromObstetricHistoryRowOrDefault,
  persistObstetricHistory,
  type ObstetricHistoryForm,
} from "@/lib/obstetricHistory";

const tabPanelSx = { pt: 2, minHeight: 280 };

/** Bordered consultation panels (allergies, obstetric, etc.) — white fill. */
const panelSectionSx = {
  bgcolor: "common.white",
  p: 2,
  borderRadius: 1,
  border: "1px solid",
  borderColor: "info.main",
};

const controlLabelSx = consultFormControlLabelSx;

/**
 * Allergies block only — checkbox sits flush next to label (does not affect other sections).
 */
const allergiesControlLabelSx = {
  m: 0,
  mr: 0,
  ml: 0,
  width: "auto",
  maxWidth: "100%",
  alignItems: "center",
  gap: 0,
  columnGap: 1,
  "& .MuiCheckbox-root": {
    padding: "2px",
  },
  "& .MuiFormControlLabel-label": {
    fontSize: "0.8125rem",
    fontWeight: 500,
    lineHeight: 1.2,
    color: "text.primary",
    flex: "0 0 auto",
    pl: 0,
    ml: "-2px",
  },
} as const;

/** Underline inputs after Food:/Drugs: — parent row uses `gap` for label-to-line space. */
const allergiesInlineUnderlineFieldSx = {
  flex: "1 1 48px",
  minWidth: 48,
  width: "100%",
  maxWidth: "100%",
  "& .MuiInputBase-root": { marginTop: 0 },
  "& .MuiInputBase-input": {
    py: 0.5,
    fontSize: "0.875rem",
    textTransform: "uppercase",
  },
} as const;

/** Yes / No radio rows — wide gap so options never overlap (social history, obstetric, etc.). */
const yesNoRadioRowSx = {
  display: "flex",
  flexDirection: "row" as const,
  flexWrap: "nowrap" as const,
  alignItems: "center",
  columnGap: 4,
  gap: 3,
  "& .MuiFormControlLabel-root": { mr: 0, flexShrink: 0 },
} as const;

function slugId(s: string) {
  return s.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
}

const VITAL_FIELD_CONFIG = [
  { key: "hr", label: "HR", placeholder: "____" },
  { key: "rr", label: "RR", placeholder: "____" },
  { key: "temp", label: "Temp", placeholder: "____" },
  { key: "o2", label: "O2 Sat", placeholder: "____" },
  { key: "pain", label: "Pain scale (0–10)", placeholder: "____" },
] as const;

type VitalFieldKey = (typeof VITAL_FIELD_CONFIG)[number]["key"] | "bp";

function VitalSignsSection({ transId, idPrefix }: { transId: string; idPrefix: string }) {
  const [input, setInput] = useState<VitalSignsInputState>(() => emptyVitalSignsInput());
  const [rowId, setRowId] = useState<string | null>(null);
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
      const { row, error } = await fetchVitalSigns(transId);
      if (cancelled) return;
      setLoading(false);
      if (error) {
        setLoadError(error);
        setInput(emptyVitalSignsInput());
        setRowId(null);
      } else {
        setRowId(row?.id ?? null);
        setInput(inputStateFromRowOrDefault(row));
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
    const { rowId: newId, error } = await persistVitalSigns(transId, rowId, input);
    setSaving(false);
    if (error) {
      setSaveError(error);
      return;
    }
    if (newId && !rowId) {
      setRowId(newId);
    }
  }, [hydrated, transId, rowId, input]);

  useConsultationDebouncedSave({
    ownTabIndex: 0,
    hydrated,
    runPersist,
    trigger: input,
  });

  function setField(key: VitalFieldKey, value: string) {
    setInput((prev) => ({ ...prev, [key]: value.toUpperCase() }));
  }

  return (
    <Box sx={{ mb: 2 }}>
      {loadError ? (
        <Alert severity="error" sx={{ mb: 1.5 }}>
          {loadError}
        </Alert>
      ) : null}
      {saveError ? (
        <Alert severity="error" sx={{ mb: 1.5 }} onClose={() => setSaveError("")}>
          {saveError}
        </Alert>
      ) : null}
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1, minHeight: 24 }}>
        {loading ? (
          <CircularProgress size={18} />
        ) : saving ? (
          <Typography variant="caption" color="text.secondary">
            Saving…
          </Typography>
        ) : null}
      </Box>
      <Grid container spacing={2}>
        <Grid size={{ xs: 6, sm: 4 }}>
          <FormFieldLabel htmlFor={`${idPrefix}-vital-bp-sys`} variant="consultation">
            BP
          </FormFieldLabel>
          <BpSplitInput
            variant="consultation"
            value={input.bp}
            onChange={(v) => setField("bp", v)}
            disabled={loading}
            systolicId={`${idPrefix}-vital-bp-sys`}
            diastolicId={`${idPrefix}-vital-bp-dia`}
          />
        </Grid>
        {VITAL_FIELD_CONFIG.map(({ key, label, placeholder }) => {
          const fid = `${idPrefix}-vital-${key}`;
          return (
            <Grid key={key} size={{ xs: 6, sm: 4 }}>
              <FormFieldLabel htmlFor={fid} variant="consultation">
                {label}
              </FormFieldLabel>
              <TextField
                id={fid}
                hiddenLabel
                placeholder={placeholder}
                value={input[key]}
                onChange={(e) => setField(key, e.target.value)}
                disabled={loading}
                {...commonFieldProps}
                sx={fieldInputSx}
              />
            </Grid>
          );
        })}
      </Grid>
    </Box>
  );
}

const ANTHRO_FIELDS = [
  { key: "weight_kg", label: "Weight" },
  { key: "height_cm", label: "Height" },
  { key: "bmi", label: "BMI" },
] as const;

type AnthroFieldKey = (typeof ANTHRO_FIELDS)[number]["key"];

function AnthropometricSection({ transId, idPrefix }: { transId: string; idPrefix: string }) {
  const [form, setForm] = useState<AnthropometricInputState>(() => emptyAnthropometricInput());
  const [rowId, setRowId] = useState<string | null>(null);
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
      const { row, error } = await fetchVitalSigns(transId);
      if (cancelled) return;
      setLoading(false);
      if (error) {
        setLoadError(error);
        setForm(emptyAnthropometricInput());
        setRowId(null);
      } else {
        setRowId(row?.id ?? null);
        setForm(anthropometricFromRowOrDefault(row));
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
    const { rowId: newId, error } = await persistAnthropometrics(transId, rowId, form);
    setSaving(false);
    if (error) {
      setSaveError(error);
      return;
    }
    if (newId && !rowId) {
      setRowId(newId);
    }
  }, [hydrated, transId, rowId, form]);

  useConsultationDebouncedSave({
    ownTabIndex: 0,
    hydrated,
    runPersist,
    trigger: form,
  });

  function setAnthroField(key: AnthroFieldKey, value: string) {
    setForm((prev) => ({ ...prev, [key]: value.toUpperCase() }));
  }

  return (
    <Box sx={{ mb: 2 }}>
      {loadError ? (
        <Alert severity="error" sx={{ mb: 1.5 }}>
          {loadError}
        </Alert>
      ) : null}
      {saveError ? (
        <Alert severity="error" sx={{ mb: 1.5 }} onClose={() => setSaveError("")}>
          {saveError}
        </Alert>
      ) : null}
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1, minHeight: 24 }}>
        {loading ? (
          <CircularProgress size={18} />
        ) : saving ? (
          <Typography variant="caption" color="text.secondary">
            Saving…
          </Typography>
        ) : null}
      </Box>
      <Grid container spacing={2}>
        {ANTHRO_FIELDS.map(({ key, label }) => {
          const fid = `${idPrefix}-anthro-${key}`;
          return (
            <Grid key={key} size={{ xs: 4 }}>
              <FormFieldLabel htmlFor={fid} variant="consultation">
                {label}
              </FormFieldLabel>
              <TextField
                id={fid}
                hiddenLabel
                placeholder="____"
                value={form[key]}
                onChange={(e) => setAnthroField(key, e.target.value)}
                disabled={loading}
                {...commonFieldProps}
                sx={fieldInputSx}
              />
            </Grid>
          );
        })}
      </Grid>
    </Box>
  );
}

function InlineField({
  idPrefix,
  suffix,
  label,
}: {
  idPrefix: string;
  suffix: string;
  label: string;
}) {
  const fid = `${idPrefix}-${suffix}`;
  return (
    <>
      <FormFieldLabel htmlFor={fid} variant="consultation">
        {label}
      </FormFieldLabel>
      <TextField id={fid} hiddenLabel placeholder="____" {...commonFieldProps} sx={fieldInputSx} />
    </>
  );
}

const PMH_CHECKBOXES = [
  { key: "hypertension", label: "Hypertension" },
  { key: "diabetes", label: "Diabetes" },
  { key: "asthma", label: "Asthma" },
  { key: "heart_disease", label: "Heart disease" },
  { key: "kidney_disease", label: "Kidney disease/stones" },
  { key: "stroke_cva", label: "Stroke / CVA" },
  { key: "thyroid_disease", label: "Thyroid disease" },
  { key: "tuberculosis", label: "TB" },
] as const;

type PmhCheckboxKey = (typeof PMH_CHECKBOXES)[number]["key"];

function PastMedicalHistorySection({ transId, idPrefix }: { transId: string; idPrefix: string }) {
  const [form, setForm] = useState<PastMedicalHistoryForm>(emptyPastMedicalHistoryForm);
  const [rowId, setRowId] = useState<string | null>(null);
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
      const { row, error } = await fetchPastMedicalHistory(transId);
      if (cancelled) return;
      setLoading(false);
      if (error) {
        setLoadError(error);
        setForm({ ...emptyPastMedicalHistoryForm });
        setRowId(null);
      } else {
        setRowId(row?.id ?? null);
        setForm(formFromRowOrDefault(row));
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
    const { rowId: newId, error } = await persistPastMedicalHistory(transId, rowId, form);
    setSaving(false);
    if (error) {
      setSaveError(error);
      return;
    }
    if (newId && !rowId) {
      setRowId(newId);
    }
  }, [hydrated, transId, rowId, form]);

  useConsultationDebouncedSave({
    ownTabIndex: 0,
    hydrated,
    runPersist,
    trigger: form,
  });

  function setCheckbox(key: PmhCheckboxKey, checked: boolean) {
    setForm((prev) => ({ ...prev, [key]: checked }));
  }

  function setOthers(value: string) {
    setForm((prev) => ({ ...prev, others: value }));
  }

  return (
    <Box sx={{ ...panelSectionSx, mb: 2 }}>
      <ConsultationSubsectionTitle>Past medical history</ConsultationSubsectionTitle>
      {loadError ? (
        <Alert severity="error" sx={{ mb: 1.5 }}>
          {loadError}
        </Alert>
      ) : null}
      {saveError ? (
        <Alert severity="error" sx={{ mb: 1.5 }} onClose={() => setSaveError("")}>
          {saveError}
        </Alert>
      ) : null}
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1, minHeight: 24 }}>
        {loading ? (
          <CircularProgress size={18} />
        ) : saving ? (
          <Typography variant="caption" color="text.secondary">
            Saving…
          </Typography>
        ) : null}
      </Box>
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, columnGap: 2, rowGap: 0.25 }}>
        {PMH_CHECKBOXES.map(({ key, label }) => (
          <FormControlLabel
            key={key}
            control={
              <Checkbox
                size="small"
                checked={form[key]}
                onChange={(_, c) => setCheckbox(key, c)}
                disabled={loading}
              />
            }
            label={label}
            sx={controlLabelSx}
          />
        ))}
      </Box>
      <Box sx={{ mt: 2 }}>
        <FormFieldLabel htmlFor={`${idPrefix}-pmh-others`} variant="consultation">
          Others
        </FormFieldLabel>
        <TextField
          id={`${idPrefix}-pmh-others`}
          hiddenLabel
          placeholder="_______________________________________"
          value={form.others}
          onChange={(e) => setOthers(e.target.value.toUpperCase())}
          disabled={loading}
          {...commonFieldProps}
          sx={fieldInputSx}
        />
      </Box>
    </Box>
  );
}

const FH_CHECKBOXES = [
  { key: "hypertension", label: "Hypertension" },
  { key: "diabetes", label: "Diabetes" },
  { key: "cancer", label: "Cancer" },
  { key: "heart_disease", label: "Heart disease" },
  { key: "stroke_cva", label: "Stroke / CVA" },
  { key: "tuberculosis", label: "TB" },
  { key: "kidney_disease", label: "Kidney disease" },
] as const;

type FhCheckboxKey = (typeof FH_CHECKBOXES)[number]["key"];

function FamilyHistorySection({ transId, idPrefix }: { transId: string; idPrefix: string }) {
  const [form, setForm] = useState<FamilyHistoryForm>(emptyFamilyHistoryForm);
  const [rowId, setRowId] = useState<string | null>(null);
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
      const { row, error } = await fetchFamilyHistory(transId);
      if (cancelled) return;
      setLoading(false);
      if (error) {
        setLoadError(error);
        setForm({ ...emptyFamilyHistoryForm });
        setRowId(null);
      } else {
        setRowId(row?.id ?? null);
        setForm(formFromFamilyRowOrDefault(row));
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
    const { rowId: newId, error } = await persistFamilyHistory(transId, rowId, form);
    setSaving(false);
    if (error) {
      setSaveError(error);
      return;
    }
    if (newId && !rowId) {
      setRowId(newId);
    }
  }, [hydrated, transId, rowId, form]);

  useConsultationDebouncedSave({
    ownTabIndex: 0,
    hydrated,
    runPersist,
    trigger: form,
  });

  function setCheckbox(key: FhCheckboxKey, checked: boolean) {
    setForm((prev) => ({ ...prev, [key]: checked }));
  }

  function setOthers(value: string) {
    setForm((prev) => ({ ...prev, others: value }));
  }

  return (
    <Box sx={{ ...panelSectionSx, mb: 2 }}>
      <ConsultationSubsectionTitle>Family history</ConsultationSubsectionTitle>
      {loadError ? (
        <Alert severity="error" sx={{ mb: 1.5 }}>
          {loadError}
        </Alert>
      ) : null}
      {saveError ? (
        <Alert severity="error" sx={{ mb: 1.5 }} onClose={() => setSaveError("")}>
          {saveError}
        </Alert>
      ) : null}
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1, minHeight: 24 }}>
        {loading ? (
          <CircularProgress size={18} />
        ) : saving ? (
          <Typography variant="caption" color="text.secondary">
            Saving…
          </Typography>
        ) : null}
      </Box>
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, columnGap: 2, rowGap: 0.25 }}>
        {FH_CHECKBOXES.map(({ key, label }) => (
          <FormControlLabel
            key={key}
            control={
              <Checkbox
                size="small"
                checked={form[key]}
                onChange={(_, c) => setCheckbox(key, c)}
                disabled={loading}
              />
            }
            label={label}
            sx={controlLabelSx}
          />
        ))}
      </Box>
      <Box sx={{ mt: 2 }}>
        <FormFieldLabel htmlFor={`${idPrefix}-fh-others`} variant="consultation">
          Others
        </FormFieldLabel>
        <TextField
          id={`${idPrefix}-fh-others`}
          hiddenLabel
          placeholder="_______________________________________"
          value={form.others}
          onChange={(e) => setOthers(e.target.value.toUpperCase())}
          disabled={loading}
          {...commonFieldProps}
          sx={fieldInputSx}
        />
      </Box>
    </Box>
  );
}

const SH_PROCEDURE_KEYS = [
  { key: "appendectomy", label: "App" },
  { key: "cholecystectomy", label: "GB" },
  { key: "cabg", label: "CABG" },
  { key: "c_section", label: "C-section" },
  { key: "hernia_repair", label: "Hernia" },
  { key: "cataract", label: "Cataract" },
] as const;

type ShProcedureKey = (typeof SH_PROCEDURE_KEYS)[number]["key"];

function SurgicalHistorySection({ transId, idPrefix }: { transId: string; idPrefix: string }) {
  const [form, setForm] = useState<SurgicalHistoryForm>(emptySurgicalHistoryForm);
  const [rowId, setRowId] = useState<string | null>(null);
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
      const { row, error } = await fetchSurgicalHistory(transId);
      if (cancelled) return;
      setLoading(false);
      if (error) {
        setLoadError(error);
        setForm({ ...emptySurgicalHistoryForm });
        setRowId(null);
      } else {
        setRowId(row?.id ?? null);
        setForm(formFromSurgicalRowOrDefault(row));
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
    const { rowId: newId, error } = await persistSurgicalHistory(transId, rowId, form);
    setSaving(false);
    if (error) {
      setSaveError(error);
      return;
    }
    if (newId && !rowId) {
      setRowId(newId);
    }
  }, [hydrated, transId, rowId, form]);

  useConsultationDebouncedSave({
    ownTabIndex: 0,
    hydrated,
    runPersist,
    trigger: form,
  });

  function setNoSurgery(checked: boolean) {
    setForm((prev) => {
      if (checked) {
        return { ...emptySurgicalHistoryForm, no_surgery: true };
      }
      return { ...prev, no_surgery: false };
    });
  }

  function setProcedure(key: ShProcedureKey, checked: boolean) {
    setForm((prev) => ({
      ...prev,
      no_surgery: false,
      [key]: checked,
    }));
  }

  function setOtherProcedures(value: string) {
    setForm((prev) => ({
      ...prev,
      no_surgery: false,
      other_procedures: value,
    }));
  }

  return (
    <Box sx={{ ...panelSectionSx, mb: 2 }}>
      <ConsultationSubsectionTitle>Surgical history</ConsultationSubsectionTitle>
      {loadError ? (
        <Alert severity="error" sx={{ mb: 1.5 }}>
          {loadError}
        </Alert>
      ) : null}
      {saveError ? (
        <Alert severity="error" sx={{ mb: 1.5 }} onClose={() => setSaveError("")}>
          {saveError}
        </Alert>
      ) : null}
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1, minHeight: 24 }}>
        {loading ? (
          <CircularProgress size={18} />
        ) : saving ? (
          <Typography variant="caption" color="text.secondary">
            Saving…
          </Typography>
        ) : null}
      </Box>
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, columnGap: 2, rowGap: 0.25 }}>
        <FormControlLabel
          control={
            <Checkbox
              size="small"
              checked={form.no_surgery}
              onChange={(_, c) => setNoSurgery(c)}
              disabled={loading}
            />
          }
          label="Negative"
          sx={controlLabelSx}
        />
        {SH_PROCEDURE_KEYS.map(({ key, label }) => (
          <FormControlLabel
            key={key}
            control={
              <Checkbox
                size="small"
                checked={form[key]}
                onChange={(_, c) => setProcedure(key, c)}
                disabled={loading || form.no_surgery}
              />
            }
            label={label}
            sx={controlLabelSx}
          />
        ))}
      </Box>
      <Box sx={{ mt: 2 }}>
        <FormFieldLabel htmlFor={`${idPrefix}-sh-other-procedures`} variant="consultation">
          Other procedures
        </FormFieldLabel>
        <TextField
          id={`${idPrefix}-sh-other-procedures`}
          hiddenLabel
          placeholder="_______________________________________"
          value={form.other_procedures}
          onChange={(e) => setOtherProcedures(e.target.value.toUpperCase())}
          disabled={loading || form.no_surgery}
          {...commonFieldProps}
          sx={fieldInputSx}
        />
      </Box>
    </Box>
  );
}

function PreviousHospitalizationSection({ transId, idPrefix }: { transId: string; idPrefix: string }) {
  const [form, setForm] = useState<PreviousHospitalizationForm>(emptyPreviousHospitalizationForm);
  const [rowId, setRowId] = useState<string | null>(null);
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
      const { row, error } = await fetchPreviousHospitalization(transId);
      if (cancelled) return;
      setLoading(false);
      if (error) {
        setLoadError(error);
        setForm({ ...emptyPreviousHospitalizationForm });
        setRowId(null);
      } else {
        setRowId(row?.id ?? null);
        setForm(formFromPreviousHospitalizationRowOrDefault(row));
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
    const { rowId: newId, error } = await persistPreviousHospitalization(transId, rowId, form);
    setSaving(false);
    if (error) {
      setSaveError(error);
      return;
    }
    if (newId && !rowId) {
      setRowId(newId);
    }
  }, [hydrated, transId, rowId, form]);

  useConsultationDebouncedSave({
    ownTabIndex: 0,
    hydrated,
    runPersist,
    trigger: form,
  });

  function setNever(checked: boolean) {
    setForm((prev) => {
      if (checked) {
        return {
          ...emptyPreviousHospitalizationForm,
          never: true,
        };
      }
      return { ...prev, never: false };
    });
  }

  function setOther(checked: boolean) {
    setForm((prev) => ({
      ...prev,
      never: false,
      other: checked,
    }));
  }

  const fieldsDisabled = loading || form.never;

  return (
    <Box sx={{ ...panelSectionSx, mb: 2 }}>
      <ConsultationSubsectionTitle>Previous hospitalization</ConsultationSubsectionTitle>
      {loadError ? (
        <Alert severity="error" sx={{ mb: 1.5 }}>
          {loadError}
        </Alert>
      ) : null}
      {saveError ? (
        <Alert severity="error" sx={{ mb: 1.5 }} onClose={() => setSaveError("")}>
          {saveError}
        </Alert>
      ) : null}
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1, minHeight: 24 }}>
        {loading ? (
          <CircularProgress size={18} />
        ) : saving ? (
          <Typography variant="caption" color="text.secondary">
            Saving…
          </Typography>
        ) : null}
      </Box>
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 2, mb: 1.5 }}>
        <FormControlLabel
          control={
            <Checkbox
              size="small"
              checked={form.never}
              onChange={(_, v) => setNever(v)}
              disabled={loading}
            />
          }
          label="Never"
          sx={controlLabelSx}
        />
        <FormControlLabel
          control={
            <Checkbox
              size="small"
              checked={form.other}
              onChange={(_, v) => setOther(v)}
              disabled={loading || form.never}
            />
          }
          label="Other"
          sx={controlLabelSx}
        />
      </Box>
      <Table
        size="small"
        sx={{ border: "1px solid", borderColor: "divider", "& td": { borderColor: "divider" } }}
      >
        <TableHead>
          <TableRow sx={{ bgcolor: "grey.200" }}>
            <TableCell sx={{ textTransform: "uppercase", fontWeight: 700, color: "info.main" }}>
              Year
            </TableCell>
            <TableCell sx={{ textTransform: "uppercase", fontWeight: 700, color: "info.main" }}>
              Hospital
            </TableCell>
            <TableCell sx={{ textTransform: "uppercase", fontWeight: 700, color: "info.main" }}>
              Diagnosis
            </TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          <TableRow>
            <TableCell sx={{ p: 0.75, verticalAlign: "middle" }}>
              <TextField
                id={`${idPrefix}-hosp-year`}
                hiddenLabel
                disabled={fieldsDisabled}
                placeholder=" "
                value={form.year}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    never: false,
                    year: e.target.value.replace(/\D/g, "").slice(0, 4),
                  }))
                }
                inputProps={{ inputMode: "numeric", maxLength: 4 }}
                {...commonFieldProps}
                sx={fieldInputSx}
              />
            </TableCell>
            <TableCell sx={{ p: 0.75, verticalAlign: "middle" }}>
              <TextField
                id={`${idPrefix}-hosp-hospital`}
                hiddenLabel
                disabled={fieldsDisabled}
                placeholder=" "
                value={form.hospital}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    never: false,
                    hospital: e.target.value,
                  }))
                }
                {...commonFieldProps}
                sx={fieldInputSx}
              />
            </TableCell>
            <TableCell sx={{ p: 0.75, verticalAlign: "middle" }}>
              <TextField
                id={`${idPrefix}-hosp-diagnosis`}
                hiddenLabel
                disabled={fieldsDisabled}
                placeholder=" "
                value={form.diagnosis}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    never: false,
                    diagnosis: e.target.value,
                  }))
                }
                {...commonFieldProps}
                sx={fieldInputSx}
              />
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </Box>
  );
}

function AllergiesSection({ transId, idPrefix }: { transId: string; idPrefix: string }) {
  const [form, setForm] = useState<AllergiesForm>(emptyAllergiesForm);
  const [rowId, setRowId] = useState<string | null>(null);
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
      const { row, error } = await fetchAllergies(transId);
      if (cancelled) return;
      setLoading(false);
      if (error) {
        setLoadError(error);
        setForm({ ...emptyAllergiesForm });
        setRowId(null);
      } else {
        setRowId(row?.id ?? null);
        setForm(formFromAllergiesRowOrDefault(row));
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
    const { rowId: newId, error } = await persistAllergies(transId, rowId, form);
    setSaving(false);
    if (error) {
      setSaveError(error);
      return;
    }
    if (newId && !rowId) {
      setRowId(newId);
    }
  }, [hydrated, transId, rowId, form]);

  useConsultationDebouncedSave({
    ownTabIndex: 0,
    hydrated,
    runPersist,
    trigger: form,
  });

  function setNoKnownAllergy(checked: boolean) {
    setForm((prev) =>
      checked
        ? { ...emptyAllergiesForm, no_known_allergy: true }
        : { ...prev, no_known_allergy: false }
    );
  }

  const nka = form.no_known_allergy;
  const foodLineChecked = !!form.food_allergy.trim();
  const drugLineChecked = !!form.drug_allergy.trim();

  return (
    <>
      <Typography
        component="h3"
        variant="body2"
        fontWeight={800}
        sx={{
          mb: 1.25,
          color: "info.main",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
        }}
      >
        Allergies:
      </Typography>
      {loadError ? (
        <Alert severity="error" sx={{ mb: 1.5 }}>
          {loadError}
        </Alert>
      ) : null}
      {saveError ? (
        <Alert severity="error" sx={{ mb: 1.5 }} onClose={() => setSaveError("")}>
          {saveError}
        </Alert>
      ) : null}
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1, minHeight: 24 }}>
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
          display: "flex",
          flexWrap: "nowrap",
          alignItems: "center",
          gap: { xs: 1.5, sm: 2, md: 3 },
          mb: 1.5,
          width: "100%",
          minWidth: 0,
          overflowX: "auto",
          pb: 0.25,
          scrollbarWidth: "thin",
        }}
      >
        <FormControlLabel
          control={
            <Checkbox
              size="small"
              checked={nka}
              onChange={(_, c) => setNoKnownAllergy(c)}
              disabled={loading}
            />
          }
          label="None"
          sx={{ ...allergiesControlLabelSx, flexShrink: 0 }}
        />
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1.25,
            flex: "1 1 0",
            minWidth: 160,
            maxWidth: "100%",
          }}
        >
          <FormControlLabel
            control={
              <Checkbox
                size="small"
                checked={foodLineChecked}
                onChange={(_, c) => {
                  if (!c) {
                    setForm((p) => ({ ...p, food_allergy: "" }));
                  }
                }}
                disabled={loading || nka}
              />
            }
            label="Food:"
            sx={{ ...allergiesControlLabelSx, flexShrink: 0 }}
          />
          <TextField
            id={`${idPrefix}-allergy-food`}
            variant="standard"
            size="small"
            placeholder=" "
            value={form.food_allergy}
            onChange={(e) =>
              setForm((p) => ({
                ...p,
                no_known_allergy: false,
                food_allergy: e.target.value,
              }))
            }
            disabled={loading || nka}
            sx={allergiesInlineUnderlineFieldSx}
          />
        </Box>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1.25,
            flex: "1 1 0",
            minWidth: 160,
            maxWidth: "100%",
          }}
        >
          <FormControlLabel
            control={
              <Checkbox
                size="small"
                checked={drugLineChecked}
                onChange={(_, c) => {
                  if (!c) {
                    setForm((p) => ({ ...p, drug_allergy: "" }));
                  }
                }}
                disabled={loading || nka}
              />
            }
            label="Drugs:"
            sx={{ ...allergiesControlLabelSx, flexShrink: 0 }}
          />
          <TextField
            id={`${idPrefix}-allergy-drugs`}
            variant="standard"
            size="small"
            placeholder=" "
            value={form.drug_allergy}
            onChange={(e) =>
              setForm((p) => ({
                ...p,
                no_known_allergy: false,
                drug_allergy: e.target.value,
              }))
            }
            disabled={loading || nka}
            sx={allergiesInlineUnderlineFieldSx}
          />
        </Box>
      </Box>
      <FormFieldLabel htmlFor={`${idPrefix}-reaction`} variant="consultation">
        Reaction type (e.g. rash, anaphylaxis)
      </FormFieldLabel>
      <TextField
        id={`${idPrefix}-reaction`}
        hiddenLabel
        multiline
        minRows={2}
        placeholder=" "
        value={form.reaction_type}
        onChange={(e) =>
          setForm((p) => ({
            ...p,
            no_known_allergy: false,
            reaction_type: e.target.value,
          }))
        }
        disabled={loading || nka}
        {...commonFieldProps}
        sx={fieldMultilineInputSx}
      />
    </>
  );
}

function SocialHistorySection({ transId, idPrefix }: { transId: string; idPrefix: string }) {
  const [form, setForm] = useState<SocialHistoryForm>(emptySocialHistoryForm);
  const [rowId, setRowId] = useState<string | null>(null);
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
      const { row, error } = await fetchSocialHistory(transId);
      if (cancelled) return;
      setLoading(false);
      if (error) {
        setLoadError(error);
        setForm({ ...emptySocialHistoryForm });
        setRowId(null);
      } else {
        setRowId(row?.id ?? null);
        setForm(formFromSocialHistoryRowOrDefault(row));
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
    const { rowId: newId, error } = await persistSocialHistory(transId, rowId, form);
    setSaving(false);
    if (error) {
      setSaveError(error);
      return;
    }
    if (newId && !rowId) {
      setRowId(newId);
    }
  }, [hydrated, transId, rowId, form]);

  useConsultationDebouncedSave({
    ownTabIndex: 0,
    hydrated,
    runPersist,
    trigger: form,
  });

  const smokerVal = form.smoker === "yes" || form.smoker === "no" ? form.smoker : "";
  const alcoholVal = form.alcohol_use === "yes" || form.alcohol_use === "no" ? form.alcohol_use : "";
  const drugsVal = form.illicit_drugs === "yes" || form.illicit_drugs === "no" ? form.illicit_drugs : "";

  const packFid = `${idPrefix}-social-pack-years`;
  const alcoholYrsFid = `${idPrefix}-social-alcohol-years`;
  const drugNotesFid = `${idPrefix}-social-drug-notes`;

  return (
    <Box sx={{ ...panelSectionSx, mb: 2 }}>
      <ConsultationSectionTitle sx={{ mb: 1.25 }}>Social history</ConsultationSectionTitle>
      {loadError ? (
        <Alert severity="error" sx={{ mb: 1.5 }}>
          {loadError}
        </Alert>
      ) : null}
      {saveError ? (
        <Alert severity="error" sx={{ mb: 1.5 }} onClose={() => setSaveError("")}>
          {saveError}
        </Alert>
      ) : null}
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1, minHeight: 24 }}>
        {loading ? (
          <CircularProgress size={18} />
        ) : saving ? (
          <Typography variant="caption" color="text.secondary">
            Saving…
          </Typography>
        ) : null}
      </Box>
      <Box>
        <Box sx={{ mb: 2 }}>
          <Typography
            component="p"
            variant="body2"
            fontWeight={700}
            color="info.main"
            sx={{ mb: 0.5, letterSpacing: "0.02em" }}
          >
            Smoking
          </Typography>
          <RadioGroup
            row
            sx={{ mb: 1, ...yesNoRadioRowSx }}
            value={smokerVal}
            onChange={(_, v) =>
              setForm((p) => ({
                ...p,
                smoker: v as SocialHistoryForm["smoker"],
                pack_years: v === "no" ? "" : p.pack_years,
              }))
            }
          >
            <FormControlLabel
              value="yes"
              control={<Radio size="small" />}
              label="Yes"
              sx={controlLabelSx}
              disabled={loading}
            />
            <FormControlLabel
              value="no"
              control={<Radio size="small" />}
              label="No"
              sx={controlLabelSx}
              disabled={loading}
            />
          </RadioGroup>
          <FormFieldLabel htmlFor={packFid} variant="consultation">
            Pack years
          </FormFieldLabel>
          <TextField
            id={packFid}
            hiddenLabel
            placeholder="____"
            value={form.pack_years}
            onChange={(e) =>
              setForm((p) => ({
                ...p,
                pack_years: e.target.value,
              }))
            }
            disabled={loading || form.smoker !== "yes"}
            {...commonFieldProps}
            sx={fieldInputSx}
          />
        </Box>
        <Box sx={{ mb: 2 }}>
          <Typography
            component="p"
            variant="body2"
            fontWeight={700}
            color="info.main"
            sx={{ mb: 0.5, letterSpacing: "0.02em" }}
          >
            Alcohol
          </Typography>
          <RadioGroup
            row
            sx={{ mb: 1, ...yesNoRadioRowSx }}
            value={alcoholVal}
            onChange={(_, v) =>
              setForm((p) => ({
                ...p,
                alcohol_use: v as SocialHistoryForm["alcohol_use"],
                alcohol_years: v === "no" ? "" : p.alcohol_years,
              }))
            }
          >
            <FormControlLabel
              value="yes"
              control={<Radio size="small" />}
              label="Yes"
              sx={controlLabelSx}
              disabled={loading}
            />
            <FormControlLabel
              value="no"
              control={<Radio size="small" />}
              label="No"
              sx={controlLabelSx}
              disabled={loading}
            />
          </RadioGroup>
          <FormFieldLabel htmlFor={alcoholYrsFid} variant="consultation">
            Years
          </FormFieldLabel>
          <TextField
            id={alcoholYrsFid}
            hiddenLabel
            placeholder="____"
            value={form.alcohol_years}
            onChange={(e) =>
              setForm((p) => ({
                ...p,
                alcohol_years: e.target.value,
              }))
            }
            disabled={loading || form.alcohol_use !== "yes"}
            {...commonFieldProps}
            sx={fieldInputSx}
          />
        </Box>
        <Box>
          <Typography
            component="p"
            variant="body2"
            fontWeight={700}
            color="info.main"
            sx={{ mb: 0.5, letterSpacing: "0.02em" }}
          >
            Drugs
          </Typography>
          <RadioGroup
            row
            sx={{ ...yesNoRadioRowSx, mb: 1 }}
            value={drugsVal}
            onChange={(_, v) =>
              setForm((p) => ({
                ...p,
                illicit_drugs: v as SocialHistoryForm["illicit_drugs"],
                drug_notes: v === "no" ? "" : p.drug_notes,
              }))
            }
          >
            <FormControlLabel
              value="yes"
              control={<Radio size="small" />}
              label="Yes"
              sx={controlLabelSx}
              disabled={loading}
            />
            <FormControlLabel
              value="no"
              control={<Radio size="small" />}
              label="No"
              sx={controlLabelSx}
              disabled={loading}
            />
          </RadioGroup>
          <FormFieldLabel htmlFor={drugNotesFid} variant="consultation">
            Details (substances, frequency)
          </FormFieldLabel>
          <TextField
            id={drugNotesFid}
            hiddenLabel
            multiline
            minRows={2}
            placeholder=" "
            value={form.drug_notes}
            onChange={(e) =>
              setForm((p) => ({
                ...p,
                drug_notes: e.target.value,
              }))
            }
            disabled={loading || form.illicit_drugs !== "yes"}
            {...commonFieldProps}
            sx={fieldMultilineInputSx}
          />
        </Box>
      </Box>
    </Box>
  );
}

const OB_GPAL_KEYS = [
  "gravida",
  "para",
  "full_term",
  "premature",
  "abortion",
  "living",
] as const;

type ObGpalKey = (typeof OB_GPAL_KEYS)[number];

function ObstetricHistorySection({ transId, idPrefix }: { transId: string; idPrefix: string }) {
  const [form, setForm] = useState<ObstetricHistoryForm>(emptyObstetricHistoryForm);
  const [rowId, setRowId] = useState<string | null>(null);
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
      const { row, error } = await fetchObstetricHistory(transId);
      if (cancelled) return;
      setLoading(false);
      if (error) {
        setLoadError(error);
        setForm({ ...emptyObstetricHistoryForm });
        setRowId(null);
      } else {
        setRowId(row?.id ?? null);
        setForm(formFromObstetricHistoryRowOrDefault(row));
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
    const { rowId: newId, error } = await persistObstetricHistory(transId, rowId, form);
    setSaving(false);
    if (error) {
      setSaveError(error);
      return;
    }
    if (newId && !rowId) {
      setRowId(newId);
    }
  }, [hydrated, transId, rowId, form]);

  useConsultationDebouncedSave({
    ownTabIndex: 0,
    hydrated,
    runPersist,
    trigger: form,
  });

  const pregnantVal = form.pregnant === "y" || form.pregnant === "n" ? form.pregnant : "";
  const pncVal = form.prenatal === "yes" || form.prenatal === "no" ? form.prenatal : "";
  const off = loading || form.not_applicable;

  function setGpal(key: ObGpalKey, raw: string) {
    const v = raw.replace(/\D/g, "").slice(0, 2);
    setForm((p) => ({ ...p, [key]: v, not_applicable: false }));
  }

  return (
    <Box sx={{ ...panelSectionSx, mb: 2, mt: 2 }}>
      <ConsultationSectionTitle sx={{ mb: 1.25 }}>Obstetric</ConsultationSectionTitle>
      {loadError ? (
        <Alert severity="error" sx={{ mb: 1.5 }}>
          {loadError}
        </Alert>
      ) : null}
      {saveError ? (
        <Alert severity="error" sx={{ mb: 1.5 }} onClose={() => setSaveError("")}>
          {saveError}
        </Alert>
      ) : null}
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1, minHeight: 24 }}>
        {loading ? (
          <CircularProgress size={18} />
        ) : saving ? (
          <Typography variant="caption" color="text.secondary">
            Saving…
          </Typography>
        ) : null}
      </Box>
      <FormControlLabel
        control={
          <Checkbox
            size="small"
            checked={form.not_applicable}
            onChange={(_, c) => {
              if (c) {
                setForm({ ...emptyObstetricHistoryForm, not_applicable: true });
              } else {
                setForm((p) => ({ ...p, not_applicable: false }));
              }
            }}
            disabled={loading}
          />
        }
        label="N/A"
        sx={{ ...controlLabelSx, mb: 1 }}
      />
      <Grid container spacing={2} sx={{ mb: 1 }}>
        <Grid size={{ xs: 6 }}>
          <FormFieldLabel htmlFor={`${idPrefix}-obs-lmp`} variant="consultation">
            LMP
          </FormFieldLabel>
          <TextField
            id={`${idPrefix}-obs-lmp`}
            hiddenLabel
            type="date"
            value={form.lmp}
            onChange={(e) => setForm((p) => ({ ...p, lmp: e.target.value, not_applicable: false }))}
            disabled={off}
            {...commonFieldProps}
            sx={fieldInputSx}
            slotProps={{ htmlInput: { max: "9999-12-31" } }}
          />
        </Grid>
        <Grid size={{ xs: 6 }}>
          <Typography
            component="p"
            variant="body2"
            fontWeight={700}
            color="info.main"
            sx={{ mb: 0.5, letterSpacing: "0.02em" }}
          >
            Pregnant
          </Typography>
          <RadioGroup
            row
            sx={yesNoRadioRowSx}
            value={pregnantVal}
            onChange={(_, v) =>
              setForm((p) => ({
                ...p,
                pregnant: v as ObstetricHistoryForm["pregnant"],
                not_applicable: false,
              }))
            }
          >
            <FormControlLabel
              value="y"
              control={<Radio size="small" />}
              label="Yes"
              sx={controlLabelSx}
              disabled={off}
            />
            <FormControlLabel
              value="n"
              control={<Radio size="small" />}
              label="No"
              sx={controlLabelSx}
              disabled={off}
            />
          </RadioGroup>
        </Grid>
      </Grid>
      <Grid container spacing={1} sx={{ mb: 1, alignItems: "flex-end" }}>
        <Grid size={{ xs: 4 }}>
          <FormFieldLabel htmlFor={`${idPrefix}-obs-edc`} variant="consultation">
            EDC
          </FormFieldLabel>
          <TextField
            id={`${idPrefix}-obs-edc`}
            hiddenLabel
            type="date"
            value={form.edc}
            onChange={(e) => setForm((p) => ({ ...p, edc: e.target.value, not_applicable: false }))}
            disabled={off}
            {...commonFieldProps}
            sx={fieldInputSx}
            slotProps={{ htmlInput: { max: "9999-12-31" } }}
          />
        </Grid>
        <Grid size={{ xs: 4 }}>
          <FormFieldLabel htmlFor={`${idPrefix}-obs-aog`} variant="consultation">
            AOG
          </FormFieldLabel>
          <TextField
            id={`${idPrefix}-obs-aog`}
            hiddenLabel
            placeholder="____"
            value={form.aog}
            onChange={(e) =>
              setForm((p) => ({ ...p, aog: e.target.value, not_applicable: false }))
            }
            disabled={off}
            {...commonFieldProps}
            sx={fieldInputSx}
          />
        </Grid>
        <Grid size={{ xs: 4 }}>
          <FormFieldLabel htmlFor={`${idPrefix}-obs-wks`} variant="consultation">
            WKS
          </FormFieldLabel>
          <TextField
            id={`${idPrefix}-obs-wks`}
            hiddenLabel
            placeholder="____"
            value={form.wks}
            onChange={(e) =>
              setForm((p) => ({ ...p, wks: e.target.value, not_applicable: false }))
            }
            disabled={off}
            {...commonFieldProps}
            sx={fieldInputSx}
          />
        </Grid>
      </Grid>
      <Typography
        variant="body2"
        fontWeight={700}
        color="info.main"
        sx={{ mb: 0.5, letterSpacing: "0.02em" }}
      >
        BY
      </Typography>
      <Box sx={{ display: "flex", gap: 2, mb: 1.5 }}>
        <FormControlLabel
          control={
            <Checkbox
              size="small"
              checked={form.edc_by_utz}
              onChange={(_, c) =>
                setForm((p) => ({ ...p, edc_by_utz: c, not_applicable: false }))
              }
              disabled={off}
            />
          }
          label="UTZ"
          sx={controlLabelSx}
        />
        <FormControlLabel
          control={
            <Checkbox
              size="small"
              checked={form.edc_by_lmp}
              onChange={(_, c) =>
                setForm((p) => ({ ...p, edc_by_lmp: c, not_applicable: false }))
              }
              disabled={off}
            />
          }
          label="LMP"
          sx={controlLabelSx}
        />
      </Box>
      <Table size="small" sx={{ mb: 1.5, border: "1px solid", borderColor: "divider", maxWidth: 400 }}>
        <TableHead>
          <TableRow sx={{ bgcolor: "grey.200" }}>
            {["G", "P", "F", "P", "A", "L"].map((h, idx) => (
              <TableCell
                key={`gp-${idx}`}
                align="center"
                sx={{ textTransform: "uppercase", fontWeight: 700, py: 0.5, color: "info.main" }}
              >
                {h}
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          <TableRow>
            {OB_GPAL_KEYS.map((key, i) => (
              <TableCell key={key} sx={{ p: 0.75, verticalAlign: "middle" }}>
                <TextField
                  id={`${idPrefix}-gpal-${i}`}
                  hiddenLabel
                  placeholder=" "
                  value={form[key]}
                  onChange={(e) => setGpal(key, e.target.value)}
                  disabled={off}
                  {...commonFieldProps}
                  sx={{
                    ...fieldInputSx,
                    "& .MuiInputBase-input": {
                      height: "100%",
                      boxSizing: "border-box",
                      textTransform: "uppercase",
                      textAlign: "center",
                    },
                  }}
                />
              </TableCell>
            ))}
          </TableRow>
        </TableBody>
      </Table>
      <Grid container spacing={2} sx={{ mb: 1 }}>
        <Grid size={{ xs: 6 }}>
          <FormFieldLabel htmlFor={`${idPrefix}-obs-fh`} variant="consultation">
            FH (cm)
          </FormFieldLabel>
          <TextField
            id={`${idPrefix}-obs-fh`}
            hiddenLabel
            placeholder="____"
            value={form.fh_cm}
            onChange={(e) =>
              setForm((p) => ({ ...p, fh_cm: e.target.value, not_applicable: false }))
            }
            disabled={off}
            {...commonFieldProps}
            sx={fieldInputSx}
          />
        </Grid>
        <Grid size={{ xs: 6 }}>
          <FormFieldLabel htmlFor={`${idPrefix}-obs-efw`} variant="consultation">
            EFW (g)
          </FormFieldLabel>
          <TextField
            id={`${idPrefix}-obs-efw`}
            hiddenLabel
            placeholder="____"
            value={form.efw_g}
            onChange={(e) =>
              setForm((p) => ({
                ...p,
                efw_g: e.target.value.replace(/\D/g, "").slice(0, 6),
                not_applicable: false,
              }))
            }
            disabled={off}
            {...commonFieldProps}
            sx={fieldInputSx}
          />
        </Grid>
      </Grid>
      <Typography
        component="p"
        variant="body2"
        fontWeight={700}
        color="info.main"
        sx={{ mb: 0.5, letterSpacing: "0.02em" }}
      >
        PNC
      </Typography>
      <RadioGroup
        row
        sx={yesNoRadioRowSx}
        value={pncVal}
        onChange={(_, v) =>
          setForm((p) => ({
            ...p,
            prenatal: v as ObstetricHistoryForm["prenatal"],
            not_applicable: false,
          }))
        }
      >
        <FormControlLabel
          value="yes"
          control={<Radio size="small" />}
          label="Yes"
          sx={controlLabelSx}
          disabled={off}
        />
        <FormControlLabel
          value="no"
          control={<Radio size="small" />}
          label="No"
          sx={controlLabelSx}
          disabled={off}
        />
      </RadioGroup>
    </Box>
  );
}

export default function MedicalHistoryPanel({ transId }: { transId: string }) {
  const rawId = useId();
  const idPrefix = `mh${rawId.replace(/\W/g, "")}`;

  return (
    <Box sx={tabPanelSx}>
      <Box
        sx={{
          bgcolor: "info.main",
          color: "info.contrastText",
          py: 1.25,
          px: 2,
          borderRadius: 1,
          mb: 2,
          textAlign: "center",
        }}
      >
        <Typography variant="subtitle1" fontWeight={800} letterSpacing="0.1em">
          MEDICAL HISTORY
        </Typography>
      </Box>

      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 6 }}>
          <ConsultationSectionTitle>Vital signs</ConsultationSectionTitle>
          <VitalSignsSection transId={transId} idPrefix={idPrefix} />

          <PastMedicalHistorySection transId={transId} idPrefix={idPrefix} />

          <FamilyHistorySection transId={transId} idPrefix={idPrefix} />

          <SurgicalHistorySection transId={transId} idPrefix={idPrefix} />

          <PreviousHospitalizationSection transId={transId} idPrefix={idPrefix} />
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <ConsultationSectionTitle>Anthropometric</ConsultationSectionTitle>
          <AnthropometricSection transId={transId} idPrefix={idPrefix} />

          <Box sx={{ ...panelSectionSx, mb: 2 }}>
            <AllergiesSection transId={transId} idPrefix={idPrefix} />

            <Box sx={{ mt: 2.5 }}>
              <ConsultationSubsectionTitle>Current medications</ConsultationSubsectionTitle>
              <TextField
                id={`${idPrefix}-meds-1`}
                hiddenLabel
                multiline
                minRows={2}
                placeholder=" "
                {...commonFieldProps}
                sx={[fieldMultilineInputSx, { mb: 1 }]}
              />
              <TextField
                id={`${idPrefix}-meds-2`}
                hiddenLabel
                multiline
                minRows={2}
                placeholder=" "
                {...commonFieldProps}
                sx={fieldMultilineInputSx}
              />
            </Box>
          </Box>

          <SocialHistorySection transId={transId} idPrefix={idPrefix} />

          <ObstetricHistorySection transId={transId} idPrefix={idPrefix} />
        </Grid>
      </Grid>
    </Box>
  );
}
