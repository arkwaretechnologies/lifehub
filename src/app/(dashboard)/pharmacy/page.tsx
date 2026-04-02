"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  Typography,
  TextField,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Box,
  Alert,
  Divider,
} from "@mui/material";
import QrCodeScannerIcon from "@mui/icons-material/QrCodeScanner";

interface Medicine {
  id: number;
  name: string;
  price: number;
  quantity: number;
}

const defaultMedicines: Medicine[] = [
  { id: 1, name: "Paracetamol 500mg", price: 5.0, quantity: 0 },
  { id: 2, name: "Amoxicillin 500mg", price: 12.0, quantity: 0 },
  { id: 3, name: "Losartan 50mg", price: 8.5, quantity: 0 },
  { id: 4, name: "Metformin 500mg", price: 6.0, quantity: 0 },
  { id: 5, name: "Omeprazole 20mg", price: 10.0, quantity: 0 },
];

export default function PharmacyPage() {
  const [qrInput, setQrInput] = useState("");
  const [medicines, setMedicines] = useState<Medicine[]>(defaultMedicines);
  const [completed, setCompleted] = useState(false);

  const handleQuantityChange = (id: number, value: string) => {
    const qty = Math.max(0, parseInt(value) || 0);
    setMedicines((prev) =>
      prev.map((m) => (m.id === id ? { ...m, quantity: qty } : m))
    );
  };

  const total = medicines.reduce((sum, m) => sum + m.price * m.quantity, 0);

  const handleCompleteSale = () => {
    setCompleted(true);
    setMedicines(defaultMedicines);
    setQrInput("");
    setTimeout(() => setCompleted(false), 3000);
  };

  return (
    <>
      <Typography variant="h5" sx={{ mb: 3 }}>
        Pharmacy
      </Typography>

      {completed && (
        <Alert severity="success" sx={{ mb: 2 }}>
          Sale completed successfully!
        </Alert>
      )}

      <Card sx={{ mb: 3 }}>
        <CardContent sx={{ p: 3 }}>
          <Typography variant="subtitle1" fontWeight={600} mb={2}>
            Scan Prescription
          </Typography>
          <TextField
            label="QR / Prescription Code"
            fullWidth
            value={qrInput}
            onChange={(e) => setQrInput(e.target.value)}
            placeholder="Scan or enter prescription code..."
            slotProps={{
              input: {
                startAdornment: (
                  <QrCodeScannerIcon sx={{ mr: 1, color: "text.secondary" }} />
                ),
              },
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent sx={{ p: 3 }}>
          <Typography variant="subtitle1" fontWeight={600} mb={2}>
            Medicine List
          </Typography>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Medicine</TableCell>
                  <TableCell align="right">Price (PHP)</TableCell>
                  <TableCell align="center">Quantity</TableCell>
                  <TableCell align="right">Subtotal</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {medicines.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell>{m.name}</TableCell>
                    <TableCell align="right">{m.price.toFixed(2)}</TableCell>
                    <TableCell align="center">
                      <TextField
                        type="number"
                        size="small"
                        value={m.quantity}
                        onChange={(e) =>
                          handleQuantityChange(m.id, e.target.value)
                        }
                        sx={{ width: 80 }}
                        slotProps={{ htmlInput: { min: 0, style: { textAlign: "center" } } }}
                      />
                    </TableCell>
                    <TableCell align="right">
                      {(m.price * m.quantity).toFixed(2)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          <Divider sx={{ my: 2 }} />

          <Box
            sx={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <Typography variant="h6" fontWeight={700}>
              Total: PHP {total.toFixed(2)}
            </Typography>
            <Button
              variant="contained"
              size="large"
              onClick={handleCompleteSale}
              disabled={total === 0}
            >
              Complete Sale
            </Button>
          </Box>
        </CardContent>
      </Card>
    </>
  );
}
