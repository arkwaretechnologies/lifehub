"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Tab, Tabs, Typography } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import CloseOutlinedIcon from "@mui/icons-material/CloseOutlined";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
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
  const [tab, setTab] = useState(0);
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const { dirty, runSaveAll, saving } = useConsultationSave();

  return (
    <Box sx={{ maxWidth: 1200, mx: "auto" }}>
      <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 1.5, mb: 2, flexWrap: "wrap" }}>
        <Button
          variant="contained"
          color="primary"
          startIcon={<SaveOutlinedIcon />}
          disabled={saving}
          onClick={() => {
            void (async () => {
              const r = await runSaveAll();
              if (r.ok) router.push("/consultation");
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
            else router.push("/dashboard");
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
              router.push("/dashboard");
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
            <PlansTreatmentPanel transId={transId} patient={patient} />
          </Box>
        </Box>
      </ConsultationActiveTabContext.Provider>

      <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 2, textAlign: "center" }}>
        Form: LH-HPE-001 · LifeHub Medical & Diagnostic Center
      </Typography>
    </Box>
  );
}
