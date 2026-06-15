"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import CloudUploadOutlinedIcon from "@mui/icons-material/CloudUploadOutlined";
import RestartAltOutlinedIcon from "@mui/icons-material/RestartAltOutlined";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import ZoomInOutlinedIcon from "@mui/icons-material/ZoomInOutlined";
import ZoomOutOutlinedIcon from "@mui/icons-material/ZoomOutOutlined";
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

const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.25;

type Props = {
  itemId: string;
  resultReceived: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  hasImage: boolean;
  originalFilename?: string | null;
  onUploaded?: () => void;
  onError?: (message: string) => void;
};

function isLegacyDicomContent(contentType: string | null, filename: string | null | undefined): boolean {
  const mime = (contentType ?? "").toLowerCase();
  if (mime.includes("dicom")) return true;
  const name = (filename ?? "").toLowerCase();
  return name.endsWith(".dcm") || name.endsWith(".dicom");
}

function clampZoom(value: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
}

type StudyImageViewerDialogProps = {
  open: boolean;
  title: string;
  imageUrl: string | null;
  legacyDicom: boolean;
  loading: boolean;
  onClose: () => void;
};

function StudyImageViewerDialog({
  open,
  title,
  imageUrl,
  legacyDicom,
  loading,
  onClose,
}: StudyImageViewerDialogProps) {
  const [scale, setScale] = useState(MIN_ZOOM);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [imageLoading, setImageLoading] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });

  useEffect(() => {
    if (!open) {
      setImageLoading(false);
      return;
    }
    setScale(MIN_ZOOM);
    setPan({ x: 0, y: 0 });
    setIsDragging(false);
    if (!legacyDicom && imageUrl) {
      setImageLoading(true);
    } else {
      setImageLoading(false);
    }
  }, [open, imageUrl, legacyDicom]);

  const canPan = scale > MIN_ZOOM;

  const zoomIn = () => setScale((s) => clampZoom(s + ZOOM_STEP));
  const zoomOut = () => {
    setScale((s) => {
      const next = clampZoom(s - ZOOM_STEP);
      if (next <= MIN_ZOOM) setPan({ x: 0, y: 0 });
      return next;
    });
  };
  const resetView = () => {
    setScale(MIN_ZOOM);
    setPan({ x: 0, y: 0 });
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (legacyDicom || !imageUrl) return;
    e.preventDefault();
    const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
    setScale((s) => {
      const next = clampZoom(s + delta);
      if (next <= MIN_ZOOM) setPan({ x: 0, y: 0 });
      return next;
    });
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!canPan || legacyDicom || !imageUrl) return;
    setIsDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    setPan({
      x: dragStart.current.panX + dx,
      y: dragStart.current.panY + dy,
    });
  };

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    setIsDragging(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  const showLoading = loading || (imageLoading && !legacyDicom && Boolean(imageUrl));

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 1,
          pr: 2,
        }}
      >
        <Typography component="span" variant="h6" noWrap sx={{ flex: 1, fontSize: "1rem", fontWeight: 600 }}>
          {title}
        </Typography>
        {!legacyDicom && imageUrl && !showLoading ? (
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.25, flexShrink: 0 }}>
            <Tooltip title="Zoom out">
              <span>
                <IconButton
                  size="small"
                  onClick={zoomOut}
                  disabled={scale <= MIN_ZOOM}
                  aria-label="Zoom out"
                >
                  <ZoomOutOutlinedIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
            <Typography variant="caption" color="text.secondary" sx={{ minWidth: 40, textAlign: "center" }}>
              {Math.round(scale * 100)}%
            </Typography>
            <Tooltip title="Zoom in">
              <span>
                <IconButton
                  size="small"
                  onClick={zoomIn}
                  disabled={scale >= MAX_ZOOM}
                  aria-label="Zoom in"
                >
                  <ZoomInOutlinedIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip title="Reset view">
              <span>
                <IconButton
                  size="small"
                  onClick={resetView}
                  disabled={scale <= MIN_ZOOM && pan.x === 0 && pan.y === 0}
                  aria-label="Reset view"
                >
                  <RestartAltOutlinedIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
          </Box>
        ) : null}
      </DialogTitle>
      <DialogContent sx={{ p: 0 }}>
        {legacyDicom ? (
          <Box sx={{ p: 3 }}>
            <Typography variant="body2" color="text.secondary">
              This study was uploaded as a DICOM file before preview conversion was enabled. Re-upload the study image to
              generate a viewable JPEG preview.
            </Typography>
          </Box>
        ) : (
          <Box
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onWheel={handleWheel}
            sx={{
              height: "75vh",
              overflow: "hidden",
              bgcolor: "#111",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: canPan ? (isDragging ? "grabbing" : "grab") : "default",
              touchAction: "none",
              userSelect: "none",
              position: "relative",
            }}
          >
            {showLoading ? (
              <CircularProgress sx={{ color: "grey.400", position: "absolute" }} aria-label="Loading image" />
            ) : null}
            {imageUrl ? (
              <Box
                component="img"
                src={imageUrl}
                alt={title}
                draggable={false}
                onLoad={() => setImageLoading(false)}
                onError={() => setImageLoading(false)}
                sx={{
                  maxWidth: "100%",
                  maxHeight: "75vh",
                  objectFit: "contain",
                  transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
                  transformOrigin: "center center",
                  transition: isDragging ? "none" : "transform 0.12s ease-out",
                  borderRadius: 1,
                  pointerEvents: "none",
                  visibility: showLoading ? "hidden" : "visible",
                }}
              />
            ) : null}
          </Box>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function ImagingStudyImageUpload({
  itemId,
  resultReceived,
  disabled,
  readOnly,
  hasImage: hasImageProp,
  originalFilename,
  onUploaded,
  onError,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [contentType, setContentType] = useState<string | null>(null);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [hasImage, setHasImage] = useState(hasImageProp);

  useEffect(() => {
    setHasImage(hasImageProp);
  }, [hasImageProp]);

  const loadPreview = useCallback(async () => {
    if (!hasImage || !itemId.trim()) {
      setPreviewUrl(null);
      setContentType(null);
      return null;
    }
    setLoadingPreview(true);
    try {
      const res = await authenticatedFetch(
        `/api/imaging/imaging-item/image?imagingRequestItemId=${encodeURIComponent(itemId)}`,
        { cache: "no-store" },
      );
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        imageUrl?: string;
        contentType?: string | null;
      };
      if (!res.ok || !json.imageUrl) {
        setPreviewUrl(null);
        setContentType(null);
        return null;
      }
      setPreviewUrl(json.imageUrl);
      setContentType(json.contentType ?? null);
      return json.imageUrl;
    } catch {
      setPreviewUrl(null);
      setContentType(null);
      return null;
    } finally {
      setLoadingPreview(false);
    }
  }, [hasImage, itemId]);

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
        contentType?: string;
      };
      if (!res.ok || json.error) {
        onError?.(json.error ?? "Upload failed.");
        return;
      }
      setHasImage(true);
      setContentType(json.contentType ?? "image/jpeg");
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
      <Typography component="span" variant="caption" color="text.disabled" sx={{ verticalAlign: "middle" }}>
        —
      </Typography>
    );
  }

  const legacyDicom =
    contentType != null ? isLegacyDicomContent(contentType, originalFilename) : false;

  const openViewer = () => {
    setViewerOpen(true);
    if (previewUrl) return;
    void (async () => {
      const url = await loadPreview();
      if (!url) {
        setViewerOpen(false);
        onError?.("Could not load image.");
      }
    })();
  };

  return (
    <>
      <Box
        component="span"
        sx={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 0.25, verticalAlign: "middle" }}
      >
        {!readOnly ? (
          <>
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
          </>
        ) : null}
        {hasImage ? (
          <Tooltip title="View image">
            <span>
              <IconButton
                size="small"
                color="secondary"
                disabled={disabled || uploading}
                onClick={openViewer}
                aria-label="View imaging result"
              >
                <VisibilityOutlinedIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        ) : null}
      </Box>
      <StudyImageViewerDialog
        open={viewerOpen}
        title={originalFilename?.trim() || "Study image"}
        imageUrl={previewUrl}
        legacyDicom={legacyDicom}
        loading={loadingPreview}
        onClose={() => setViewerOpen(false)}
      />
    </>
  );
}
