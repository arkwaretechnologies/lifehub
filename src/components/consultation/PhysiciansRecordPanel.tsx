"use client";

/**
 * Physician's Record — chief complaint & HPI → `encounters`; physical / neurologic exam → `physical_examination`.
 * Autosave runs only while this tab (index 2) is active.
 */

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import {
  Alert,
  Box,
  Checkbox,
  CircularProgress,
  Divider,
  FormControlLabel,
  Grid,
  TextField,
  Typography,
} from "@mui/material";
import {
  ConsultationSectionTitle,
  consultFormControlLabelSx,
} from "@/components/consultation/ConsultationSectionTitle";
import { useConsultationDebouncedSave } from "@/components/consultation/useConsultationDebouncedSave";
import {
  fetchEncounterPhysicianRecord,
  persistEncounterPhysicianRecord,
} from "@/lib/consultationData";
import {
  fetchPhysicalExamination,
  formFromPhysicalExaminationRowOrDefault,
  persistPhysicalExamination,
  type PhysicalExaminationForm,
} from "@/lib/physicalExamination";

const tabPanelSx = { pt: 0, minHeight: 280 };

const headerBarSx = {
  bgcolor: "info.main",
  color: "info.contrastText",
  py: 1.25,
  px: 2,
  borderRadius: 1,
  mb: 2,
  textAlign: "center",
} as const;

const peColumnSx = {
  border: "1px solid",
  borderColor: "info.main",
  borderRadius: 1,
  p: { xs: 1.5, sm: 2 },
  bgcolor: "background.paper",
  height: "100%",
} as const;

type PhysicalExamBoolKey = {
  [K in keyof PhysicalExaminationForm]: PhysicalExaminationForm[K] extends boolean ? K : never;
}[keyof PhysicalExaminationForm];

type PhysicalExamStringKey = {
  [K in keyof PhysicalExaminationForm]: PhysicalExaminationForm[K] extends string ? K : never;
}[keyof PhysicalExaminationForm];

function ControlledCheckboxRow({
  items,
  form,
  setForm,
  disabled,
}: {
  items: { label: string; key: PhysicalExamBoolKey }[];
  form: PhysicalExaminationForm;
  setForm: Dispatch<SetStateAction<PhysicalExaminationForm>>;
  disabled?: boolean;
}) {
  return (
    <Box
      sx={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        columnGap: { xs: 1, sm: 1.5 },
        rowGap: 0.5,
        mb: 0.5,
      }}
    >
      {items.map(({ label, key }) => (
        <FormControlLabel
          key={key}
          control={
            <Checkbox
              size="small"
              checked={form[key]}
              disabled={disabled}
              onChange={(_, checked) => setForm((f) => ({ ...f, [key]: checked }))}
            />
          }
          label={label}
          sx={consultFormControlLabelSx}
        />
      ))}
    </Box>
  );
}

function ControlledPeBlock({
  title,
  checkItems,
  notesKey,
  form,
  setForm,
  disabled,
}: {
  title: string;
  checkItems: { label: string; key: PhysicalExamBoolKey }[];
  notesKey: PhysicalExamStringKey;
  form: PhysicalExaminationForm;
  setForm: Dispatch<SetStateAction<PhysicalExaminationForm>>;
  disabled?: boolean;
}) {
  return (
    <Box sx={{ mb: 2 }}>
      <ConsultationSectionTitle dense>{title}</ConsultationSectionTitle>
      <ControlledCheckboxRow items={checkItems} form={form} setForm={setForm} disabled={disabled} />
      <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ mt: 1, display: "block" }}>
        OTHERS
      </Typography>
      <Divider sx={{ borderColor: "info.light", my: 0.75 }} />
      <TextField
        variant="standard"
        fullWidth
        size="small"
        placeholder=" "
        hiddenLabel
        value={form[notesKey]}
        disabled={disabled}
        onChange={(e) => setForm((f) => ({ ...f, [notesKey]: e.target.value }))}
      />
    </Box>
  );
}

const CNS_LINES: { label: string; field: PhysicalExamStringKey; suffix: string }[] = [
  { label: "I:", field: "pe_neuro_cn_i", suffix: "cns-i" },
  { label: "II, III:", field: "pe_neuro_cn_ii_iii", suffix: "cns-ii-iii" },
  { label: "IV, VI:", field: "pe_neuro_cn_iv_vi", suffix: "cns-iv-vi" },
  { label: "V, VII:", field: "pe_neuro_cn_v_vii", suffix: "cns-v-vii" },
  { label: "VIII:", field: "pe_neuro_cn_viii", suffix: "cns-viii" },
  { label: "IX, X:", field: "pe_neuro_cn_ix_x", suffix: "cns-ix-x" },
  { label: "XI, XII:", field: "pe_neuro_cn_xi_xii", suffix: "cns-xi-xii" },
];

export default function PhysiciansRecordPanel({ transId }: { transId: string }) {
  const rawId = useId();
  const idPrefix = `pr${rawId.replace(/\W/g, "")}`;
  const chiefFid = `${idPrefix}-chief-complaint`;
  const hpiFid = `${idPrefix}-hpi`;

  const [chiefComplaint, setChiefComplaint] = useState("");
  const [hpi, setHpi] = useState("");
  const [peForm, setPeForm] = useState<PhysicalExaminationForm>(() =>
    formFromPhysicalExaminationRowOrDefault(null)
  );
  const [peRowId, setPeRowId] = useState<string | null>(null);
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
      const [phys, pe] = await Promise.all([
        fetchEncounterPhysicianRecord(transId),
        fetchPhysicalExamination(transId),
      ]);
      if (cancelled) return;
      setLoading(false);
      const errs: string[] = [];
      if (phys.error) errs.push(phys.error);
      if (pe.error) errs.push(pe.error);
      setLoadError(errs.join(" · "));
      if (!phys.error) {
        setChiefComplaint(phys.form.chief_complaint);
        setHpi(phys.form.history_of_present_illness);
      } else {
        setChiefComplaint("");
        setHpi("");
      }
      if (!pe.error) {
        setPeForm(formFromPhysicalExaminationRowOrDefault(pe.row));
        setPeRowId(pe.row?.id ?? null);
      } else {
        setPeForm(formFromPhysicalExaminationRowOrDefault(null));
        setPeRowId(null);
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
    const [physRes, peRes] = await Promise.all([
      persistEncounterPhysicianRecord(transId, {
        chief_complaint: chiefComplaint,
        history_of_present_illness: hpi,
      }),
      persistPhysicalExamination(transId, peRowId, peForm),
    ]);
    setSaving(false);
    const errs: string[] = [];
    if (physRes.error) errs.push(physRes.error);
    if (peRes.error) errs.push(peRes.error);
    if (errs.length) setSaveError(errs.join(" · "));
    if (peRes.rowId) setPeRowId(peRes.rowId);
  }, [hydrated, transId, chiefComplaint, hpi, peRowId, peForm]);

  const saveTrigger = useMemo(
    () => ({ chiefComplaint, hpi, peForm }),
    [chiefComplaint, hpi, peForm]
  );

  useConsultationDebouncedSave({
    ownTabIndex: 2,
    hydrated,
    runPersist,
    trigger: saveTrigger,
  });

  const peDisabled = loading;

  return (
    <Box sx={tabPanelSx}>
      <Box sx={headerBarSx}>
        <Typography variant="subtitle1" fontWeight={800} letterSpacing="0.1em">
          PHYSICIAN&apos;S RECORD
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

      <Typography component="label" htmlFor={chiefFid} variant="body2" fontWeight={700} color="info.main" sx={{ mb: 1, display: "block" }}>
        CHIEF COMPLAINT
      </Typography>
      <TextField
        id={chiefFid}
        fullWidth
        multiline
        minRows={4}
        placeholder=" "
        value={chiefComplaint}
        onChange={(e) => setChiefComplaint(e.target.value)}
        disabled={loading}
        sx={{ mb: 3, "& .MuiOutlinedInput-root": { bgcolor: "background.paper" } }}
      />

      <Typography component="label" htmlFor={hpiFid} variant="body2" fontWeight={700} color="info.main" sx={{ mb: 1, display: "block" }}>
        HISTORY OF PRESENT ILLNESS
      </Typography>
      <TextField
        id={hpiFid}
        fullWidth
        multiline
        minRows={6}
        placeholder=" "
        value={hpi}
        onChange={(e) => setHpi(e.target.value)}
        disabled={loading}
        sx={{ mb: 3, "& .MuiOutlinedInput-root": { bgcolor: "background.paper" } }}
      />

      <Grid container spacing={2} alignItems="stretch">
        <Grid size={{ xs: 12, md: 8 }}>
          <Box sx={peColumnSx}>
            <Typography
              variant="subtitle2"
              fontWeight={800}
              color="info.main"
              sx={{ mb: 2, letterSpacing: "0.06em" }}
            >
              PHYSICAL EXAMINATION
            </Typography>

            <ControlledPeBlock
              title="GENERAL"
              checkItems={[
                { label: "ALERT", key: "pe_general_alert" },
                { label: "DISTRESS", key: "pe_general_distress" },
                { label: "DROWSY", key: "pe_general_drowsy" },
                { label: "COMA", key: "pe_general_coma" },
              ]}
              notesKey="pe_general_notes"
              form={peForm}
              setForm={setPeForm}
              disabled={peDisabled}
            />
            <ControlledPeBlock
              title="HEENT"
              checkItems={[
                { label: "LIDS/ CONJ NIL", key: "pe_heent_lids_conj_nil" },
                { label: "PERRLA", key: "pe_heent_perrla" },
                { label: "TYM CANAL", key: "pe_heent_tym_canal" },
                { label: "NASAL NL", key: "pe_heent_nasal_nl" },
                { label: "LIPS, TEETH, GUMS", key: "pe_heent_lips_teeth_gums" },
              ]}
              notesKey="pe_heent_notes"
              form={peForm}
              setForm={setPeForm}
              disabled={peDisabled}
            />
            <ControlledPeBlock
              title="CHEST/LUNGS"
              checkItems={[
                { label: "NL RESP EFFORT", key: "pe_chest_nl_resp_effort" },
                { label: "CBS", key: "pe_chest_cbs" },
                { label: "NL PALPATION", key: "pe_chest_nl_palpation" },
                { label: "NL SYMMETRY & EXPANSION", key: "pe_chest_nl_symmetry" },
              ]}
              notesKey="pe_chest_notes"
              form={peForm}
              setForm={setPeForm}
              disabled={peDisabled}
            />
            <ControlledPeBlock
              title="CVS"
              checkItems={[
                { label: "RRR", key: "pe_cvs_rrr" },
                { label: "NO MURMUR/ GALLOP", key: "pe_cvs_no_murmur_gallop" },
                { label: "NL S1S2", key: "pe_cvs_nl_s1s2" },
                { label: "PULSES", key: "pe_cvs_pulses" },
              ]}
              notesKey="pe_cvs_notes"
              form={peForm}
              setForm={setPeForm}
              disabled={peDisabled}
            />
            <ControlledPeBlock
              title="ABDOMEN/ GI"
              checkItems={[
                { label: "NO TENDERNESS/MASS", key: "pe_abdomen_no_tenderness" },
                { label: "LIVER SPLEEN", key: "pe_abdomen_liver_spleen" },
                { label: "NO HERNIA", key: "pe_abdomen_no_hernia" },
                { label: "+BS", key: "pe_abdomen_bs_present" },
                { label: "NO GUARDING", key: "pe_abdomen_no_guarding" },
              ]}
              notesKey="pe_abdomen_notes"
              form={peForm}
              setForm={setPeForm}
              disabled={peDisabled}
            />
            <ControlledPeBlock
              title="GU"
              checkItems={[
                { label: "MALE", key: "pe_gu_male" },
                { label: "FEMALE", key: "pe_gu_female" },
                { label: "NO CVA TENDERNESS", key: "pe_gu_no_cva_tenderness" },
                { label: "SCROTAL CONTENT WNL", key: "pe_gu_scrotal_wnl" },
                { label: "PELVIC EXAM NL", key: "pe_gu_pelvic_nl" },
              ]}
              notesKey="pe_gu_notes"
              form={peForm}
              setForm={setPeForm}
              disabled={peDisabled}
            />

            <Box sx={{ mb: 2 }}>
              <ControlledCheckboxRow
                items={[
                  { label: "NL GAIT", key: "pe_ext_nl_gait" },
                  { label: "NL STRENGTH", key: "pe_ext_nl_strength" },
                  { label: "NL DIGITS/NAILS", key: "pe_ext_nl_digits_nails" },
                  { label: "NL CLUBBING NL TONE", key: "pe_ext_nl_clubbing_tone" },
                ]}
                form={peForm}
                setForm={setPeForm}
                disabled={peDisabled}
              />
            </Box>

            <ConsultationSectionTitle dense>EXTREMITIES / MSK</ConsultationSectionTitle>
            <ControlledCheckboxRow
              items={[
                { label: "EDEMA", key: "pe_ext_edema" },
                { label: "ULCERS", key: "pe_ext_ulcers" },
              ]}
              form={peForm}
              setForm={setPeForm}
              disabled={peDisabled}
            />
            <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ mt: 1, display: "block" }}>
              OTHERS
            </Typography>
            <Divider sx={{ borderColor: "info.light", my: 0.75 }} />
            <TextField
              variant="standard"
              fullWidth
              size="small"
              placeholder=" "
              hiddenLabel
              value={peForm.pe_ext_notes}
              disabled={peDisabled}
              onChange={(e) => setPeForm((f) => ({ ...f, pe_ext_notes: e.target.value }))}
            />
          </Box>
        </Grid>

        <Grid size={{ xs: 12, md: 4 }}>
          <Box sx={peColumnSx}>
            <Typography
              variant="subtitle2"
              fontWeight={800}
              color="info.main"
              sx={{ mb: 2, letterSpacing: "0.06em" }}
            >
              NEUROLOGIC EXAMINATION
            </Typography>

            <ConsultationSectionTitle dense>MMS</ConsultationSectionTitle>
            <ControlledCheckboxRow
              items={[
                { label: "ALERT", key: "pe_neuro_alert" },
                { label: "ORIENTED", key: "pe_neuro_oriented" },
                { label: "JUDGMENT/INSIGHT", key: "pe_neuro_judgment_insight" },
                { label: "MEMORY", key: "pe_neuro_memory" },
                { label: "MOOD", key: "pe_neuro_mood" },
                { label: "NO DELUSIONS", key: "pe_neuro_no_delusions" },
              ]}
              form={peForm}
              setForm={setPeForm}
              disabled={peDisabled}
            />

            <ConsultationSectionTitle dense sx={{ mt: 2 }}>
              CEREBRAL
            </ConsultationSectionTitle>
            <TextField
              variant="standard"
              fullWidth
              size="small"
              placeholder=" "
              sx={{ mb: 2 }}
              hiddenLabel
              value={peForm.pe_neuro_cerebral}
              disabled={peDisabled}
              onChange={(e) => setPeForm((f) => ({ ...f, pe_neuro_cerebral: e.target.value }))}
            />

            <ConsultationSectionTitle dense>CNS</ConsultationSectionTitle>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1, mb: 2 }}>
              {CNS_LINES.map((row) => {
                const cid = `${idPrefix}-${row.suffix}`;
                return (
                  <Box
                    key={row.suffix}
                    sx={{ display: "flex", alignItems: "baseline", gap: 1, flexWrap: "wrap" }}
                  >
                    <Typography
                      component="label"
                      htmlFor={cid}
                      variant="body2"
                      fontWeight={600}
                      sx={{ minWidth: 72, color: "text.primary" }}
                    >
                      {row.label}
                    </Typography>
                    <TextField
                      id={cid}
                      variant="standard"
                      size="small"
                      fullWidth
                      sx={{ flex: 1, minWidth: 120 }}
                      value={peForm[row.field]}
                      disabled={peDisabled}
                      onChange={(e) =>
                        setPeForm((f) => ({ ...f, [row.field]: e.target.value }))
                      }
                    />
                  </Box>
                );
              })}
            </Box>

            <ConsultationSectionTitle dense>CEREBELLAR</ConsultationSectionTitle>
            <TextField
              variant="standard"
              fullWidth
              size="small"
              placeholder=" "
              sx={{ mb: 2 }}
              hiddenLabel
              value={peForm.pe_neuro_cerebellar}
              disabled={peDisabled}
              onChange={(e) => setPeForm((f) => ({ ...f, pe_neuro_cerebellar: e.target.value }))}
            />

            <ConsultationSectionTitle dense>MOTOR STRENGTH</ConsultationSectionTitle>
            <TextField
              variant="standard"
              fullWidth
              size="small"
              placeholder=" "
              sx={{ mb: 2 }}
              hiddenLabel
              value={peForm.pe_neuro_motor_strength}
              disabled={peDisabled}
              onChange={(e) => setPeForm((f) => ({ ...f, pe_neuro_motor_strength: e.target.value }))}
            />

            <ConsultationSectionTitle dense>SENSORY/REFLEXES</ConsultationSectionTitle>
            <TextField
              variant="standard"
              fullWidth
              size="small"
              placeholder=" "
              hiddenLabel
              value={peForm.pe_neuro_sensory_reflex}
              disabled={peDisabled}
              onChange={(e) => setPeForm((f) => ({ ...f, pe_neuro_sensory_reflex: e.target.value }))}
            />
          </Box>
        </Grid>
      </Grid>
    </Box>
  );
}
