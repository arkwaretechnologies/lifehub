"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  Typography,
  TextField,
  Button,
  Box,
  Table,
  TableBody,
  TableCell,
  TableRow,
  Chip,
  Alert,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";

interface BillingRecord {
  id: number;
  name: string;
  consultationFee: number;
  labFees: number;
  paid: boolean;
}

const mockRecords: BillingRecord[] = [
  { id: 1, name: "Juan Dela Cruz", consultationFee: 500, labFees: 350, paid: false },
  { id: 2, name: "Maria Santos", consultationFee: 500, labFees: 0, paid: false },
  { id: 3, name: "Pedro Reyes", consultationFee: 500, labFees: 800, paid: true },
  { id: 4, name: "Ana Garcia", consultationFee: 500, labFees: 200, paid: false },
];

export default function CashierPage() {
  const [search, setSearch] = useState("");
  const [records, setRecords] = useState(mockRecords);
  const [successMsg, setSuccessMsg] = useState("");

  const filtered = records.filter((r) =>
    r.name.toLowerCase().includes(search.toLowerCase())
  );

  const markAsPaid = (id: number) => {
    setRecords((prev) =>
      prev.map((r) => (r.id === id ? { ...r, paid: true } : r))
    );
    setSuccessMsg("Payment recorded successfully!");
    setTimeout(() => setSuccessMsg(""), 3000);
  };

  return (
    <>
      <Typography variant="h5" sx={{ mb: 3 }}>
        Cashier
      </Typography>

      {successMsg && (
        <Alert severity="success" sx={{ mb: 2 }}>
          {successMsg}
        </Alert>
      )}

      <Card sx={{ mb: 3 }}>
        <CardContent sx={{ p: 3 }}>
          <TextField
            label="Search patient"
            fullWidth
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            slotProps={{
              input: { startAdornment: <SearchIcon sx={{ mr: 1, color: "text.secondary" }} /> },
            }}
          />
        </CardContent>
      </Card>

      {filtered.map((record) => (
        <Card key={record.id} sx={{ mb: 2 }}>
          <CardContent sx={{ p: 3 }}>
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
              <Typography variant="subtitle1" fontWeight={600}>
                {record.name}
              </Typography>
              <Chip
                label={record.paid ? "Paid" : "Unpaid"}
                color={record.paid ? "success" : "warning"}
                size="small"
              />
            </Box>

            <Table size="small">
              <TableBody>
                <TableRow>
                  <TableCell sx={{ border: 0, pl: 0 }}>Consultation Fee</TableCell>
                  <TableCell align="right" sx={{ border: 0 }}>
                    PHP {record.consultationFee.toFixed(2)}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell sx={{ border: 0, pl: 0 }}>Lab Fees</TableCell>
                  <TableCell align="right" sx={{ border: 0 }}>
                    PHP {record.labFees.toFixed(2)}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell sx={{ pl: 0 }}>
                    <Typography fontWeight={700}>Total</Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Typography fontWeight={700}>
                      PHP {(record.consultationFee + record.labFees).toFixed(2)}
                    </Typography>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>

            {!record.paid && (
              <Box sx={{ mt: 2, display: "flex", justifyContent: "flex-end" }}>
                <Button
                  variant="contained"
                  color="success"
                  onClick={() => markAsPaid(record.id)}
                >
                  Mark as Paid
                </Button>
              </Box>
            )}
          </CardContent>
        </Card>
      ))}
    </>
  );
}
