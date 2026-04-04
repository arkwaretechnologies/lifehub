"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Box,
  Button,
  Checkbox,
  FormControl,
  FormControlLabel,
  Grid,
  InputAdornment,
  InputLabel,
  MenuItem,
  Select,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import ArrowBackIosNewIcon from "@mui/icons-material/ArrowBackIosNew";
import CheckIcon from "@mui/icons-material/Check";
import TaskAltIcon from "@mui/icons-material/TaskAlt";
import SearchIcon from "@mui/icons-material/Search";
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
  "Orders",
  "Investigations",
  "Documents",
  "EMR",
] as const;

const DOC_SUB_TABS = ["Consents & contracts", "Uploads"] as const;

const tabPanelSx = {
  pt: 2,
  minHeight: 280,
};

function a11yProps(index: number) {
  return { id: `consultation-tab-${index}`, "aria-controls": `consultation-tabpanel-${index}` };
}

function OrdersPanel() {
  return (
    <Box sx={tabPanelSx}>
      <Typography variant="subtitle2" color="info.main" fontWeight={700} gutterBottom>
        Plan / treatment
      </Typography>
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
        {["Labs", "Imaging", "Medications", "Referral"].map((label) => (
          <FormControlLabel key={label} control={<Checkbox />} label={label} />
        ))}
      </Box>
      <TextField fullWidth multiline minRows={3} label="Orders detail" sx={{ mt: 2 }} />
    </Box>
  );
}

function InvestigationsPanel() {
  return (
    <Box sx={tabPanelSx}>
      <Typography variant="subtitle2" color="info.main" fontWeight={700} gutterBottom>
        Investigations
      </Typography>
      <TextField fullWidth multiline minRows={6} label="Laboratory & imaging notes" placeholder="Pending results…" />
    </Box>
  );
}

function DocumentsPanel() {
  const [sub, setSub] = useState(0);
  const [formType, setFormType] = useState("");
  return (
    <Box sx={tabPanelSx}>
      <Tabs
        value={sub}
        onChange={(_, v) => setSub(v)}
        variant="fullWidth"
        sx={{
          minHeight: 40,
          mb: 2,
          "& .MuiTab-root": { textTransform: "capitalize", minHeight: 40, fontWeight: 600 },
          "& .MuiTabs-indicator": { height: 3, borderRadius: 1 },
        }}
      >
        {DOC_SUB_TABS.map((label, i) => (
          <Tab key={label} label={label} />
        ))}
      </Tabs>
      {sub === 0 ? (
        <Box>
          <Typography variant="subtitle2" color="text.secondary" fontWeight={700} gutterBottom>
            Forms
          </Typography>
          <Box
            sx={{
              display: "flex",
              flexDirection: { xs: "column", sm: "row" },
              alignItems: { sm: "center" },
              gap: 2,
              mb: 3,
            }}
          >
            <FormControl size="small" sx={{ minWidth: 220 }}>
              <InputLabel id="form-select-label">Form</InputLabel>
              <Select
                labelId="form-select-label"
                label="Form"
                value={formType}
                onChange={(e) => setFormType(e.target.value)}
              >
                <MenuItem value="">
                  <em>Select form</em>
                </MenuItem>
                <MenuItem value="consent">General consent</MenuItem>
                <MenuItem value="lab">Laboratory request</MenuItem>
              </Select>
            </FormControl>
            <Button
              variant="contained"
              color="primary"
              startIcon={<TaskAltIcon />}
              sx={{ textTransform: "capitalize", alignSelf: { xs: "stretch", sm: "center" } }}
            >
              Generate form
            </Button>
          </Box>
          <Typography variant="body2" color="text.secondary">
            Consents and contracts for this visit appear here after generation.
          </Typography>
        </Box>
      ) : (
        <Typography variant="body2" color="text.secondary">
          Upload files from the reception workflow or drag-and-drop (coming soon).
        </Typography>
      )}
      <Box sx={{ display: "flex", justifyContent: "flex-end", mt: 4 }}>
        <TextField
          size="small"
          placeholder="Search keyword"
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" color="action" />
                </InputAdornment>
              ),
            },
          }}
          sx={{ maxWidth: 280 }}
        />
      </Box>
    </Box>
  );
}

function EmrPanel() {
  return (
    <Box sx={tabPanelSx}>
      <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 2, color: "text.primary" }}>
        EMR notes
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Use the <strong>Review of systems</strong> tab for the structured ROS checklist. Add narrative notes,
        links, or follow-up items here.
      </Typography>
      <TextField fullWidth multiline minRows={8} label="Additional documentation" placeholder="Enter notes…" />
    </Box>
  );
}

export default function ConsultationWorkspace({ patient }: { patient: ConsultationPatient }) {
  const router = useRouter();
  /** Default to Documents to match consultation workspace layout reference. */
  const [tab, setTab] = useState(5);

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
        {tab === 3 && <OrdersPanel />}
        {tab === 4 && <InvestigationsPanel />}
        {tab === 5 && <DocumentsPanel />}
        {tab === 6 && <EmrPanel />}
      </Box>

      <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 2, textAlign: "center" }}>
        Form: LH-HPE-001 · LifeHub Medical & Diagnostic Center
      </Typography>
    </Box>
  );
}
