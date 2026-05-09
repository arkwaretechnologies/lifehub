"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Tab, Tabs, Typography } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import CloseOutlinedIcon from "@mui/icons-material/CloseOutlined";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import PrintOutlinedIcon from "@mui/icons-material/PrintOutlined";
import SaveOutlinedIcon from "@mui/icons-material/SaveOutlined";
import type { ConsultationPatient } from "./consultationTypes";
import { ConsultationActiveTabContext } from "./consultationTabContext";
import { ConsultationSaveProvider, useConsultationSave } from "./consultationSaveContext";
import AssessmentDiagnosisPanel from "./AssessmentDiagnosisPanel";
import FocusedExamNotesPanel from "./FocusedExamNotesPanel";
import MedicalHistoryPanel from "./MedicalHistoryPanel";
import PatientInformationBanner from "./PatientInformationBanner";
import PhysiciansRecordPanel from "./PhysiciansRecordPanel";
import PlansTreatmentPanel from "./PlansTreatmentPanel";
import ReviewOfSystemsPanel from "./ReviewOfSystemsPanel";
import ChargesServicesPanel from "./ChargesServicesPanel";
import { useAuth } from "@/components/AuthProvider";
import { fetchEncounterClinicalDiagnosis, fetchEncounterPhysicianRecord, fetchEncounterPlansTreatment } from "@/lib/consultationData";
import {
  emptyPhysicalExaminationForm,
  fetchFocusedExamNotes,
  fetchPhysicalExamination,
  formFromPhysicalExaminationRowOrDefault,
  type PhysicalExaminationForm,
} from "@/lib/physicalExamination";
import { openConsultationPrintWindow } from "@/lib/consultationPrint";
import type { UserProfile } from "@/lib/types";
import { formFromAllergiesRowOrDefault, fetchAllergies } from "@/lib/allergies";
import { fetchCurrentMedicationsForEncounter } from "@/lib/currentMedications";
import { fetchFamilyHistory, formFromFamilyRowOrDefault } from "@/lib/familyHistory";
import { formFromRowOrDefault, fetchPastMedicalHistory } from "@/lib/pastMedicalHistory";
import {
  fetchObstetricHistory,
  formFromObstetricHistoryRowOrDefault,
} from "@/lib/obstetricHistory";
import {
  fetchPreviousHospitalization,
  formFromPreviousHospitalizationRowOrDefault,
} from "@/lib/previousHospitalizations";
import {
  fetchReviewOfSystems,
  formFromRowOrDefault as rosFormFromRowOrDefault,
  emptyReviewOfSystemsForm,
  type ReviewOfSystemsBooleanKey,
  type ReviewOfSystemsForm,
} from "@/lib/reviewOfSystems";
import { fetchSocialHistory, formFromSocialHistoryRowOrDefault } from "@/lib/socialHistory";
import { fetchSurgicalHistory, formFromSurgicalRowOrDefault } from "@/lib/surgicalHistory";
import { fetchVitalSigns } from "@/lib/vitalSigns";

/** Same UI as `ReviewOfSystemsPanel` — kept so older references to this name still resolve. */
function PhysicalAssessmentPanel({ transId }: { transId: string }) {
  return <ReviewOfSystemsPanel transId={transId} />;
}

const PRIMARY_TABS = [
  "Medical history",
  "Review of systems",
  "Physician's record",
  "Focused exam / notes",
  "Assessment / diagnosis",
  "Plans / treatment",
  "Charges / services",
] as const;

function a11yProps(index: number) {
  return { id: `consultation-tab-${index}`, "aria-controls": `consultation-tabpanel-${index}` };
}

export default function ConsultationWorkspace({
  patient,
  transId,
  isNew = false,
}: {
  patient: ConsultationPatient;
  transId: string;
  isNew?: boolean;
}) {
  return (
    <ConsultationSaveProvider>
      <ConsultationWorkspaceInner patient={patient} transId={transId} isNew={isNew} />
    </ConsultationSaveProvider>
  );
}

function ConsultationWorkspaceInner({ patient, transId, isNew }: { patient: ConsultationPatient; transId: string; isNew: boolean }) {
  const router = useRouter();
  const { profile } = useAuth();
  const [tab, setTab] = useState(0);
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [printing, setPrinting] = useState(false);
  const { dirty, runSaveAll, saving } = useConsultationSave();

  function getPhysiciansRecordChiefComplaintFromDom(): string | null {
    if (typeof document === "undefined") return null;
    const el = document.querySelector(
      'textarea[id$="-chief-complaint"]',
    ) as HTMLTextAreaElement | null;
    return el !== null ? el.value : null;
  }

  function getPhysiciansRecordHpiFromDom(): string | null {
    if (typeof document === "undefined") return null;
    const el = document.querySelector('textarea[id$="-hpi"]') as HTMLTextAreaElement | null;
    return el !== null ? el.value : null;
  }

  function getMedicalHistoryCurrentMedicationInputs(): string[] {
    if (typeof document === "undefined") return [];
    const m1 =
      (
        document.querySelector('textarea[id$="-meds-1"], input[id$="-meds-1"]') as
          | HTMLTextAreaElement
          | HTMLInputElement
          | null
      )?.value ?? "";
    const m2 =
      (
        document.querySelector('textarea[id$="-meds-2"], input[id$="-meds-2"]') as
          | HTMLTextAreaElement
          | HTMLInputElement
          | null
      )?.value ?? "";
    return [m1.trim(), m2.trim()].filter((v) => v.length > 0);
  }

  function getReviewOfSystemsFromPanel(): ReviewOfSystemsForm | null {
    if (typeof document === "undefined") return null;
    const panel = document.querySelector("#consultation-tabpanel-1");
    if (!panel) return null;

    const form = emptyReviewOfSystemsForm();
    const mapLabelToKeys: Record<string, readonly ReviewOfSystemsBooleanKey[]> = {
      Fever: ["ros_fever"],
      "Weight loss": ["ros_weight_loss"],
      Fatigue: ["ros_fatigue"],
      "Vision changes": ["ros_vision_changes"],
      Redness: ["ros_eye_redness"],
      Discharge: ["ros_eye_discharge"],
      "Hearing changes": ["ros_hearing_changes"],
      "Nasal congestion": ["ros_nasal_congestion"],
      "Sore throat": ["ros_sore_throat"],
      "Chest pain": ["ros_chest_pain"],
      Palpitations: ["ros_palpitations"],
      Edema: ["ros_edema"],
      "Shortness of breath": ["ros_sob"],
      Wheezing: ["ros_wheezing"],
      Cough: ["ros_cough"],
      Nausea: ["ros_nausea"],
      Vomiting: ["ros_vomiting"],
      Diarrhea: ["ros_diarrhea"],
      "Abdominal pain": ["ros_abdominal_pain"],
      "Urinary frequency": ["ros_urinary_frequency"],
      Urgency: ["ros_urinary_urgency"],
      Incontinence: ["ros_incontinence"],
      "Joint pain": ["ros_joint_pain"],
      "Muscle weakness": ["ros_muscle_weakness"],
      Rashes: ["ros_rashes"],
      Lesions: ["ros_lesions"],
      Lumps: ["ros_lumps"],
      Headaches: ["ros_headaches"],
      Dizziness: ["ros_dizziness"],
      Numbness: ["ros_numbness"],
      Depression: ["ros_depression"],
      Anxiety: ["ros_anxiety"],
      "Sleep disturbances": ["ros_sleep_disturbances"],
      "Hot flashes": ["ros_hot_flashes"],
      "Intolerance to heat/cold": ["ros_heat_cold_intolerance"],
      "Excessive thirst": ["ros_excessive_thirst"],
      "Easy bruising": ["ros_easy_bruising"],
      Bleeding: ["ros_bleeding"],
      "Swollen glands": ["ros_swollen_glands"],
      "Seasonal allergies": ["ros_seasonal_allergies"],
      "Frequent infections": ["ros_frequent_infections"],
      "Hives/rashes": ["ros_hives_rashes"],
    };

    let matched = 0;
    const rows = panel.querySelectorAll(".MuiFormControlLabel-root");
    for (const row of rows) {
      const label = (row.querySelector(".MuiFormControlLabel-label")?.textContent ?? "").trim();
      const keys = mapLabelToKeys[label];
      if (!keys || keys.length === 0) continue;
      const checked = (row.querySelector('input[type="checkbox"]') as HTMLInputElement | null)?.checked ?? false;
      for (const key of keys) {
        form[key] = checked;
      }
      matched++;
    }
    return matched > 0 ? form : null;
  }

  function getPhysicalExaminationFromPanel(): PhysicalExaminationForm | null {
    if (typeof document === "undefined") return null;
    const panel = document.querySelector("#consultation-tabpanel-2");
    if (!panel) return null;

    const form = { ...emptyPhysicalExaminationForm };
    let matched = 0;
    const checkboxInputs = Array.from(
      panel.querySelectorAll('input[type="checkbox"]'),
    ) as HTMLInputElement[];
    const checkboxKeyOrder: (keyof PhysicalExaminationForm)[] = [
      "pe_general_alert",
      "pe_general_distress",
      "pe_general_drowsy",
      "pe_general_coma",
      "pe_heent_lids_conj_nil",
      "pe_heent_perrla",
      "pe_heent_tym_canal",
      "pe_heent_nasal_nl",
      "pe_heent_lips_teeth_gums",
      "pe_chest_nl_resp_effort",
      "pe_chest_cbs",
      "pe_chest_nl_palpation",
      "pe_chest_nl_symmetry",
      "pe_cvs_rrr",
      "pe_cvs_no_murmur_gallop",
      "pe_cvs_nl_s1s2",
      "pe_cvs_pulses",
      "pe_abdomen_no_tenderness",
      "pe_abdomen_liver_spleen",
      "pe_abdomen_no_hernia",
      "pe_abdomen_bs_present",
      "pe_abdomen_no_guarding",
      "pe_gu_male",
      "pe_gu_female",
      "pe_gu_no_cva_tenderness",
      "pe_gu_scrotal_wnl",
      "pe_gu_pelvic_nl",
      "pe_ext_nl_gait",
      "pe_ext_nl_strength",
      "pe_ext_nl_digits_nails",
      "pe_ext_nl_clubbing_tone",
      "pe_ext_edema",
      "pe_ext_ulcers",
      "pe_neuro_alert",
      "pe_neuro_oriented",
      "pe_neuro_judgment_insight",
      "pe_neuro_memory",
      "pe_neuro_mood",
      "pe_neuro_no_delusions",
    ];
    for (let i = 0; i < checkboxKeyOrder.length; i++) {
      const input = checkboxInputs[i];
      if (!input) continue;
      (form as Record<string, unknown>)[checkboxKeyOrder[i]] = input.checked;
      matched++;
    }

    const standardInputs = Array.from(
      panel.querySelectorAll("input.MuiInputBase-input"),
    ) as HTMLInputElement[];
    const textKeyOrder: (keyof PhysicalExaminationForm)[] = [
      "pe_general_notes",
      "pe_heent_notes",
      "pe_chest_notes",
      "pe_cvs_notes",
      "pe_abdomen_notes",
      "pe_gu_notes",
      "pe_ext_notes",
      "pe_neuro_cerebral",
      "pe_neuro_cn_i",
      "pe_neuro_cn_ii_iii",
      "pe_neuro_cn_iv_vi",
      "pe_neuro_cn_v_vii",
      "pe_neuro_cn_viii",
      "pe_neuro_cn_ix_x",
      "pe_neuro_cn_xi_xii",
      "pe_neuro_cerebellar",
      "pe_neuro_motor_strength",
      "pe_neuro_sensory_reflex",
    ];
    for (let i = 0; i < textKeyOrder.length; i++) {
      const val = standardInputs[i]?.value;
      if (typeof val !== "string") continue;
      (form as Record<string, unknown>)[textKeyOrder[i]] = val;
      if (val.trim().length > 0) matched++;
    }

    return matched > 0 ? { ...form } : null;
  }

  function getFocusedExamNotesFromPanel(): string | null {
    if (typeof document === "undefined") return null;
    const panel = document.querySelector("#consultation-tabpanel-3");
    if (!panel) return null;
    const el = panel.querySelector("textarea") as HTMLTextAreaElement | null;
    return el !== null ? el.value : null;
  }

  function getClinicalDiagnosisFromPanel(): string | null {
    if (typeof document === "undefined") return null;
    const panel = document.querySelector("#consultation-tabpanel-4");
    if (!panel) return null;
    const el = panel.querySelector("textarea") as HTMLTextAreaElement | null;
    return el !== null ? el.value : null;
  }

  return (
    <Box sx={{ maxWidth: 1200, mx: "auto" }}>
      <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 1.5, mb: 2, flexWrap: "wrap" }}>
        <Button
          type="button"
          variant="outlined"
          color="secondary"
          startIcon={<PrintOutlinedIcon />}
          disabled={printing}
          onClick={() => {
            void (async () => {
              setPrinting(true);
              try {
                const [
                  physRec,
                  diagnosis,
                  plans,
                  focused,
                  vitals,
                  pmh,
                  allergies,
                  currentMeds,
                  familyHistory,
                  socialHistory,
                  surgicalHistory,
                  previousHospitalization,
                  obstetricHistory,
                  reviewOfSystems,
                  peExam,
                ] = await Promise.all([
                  fetchEncounterPhysicianRecord(transId),
                  fetchEncounterClinicalDiagnosis(transId),
                  fetchEncounterPlansTreatment(transId),
                  fetchFocusedExamNotes(transId),
                  fetchVitalSigns(transId),
                  fetchPastMedicalHistory(transId),
                  fetchAllergies(transId),
                  fetchCurrentMedicationsForEncounter(transId),
                  fetchFamilyHistory(transId),
                  fetchSocialHistory(transId),
                  fetchSurgicalHistory(transId),
                  fetchPreviousHospitalization(transId),
                  fetchObstetricHistory(transId),
                  fetchReviewOfSystems(transId),
                  fetchPhysicalExamination(transId),
                ]);

                const v = vitals?.row ?? null;
                const bp =
                  v?.bp_systolic != null && v?.bp_diastolic != null
                    ? `${v.bp_systolic}/${v.bp_diastolic}`
                    : "";

                const u = profile as UserProfile | null;
                const currentMedsFromFields = getMedicalHistoryCurrentMedicationInputs();
                const reviewOfSystemsFromPanel = getReviewOfSystemsFromPanel();
                const peFormFromDb = formFromPhysicalExaminationRowOrDefault(
                  peExam.error ? null : peExam.row,
                );
                const peForm = getPhysicalExaminationFromPanel() ?? peFormFromDb;
                const ok = await openConsultationPrintWindow({
                  patient,
                  physician: {
                    fullname: u?.fullname?.trim() ?? "",
                    licenseNo: u?.license_no?.trim() ?? "",
                  },
                  details: {
                    chiefComplaint:
                      getPhysiciansRecordChiefComplaintFromDom() ?? physRec.form.chief_complaint,
                    historyOfPresentIllness:
                      getPhysiciansRecordHpiFromDom() ?? physRec.form.history_of_present_illness,
                    physicalExaminationForm: peForm,
                    focusedExamNotes: getFocusedExamNotesFromPanel() ?? focused.notes,
                    clinicalDiagnosis:
                      getClinicalDiagnosisFromPanel() ?? diagnosis.form.clinical_diagnosis,
                    planNotes: plans.form.plan_notes,
                    disposition: plans.form.disposition ?? "",
                    vitalBp: bp,
                    vitalHr: v?.heart_rate != null ? String(v.heart_rate) : "",
                    vitalRr: v?.respiratory_rate != null ? String(v.respiratory_rate) : "",
                    vitalTemp: v?.temperature != null ? String(v.temperature) : "",
                    vitalO2: v?.o2_saturation != null ? String(v.o2_saturation) : "",
                    vitalPain: v?.pain_scale != null ? String(v.pain_scale) : "",
                    anthropometricWeight: v?.weight_kg != null ? String(v.weight_kg) : "",
                    anthropometricHeight: v?.height_cm != null ? String(v.height_cm) : "",
                    anthropometricBmi: v?.bmi != null ? String(v.bmi) : "",
                    pastMedicalHistory: formFromRowOrDefault(pmh.row),
                    familyHistory: formFromFamilyRowOrDefault(familyHistory.row),
                    socialHistory: formFromSocialHistoryRowOrDefault(socialHistory.row),
                    surgicalHistory: formFromSurgicalRowOrDefault(surgicalHistory.row),
                    previousHospitalization: formFromPreviousHospitalizationRowOrDefault(
                      previousHospitalization.row,
                    ),
                    obstetricHistory: formFromObstetricHistoryRowOrDefault(
                      obstetricHistory.row,
                    ),
                    reviewOfSystems:
                      reviewOfSystemsFromPanel ?? rosFormFromRowOrDefault(reviewOfSystems.row),
                    allergies: formFromAllergiesRowOrDefault(allergies.row),
                    currentMedications:
                      currentMedsFromFields.length > 0
                        ? currentMedsFromFields
                        : currentMeds.medications.map((m) => {
                            const name = (m.medication_name ?? "").trim();
                            const dosage = (m.dosage ?? "").trim();
                            const frequency = (m.frequency ?? "").trim();
                            const parts = [name, dosage, frequency].filter((x) => x.length > 0);
                            return parts.join(" | ");
                          }),
                  },
                });
                if (!ok) {
                  window.alert(
                    "Could not load the consultation PDF template. Ensure templates/Consultation Template.pdf is present on the server.",
                  );
                }
              } finally {
                setPrinting(false);
              }
            })();
          }}
          sx={{ textTransform: "capitalize", borderRadius: 999, px: 2.5 }}
        >
          {printing ? "Preparing…" : "Print consultation"}
        </Button>
        <Button
          variant="contained"
          color="primary"
          startIcon={<SaveOutlinedIcon />}
          disabled={saving}
          onClick={() => {
            void (async () => {
              const r = await runSaveAll();
              if (r.ok) {
                await fetch("/api/consultation/complete-queue-ticket", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ transId }),
                }).catch(() => {});
                router.push("/consultation");
              }
              else window.alert(r.error ?? "Failed to save consultation.");
            })();
          }}
          sx={{ textTransform: "capitalize", borderRadius: 999, px: 2.5 }}
        >
          {saving ? "Saving…" : "Save consultation"}
        </Button>
        {!isNew ? (
          <Button
            variant="contained"
            color="error"
            startIcon={<DeleteOutlineIcon />}
            onClick={() => setDeleteConfirmOpen(true)}
            sx={{ textTransform: "capitalize", borderRadius: 999, px: 2.5 }}
          >
            Delete
          </Button>
        ) : null}
        <Button
          variant="outlined"
          startIcon={<CloseIcon />}
          onClick={() => {
            if (dirty) setCloseConfirmOpen(true);
            else router.push("/consultation");
          }}
          sx={{
            textTransform: "capitalize",
            borderRadius: 999,
            px: 2.5,
            // Matches the screenshot's slate/purple tone.
            color: "#464669",
            borderColor: "#464669",
            "&:hover": {
              borderColor: "#464669",
              bgcolor: "rgba(70, 70, 105, 0.08)",
            },
          }}
        >
          Close
        </Button>
      </Box>

      <Dialog open={closeConfirmOpen} onClose={() => setCloseConfirmOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 800 }}>Unsaved changes</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" color="text.secondary">
            You have unsaved changes. Please save your consultation before closing.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setCloseConfirmOpen(false)}
            color="inherit"
            variant="text"
            startIcon={<CloseOutlinedIcon />}
            sx={{ textTransform: "none" }}
          >
            Cancel
          </Button>
          <Button
            onClick={() => {
              setCloseConfirmOpen(false);
              router.push("/consultation");
            }}
            color="secondary"
            variant="contained"
            sx={{ textTransform: "none" }}
          >
            Close anyway
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={deleteConfirmOpen} onClose={() => setDeleteConfirmOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 800 }}>Delete consultation</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" color="text.secondary">
            This will permanently delete this consultation record and all related data. Continue?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setDeleteConfirmOpen(false)}
            color="inherit"
            variant="text"
            startIcon={<CloseOutlinedIcon />}
            sx={{ textTransform: "none" }}
          >
            Cancel
          </Button>
          <Button
            onClick={async () => {
              setDeleteConfirmOpen(false);
              const { deleteEncounterEverywhere } = await import("@/lib/deleteEncounter");
              const r = await deleteEncounterEverywhere(transId);
              if (r.error) window.alert(r.error);
              else router.push("/consultation");
            }}
            color="error"
            variant="contained"
            startIcon={<DeleteOutlineIcon />}
            sx={{ textTransform: "none" }}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      <PatientInformationBanner patient={patient} />

      <Box sx={{ borderBottom: 1, borderColor: "divider", mb: 0 }}>
        <Tabs
          value={tab}
          onChange={(_, v) => setTab(v)}
          variant="scrollable"
          scrollButtons="auto"
          sx={{
            "& .MuiTab-root": {
              textTransform: "capitalize",
              minHeight: 48,
              fontWeight: 600,
              color: "text.secondary",
            },
            "& .Mui-selected": { color: "info.main" },
            "& .MuiTabs-indicator": { bgcolor: "info.main", height: 3 },
          }}
        >
          {PRIMARY_TABS.map((label, i) => (
            <Tab key={label} label={label} {...a11yProps(i)} />
          ))}
        </Tabs>
      </Box>

      <ConsultationActiveTabContext.Provider value={tab}>
        <Box
          sx={{
            bgcolor: "background.paper",
            borderRadius: 2,
            px: { xs: 2, md: 3 },
            py: 2,
            border: "1px solid",
            borderColor: "divider",
          }}
        >
          <Box role="tabpanel" id="consultation-tabpanel-0" aria-labelledby="consultation-tab-0" hidden={tab !== 0} sx={{ display: tab === 0 ? "block" : "none" }}>
            <MedicalHistoryPanel transId={transId} />
          </Box>
          <Box role="tabpanel" id="consultation-tabpanel-1" aria-labelledby="consultation-tab-1" hidden={tab !== 1} sx={{ display: tab === 1 ? "block" : "none" }}>
            <PhysicalAssessmentPanel transId={transId} />
          </Box>
          <Box role="tabpanel" id="consultation-tabpanel-2" aria-labelledby="consultation-tab-2" hidden={tab !== 2} sx={{ display: tab === 2 ? "block" : "none" }}>
            <PhysiciansRecordPanel transId={transId} />
          </Box>
          <Box role="tabpanel" id="consultation-tabpanel-3" aria-labelledby="consultation-tab-3" hidden={tab !== 3} sx={{ display: tab === 3 ? "block" : "none" }}>
            <FocusedExamNotesPanel transId={transId} />
          </Box>
          <Box role="tabpanel" id="consultation-tabpanel-4" aria-labelledby="consultation-tab-4" hidden={tab !== 4} sx={{ display: tab === 4 ? "block" : "none" }}>
            <AssessmentDiagnosisPanel transId={transId} />
          </Box>
          <Box role="tabpanel" id="consultation-tabpanel-5" aria-labelledby="consultation-tab-5" hidden={tab !== 5} sx={{ display: tab === 5 ? "block" : "none" }}>
            <PlansTreatmentPanel transId={transId} patient={patient} isNew={isNew} />
          </Box>
          <Box role="tabpanel" id="consultation-tabpanel-6" aria-labelledby="consultation-tab-6" hidden={tab !== 6} sx={{ display: tab === 6 ? "block" : "none" }}>
            <ChargesServicesPanel transId={transId} patient={patient} />
          </Box>
        </Box>
      </ConsultationActiveTabContext.Provider>

      <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 2, textAlign: "center" }}>
        Form: LH-HPE-001 · LifeHub Medical & Diagnostic Center
      </Typography>
    </Box>
  );
}
