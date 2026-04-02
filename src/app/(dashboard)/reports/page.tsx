"use client";

import { Card, CardContent, Typography } from "@mui/material";
import AssessmentOutlinedIcon from "@mui/icons-material/AssessmentOutlined";

export default function ReportsPage() {
  return (
    <>
      <Typography variant="h5" sx={{ mb: 3 }}>
        Reports
      </Typography>

      <Card>
        <CardContent sx={{ p: 6, textAlign: "center" }}>
          <AssessmentOutlinedIcon
            sx={{ fontSize: 64, color: "text.secondary", mb: 2 }}
          />
          <Typography variant="h6" color="text.secondary">
            Reports page coming soon.
          </Typography>
          <Typography variant="body2" color="text.secondary" mt={1}>
            Analytics and generated reports will be available here.
          </Typography>
        </CardContent>
      </Card>
    </>
  );
}
