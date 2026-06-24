"use client";

import { Box, TextField, type TextFieldProps } from "@mui/material";
import { FormFieldLabel } from "@/components/FormFieldLabel";
import { commonFieldProps, dateFieldInputSx } from "@/components/fieldInputStyles";

type Props = Omit<TextFieldProps, "type" | "label"> & {
  id: string;
  label: string;
  labelVariant?: "default" | "consultation";
  required?: boolean;
  /** Optional fixed width on the wrapper `Box`. */
  width?: number | string | { xs?: string; sm?: number };
};

export function DatePickerField({
  id,
  label,
  labelVariant = "default",
  required = false,
  width,
  sx,
  ...textFieldProps
}: Props) {
  const field = (
    <>
      <FormFieldLabel htmlFor={id} required={required} variant={labelVariant}>
        {label}
      </FormFieldLabel>
      <TextField
        id={id}
        hiddenLabel
        type="date"
        {...commonFieldProps}
        sx={[dateFieldInputSx, ...(Array.isArray(sx) ? sx : sx ? [sx] : [])]}
        {...textFieldProps}
      />
    </>
  );

  if (width != null) {
    return <Box sx={{ width }}>{field}</Box>;
  }
  return field;
}
