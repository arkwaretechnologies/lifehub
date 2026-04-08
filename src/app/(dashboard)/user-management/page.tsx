"use client";

import { Card, CardContent, Typography } from "@mui/material";
import AdminPanelSettingsOutlinedIcon from "@mui/icons-material/AdminPanelSettingsOutlined";

export default function UserManagementPage() {
  return (
    <>
      <Typography variant="h5" sx={{ mb: 3 }}>
        User Management
      </Typography>

      <Card>
        <CardContent sx={{ p: 6, textAlign: "center" }}>
          <AdminPanelSettingsOutlinedIcon
            sx={{ fontSize: 64, color: "text.secondary", mb: 2 }}
          />
          <Typography variant="h6" color="text.secondary">
            Coming soon.
          </Typography>
          <Typography variant="body2" color="text.secondary" mt={1}>
            Admin tools for managing users will be available here.
          </Typography>
        </CardContent>
      </Card>
    </>
  );
}

