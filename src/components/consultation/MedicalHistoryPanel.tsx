"use client";

import type { ReactNode } from "react";
import { useId, useState } from "react";
import {
  Box,
  Checkbox,
  FormControlLabel,
  Grid,
  Radio,
  RadioGroup,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { FormFieldLabel } from "@/components/FormFieldLabel";
import {
  commonFieldProps,
  fieldInputSx,
  fieldMultilineInputSx,
} from "@/components/fieldInputStyles";

const tabPanelSx = { pt: 2, minHeight: 280 };

const greySectionSx = {
  bgcolor: "grey.100",
  p: 2,
  borderRadius: 1,
  border: "1px solid",
  borderColor: "divider",
};

/** Matches patient page card section title (`Patient Records`). */
const sectionTitleSx = {
  variant: "subtitle1" as const,
  fontWeight: 600,
  sx: { mb: 2, color: "text.primary" },
};

/** Inset subsection (grey panels) — `body2` / 600 like `FormFieldLabel`. */
function SubsectionTitle({ children }: { children: ReactNode }) {
  return (
    <Typography component="h3" variant="body2" fontWeight={600} sx={{ mb: 1.5, color: "text.primary" }}>
      {children}
    </Typography>
  );
}

const controlLabelSx = {
  mr: 0,
  "& .MuiFormControlLabel-label": {
    fontSize: "0.875rem",
    fontWeight: 400,
    color: "text.primary",
  },
} as const;

/**
 * Allergies block only — checkbox sits flush next to label (does not affect other sections).
 */
const allergiesControlLabelSx = {
  m: 0,
  mr: 0,
  ml: 0,
  width: "auto",
  maxWidth: "100%",
  alignItems: "center",
  gap: 0,
  columnGap: 1,
  "& .MuiCheckbox-root": {
    padding: "2px",
  },
  "& .MuiFormControlLabel-label": {
    fontSize: "0.875rem",
    fontWeight: 400,
    lineHeight: 1.2,
    color: "text.primary",
    flex: "0 0 auto",
    pl: 0,
    ml: "-2px",
  },
} as const;

/** Underline inputs after Food:/Drugs: — parent row uses `gap` for label-to-line space. */
const allergiesInlineUnderlineFieldSx = {
  flex: "1 1 48px",
  minWidth: 48,
  width: "100%",
  maxWidth: "100%",
  "& .MuiInputBase-root": { marginTop: 0 },
  "& .MuiInputBase-input": {
    py: 0.5,
    fontSize: "0.875rem",
    textTransform: "uppercase",
  },
} as const;

/** Yes / No radio rows — wide gap so options never overlap (social history, obstetric, etc.). */
const yesNoRadioRowSx = {
  display: "flex",
  flexDirection: "row" as const,
  flexWrap: "nowrap" as const,
  alignItems: "center",
  columnGap: 4,
  gap: 3,
  "& .MuiFormControlLabel-root": { mr: 0, flexShrink: 0 },
} as const;

function slugId(s: string) {
  return s.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
}

function VitalRow({ idPrefix, labels }: { idPrefix: string; labels: string[] }) {
  return (
    <Grid container spacing={2} sx={{ mb: 2 }}>
      {labels.map((label) => {
        const fid = `${idPrefix}-vital-${slugId(label)}`;
        return (
          <Grid key={label} size={{ xs: 6, sm: 4 }}>
            <FormFieldLabel htmlFor={fid}>{label}</FormFieldLabel>
            <TextField id={fid} hiddenLabel placeholder="____" {...commonFieldProps} sx={fieldInputSx} />
          </Grid>
        );
      })}
    </Grid>
  );
}

function CheckboxGrid({ items }: { items: string[] }) {
  return (
    <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, columnGap: 2, rowGap: 0.25 }}>
      {items.map((label) => (
        <FormControlLabel
          key={label}
          control={<Checkbox size="small" />}
          label={label}
          sx={controlLabelSx}
        />
      ))}
    </Box>
  );
}

function InlineField({
  idPrefix,
  suffix,
  label,
}: {
  idPrefix: string;
  suffix: string;
  label: string;
}) {
  const fid = `${idPrefix}-${suffix}`;
  return (
    <>
      <FormFieldLabel htmlFor={fid}>{label}</FormFieldLabel>
      <TextField id={fid} hiddenLabel placeholder="____" {...commonFieldProps} sx={fieldInputSx} />
    </>
  );
}

export default function MedicalHistoryPanel() {
  const rawId = useId();
  const idPrefix = `mh${rawId.replace(/\W/g, "")}`;
  const [hospNever, setHospNever] = useState(false);
  const [hospOther, setHospOther] = useState(false);

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
        <Typography
          variant="subtitle1"
          fontWeight={800}
          sx={{ textTransform: "uppercase", letterSpacing: "0.12em" }}
        >
          Medical history
        </Typography>
      </Box>

      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Typography {...sectionTitleSx}>Vital signs</Typography>
          <VitalRow
            idPrefix={idPrefix}
            labels={["BP", "HR", "RR", "Temp", "O2 Sat", "Pain scale (0–10)"]}
          />

          <Box sx={{ ...greySectionSx, mb: 2 }}>
            <SubsectionTitle>Past medical history</SubsectionTitle>
            <CheckboxGrid
              items={[
                "Hypertension",
                "Diabetes",
                "Asthma",
                "Heart disease",
                "Kidney disease/stones",
                "Stroke / CVA",
                "Thyroid disease",
                "TB",
              ]}
            />
            <Box sx={{ mt: 2 }}>
              <FormFieldLabel htmlFor={`${idPrefix}-pmh-others`}>Others</FormFieldLabel>
              <TextField
                id={`${idPrefix}-pmh-others`}
                hiddenLabel
                placeholder="_______________________________________"
                {...commonFieldProps}
                sx={fieldInputSx}
              />
            </Box>
          </Box>

          <Typography {...sectionTitleSx}>Family history</Typography>
          <Box sx={{ mb: 2 }}>
            <CheckboxGrid
              items={[
                "Hypertension",
                "Diabetes",
                "Cancer",
                "Heart disease",
                "Stroke / CVA",
                "TB",
                "Kidney disease",
              ]}
            />
          </Box>

          <Typography {...sectionTitleSx}>Surgical history</Typography>
          <Box sx={{ mb: 2 }}>
            <CheckboxGrid
              items={["Negative", "App", "GB", "CABG", "C-section", "Hernia", "Cataract"]}
            />
          </Box>

          <Typography {...sectionTitleSx}>Previous hospitalization</Typography>
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 2, mb: 1.5 }}>
            <FormControlLabel
              control={
                <Checkbox
                  size="small"
                  checked={hospNever}
                  onChange={(_, v) => {
                    setHospNever(v);
                    if (v) setHospOther(false);
                  }}
                />
              }
              label="Never"
              sx={controlLabelSx}
            />
            <FormControlLabel
              control={
                <Checkbox
                  size="small"
                  checked={hospOther}
                  onChange={(_, v) => {
                    setHospOther(v);
                    if (v) setHospNever(false);
                  }}
                />
              }
              label="Other"
              sx={controlLabelSx}
            />
          </Box>
          <Table
            size="small"
            sx={{ border: "1px solid", borderColor: "divider", "& td": { borderColor: "divider" } }}
          >
            <TableHead>
              <TableRow sx={{ bgcolor: "grey.200" }}>
                <TableCell sx={{ textTransform: "uppercase", fontWeight: 700 }}>Year</TableCell>
                <TableCell sx={{ textTransform: "uppercase", fontWeight: 700 }}>Hospital</TableCell>
                <TableCell sx={{ textTransform: "uppercase", fontWeight: 700 }}>Diagnosis</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {[0, 1, 2].map((i) => (
                <TableRow key={i}>
                  {(["year", "hospital", "diagnosis"] as const).map((col) => (
                    <TableCell key={col} sx={{ p: 0.75, verticalAlign: "middle" }}>
                      <TextField
                        id={`${idPrefix}-hosp-${i}-${col}`}
                        hiddenLabel
                        disabled={hospNever}
                        placeholder=" "
                        {...commonFieldProps}
                        sx={fieldInputSx}
                      />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <Typography {...sectionTitleSx}>Anthropometric</Typography>
          <Grid container spacing={2} sx={{ mb: 2 }}>
            {(["Weight", "Height", "BMI"] as const).map((label) => {
              const fid = `${idPrefix}-anthro-${slugId(label)}`;
              return (
                <Grid key={label} size={{ xs: 4 }}>
                  <FormFieldLabel htmlFor={fid}>{label}</FormFieldLabel>
                  <TextField id={fid} hiddenLabel placeholder="____" {...commonFieldProps} sx={fieldInputSx} />
                </Grid>
              );
            })}
          </Grid>

          <Box sx={{ ...greySectionSx, mb: 2 }}>
            <Typography
              component="h3"
              variant="body2"
              fontWeight={800}
              sx={{
                mb: 1.25,
                color: "info.main",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}
            >
              Allergies:
            </Typography>
            <Box
              sx={{
                display: "flex",
                flexWrap: "nowrap",
                alignItems: "center",
                gap: { xs: 1.5, sm: 2, md: 3 },
                mb: 1.5,
                width: "100%",
                minWidth: 0,
                overflowX: "auto",
                pb: 0.25,
                scrollbarWidth: "thin",
              }}
            >
              <FormControlLabel
                control={<Checkbox size="small" />}
                label="None"
                sx={{ ...allergiesControlLabelSx, flexShrink: 0 }}
              />
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1.25,
                  flex: "1 1 0",
                  minWidth: 160,
                  maxWidth: "100%",
                }}
              >
                <FormControlLabel
                  control={<Checkbox size="small" />}
                  label="Food:"
                  sx={{ ...allergiesControlLabelSx, flexShrink: 0 }}
                />
                <TextField
                  id={`${idPrefix}-allergy-food`}
                  variant="standard"
                  size="small"
                  placeholder=" "
                  sx={allergiesInlineUnderlineFieldSx}
                />
              </Box>
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1.25,
                  flex: "1 1 0",
                  minWidth: 160,
                  maxWidth: "100%",
                }}
              >
                <FormControlLabel
                  control={<Checkbox size="small" />}
                  label="Drugs:"
                  sx={{ ...allergiesControlLabelSx, flexShrink: 0 }}
                />
                <TextField
                  id={`${idPrefix}-allergy-drugs`}
                  variant="standard"
                  size="small"
                  placeholder=" "
                  sx={allergiesInlineUnderlineFieldSx}
                />
              </Box>
            </Box>
            <FormFieldLabel htmlFor={`${idPrefix}-reaction`}>
              Reaction type (e.g. rash, anaphylaxis)
            </FormFieldLabel>
            <TextField
              id={`${idPrefix}-reaction`}
              hiddenLabel
              multiline
              minRows={2}
              placeholder=" "
              {...commonFieldProps}
              sx={fieldMultilineInputSx}
            />

            <Box sx={{ mt: 2.5 }}>
              <SubsectionTitle>Current medications</SubsectionTitle>
              <TextField
                id={`${idPrefix}-meds-1`}
                hiddenLabel
                multiline
                minRows={2}
                placeholder=" "
                {...commonFieldProps}
                sx={[fieldMultilineInputSx, { mb: 1 }]}
              />
              <TextField
                id={`${idPrefix}-meds-2`}
                hiddenLabel
                multiline
                minRows={2}
                placeholder=" "
                {...commonFieldProps}
                sx={fieldMultilineInputSx}
              />
            </Box>
          </Box>

          <Typography {...sectionTitleSx}>Social history</Typography>
          <Box>
            <Box sx={{ mb: 2 }}>
              <Typography component="p" variant="body2" fontWeight={600} sx={{ mb: 0.5, color: "text.primary" }}>
                Smoking
              </Typography>
              <RadioGroup row sx={{ mb: 1, ...yesNoRadioRowSx }}>
                <FormControlLabel value="yes" control={<Radio size="small" />} label="Yes" sx={controlLabelSx} />
                <FormControlLabel value="no" control={<Radio size="small" />} label="No" sx={controlLabelSx} />
              </RadioGroup>
              <InlineField idPrefix={idPrefix} suffix="pack-years" label="Pack years" />
            </Box>
            <Box sx={{ mb: 2 }}>
              <Typography component="p" variant="body2" fontWeight={600} sx={{ mb: 0.5, color: "text.primary" }}>
                Alcohol
              </Typography>
              <RadioGroup row sx={{ mb: 1, ...yesNoRadioRowSx }}>
                <FormControlLabel value="yes" control={<Radio size="small" />} label="Yes" sx={controlLabelSx} />
                <FormControlLabel value="no" control={<Radio size="small" />} label="No" sx={controlLabelSx} />
              </RadioGroup>
              <InlineField idPrefix={idPrefix} suffix="alcohol-years" label="Years" />
            </Box>
            <Box>
              <Typography component="p" variant="body2" fontWeight={600} sx={{ mb: 0.5, color: "text.primary" }}>
                Drugs
              </Typography>
              <RadioGroup row sx={yesNoRadioRowSx}>
                <FormControlLabel value="yes" control={<Radio size="small" />} label="Yes" sx={controlLabelSx} />
                <FormControlLabel value="no" control={<Radio size="small" />} label="No" sx={controlLabelSx} />
              </RadioGroup>
            </Box>
          </Box>

          <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 2, color: "text.primary", mt: 2 }}>
            Obstetric
          </Typography>
          <FormControlLabel
            control={<Checkbox size="small" />}
            label="N/A"
            sx={{ ...controlLabelSx, mb: 1 }}
          />
          <Grid container spacing={2} sx={{ mb: 1 }}>
            <Grid size={{ xs: 6 }}>
              <InlineField idPrefix={idPrefix} suffix="lmp" label="LMP" />
            </Grid>
            <Grid size={{ xs: 6 }}>
              <Typography component="p" variant="body2" fontWeight={600} sx={{ mb: 0.5, color: "text.primary" }}>
                Pregnant
              </Typography>
              <RadioGroup row sx={yesNoRadioRowSx}>
                <FormControlLabel value="y" control={<Radio size="small" />} label="Yes" sx={controlLabelSx} />
                <FormControlLabel value="n" control={<Radio size="small" />} label="No" sx={controlLabelSx} />
              </RadioGroup>
            </Grid>
          </Grid>
          <Grid container spacing={1} sx={{ mb: 1, alignItems: "flex-end" }}>
            <Grid size={{ xs: 4 }}>
              <InlineField idPrefix={idPrefix} suffix="edc" label="EDC" />
            </Grid>
            <Grid size={{ xs: 4 }}>
              <InlineField idPrefix={idPrefix} suffix="aog" label="AOG" />
            </Grid>
            <Grid size={{ xs: 4 }}>
              <InlineField idPrefix={idPrefix} suffix="wks" label="WKS" />
            </Grid>
          </Grid>
          <Typography variant="body2" fontWeight={600} sx={{ mb: 0.5, color: "text.primary" }}>
            BY
          </Typography>
          <Box sx={{ display: "flex", gap: 2, mb: 1.5 }}>
            <FormControlLabel control={<Checkbox size="small" />} label="UTZ" sx={controlLabelSx} />
            <FormControlLabel control={<Checkbox size="small" />} label="LMP" sx={controlLabelSx} />
          </Box>
          <Table size="small" sx={{ mb: 1.5, border: "1px solid", borderColor: "divider", maxWidth: 400 }}>
            <TableHead>
              <TableRow sx={{ bgcolor: "grey.200" }}>
                {["G", "P", "F", "P", "A", "L"].map((h, idx) => (
                  <TableCell
                    key={`gp-${idx}`}
                    align="center"
                    sx={{ textTransform: "uppercase", fontWeight: 700, py: 0.5 }}
                  >
                    {h}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              <TableRow>
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <TableCell key={i} sx={{ p: 0.75, verticalAlign: "middle" }}>
                    <TextField
                      id={`${idPrefix}-gpal-${i}`}
                      hiddenLabel
                      placeholder=" "
                      {...commonFieldProps}
                      sx={{
                        ...fieldInputSx,
                        "& .MuiInputBase-input": {
                          height: "100%",
                          boxSizing: "border-box",
                          textTransform: "uppercase",
                          textAlign: "center",
                        },
                      }}
                    />
                  </TableCell>
                ))}
              </TableRow>
            </TableBody>
          </Table>
          <Grid container spacing={2} sx={{ mb: 1 }}>
            <Grid size={{ xs: 6 }}>
              <InlineField idPrefix={idPrefix} suffix="fh" label="FH (cm)" />
            </Grid>
            <Grid size={{ xs: 6 }}>
              <InlineField idPrefix={idPrefix} suffix="efw" label="EFW (g)" />
            </Grid>
          </Grid>
          <Typography component="p" variant="body2" fontWeight={600} sx={{ mb: 0.5, color: "text.primary" }}>
            PNC
          </Typography>
          <RadioGroup row sx={yesNoRadioRowSx}>
            <FormControlLabel value="yes" control={<Radio size="small" />} label="Yes" sx={controlLabelSx} />
            <FormControlLabel value="no" control={<Radio size="small" />} label="No" sx={controlLabelSx} />
          </RadioGroup>
        </Grid>
      </Grid>
    </Box>
  );
}
