"use client";

import { Card, CardContent, Typography } from "@mui/material";

export default function LabResultsPage() {
  return (
    <>
      <Typography variant="h5" sx={{ mb: 3 }}>
        Lab Results
      </Typography>

      <Card>
        <CardContent sx={{ p: 3 }}>
          <Typography variant="body2" color="text.secondary">
            Results view coming soon.
          </Typography>
        </CardContent>
      </Card>
    </>
  );
}

