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

/** Date inputs — same height as `fieldInputSx`, without uppercase value text. */
export const dateFieldInputSx = {
  "& .MuiInputBase-root": { height: 40 },
  "& .MuiInputBase-input": {
    height: "100%",
    boxSizing: "border-box",
    textTransform: "none",
  },
} as const;

/** Toolbar filter buttons aligned to `dateFieldInputSx` height. */
export const filterToolbarButtonSx = {
  height: 40,
  minHeight: 40,
  px: 1.75,
  whiteSpace: "nowrap",
} as const;

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

/** Findings / impression fields — keep pasted and typed letter casing as entered. */
export const imagingReportFieldSx = {
  "& .MuiInputBase-root": {
    minHeight: 88,
    alignItems: "flex-start",
  },
  "& .MuiInputBase-input": {
    py: 1.25,
    boxSizing: "border-box",
    textTransform: "none",
  },
} as const;
