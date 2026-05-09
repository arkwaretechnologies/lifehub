"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Box,
  Checkbox,
  CircularProgress,
  FormControlLabel,
  Grid,
  Stack,
  Typography,
} from "@mui/material";
import { consultFormControlLabelSx } from "@/components/consultation/ConsultationSectionTitle";
import { useConsultationSave } from "@/components/consultation/consultationSaveContext";
import {
  emptyReviewOfSystemsForm,
  fetchReviewOfSystems,
  formFromRowOrDefault,
  persistReviewOfSystems,
  type ReviewOfSystemsBooleanKey,
  type ReviewOfSystemsForm,
} from "@/lib/reviewOfSystems";

const tabPanelSx = { pt: 0, minHeight: 280 };

const rosItemSx = {
  ...consultFormControlLabelSx,
  ml: 0,
  width: "auto",
  flexShrink: 0,
  "& .MuiFormControlLabel-label": {
    fontSize: "0.8125rem",
    fontWeight: 500,
    color: "text.primary",
    pl: 0,
  },
} as const;

const sectionBoxSx = {
  border: "1px solid",
  borderColor: "info.main",
  borderRadius: 1,
  p: { xs: 2, sm: 2.5 },
  bgcolor: "background.paper",
  mb: 2,
  boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)",
} as const;

const LABEL_COL = { xs: 12, sm: 4, md: 3.5 } as const;
const SYMPTOMS_COL = { xs: 12, sm: 8, md: 8.5 } as const;

type RosItemConfig = { label: string; keys: readonly ReviewOfSystemsBooleanKey[] };
type RosLineConfig = { category: string; items: readonly RosItemConfig[] };

const ROS_SECTION_A: RosLineConfig[] = [
  {
    category: "Constitutional",
    items: [
      { label: "Fever", keys: ["ros_fever"] },
      { label: "Weight loss", keys: ["ros_weight_loss"] },
      { label: "Fatigue", keys: ["ros_fatigue"] },
    ],
  },
  {
    category: "Eyes",
    items: [
      { label: "Vision changes", keys: ["ros_vision_changes"] },
      { label: "Redness", keys: ["ros_eye_redness"] },
      { label: "Discharge", keys: ["ros_eye_discharge"] },
    ],
  },
  {
    category: "Ears, Nose, Throat",
    items: [
      { label: "Hearing changes", keys: ["ros_hearing_changes"] },
      { label: "Nasal congestion", keys: ["ros_nasal_congestion"] },
      { label: "Sore throat", keys: ["ros_sore_throat"] },
    ],
  },
  {
    category: "Cardiovascular",
    items: [
      { label: "Chest pain", keys: ["ros_chest_pain"] },
      { label: "Palpitations", keys: ["ros_palpitations"] },
      { label: "Edema", keys: ["ros_edema"] },
    ],
  },
  {
    category: "Respiratory",
    items: [
      { label: "Shortness of breath", keys: ["ros_sob"] },
      { label: "Wheezing", keys: ["ros_wheezing"] },
      { label: "Cough", keys: ["ros_cough"] },
    ],
  },
  {
    category: "Gastrointestinal",
    items: [
      { label: "Nausea", keys: ["ros_nausea"] },
      { label: "Vomiting", keys: ["ros_vomiting"] },
      { label: "Diarrhea", keys: ["ros_diarrhea"] },
      { label: "Abdominal pain", keys: ["ros_abdominal_pain"] },
    ],
  },
  {
    category: "Genitourinary",
    items: [
      { label: "Urinary frequency", keys: ["ros_urinary_frequency"] },
      { label: "Urgency", keys: ["ros_urinary_urgency"] },
      { label: "Incontinence", keys: ["ros_incontinence"] },
    ],
  },
  {
    category: "Musculoskeletal",
    items: [
      { label: "Joint pain", keys: ["ros_joint_pain"] },
      { label: "Muscle weakness", keys: ["ros_muscle_weakness"] },
    ],
  },
  {
    category: "Skin/Breast",
    items: [
      { label: "Rashes", keys: ["ros_rashes"] },
      { label: "Lesions", keys: ["ros_lesions"] },
      { label: "Lumps", keys: ["ros_lumps"] },
    ],
  },
  {
    category: "Neurological",
    items: [
      { label: "Headaches", keys: ["ros_headaches"] },
      { label: "Dizziness", keys: ["ros_dizziness"] },
      { label: "Numbness", keys: ["ros_numbness"] },
    ],
  },
];

const ROS_SECTION_B: RosLineConfig[] = [
  {
    category: "Psychiatric",
    items: [
      { label: "Depression", keys: ["ros_depression"] },
      { label: "Anxiety", keys: ["ros_anxiety"] },
      { label: "Sleep disturbances", keys: ["ros_sleep_disturbances"] },
    ],
  },
  {
    category: "Endocrine",
    items: [
      { label: "Hot flashes", keys: ["ros_hot_flashes"] },
      { label: "Intolerance to heat/cold", keys: ["ros_heat_cold_intolerance"] },
      { label: "Excessive thirst", keys: ["ros_excessive_thirst"] },
    ],
  },
  {
    category: "Hematologic/Lymphatic",
    items: [
      { label: "Easy bruising", keys: ["ros_easy_bruising"] },
      { label: "Bleeding", keys: ["ros_bleeding"] },
      { label: "Swollen glands", keys: ["ros_swollen_glands"] },
    ],
  },
  {
    category: "Immunology",
    items: [
      { label: "Seasonal allergies", keys: ["ros_seasonal_allergies"] },
      { label: "Frequent infections", keys: ["ros_frequent_infections"] },
      { label: "Hives/rashes", keys: ["ros_hives_rashes"] },
    ],
  },
];

function RosRow({
  line,
  form,
  disabled,
  onToggleKeys,
}: {
  line: RosLineConfig;
  form: ReviewOfSystemsForm;
  disabled: boolean;
  onToggleKeys: (keys: readonly ReviewOfSystemsBooleanKey[], checked: boolean) => void;
}) {
  return (
    <Grid container spacing={{ xs: 0.75, sm: 2 }} alignItems="flex-start" columnSpacing={{ sm: 2 }}>
      <Grid size={LABEL_COL}>
        <Typography
          variant="body2"
          fontWeight={700}
          sx={{
            color: "text.primary",
            lineHeight: 1.4,
            pr: { sm: 1 },
            pt: { xs: 0, sm: "3px" },
            textAlign: { xs: "left", sm: "right" },
          }}
        >
          {line.category}:
        </Typography>
      </Grid>
      <Grid size={SYMPTOMS_COL} sx={{ minWidth: 0 }}>
        <Box
          sx={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            columnGap: { xs: 1, sm: 2 },
            rowGap: 1,
            pl: { xs: 0, sm: 0.5 },
          }}
        >
          {line.items.map((item) => {
            const checked = item.keys.some((k) => form[k]);
            return (
              <FormControlLabel
                key={item.label}
                control={
                  <Checkbox
                    size="small"
                    checked={checked}
                    disabled={disabled}
                    onChange={(_, c) => onToggleKeys(item.keys, c)}
                  />
                }
                label={item.label}
                sx={rosItemSx}
              />
            );
          })}
        </Box>
      </Grid>
    </Grid>
  );
}

function RosSection({
  lines,
  form,
  disabled,
  onToggleKeys,
}: {
  lines: RosLineConfig[];
  form: ReviewOfSystemsForm;
  disabled: boolean;
  onToggleKeys: (keys: readonly ReviewOfSystemsBooleanKey[], checked: boolean) => void;
}) {
  return (
    <Stack spacing={{ xs: 2, sm: 2.5 }}>
      {lines.map((line) => (
        <RosRow
          key={line.category}
          line={line}
          form={form}
          disabled={disabled}
          onToggleKeys={onToggleKeys}
        />
      ))}
    </Stack>
  );
}

export default function ReviewOfSystemsPanel({ transId }: { transId: string }) {
  const [form, setForm] = useState<ReviewOfSystemsForm>(() => emptyReviewOfSystemsForm());
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
      const { row, error } = await fetchReviewOfSystems(transId);
      if (cancelled) return;
      setLoading(false);
      if (error) {
        setLoadError(error);
        setForm(emptyReviewOfSystemsForm());
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

  const onToggleKeys = useCallback((keys: readonly ReviewOfSystemsBooleanKey[], checked: boolean) => {
    setForm((prev) => {
      const next = { ...prev };
      for (const k of keys) {
        next[k] = checked;
      }
      return next;
    });
  }, []);

  const runPersist = useCallback(async () => {
    if (!hydrated) return;
    setSaveError("");
    setSaving(true);
    const { rowId: newId, error } = await persistReviewOfSystems(transId, rowId, form);
    setSaving(false);
    if (error) {
      setSaveError(error);
      return;
    }
    if (newId && !rowId) {
      setRowId(newId);
    }
    setPanelDirty("review-of-systems", false);
  }, [hydrated, transId, rowId, form, setPanelDirty]);

  useEffect(() => {
    if (!hydrated) return;
    return registerSaveHandler("review-of-systems", runPersist);
  }, [registerSaveHandler, runPersist, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    setPanelDirty("review-of-systems", true);
  }, [form, hydrated, setPanelDirty]);

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
          REVIEW OF SYSTEMS
        </Typography>
      </Box>

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
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2, minHeight: 24 }}>
        {loading ? (
          <CircularProgress size={18} />
        ) : saving ? (
          <Typography variant="caption" color="text.secondary">
            Saving…
          </Typography>
        ) : null}
      </Box>

      <Box sx={sectionBoxSx}>
        <RosSection
          lines={ROS_SECTION_A}
          form={form}
          disabled={loading}
          onToggleKeys={onToggleKeys}
        />
      </Box>

      <Box sx={{ ...sectionBoxSx, mb: 0 }}>
        <RosSection
          lines={ROS_SECTION_B}
          form={form}
          disabled={loading}
          onToggleKeys={onToggleKeys}
        />
      </Box>
    </Box>
  );
}
