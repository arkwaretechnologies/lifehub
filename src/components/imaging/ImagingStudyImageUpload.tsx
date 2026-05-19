"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import CloudUploadOutlinedIcon from "@mui/icons-material/CloudUploadOutlined";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import {
  Box,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Tooltip,
  Typography,
} from "@mui/material";
import { authenticatedFetch } from "@/lib/authenticatedFetch";
import { IMAGING_UPLOAD_ACCEPT } from "@/lib/imagingResultImageShared";

type Props = {
  itemId: string;
  resultReceived: boolean;
  disabled?: boolean;
  hasImage: boolean;
  originalFilename?: string | null;
  onUploaded?: () => void;
  onError?: (message: string) => void;
};

export default function ImagingStudyImageUpload({
  itemId,
  resultReceived,
  disabled,
  hasImage: hasImageProp,
  originalFilename,
  onUploaded,
  onError,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [hasImage, setHasImage] = useState(hasImageProp);

  useEffect(() => {
    setHasImage(hasImageProp);
  }, [hasImageProp]);

  const loadPreview = useCallback(async () => {
    if (!hasImage || !itemId.trim()) {
      setPreviewUrl(null);
      return null;
    }
    setLoadingPreview(true);
    try {
      const res = await authenticatedFetch(
        `/api/imaging/imaging-item/image?imagingRequestItemId=${encodeURIComponent(itemId)}`,
        { cache: "no-store" },
      );
      const json = (await res.json().catch(() => ({}))) as { error?: string; imageUrl?: string };
      if (!res.ok || !json.imageUrl) {
        setPreviewUrl(null);
        return null;
      }
      setPreviewUrl(json.imageUrl);
      return json.imageUrl;
    } catch {
      setPreviewUrl(null);
      return null;
    } finally {
      setLoadingPreview(false);
    }
  }, [hasImage, itemId]);

  useEffect(() => {
    void loadPreview();
  }, [loadPreview]);

  const uploadFile = async (file: File) => {
    if (!resultReceived) {
      onError?.("Mark Received before uploading.");
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.append("imagingRequestItemId", itemId);
      form.append("file", file);
      const res = await authenticatedFetch("/api/imaging/imaging-item/upload", {
        method: "POST",
        body: form,
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        imageUrl?: string;
        optimized?: boolean;
      };
      if (!res.ok || json.error) {
        onError?.(json.error ?? "Upload failed.");
        return;
      }
      setHasImage(true);
      if (json.imageUrl) setPreviewUrl(json.imageUrl);
      else await loadPreview();
      onUploaded?.();
    } catch {
      onError?.("Upload failed.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  if (!resultReceived) {
    return (
      <Typography variant="caption" color="text.disabled">
        —
      </Typography>
    );
  }

  const isDicom =
    (originalFilename ?? "").toLowerCase().endsWith(".dcm") ||
    (originalFilename ?? "").toLowerCase().endsWith(".dicom");

  const openViewer = async () => {
    const url = previewUrl ?? (await loadPreview());
    if (!url) {
      onError?.("Could not load image.");
      return;
    }
    if (isDicom) {
      window.open(url, "_blank", "noopener,noreferrer");
      return;
    }
    setViewerOpen(true);
  };

  return (
    <Box sx={{ display: "flex", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 0.25 }}>
      <input
        ref={inputRef}
        type="file"
        accept={IMAGING_UPLOAD_ACCEPT}
        hidden
        disabled={disabled || uploading}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void uploadFile(file);
        }}
      />
      <Tooltip
        title={
          hasImage
            ? "Replace x-ray / study image (.dcm, .dicom, .jpg, .png, .tif, .tiff, .bmp, .webp)"
            : "Upload x-ray / study image (.dcm, .dicom, .jpg, .png, .tif, .tiff, .bmp, .webp)"
        }
      >
        <span>
          <IconButton
            size="small"
            color={hasImage ? "success" : "primary"}
            disabled={disabled || uploading}
            onClick={() => inputRef.current?.click()}
            aria-label="Upload imaging result"
          >
            {uploading ? (
              <CircularProgress size={22} />
            ) : (
              <CloudUploadOutlinedIcon fontSize="small" />
            )}
          </IconButton>
        </span>
      </Tooltip>
      {hasImage ? (
        <Tooltip title={isDicom ? "Open DICOM file" : "View image"}>
          <span>
            <IconButton
              size="small"
              color="secondary"
              disabled={disabled || uploading || loadingPreview}
              onClick={() => void openViewer()}
              aria-label="View imaging result"
            >
              {loadingPreview ? (
                <CircularProgress size={22} />
              ) : (
                <VisibilityOutlinedIcon fontSize="small" />
              )}
            </IconButton>
          </span>
        </Tooltip>
      ) : null}
      <Dialog open={viewerOpen} onClose={() => setViewerOpen(false)} maxWidth="lg" fullWidth>
        <DialogTitle sx={{ pr: 6 }}>
          {originalFilename?.trim() || "Study image"}
        </DialogTitle>
        <DialogContent>
          {previewUrl && !isDicom ? (
            <Box
              component="img"
              src={previewUrl}
              alt={originalFilename?.trim() || "Study image"}
              sx={{
                width: "100%",
                maxHeight: "75vh",
                objectFit: "contain",
                borderRadius: 1,
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </Box>
  );
}
