"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Box, Button, Tab, Tabs, Typography } from "@mui/material";
import ArrowBackIosNewIcon from "@mui/icons-material/ArrowBackIosNew";
import CheckIcon from "@mui/icons-material/Check";
import type { ConsultationPatient } from "./consultationTypes";
import { ConsultationActiveTabContext } from "./consultationTabContext";
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
}: {
  patient: ConsultationPatient;
  transId: string;
}) {
  const router = useRouter();
  const [tab, setTab] = useState(0);

  return (
    <Box sx={{ maxWidth: 1200, mx: "auto" }}>
      <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 1.5, mb: 2 }}>
        <Button
          variant="contained"
          color="primary"
          startIcon={<ArrowBackIosNewIcon sx={{ fontSize: 14 }} />}
          onClick={() => router.push("/consultation")}
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
          <Box
            role="tabpanel"
            id="consultation-tabpanel-0"
            aria-labelledby="consultation-tab-0"
            hidden={tab !== 0}
            sx={{ display: tab === 0 ? "block" : "none" }}
          >
            <MedicalHistoryPanel transId={transId} />
          </Box>
          <Box
            role="tabpanel"
            id="consultation-tabpanel-1"
            aria-labelledby="consultation-tab-1"
            hidden={tab !== 1}
            sx={{ display: tab === 1 ? "block" : "none" }}
          >
            <PhysicalAssessmentPanel transId={transId} />
          </Box>
          <Box
            role="tabpanel"
            id="consultation-tabpanel-2"
            aria-labelledby="consultation-tab-2"
            hidden={tab !== 2}
            sx={{ display: tab === 2 ? "block" : "none" }}
          >
            <PhysiciansRecordPanel transId={transId} />
          </Box>
          <Box
            role="tabpanel"
            id="consultation-tabpanel-3"
            aria-labelledby="consultation-tab-3"
            hidden={tab !== 3}
            sx={{ display: tab === 3 ? "block" : "none" }}
          >
            <FocusedExamNotesPanel transId={transId} />
          </Box>
          <Box
            role="tabpanel"
            id="consultation-tabpanel-4"
            aria-labelledby="consultation-tab-4"
            hidden={tab !== 4}
            sx={{ display: tab === 4 ? "block" : "none" }}
          >
            <AssessmentDiagnosisPanel transId={transId} />
          </Box>
          <Box
            role="tabpanel"
            id="consultation-tabpanel-5"
            aria-labelledby="consultation-tab-5"
            hidden={tab !== 5}
            sx={{ display: tab === 5 ? "block" : "none" }}
          >
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
