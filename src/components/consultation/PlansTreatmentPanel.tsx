"use client";

import { Box, Checkbox, FormControlLabel, Grid, TextField, Typography } from "@mui/material";
import { consultFormControlLabelSx } from "@/components/consultation/ConsultationSectionTitle";

const tabPanelSx = { pt: 2, minHeight: 280 };

const cardOuterSx = {
  border: "1px solid",
  borderColor: "grey.900",
  borderRadius: 1,
  overflow: "hidden",
  bgcolor: "background.paper",
} as const;

const sectionLabelProps = {
  component: "h3" as const,
  variant: "body2" as const,
  fontWeight: 700,
  color: "info.main" as const,
  sx: {
    letterSpacing: "0.02em",
    display: "block",
    mb: 1.5,
    textTransform: "uppercase" as const,
  },
};

const notesFieldSx = {
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
  },
} as const;

export default function PlansTreatmentPanel() {
  return (
    <Box sx={tabPanelSx}>
      <Box sx={cardOuterSx}>
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
            PLANS/TREATMENT
          </Typography>
        </Box>

        <Box sx={{ p: { xs: 2, sm: 2.5 } }}>
          <Typography {...sectionLabelProps}>PLAN/TREATMENT:</Typography>

          <Grid container spacing={{ xs: 0.5, sm: 1 }} sx={{ mb: 2, alignItems: "center" }}>
            <Grid size={{ xs: "auto" }}>
              <FormControlLabel
                control={<Checkbox size="small" />}
                label="LABS"
                sx={consultFormControlLabelSx}
              />
            </Grid>
            <Grid size={{ xs: "auto" }}>
              <FormControlLabel
                control={<Checkbox size="small" />}
                label="IMAGING"
                sx={consultFormControlLabelSx}
              />
            </Grid>
            <Grid size={{ xs: "auto" }}>
              <FormControlLabel
                control={<Checkbox size="small" />}
                label="MEDICATIONS"
                sx={consultFormControlLabelSx}
              />
            </Grid>
          </Grid>
          <Box sx={{ mb: 2 }}>
            <FormControlLabel
              control={<Checkbox size="small" />}
              label="REFERRAL"
              sx={consultFormControlLabelSx}
            />
          </Box>

          <TextField
            fullWidth
            multiline
            minRows={10}
            placeholder=" "
            hiddenLabel
            variant="outlined"
            sx={[notesFieldSx, { mb: 3 }]}
          />

          <Typography {...sectionLabelProps}>DISPOSITION:</Typography>
          <Box
            sx={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              columnGap: { xs: 1, sm: 2 },
              rowGap: 1,
            }}
          >
            {(["HOME", "MEDICO LEGAL", "ADVISE ADMISSION", "ABSCONDED", "DAMA"] as const).map((label) => (
              <FormControlLabel
                key={label}
                control={<Checkbox size="small" />}
                label={label}
                sx={consultFormControlLabelSx}
              />
            ))}
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
