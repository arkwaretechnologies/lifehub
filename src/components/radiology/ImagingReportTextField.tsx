"use client";

import { useEffect, useState } from "react";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
} from "@mui/material";
import { commonFieldProps, imagingReportFieldSx } from "@/components/fieldInputStyles";

type Label = "Findings" | "Impression";

type Props = {
  label: Label;
  studyLabel: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
};

function placeholderFor(label: Label): string {
  return label === "Findings" ? "Click to enter findings…" : "Click to enter impression…";
}

export default function ImagingReportTextField({
  label,
  studyLabel,
  value,
  onChange,
  disabled = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const [modalDraft, setModalDraft] = useState(value);

  useEffect(() => {
    if (open) {
      setModalDraft(value);
    }
  }, [open, value]);

  const closeWithoutSave = () => {
    setOpen(false);
  };

  const saveAndClose = () => {
    onChange(modalDraft);
    setOpen(false);
  };

  const editable = !disabled;

  return (
    <>
      <TextField
        {...commonFieldProps}
        multiline
        minRows={2}
        disabled={disabled}
        value={value}
        placeholder={editable ? placeholderFor(label) : undefined}
        onClick={() => {
          if (editable) setOpen(true);
        }}
        slotProps={{
          input: {
            readOnly: editable,
          },
        }}
        sx={{
          ...imagingReportFieldSx,
          ...(editable
            ? {
                "& .MuiInputBase-root": {
                  ...imagingReportFieldSx["& .MuiInputBase-root"],
                  cursor: "pointer",
                },
                "& .MuiInputBase-input": {
                  ...imagingReportFieldSx["& .MuiInputBase-input"],
                  cursor: "pointer",
                },
              }
            : {}),
        }}
      />
      <Dialog
        open={open}
        onClose={closeWithoutSave}
        maxWidth="md"
        fullWidth
        aria-labelledby="imaging-report-text-dialog-title"
      >
        <DialogTitle id="imaging-report-text-dialog-title" sx={{ fontWeight: 700 }}>
          {label} — {studyLabel}
        </DialogTitle>
        <DialogContent dividers sx={{ pt: 2 }}>
          <TextField
            {...commonFieldProps}
            multiline
            minRows={14}
            maxRows={24}
            autoFocus
            value={modalDraft}
            onChange={(e) => setModalDraft(e.target.value)}
            sx={imagingReportFieldSx}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={closeWithoutSave} color="inherit" sx={{ textTransform: "none" }}>
            Cancel
          </Button>
          <Button onClick={saveAndClose} variant="contained" color="secondary" sx={{ textTransform: "none" }}>
            Done
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
