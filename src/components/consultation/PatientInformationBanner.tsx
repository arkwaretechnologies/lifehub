"use client";

import type { ReactNode } from "react";
import { Box, Grid, Typography } from "@mui/material";
import type { SxProps, Theme } from "@mui/material/styles";
import type { ConsultationPatient } from "./consultationTypes";
import { CONSULTATION_BRANDING } from "./consultationTypes";

/** Matches `FormFieldLabel` on the patient page (body2 / 600 / text.primary). */
function BannerLabel({ htmlFor, children }: { htmlFor: string; children: ReactNode }) {
  return (
    <Typography
      component="label"
      variant="body2"
      htmlFor={htmlFor}
      sx={{
        display: "block",
        mb: 0.75,
        fontWeight: 600,
        color: "text.primary",
      }}
    >
      {children}
    </Typography>
  );
}

/** Read-only “value” line — same casing treatment as patient table cells. */
function BannerValue({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <Typography
      id={id}
      component="p"
      variant="body2"
      sx={{ m: 0, textTransform: "uppercase", color: "text.primary", lineHeight: 1.35 }}
    >
      {children}
    </Typography>
  );
}

function Field({ label, value, id }: { label: string; value: string; id: string }) {
  const display = value?.trim() ? value : "—";
  return (
    <Grid size={{ xs: 12, sm: 6, md: 3 }}>
      <BannerLabel htmlFor={id}>{label}</BannerLabel>
      <BannerValue id={id}>{display}</BannerValue>
    </Grid>
  );
}

export default function PatientInformationBanner({
  patient,
  showBranding = true,
  sx: sxProp,
}: {
  patient: ConsultationPatient;
  showBranding?: boolean;
  sx?: SxProps<Theme>;
}) {
  return (
    <Box
      sx={{
        borderRadius: 2,
        bgcolor: "background.paper",
        border: "1px solid",
        borderColor: "divider",
        px: { xs: 2, md: 3 },
        py: 2,
        mb: 2,
        ...sxProp,
      }}
    >
      {showBranding ? (
        <>
          <Typography
            variant="h6"
            fontWeight={800}
            letterSpacing={-0.5}
            sx={{ display: "block", textAlign: "center", color: "text.primary", mb: 0.25 }}
          >
            {CONSULTATION_BRANDING.org}
          </Typography>
          <Typography
            variant="caption"
            sx={{
              display: "block",
              textAlign: "center",
              color: "text.secondary",
              mb: 1.5,
            }}
          >
            {CONSULTATION_BRANDING.tagline} · {CONSULTATION_BRANDING.addressLine} | Tel:{" "}
            {CONSULTATION_BRANDING.tel} | {CONSULTATION_BRANDING.email}
          </Typography>
        </>
      ) : null}
      <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 2, color: "text.primary" }}>
        Patient information
      </Typography>
      <Grid container spacing={2}>
        <Field id="consult-pi-name" label="Name" value={patient.name} />
        <Field id="consult-pi-date" label="Date" value={patient.date} />
        <Field id="consult-pi-time" label="Time" value={patient.time} />
        <Field id="consult-pi-agesex" label="Age / sex" value={patient.ageSex} />
        <Field id="consult-pi-dob" label="DOB" value={patient.dob} />
        <Field id="consult-pi-civil" label="Civil status" value={patient.civilStatus} />
        <Field id="consult-pi-contact" label="Contact no" value={patient.contactNo} />
        <Field id="consult-pi-occupation" label="Occupation" value={patient.occupation} />
        <Field id="consult-pi-pid" label="Patient ID" value={patient.patientId} />
        <Field id="consult-pi-phil" label="PhilHealth no" value={patient.philhealthNo} />
        <Field id="consult-pi-ref" label="Referring physician" value={patient.referringPhysician} />
        <Grid size={{ xs: 12 }}>
          <BannerLabel htmlFor="consult-pi-address">Address</BannerLabel>
          <BannerValue id="consult-pi-address">{patient.address?.trim() ? patient.address : "—"}</BannerValue>
        </Grid>
      </Grid>
    </Box>
  );
}
