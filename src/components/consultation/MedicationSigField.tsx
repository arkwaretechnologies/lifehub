"use client";

import { useCallback, useLayoutEffect, useRef } from "react";
import { TextField, type TextFieldProps } from "@mui/material";

/** Match small outlined single-line field inner height (product / qty). */
const SIG_ROOT_MIN_PX = 44;
const SIG_MAX_TEXTAREA_PX = 132;

const sigFieldSx = {
  "& .MuiOutlinedInput-root": {
    bgcolor: "background.paper",
    minHeight: SIG_ROOT_MIN_PX,
    alignItems: "center",
    py: 0,
  },
  "& .MuiOutlinedInput-root.MuiInputBase-multiline": {
    padding: 0,
  },
  "& textarea.MuiOutlinedInput-input": {
    py: 1.125,
    px: 1.75,
    lineHeight: 1.5,
    boxSizing: "border-box" as const,
    overflow: "hidden",
    resize: "none",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  },
  "& .MuiInputLabel-root": {
    lineHeight: 1.3,
  },
} as const;

export default function MedicationSigField({
  value,
  onChange,
  sx,
  ...rest
}: Omit<TextFieldProps, "multiline" | "value" | "onChange" | "size"> & {
  value: string;
  onChange: (value: string) => void;
}) {
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const syncHeight = useCallback(() => {
    const ta = inputRef.current;
    if (!ta) return;
    ta.style.height = "0px";
    const next = Math.min(ta.scrollHeight, SIG_MAX_TEXTAREA_PX);
    ta.style.height = `${next}px`;
    ta.style.overflowY = ta.scrollHeight > SIG_MAX_TEXTAREA_PX ? "auto" : "hidden";
  }, []);

  useLayoutEffect(() => {
    syncHeight();
  }, [value, syncHeight]);

  return (
    <TextField
      {...rest}
      size="small"
      fullWidth
      multiline
      value={value}
      inputRef={inputRef}
      onChange={(e) => {
        onChange(e.target.value);
        requestAnimationFrame(syncHeight);
      }}
      sx={[sigFieldSx, ...(Array.isArray(sx) ? sx : sx ? [sx] : [])]}
    />
  );
}
