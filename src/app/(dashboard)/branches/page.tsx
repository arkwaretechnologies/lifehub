"use client";

import {
  Grid,
  Card,
  CardContent,
  Typography,
  Chip,
  Box,
} from "@mui/material";
import LocationOnIcon from "@mui/icons-material/LocationOn";

const branches = [
  { id: 1, name: "Main Branch - Manila", address: "123 Rizal Avenue, Manila", status: "Active" },
  { id: 2, name: "Quezon City Branch", address: "456 EDSA, Quezon City", status: "Active" },
  { id: 3, name: "Cebu Branch", address: "789 Osmena Blvd, Cebu City", status: "Active" },
  { id: 4, name: "Davao Branch", address: "321 Bolton St, Davao City", status: "Coming Soon" },
];

export default function BranchesPage() {
  return (
    <>
      <Typography variant="h5" sx={{ mb: 3 }}>
        Branches
      </Typography>

      <Grid container spacing={3}>
        {branches.map((branch) => (
          <Grid key={branch.id} size={{ xs: 12, sm: 6, md: 4 }}>
            <Card sx={{ height: "100%" }}>
              <CardContent sx={{ p: 3 }}>
                <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", mb: 1 }}>
                  <Typography variant="subtitle1" fontWeight={600}>
                    {branch.name}
                  </Typography>
                  <Chip
                    label={branch.status}
                    color={branch.status === "Active" ? "success" : "default"}
                    size="small"
                  />
                </Box>
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mt: 1 }}>
                  <LocationOnIcon sx={{ fontSize: 18, color: "text.secondary" }} />
                  <Typography variant="body2" color="text.secondary">
                    {branch.address}
                  </Typography>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
    </>
  );
}
