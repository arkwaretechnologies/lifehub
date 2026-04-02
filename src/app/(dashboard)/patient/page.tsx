"use client";

import { useState } from "react";
import {
  Box,
  Card,
  CardContent,
  TextField,
  Button,
  Typography,
  Grid,
  MenuItem,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Divider,
} from "@mui/material";

interface Patient {
  id: number;
  fullName: string;
  age: string;
  gender: string;
  contact: string;
  height: string;
  weight: string;
  bloodPressure: string;
}

const emptyForm = {
  fullName: "",
  age: "",
  gender: "",
  contact: "",
  height: "",
  weight: "",
  bloodPressure: "",
};

export default function PatientPage() {
  const [form, setForm] = useState(emptyForm);
  const [patients, setPatients] = useState<Patient[]>([]);

  const handleChange = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
  };

  const handleSave = () => {
    if (!form.fullName) return;
    setPatients((prev) => [
      ...prev,
      { ...form, id: Date.now() },
    ]);
    setForm(emptyForm);
  };

  return (
    <>
      <Typography variant="h5" sx={{ mb: 3 }}>
        Patient Registration
      </Typography>

      <Card sx={{ mb: 3 }}>
        <CardContent sx={{ p: 3 }}>
          <Typography variant="subtitle1" fontWeight={600} mb={2}>
            Personal Information
          </Typography>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                label="Full Name"
                fullWidth
                value={form.fullName}
                onChange={handleChange("fullName")}
              />
            </Grid>
            <Grid size={{ xs: 6, sm: 3 }}>
              <TextField
                label="Age"
                type="number"
                fullWidth
                value={form.age}
                onChange={handleChange("age")}
              />
            </Grid>
            <Grid size={{ xs: 6, sm: 3 }}>
              <TextField
                label="Gender"
                select
                fullWidth
                value={form.gender}
                onChange={handleChange("gender")}
              >
                <MenuItem value="Male">Male</MenuItem>
                <MenuItem value="Female">Female</MenuItem>
                <MenuItem value="Other">Other</MenuItem>
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                label="Contact Number"
                fullWidth
                value={form.contact}
                onChange={handleChange("contact")}
              />
            </Grid>
          </Grid>

          <Divider sx={{ my: 3 }} />

          <Typography variant="subtitle1" fontWeight={600} mb={2}>
            Mini Triage
          </Typography>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField
                label="Height (cm)"
                fullWidth
                value={form.height}
                onChange={handleChange("height")}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField
                label="Weight (kg)"
                fullWidth
                value={form.weight}
                onChange={handleChange("weight")}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField
                label="Blood Pressure"
                fullWidth
                placeholder="e.g. 120/80"
                value={form.bloodPressure}
                onChange={handleChange("bloodPressure")}
              />
            </Grid>
          </Grid>

          <Box sx={{ mt: 3, display: "flex", justifyContent: "flex-end" }}>
            <Button variant="contained" size="large" onClick={handleSave}>
              Save Patient
            </Button>
          </Box>
        </CardContent>
      </Card>

      {patients.length > 0 && (
        <Card>
          <CardContent sx={{ p: 3 }}>
            <Typography variant="subtitle1" fontWeight={600} mb={2}>
              Registered Patients
            </Typography>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Name</TableCell>
                    <TableCell>Age</TableCell>
                    <TableCell>Gender</TableCell>
                    <TableCell>Contact</TableCell>
                    <TableCell>Height</TableCell>
                    <TableCell>Weight</TableCell>
                    <TableCell>BP</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {patients.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>{p.fullName}</TableCell>
                      <TableCell>{p.age}</TableCell>
                      <TableCell>{p.gender}</TableCell>
                      <TableCell>{p.contact}</TableCell>
                      <TableCell>{p.height}</TableCell>
                      <TableCell>{p.weight}</TableCell>
                      <TableCell>{p.bloodPressure}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </CardContent>
        </Card>
      )}
    </>
  );
}
