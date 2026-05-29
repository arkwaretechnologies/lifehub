"use client";

import { Card, CardContent, Typography } from "@mui/material";
import AssessmentOutlinedIcon from "@mui/icons-material/AssessmentOutlined";

type ReportPlaceholderPageProps = {
  title: string;
  description?: string;
};

export default function ReportPlaceholderPage({ title, description }: ReportPlaceholderPageProps) {
  return (
    <>
      <Typography variant="h5" sx={{ mb: 3 }}>
        {title}
      </Typography>

      <Card>
        <CardContent sx={{ p: 6, textAlign: "center" }}>
          <AssessmentOutlinedIcon sx={{ fontSize: 64, color: "text.secondary", mb: 2 }} />
          <Typography variant="h6" color="text.secondary">
            Report coming soon.
          </Typography>
          {description ? (
            <Typography variant="body2" color="text.secondary" mt={1} maxWidth={480} mx="auto">
              {description}
            </Typography>
          ) : null}
        </CardContent>
      </Card>
    </>
  );
}
