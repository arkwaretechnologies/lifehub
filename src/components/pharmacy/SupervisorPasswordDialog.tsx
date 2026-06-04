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
  Divider,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { verifySupervisorApi } from "@/lib/pharmacyCartLineRequests";

export type SupervisorCartAction = "increment" | "decrement" | "delete" | "set_quantity";

type Props = {
  open: boolean;
  action: SupervisorCartAction;
  /** When action is `set_quantity`, shown in the authorization prompt. */
  targetQty?: number;
  productLabel: string;
  onClose: () => void;
  onVerified: (displayName: string) => void;
  /** Remote approval when no supervisor is at the register. */
  onRequestApproval: () => void;
  requestBusy?: boolean;
  requestError?: string | null;
  container?: () => HTMLElement | null;
};

const ACTION_LABEL: Record<Exclude<SupervisorCartAction, "set_quantity">, string> = {
  increment: "increase quantity",
  decrement: "decrease quantity",
  delete: "remove this line",
};

function describeSupervisorAction(action: SupervisorCartAction, targetQty?: number): string {
  if (action === "set_quantity" && targetQty != null && targetQty >= 1) {
    return `set quantity to ${targetQty}`;
  }
  if (action === "set_quantity") return "change quantity";
  return ACTION_LABEL[action];
}

/** Outlined fields: stable label + vertically centered input (matches product management forms). */
const SUPERVISOR_FIELD_SX = {
  "& .MuiOutlinedInput-root": {
    minHeight: 48,
    alignItems: "center",
  },
  "& .MuiInputBase-input": {
    py: 1.25,
    px: 1.5,
    fontSize: "1rem",
    lineHeight: 1.5,
    boxSizing: "border-box",
  },
  "& .MuiInputLabel-root": {
    fontSize: "0.875rem",
    lineHeight: 1.5,
  },
  "& .MuiInputLabel-shrink": {
    transform: "translate(14px, -9px) scale(0.75)",
  },
} as const;

export default function SupervisorPasswordDialog({
  open,
  action,
  targetQty,
  productLabel,
  onClose,
  onVerified,
  onRequestApproval,
  requestBusy = false,
  requestError = null,
  container,
}: Props) {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const handleClose = () => {
    if (busy || requestBusy) return;
    setErr(null);
    setIdentifier("");
    setPassword("");
    onClose();
  };

  const anyBusy = busy || requestBusy;

  const handleSubmit = async () => {
    const id = identifier.trim();
    if (!id || !password) {
      setErr("Enter supervisor username and password.");
      return;
    }
    setBusy(true);
    setErr(null);
    const { ok, displayName, error } = await verifySupervisorApi(id, password);
    setBusy(false);
    if (!ok) {
      setErr(error ?? "Verification failed.");
      return;
    }
    setIdentifier("");
    setPassword("");
    onVerified(displayName ?? id);
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="xs" fullWidth container={container}>
      <DialogTitle>Supervisor authorization</DialogTitle>
      <DialogContent sx={{ pt: 1 }}>
        <Alert severity="info" sx={{ mb: 2 }}>
          To {describeSupervisorAction(action, targetQty)} for <strong>{productLabel}</strong>, have a supervisor sign in here
          or send a line authorization request to an approver.
        </Alert>
        {err && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {err}
          </Alert>
        )}
        {requestError && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {requestError}
          </Alert>
        )}
        <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>
          Supervisor at register
        </Typography>
        <Stack spacing={1.5}>
          <TextField
            label="Supervisor username"
            fullWidth
            size="medium"
            autoComplete="username"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            disabled={anyBusy}
            InputLabelProps={{ shrink: true }}
            sx={SUPERVISOR_FIELD_SX}
          />
          <TextField
            label="Password"
            type="password"
            fullWidth
            size="medium"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={anyBusy}
            InputLabelProps={{ shrink: true }}
            sx={SUPERVISOR_FIELD_SX}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleSubmit();
            }}
          />
        </Stack>
        <Button
          variant="contained"
          fullWidth
          sx={{ mt: 1.5 }}
          onClick={() => void handleSubmit()}
          disabled={anyBusy}
        >
          {busy ? <CircularProgress size={22} color="inherit" /> : "Authorize"}
        </Button>

        <Divider sx={{ my: 2 }}>
          <Typography variant="caption" color="text.secondary">
            or
          </Typography>
        </Divider>

        <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 0.5 }}>
          Remote approval
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          Notify an approver on their dashboard. You will be prompted when they approve or reject.
        </Typography>
        <Button
          variant="outlined"
          color="secondary"
          fullWidth
          onClick={onRequestApproval}
          disabled={anyBusy}
        >
          {requestBusy ? <CircularProgress size={22} /> : "Request for approval"}
        </Button>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={anyBusy}>
          Cancel
        </Button>
      </DialogActions>
    </Dialog>
  );
}
