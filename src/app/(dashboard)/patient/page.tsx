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
  name: string;
  age: string;
  sex: string;
  dob: string;
  civilStatus: string;
  address: string;
  contactNo: string;
  occupation: string;
  referringPhysician: string;
  patientId: string;
  philHealthNo: string;
}

const emptyForm: Omit<Patient, "id"> = {
  name: "",
  age: "",
  sex: "",
  dob: "",
  civilStatus: "",
  address: "",
  contactNo: "",
  occupation: "",
  referringPhysician: "",
  patientId: "",
  philHealthNo: "",
};

export default function PatientPage() {
  const [form, setForm] = useState(emptyForm);
  const [patients, setPatients] = useState<Patient[]>([]);
  const commonFieldProps = {
    fullWidth: true,
    size: "small" as const,
  };

  const commonFieldSx = {
    "& .MuiInputBase-root": { height: 40 },
    "& .MuiInputBase-input": { height: "100%", boxSizing: "border-box" },
    "& .MuiSelect-select": { height: "100%", display: "flex", alignItems: "center" },
  } as const;

  const handleChange = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
  };

  const handleSave = () => {
    if (!form.name) return;
    setPatients((prev) => [
      ...prev,
      { ...form, id: Date.now() },
    ]);
    setForm(emptyForm);
  };

  return (
    <>
      <Typography variant="h5" sx={{ mb: 3 }}>
        Patient
      </Typography>

      <Card sx={{ mb: 3 }}>
        <CardContent sx={{ p: 3 }}>
          <Typography variant="subtitle1" fontWeight={700} sx={{ letterSpacing: 0.5 }} mb={2}>
            PATIENT INFORMATION
          </Typography>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                label="Name"
                {...commonFieldProps}
                sx={commonFieldSx}
                value={form.name}
                onChange={handleChange("name")}
              />
            </Grid>

            <Grid size={{ xs: 6, md: 3 }}>
              <TextField
                label="Age"
                type="number"
                {...commonFieldProps}
                sx={commonFieldSx}
                value={form.age}
                onChange={handleChange("age")}
              />
            </Grid>
            <Grid size={{ xs: 6, md: 3 }}>
              <TextField
                label="Sex"
                select
                {...commonFieldProps}
                sx={commonFieldSx}
                value={form.sex}
                onChange={handleChange("sex")}
              >
                <MenuItem value="Male">Male</MenuItem>
                <MenuItem value="Female">Female</MenuItem>
                <MenuItem value="Other">Other</MenuItem>
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, md: 3 }}>
              <TextField
                label="DOB"
                type="date"
                {...commonFieldProps}
                sx={commonFieldSx}
                InputLabelProps={{ shrink: true }}
                value={form.dob}
                onChange={handleChange("dob")}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 3 }}>
              <TextField
                label="Civil Status"
                select
                {...commonFieldProps}
                sx={commonFieldSx}
                value={form.civilStatus}
                onChange={handleChange("civilStatus")}
              >
                <MenuItem value="Single">Single</MenuItem>
                <MenuItem value="Married">Married</MenuItem>
                <MenuItem value="Widowed">Widowed</MenuItem>
                <MenuItem value="Separated">Separated</MenuItem>
              </TextField>
            </Grid>

            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                label="Address"
                {...commonFieldProps}
                sx={commonFieldSx}
                value={form.address}
                onChange={handleChange("address")}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 3 }}>
              <TextField
                label="Contact No"
                {...commonFieldProps}
                sx={commonFieldSx}
                value={form.contactNo}
                onChange={handleChange("contactNo")}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 3 }}>
              <TextField
                label="Occupation"
                {...commonFieldProps}
                sx={commonFieldSx}
                value={form.occupation}
                onChange={handleChange("occupation")}
              />
            </Grid>
          </Grid>

          <Divider sx={{ my: 3 }} />
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                label="Referring Physician"
                {...commonFieldProps}
                sx={commonFieldSx}
                value={form.referringPhysician}
                onChange={handleChange("referringPhysician")}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 3 }}>
              <TextField
                label="Patient ID"
                {...commonFieldProps}
                sx={commonFieldSx}
                value={form.patientId}
                onChange={handleChange("patientId")}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 3 }}>
              <TextField
                label="PhilHealth No"
                {...commonFieldProps}
                sx={commonFieldSx}
                value={form.philHealthNo}
                onChange={handleChange("philHealthNo")}
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
                    <TableCell>Sex</TableCell>
                    <TableCell>DOB</TableCell>
                    <TableCell>Contact No</TableCell>
                    <TableCell>Patient ID</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {patients.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>{p.name}</TableCell>
                      <TableCell>{p.age}</TableCell>
                      <TableCell>{p.sex}</TableCell>
                      <TableCell>{p.dob}</TableCell>
                      <TableCell>{p.contactNo}</TableCell>
                      <TableCell>{p.patientId}</TableCell>
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
