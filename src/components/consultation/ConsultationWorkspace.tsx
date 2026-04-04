"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Box, Button, Tab, Tabs, TextField, Typography } from "@mui/material";
import ArrowBackIosNewIcon from "@mui/icons-material/ArrowBackIosNew";
import CheckIcon from "@mui/icons-material/Check";
import type { ConsultationPatient } from "./consultationTypes";
import MedicalHistoryPanel from "./MedicalHistoryPanel";
import PatientInformationBanner from "./PatientInformationBanner";
import PhysiciansRecordPanel from "./PhysiciansRecordPanel";
import ReviewOfSystemsPanel from "./ReviewOfSystemsPanel";

/** Same UI as `ReviewOfSystemsPanel` — kept so older references to this name still resolve. */
function PhysicalAssessmentPanel() {
  return <ReviewOfSystemsPanel />;
}

const PRIMARY_TABS = [
  "Medical history",
  "Review of systems",
  "Physician's record",
  "Focused exam / notes",
  "Assessment / diagnosis",
] as const;

const tabPanelSx = {
  pt: 2,
  minHeight: 280,
};

function a11yProps(index: number) {
  return { id: `consultation-tab-${index}`, "aria-controls": `consultation-tabpanel-${index}` };
}

function FocusedExamNotesPanel() {
  return (
    <Box sx={tabPanelSx}>
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

function AssessmentClinicalDiagnosisPanel() {
  return (
    <Box sx={tabPanelSx}>
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

export default function ConsultationWorkspace({ patient }: { patient: ConsultationPatient }) {
  const router = useRouter();
  const [tab, setTab] = useState(0);

  return (
    <Box sx={{ maxWidth: 1200, mx: "auto" }}>
      <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 1.5, mb: 2 }}>
        <Button
          variant="contained"
          color="primary"
          startIcon={<ArrowBackIosNewIcon sx={{ fontSize: 14 }} />}
          onClick={() => router.back()}
          sx={{ textTransform: "capitalize", borderRadius: 999, px: 2.5 }}
        >
          Back
        </Button>
        <Button
          variant="contained"
          color="secondary"
          startIcon={<CheckIcon />}
          sx={{ textTransform: "capitalize", borderRadius: 999, px: 2.5 }}
        >
          Close
        </Button>
      </Box>

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

      <Box
        role="tabpanel"
        id={`consultation-tabpanel-${tab}`}
        aria-labelledby={`consultation-tab-${tab}`}
        sx={{ bgcolor: "background.paper", borderRadius: 2, px: { xs: 2, md: 3 }, py: 2, border: "1px solid", borderColor: "divider" }}
      >
        {tab === 0 && <MedicalHistoryPanel />}
        {tab === 1 && <PhysicalAssessmentPanel />}
        {tab === 2 && <PhysiciansRecordPanel />}
        {tab === 3 && <FocusedExamNotesPanel />}
        {tab === 4 && <AssessmentClinicalDiagnosisPanel />}
      </Box>

      <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 2, textAlign: "center" }}>
        Form: LH-HPE-001 · LifeHub Medical & Diagnostic Center
      </Typography>
    </Box>
  );
}
