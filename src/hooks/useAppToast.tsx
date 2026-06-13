"use client";

import { useCallback, useState } from "react";
import { Alert, Snackbar } from "@mui/material";

export type AppToastSeverity = "success" | "error" | "info";

export function useAppToast() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [severity, setSeverity] = useState<AppToastSeverity>("success");

  const hideToast = useCallback(() => setOpen(false), []);

  const showToast = useCallback((msg: string, sev: AppToastSeverity = "success") => {
    setMessage(msg);
    setSeverity(sev);
    setOpen(true);
  }, []);

  const Toast = useCallback(
    () => (
      <Snackbar
        open={open}
        autoHideDuration={severity === "info" ? null : 3500}
        onClose={hideToast}
        anchorOrigin={{ vertical: "top", horizontal: "center" }}
      >
        <Alert severity={severity} variant="filled" onClose={hideToast} sx={{ width: "100%" }}>
          {message}
        </Alert>
      </Snackbar>
    ),
    [open, message, severity, hideToast],
  );

  return { showToast, hideToast, Toast };
}
