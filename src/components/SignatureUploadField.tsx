"use client";

import { useRef } from "react";
import { Box, Button, Stack, Typography } from "@mui/material";
import UploadFileOutlinedIcon from "@mui/icons-material/UploadFileOutlined";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import { SIGNATURE_UPLOAD_ACCEPT } from "@/lib/signatureImageShared";

export default function SignatureUploadField({
  label = "Signature image",
  helperText,
  previewUrl,
  hasSignature,
  uploading,
  disabled,
  onUpload,
  onRemove,
}: {
  label?: string;
  helperText?: string;
  previewUrl: string | null;
  hasSignature: boolean;
  uploading?: boolean;
  disabled?: boolean;
  onUpload: (file: File) => void;
  onRemove: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <Box>
      <Typography variant="body2" fontWeight={600} sx={{ mb: 1 }}>
        {label}
      </Typography>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems={{ sm: "center" }}>
        <Box
          sx={{
            width: 200,
            height: 72,
            border: "1px dashed",
            borderColor: "divider",
            borderRadius: 2,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            bgcolor: "grey.50",
            overflow: "hidden",
          }}
        >
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewUrl}
              alt="Signature preview"
              style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
            />
          ) : (
            <Typography variant="caption" color="text.secondary">
              No signature
            </Typography>
          )}
        </Box>
        <Stack direction="row" spacing={1} flexWrap="wrap">
          <Button
            variant="outlined"
            size="small"
            startIcon={<UploadFileOutlinedIcon />}
            disabled={disabled || uploading}
            onClick={() => inputRef.current?.click()}
          >
            {hasSignature ? "Replace" : "Upload"}
          </Button>
          {hasSignature ? (
            <Button
              variant="outlined"
              size="small"
              color="error"
              startIcon={<DeleteOutlineIcon />}
              disabled={disabled || uploading}
              onClick={() => onRemove()}
            >
              Remove
            </Button>
          ) : null}
        </Stack>
      </Stack>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.75 }}>
        PNG with transparent background recommended (max 5 MB).
        {helperText ? ` ${helperText}` : ""}
      </Typography>
      <input
        ref={inputRef}
        type="file"
        accept={SIGNATURE_UPLOAD_ACCEPT}
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) onUpload(file);
        }}
      />
    </Box>
  );
}
