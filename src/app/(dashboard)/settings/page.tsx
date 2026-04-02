"use client";

import { Card, CardContent, Typography, Box } from "@mui/material";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";

export default function SettingsPage() {
  return (
    <>
      <Typography variant="h5" sx={{ mb: 3 }}>
        Settings
      </Typography>

      <Card>
        <CardContent sx={{ p: 6, textAlign: "center" }}>
          <SettingsOutlinedIcon
            sx={{ fontSize: 64, color: "text.secondary", mb: 2 }}
          />
          <Typography variant="h6" color="text.secondary">
            Settings page coming soon.
          </Typography>
          <Typography variant="body2" color="text.secondary" mt={1}>
            System configuration and preferences will be available here.
          </Typography>
        </CardContent>
      </Card>
    </>
  );
}
