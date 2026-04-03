"use client";

import { Alert, Box, Card, CardContent, Typography } from "@mui/material";
import LocalHospitalOutlinedIcon from "@mui/icons-material/LocalHospitalOutlined";

export default function ConsultationPage() {
  return (
    <>
      <Typography variant="h5" sx={{ mb: 3 }}>
        Consultation
      </Typography>

      <Card>
        <CardContent sx={{ p: 6, textAlign: "center" }}>
          <LocalHospitalOutlinedIcon
            sx={{ fontSize: 64, color: "text.secondary", mb: 2 }}
          />
          <Alert severity="info" variant="outlined">
            Coming soon for now.
          </Alert>
          <Typography variant="body2" color="text.secondary" mt={2}>
            This module will be used by the doctor.
          </Typography>
        </CardContent>
      </Card>
    </>
  );
}

