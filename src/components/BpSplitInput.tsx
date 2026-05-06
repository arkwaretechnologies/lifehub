"use client";

import { Box, Stack, TextField, Typography } from "@mui/material";
import { mergeBpFromInputs, splitBpForInputs } from "@/lib/bpInput";
import { commonFieldProps, fieldInputSx } from "@/components/fieldInputStyles";

export type BpSplitInputProps = {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  variant: "reception" | "consultation";
  systolicId?: string;
  diastolicId?: string;
};

export function BpSplitInput({
  value,
  onChange,
  disabled,
  variant,
  systolicId,
  diastolicId,
}: BpSplitInputProps) {
  const { systolic, diastolic } = splitBpForInputs(value);

  const fieldSx =
    variant === "consultation"
      ? { ...fieldInputSx, flex: 1, minWidth: 0 }
      : { flex: 1, minWidth: 0 };

  const shared =
    variant === "consultation"
      ? { ...commonFieldProps, disabled, sx: fieldSx }
      : { fullWidth: true, disabled, size: "small" as const, sx: fieldSx };

  return (
    <Box sx={{ width: "100%" }}>
      {variant === "reception" ? (
        <Typography
          variant="caption"
          component="span"
          sx={{
            display: "block",
            ml: 1.75,
            mb: 0.25,
            color: "primary.main",
            lineHeight: 1.2,
            fontSize: "0.75rem",
          }}
        >
          BP
        </Typography>
      ) : null}
      <Stack
        direction="row"
        alignItems="center"
        spacing={0.75}
        useFlexGap
        sx={{ width: "100%" }}
      >
        <TextField
          id={systolicId}
          hiddenLabel
          placeholder="120"
          value={systolic}
          onChange={(e) => onChange(mergeBpFromInputs(e.target.value, diastolic))}
          inputProps={{
            inputMode: "numeric",
            maxLength: 3,
            "aria-label": "Blood pressure systolic",
          }}
          {...shared}
        />
        <Typography
          component="span"
          sx={{
            userSelect: "none",
            color: "text.secondary",
            fontWeight: 600,
            flexShrink: 0,
            lineHeight: 1,
          }}
        >
          /
        </Typography>
        <TextField
          id={diastolicId}
          hiddenLabel
          placeholder="80"
          value={diastolic}
          onChange={(e) => onChange(mergeBpFromInputs(systolic, e.target.value))}
          inputProps={{
            inputMode: "numeric",
            maxLength: 3,
            "aria-label": "Blood pressure diastolic",
          }}
          {...shared}
        />
      </Stack>
    </Box>
  );
}
