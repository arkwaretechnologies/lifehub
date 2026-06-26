"use client";

import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Typography,
} from "@mui/material";

export type PackageSelectionConfirmDialogProps = {
  open: boolean;
  packageName: string;
  labTestNames: string[];
  imagingStudyNames: string[];
  onCancel: () => void;
  onConfirm: () => void;
};

export function PackageSelectionConfirmDialog({
  open,
  packageName,
  labTestNames,
  imagingStudyNames,
  onCancel,
  onConfirm,
}: PackageSelectionConfirmDialogProps) {
  return (
    <Dialog open={open} onClose={onCancel} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 800 }}>Add package?</DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ mb: 1.5 }}>
          You already selected some items individually. Adding{" "}
          <Typography component="span" variant="body2" fontWeight={700}>
            {packageName}
          </Typography>{" "}
          will remove those line-item selections and include them in the package instead.
        </Typography>
        {labTestNames.length > 0 ? (
          <Stack spacing={0.5} sx={{ mb: imagingStudyNames.length > 0 ? 1.5 : 0 }}>
            <Typography variant="caption" fontWeight={700} color="text.secondary">
              Laboratory tests
            </Typography>
            <Stack component="ul" spacing={0.5} sx={{ m: 0, pl: 2.5 }}>
              {labTestNames.map((name) => (
                <Typography key={name} component="li" variant="body2">
                  {name}
                </Typography>
              ))}
            </Stack>
          </Stack>
        ) : null}
        {imagingStudyNames.length > 0 ? (
          <Stack spacing={0.5}>
            <Typography variant="caption" fontWeight={700} color="text.secondary">
              Imaging studies
            </Typography>
            <Stack component="ul" spacing={0.5} sx={{ m: 0, pl: 2.5 }}>
              {imagingStudyNames.map((name) => (
                <Typography key={name} component="li" variant="body2">
                  {name}
                </Typography>
              ))}
            </Stack>
          </Stack>
        ) : null}
      </DialogContent>
      <DialogActions sx={{ px: 2, py: 1.5 }}>
        <Button onClick={onCancel} sx={{ textTransform: "none" }}>
          Cancel
        </Button>
        <Button variant="contained" onClick={onConfirm} sx={{ textTransform: "none" }}>
          Add package
        </Button>
      </DialogActions>
    </Dialog>
  );
}
