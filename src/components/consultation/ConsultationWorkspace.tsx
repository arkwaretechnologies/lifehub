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

const PRIMARY_TABS = [
  "Medical history",
  "Physical assessment",
  "Allergy",
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

function PhysicalAssessmentPanel() {
  return (
    <Box sx={tabPanelSx}>
      <Typography variant="subtitle2" color="info.main" fontWeight={700} gutterBottom>
        Vital signs
      </Typography>
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {["BP", "HR", "RR", "Temp", "O2 Sat", "Pain scale (0–10)"].map((label) => (
          <Grid key={label} size={{ xs: 6, md: 4 }}>
            <TextField fullWidth size="small" label={label} placeholder="—" />
          </Grid>
        ))}
      </Grid>
      <Typography variant="subtitle2" color="info.main" fontWeight={700} gutterBottom>
        Anthropometric
      </Typography>
      <Grid container spacing={2}>
        {["Weight", "Height", "BMI"].map((label) => (
          <Grid key={label} size={{ xs: 6, md: 4 }}>
            <TextField fullWidth size="small" label={label} placeholder="—" />
          </Grid>
        ))}
      </Grid>
    </Box>
  );
}

function AllergyPanel() {
  const [none, setNone] = useState(false);
  return (
    <Box sx={tabPanelSx}>
      <Typography variant="subtitle2" color="info.main" fontWeight={700} gutterBottom>
        Allergies
      </Typography>
      <FormControlLabel
        control={<Checkbox checked={none} onChange={(_, v) => setNone(v)} />}
        label="None"
      />
      <Grid container spacing={2} sx={{ mt: 1 }}>
        <Grid size={{ xs: 12, md: 6 }}>
          <TextField fullWidth size="small" label="Food" placeholder="—" disabled={none} />
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <TextField fullWidth size="small" label="Drugs" placeholder="—" disabled={none} />
        </Grid>
        <Grid size={{ xs: 12 }}>
          <TextField
            fullWidth
            multiline
            minRows={2}
            label="Reaction type (e.g. rash, anaphylaxis)"
            disabled={none}
          />
        </Grid>
      </Grid>
    </Box>
  );
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

const ROS_GROUPS: { title: string; items: string[] }[] = [
  { title: "Constitutional", items: ["Fever", "Weight loss", "Fatigue"] },
  { title: "Eyes", items: ["Vision changes", "Redness", "Discharge"] },
  { title: "Cardiovascular", items: ["Chest pain", "Palpitations", "Edema"] },
  { title: "Respiratory", items: ["Shortness of breath", "Wheezing", "Cough"] },
];

function EmrPanel() {
  return (
    <Box sx={tabPanelSx}>
      <Typography variant="subtitle2" color="info.main" fontWeight={700} gutterBottom>
        Review of systems
      </Typography>
      <Grid container spacing={2}>
        {ROS_GROUPS.map((g) => (
          <Grid key={g.title} size={{ xs: 12, md: 6 }}>
            <Typography variant="caption" fontWeight={700} color="text.secondary" display="block" sx={{ mb: 0.5 }}>
              {g.title}
            </Typography>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 0 }}>
              {g.items.map((item) => (
                <FormControlLabel key={item} control={<Checkbox size="small" />} label={item} />
              ))}
            </Box>
          </Grid>
        ))}
      </Grid>
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
        {tab === 2 && <AllergyPanel />}
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
