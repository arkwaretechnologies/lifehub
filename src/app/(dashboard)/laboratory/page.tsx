"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  IconButton,
  Tooltip,
} from "@mui/material";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";

type LabStatus = "Waiting" | "Ongoing" | "Done";

interface LabPatient {
  id: number;
  name: string;
  test: string;
  status: LabStatus;
}

const initialData: LabPatient[] = [
  { id: 1, name: "Juan Dela Cruz", test: "CBC", status: "Waiting" },
  { id: 2, name: "Maria Santos", test: "Urinalysis", status: "Ongoing" },
  { id: 3, name: "Pedro Reyes", test: "X-Ray", status: "Done" },
  { id: 4, name: "Ana Garcia", test: "Blood Chemistry", status: "Waiting" },
  { id: 5, name: "Carlos Mendoza", test: "ECG", status: "Ongoing" },
];

const statusColor: Record<LabStatus, "warning" | "info" | "success"> = {
  Waiting: "warning",
  Ongoing: "info",
  Done: "success",
};

const nextStatus: Record<LabStatus, LabStatus | null> = {
  Waiting: "Ongoing",
  Ongoing: "Done",
  Done: null,
};

export default function LaboratoryPage() {
  const [patients, setPatients] = useState<LabPatient[]>(initialData);

  const advanceStatus = (id: number) => {
    setPatients((prev) =>
      prev.map((p) => {
        if (p.id !== id) return p;
        const next = nextStatus[p.status];
        return next ? { ...p, status: next } : p;
      })
    );
  };

  return (
    <>
      <Typography variant="h5" sx={{ mb: 3 }}>
        Laboratory
      </Typography>

      <Card>
        <CardContent sx={{ p: 3 }}>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Patient Name</TableCell>
                  <TableCell>Test</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell align="right">Action</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {patients.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>{p.name}</TableCell>
                    <TableCell>{p.test}</TableCell>
                    <TableCell>
                      <Chip
                        label={p.status}
                        color={statusColor[p.status]}
                        size="small"
                      />
                    </TableCell>
                    <TableCell align="right">
                      {p.status !== "Done" && (
                        <Tooltip title={`Move to ${nextStatus[p.status]}`}>
                          <IconButton
                            size="small"
                            color="primary"
                            onClick={() => advanceStatus(p.id)}
                          >
                            <ArrowForwardIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>
    </>
  );
}
