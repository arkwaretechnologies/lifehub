/** Shared with patient and consultation forms — keep in sync with `PatientFormFields`. */
export const commonFieldProps = {
  fullWidth: true,
  size: "small" as const,
};

export const fieldInputSx = {
  "& .MuiInputBase-root": { height: 40 },
  "& .MuiInputBase-input": {
    height: "100%",
    boxSizing: "border-box",
    textTransform: "uppercase",
  },
  "& .MuiSelect-select": {
    height: "100%",
    display: "flex",
    alignItems: "center",
    textTransform: "uppercase",
  },
} as const;

export const emailFieldInputSx = {
  "& .MuiInputBase-root": { height: 40 },
  "& .MuiInputBase-input": {
    height: "100%",
    boxSizing: "border-box",
    textTransform: "lowercase",
  },
  "& .MuiSelect-select": {
    height: "100%",
    display: "flex",
    alignItems: "center",
    textTransform: "uppercase",
  },
} as const;

export const menuItemSx = { textTransform: "uppercase" as const };

export const fieldMultilineInputSx = {
  "& .MuiInputBase-root": {
    minHeight: 88,
    alignItems: "flex-start",
  },
  "& .MuiInputBase-input": {
    py: 1.25,
    boxSizing: "border-box",
    textTransform: "uppercase",
  },
} as const;
