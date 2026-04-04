"use client";

import { Box, Checkbox, FormControlLabel, Grid, Stack, Typography } from "@mui/material";

const tabPanelSx = { pt: 0, minHeight: 280 };

/** Checkbox + symptom — even spacing, no commas. */
const rosItemSx = {
  m: 0,
  mr: 0,
  ml: 0,
  alignItems: "center",
  gap: 0,
  columnGap: 0.25,
  width: "auto",
  flexShrink: 0,
  "& .MuiCheckbox-root": { padding: "4px" },
  "& .MuiFormControlLabel-label": {
    fontSize: "0.875rem",
    fontWeight: 400,
    color: "text.primary",
    pl: 0,
  },
} as const;

const sectionBoxSx = {
  border: "1px solid",
  borderColor: "divider",
  borderRadius: 1,
  p: { xs: 2, sm: 2.5 },
  bgcolor: "background.paper",
  mb: 2,
  boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)",
} as const;

/** Fixed label column so every row’s checkboxes start on one vertical line. */
const LABEL_COL = { xs: 12, sm: 4, md: 3.5 } as const;
const SYMPTOMS_COL = { xs: 12, sm: 8, md: 8.5 } as const;

type RosLine = { category: string; items: string[] };

const ROS_SECTION_A: RosLine[] = [
  { category: "Constitutional", items: ["Fever", "Weight loss", "Fatigue"] },
  { category: "Eyes", items: ["Vision changes", "Redness", "Discharge"] },
  {
    category: "Ears, Nose, Throat",
    items: ["Hearing changes", "nasal congestion", "sore throat"],
  },
  { category: "Cardiovascular", items: ["Chest pain", "Palpitations", "Edema"] },
  { category: "Respiratory", items: ["Shortness of breath", "Wheezing", "Cough"] },
  {
    category: "Gastrointestinal",
    items: ["Nausea", "Vomiting", "Diarrhea", "Abdominal pain"],
  },
  {
    category: "Genitourinary",
    items: ["Urinary frequency or urgency", "Incontinence"],
  },
  { category: "Musculoskeletal", items: ["Joint pain", "Muscle weakness"] },
  { category: "Skin/Breast", items: ["Rashes", "Lesions", "Lumps"] },
  { category: "Neurological", items: ["Headaches", "Dizziness", "Numbness"] },
];

const ROS_SECTION_B: RosLine[] = [
  {
    category: "Psychiatric",
    items: ["Depression", "Anxiety", "Sleep disturbances"],
  },
  {
    category: "Endocrine",
    items: ["Hot flashes", "Intolerance to heat/cold", "Excessive thirst"],
  },
  {
    category: "Hematologic/Lymphatic",
    items: ["Easy bruising", "Bleeding", "Swollen glands"],
  },
  {
    category: "Immunology",
    items: ["Seasonal allergies", "Frequent infections", "Hives/rashes"],
  },
];

function RosRow({ line }: { line: RosLine }) {
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
          {line.items.map((item) => (
            <FormControlLabel
              key={item}
              control={<Checkbox size="small" />}
              label={item}
              sx={rosItemSx}
            />
          ))}
        </Box>
      </Grid>
    </Grid>
  );
}

function RosSection({ lines }: { lines: RosLine[] }) {
  return (
    <Stack spacing={{ xs: 2, sm: 2.5 }}>
      {lines.map((line) => (
        <RosRow key={line.category} line={line} />
      ))}
    </Stack>
  );
}

export default function ReviewOfSystemsPanel() {
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
        <Typography variant="subtitle1" fontWeight={800} letterSpacing="0.12em">
          REVIEW OF SYSTEMS
        </Typography>
      </Box>

      <Box sx={sectionBoxSx}>
        <RosSection lines={ROS_SECTION_A} />
      </Box>

      <Box sx={{ ...sectionBoxSx, mb: 0 }}>
        <RosSection lines={ROS_SECTION_B} />
      </Box>
    </Box>
  );
}
