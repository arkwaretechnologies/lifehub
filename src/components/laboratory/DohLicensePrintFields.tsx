"use client";

import { Box, Stack, TextField, Typography } from "@mui/material";
import type { DohLicensePrintFormFields } from "@/lib/resultDohLicensePrint";

const fieldSx = {
  fullWidth: true as const,
  sx: { "& .MuiOutlinedInput-root": { minHeight: 44, borderRadius: 2 } },
};

export function DohLicensePrintFields({
  fields,
  onChange,
}: {
  fields: DohLicensePrintFormFields;
  onChange: (next: DohLicensePrintFormFields) => void;
}) {
  return (
    <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2, p: 1.5 }}>
      <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>
        DOH License No
      </Typography>
      <TextField
        label="License number"
        value={fields.license_no}
        onChange={(e) => onChange({ ...fields, license_no: e.target.value })}
        sx={{ mb: 1.5, ...fieldSx.sx }}
        fullWidth
      />
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
        <TextField
          label="X (refX)"
          type="number"
          value={fields.layout.print_ref_x}
          onChange={(e) =>
            onChange({
              ...fields,
              layout: { ...fields.layout, print_ref_x: e.target.value },
            })
          }
          {...fieldSx}
        />
        <TextField
          label="Y from top"
          type="number"
          value={fields.layout.print_ref_from_top}
          onChange={(e) =>
            onChange({
              ...fields,
              layout: { ...fields.layout, print_ref_from_top: e.target.value },
            })
          }
          {...fieldSx}
        />
        <TextField
          label="Font size"
          type="number"
          value={fields.layout.print_font_size}
          onChange={(e) =>
            onChange({
              ...fields,
              layout: { ...fields.layout, print_font_size: e.target.value },
            })
          }
          {...fieldSx}
        />
        <TextField
          label="Max width"
          type="number"
          value={fields.layout.print_max_width}
          onChange={(e) =>
            onChange({
              ...fields,
              layout: { ...fields.layout, print_max_width: e.target.value },
            })
          }
          {...fieldSx}
        />
      </Stack>
    </Box>
  );
}
