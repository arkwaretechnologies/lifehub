"use client";

import { useState } from "react";
import {
  Alert,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  Radio,
  RadioGroup,
  TextField,
  Typography,
} from "@mui/material";
import type { CartLineRequestAction } from "@/lib/pharmacyLineRequestServer";

type Props = {
  open: boolean;
  productLabel: string;
  currentQty: number;
  busy?: boolean;
  error?: string | null;
  onClose: () => void;
  onSubmit: (action: CartLineRequestAction, note: string) => void;
  container?: () => HTMLElement | null;
};

export default function LineAuthorizationRequestDialog({
  open,
  productLabel,
  currentQty,
  busy = false,
  error = null,
  onClose,
  onSubmit,
  container,
}: Props) {
  const [action, setAction] = useState<CartLineRequestAction>("delete");
  const [note, setNote] = useState("");

  const handleClose = () => {
    if (busy) return;
    setNote("");
    setAction("delete");
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth container={container}>
      <DialogTitle>Request line authorization</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          <strong>{productLabel}</strong> · current qty {currentQty}
        </Typography>
        <Typography variant="body2" sx={{ mb: 1 }}>
          An approver will be notified. You can continue once they approve or reject.
        </Typography>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        <FormControl component="fieldset" sx={{ mt: 1 }}>
          <RadioGroup
            value={action}
            onChange={(e) => setAction(e.target.value as CartLineRequestAction)}
          >
            <FormControlLabel value="delete" control={<Radio />} label="Remove line from cart" />
            <FormControlLabel
              value="quantity_change"
              control={<Radio />}
              label="Change quantity (approver confirms; cart updates automatically)"
            />
          </RadioGroup>
        </FormControl>
        <TextField
          label="Note (optional)"
          fullWidth
          margin="normal"
          multiline
          minRows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          disabled={busy}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={busy}>
          Cancel
        </Button>
        <Button variant="contained" onClick={() => onSubmit(action, note.trim())} disabled={busy}>
          {busy ? <CircularProgress size={22} color="inherit" /> : "Submit request"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
