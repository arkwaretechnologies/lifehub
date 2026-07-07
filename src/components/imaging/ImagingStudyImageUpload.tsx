"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import CloudUploadOutlinedIcon from "@mui/icons-material/CloudUploadOutlined";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import RestartAltOutlinedIcon from "@mui/icons-material/RestartAltOutlined";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import ZoomInOutlinedIcon from "@mui/icons-material/ZoomInOutlined";
import ZoomOutOutlinedIcon from "@mui/icons-material/ZoomOutOutlined";
import {
  Badge,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
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

type ViewerImage = {
  id: string;
  imageUrl: string;
  contentType: string | null;
  originalFilename: string | null;
  sortOrder: number;
};

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
  images: ViewerImage[];
  currentIndex: number;
  loading: boolean;
  canDelete: boolean;
  deleting: boolean;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  onDelete: () => void;
};

function StudyImageViewerDialog({
  open,
  images,
  currentIndex,
  loading,
  canDelete,
  deleting,
  onClose,
  onPrev,
  onNext,
  onDelete,
}: StudyImageViewerDialogProps) {
  const [scale, setScale] = useState(MIN_ZOOM);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [imageLoading, setImageLoading] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });

  const current = images[currentIndex] ?? null;
  const imageUrl = current?.imageUrl ?? null;
  const title = current?.originalFilename?.trim() || "Study image";
  const legacyDicom = isLegacyDicomContent(current?.contentType ?? null, current?.originalFilename);
  const hasMultiple = images.length > 1;
  const canGoPrev = currentIndex > 0;
  const canGoNext = currentIndex < images.length - 1;

  useEffect(() => {
    if (!open) {
      setImageLoading(false);
      setConfirmDeleteOpen(false);
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
  }, [open, imageUrl, legacyDicom, currentIndex]);

  useEffect(() => {
    if (!open || !hasMultiple) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" && canGoPrev) {
        e.preventDefault();
        onPrev();
      } else if (e.key === "ArrowRight" && canGoNext) {
        e.preventDefault();
        onNext();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, hasMultiple, canGoPrev, canGoNext, onPrev, onNext]);

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
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, flex: 1, minWidth: 0 }}>
          {hasMultiple ? (
            <Tooltip title="Previous image">
              <span>
                <IconButton
                  size="small"
                  onClick={onPrev}
                  disabled={!canGoPrev}
                  aria-label="Previous image"
                >
                  <ChevronLeftIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
          ) : null}
          <Typography component="span" variant="h6" noWrap sx={{ flex: 1, fontSize: "1rem", fontWeight: 600 }}>
            {title}
          </Typography>
          {hasMultiple ? (
            <>
              <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
                {currentIndex + 1} / {images.length}
              </Typography>
              <Tooltip title="Next image">
                <span>
                  <IconButton
                    size="small"
                    onClick={onNext}
                    disabled={!canGoNext}
                    aria-label="Next image"
                  >
                    <ChevronRightIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
            </>
          ) : null}
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.25, flexShrink: 0 }}>
          {!legacyDicom && imageUrl && !showLoading ? (
            <>
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
            </>
          ) : null}
          {canDelete ? (
            <Tooltip title="Delete this image">
              <span>
                <IconButton
                  size="small"
                  color="error"
                  disabled={deleting || !current?.id}
                  onClick={() => setConfirmDeleteOpen(true)}
                  aria-label="Delete image"
                >
                  {deleting ? (
                    <CircularProgress size={18} color="inherit" />
                  ) : (
                    <DeleteOutlineIcon fontSize="small" />
                  )}
                </IconButton>
              </span>
            </Tooltip>
          ) : null}
        </Box>
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
      <Dialog open={confirmDeleteOpen} onClose={() => !deleting && setConfirmDeleteOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Delete image?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Remove <strong>{title}</strong> from this study? This cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setConfirmDeleteOpen(false)} disabled={deleting}>
            Cancel
          </Button>
          <Button
            color="error"
            variant="contained"
            disabled={deleting}
            onClick={() => {
              setConfirmDeleteOpen(false);
              onDelete();
            }}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Dialog>
  );
}

export default function ImagingStudyImageUpload({
  itemId,
  resultReceived,
  disabled,
  readOnly,
  hasImage: hasImageProp,
  onUploaded,
  onError,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [loadingImages, setLoadingImages] = useState(false);
  const [images, setImages] = useState<ViewerImage[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [hasImage, setHasImage] = useState(hasImageProp);
  const [imageCount, setImageCount] = useState(hasImageProp ? 1 : 0);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    setHasImage(hasImageProp);
    if (!hasImageProp) {
      setImageCount(0);
      setImages([]);
    }
  }, [hasImageProp]);

  useEffect(() => {
    setImages([]);
    setCurrentIndex(0);
  }, [itemId]);

  const loadImages = useCallback(async () => {
    if (!hasImage || !itemId.trim()) {
      setImages([]);
      setImageCount(0);
      return [];
    }
    setLoadingImages(true);
    try {
      const res = await authenticatedFetch(
        `/api/imaging/imaging-item/images?imagingRequestItemId=${encodeURIComponent(itemId)}`,
        { cache: "no-store" },
      );
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        images?: ViewerImage[];
      };
      if (!res.ok || json.error) {
        setImages([]);
        setImageCount(0);
        return [];
      }
      const loaded = Array.isArray(json.images) ? json.images : [];
      setImages(loaded);
      setImageCount(loaded.length);
      setCurrentIndex(0);
      return loaded;
    } catch {
      setImages([]);
      setImageCount(0);
      return [];
    } finally {
      setLoadingImages(false);
    }
  }, [hasImage, itemId]);

  const uploadFiles = async (files: File[]) => {
    if (!resultReceived) {
      onError?.("Mark Received before uploading.");
      return;
    }
    if (files.length === 0) return;

    setUploading(true);
    try {
      const form = new FormData();
      form.append("imagingRequestItemId", itemId);
      for (const file of files) {
        form.append("file", file);
      }
      const res = await authenticatedFetch("/api/imaging/imaging-item/upload", {
        method: "POST",
        body: form,
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        imageCount?: number;
      };
      if (!res.ok || json.error) {
        onError?.(json.error ?? "Upload failed.");
        return;
      }
      setHasImage(true);
      setImageCount(typeof json.imageCount === "number" ? json.imageCount : files.length);
      setImages([]);
      onUploaded?.();
    } catch {
      onError?.("Upload failed.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const goPrev = useCallback(() => {
    setCurrentIndex((index) => Math.max(0, index - 1));
  }, []);

  const goNext = useCallback(() => {
    setCurrentIndex((index) => Math.min(images.length - 1, index + 1));
  }, [images.length]);

  const deleteCurrentImage = async () => {
    const current = images[currentIndex];
    if (!current?.id || !itemId.trim()) return;

    setDeleting(true);
    try {
      const res = await authenticatedFetch(
        `/api/imaging/imaging-item/image?imagingRequestItemId=${encodeURIComponent(itemId)}&imageId=${encodeURIComponent(current.id)}`,
        { method: "DELETE" },
      );
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        imageCount?: number;
        hasImage?: boolean;
      };
      if (!res.ok || json.error) {
        onError?.(json.error ?? "Could not delete image.");
        return;
      }

      const nextImages = images.filter((img) => img.id !== current.id);
      const nextCount = typeof json.imageCount === "number" ? json.imageCount : nextImages.length;
      const stillHasImage = json.hasImage === true || nextCount > 0;

      setImages(nextImages);
      setImageCount(nextCount);
      setHasImage(stillHasImage);
      setCurrentIndex((index) => Math.min(index, Math.max(0, nextImages.length - 1)));

      if (!stillHasImage) {
        setViewerOpen(false);
      }
      onUploaded?.();
    } catch {
      onError?.("Could not delete image.");
    } finally {
      setDeleting(false);
    }
  };

  if (!resultReceived) {
    return (
      <Typography component="span" variant="caption" color="text.disabled" sx={{ verticalAlign: "middle" }}>
        —
      </Typography>
    );
  }

  const openViewer = () => {
    setViewerOpen(true);
    void (async () => {
      const loaded = images.length > 0 ? images : await loadImages();
      if (loaded.length === 0) {
        setViewerOpen(false);
        onError?.("Could not load image.");
      }
    })();
  };

  const viewTooltip =
    imageCount > 1 ? `View images (${imageCount})` : "View image";

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
              multiple
              hidden
              disabled={disabled || uploading}
              onChange={(e) => {
                const selected = Array.from(e.target.files ?? []);
                if (selected.length > 0) void uploadFiles(selected);
              }}
            />
            <Tooltip
              title={
                hasImage
                  ? "Add x-ray / study images (.dcm, .dicom, .jpg, .png, .tif, .tiff, .bmp, .webp)"
                  : "Upload x-ray / study images (.dcm, .dicom, .jpg, .png, .tif, .tiff, .bmp, .webp)"
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
          <Tooltip title={viewTooltip}>
            <span>
              <IconButton
                size="small"
                color="secondary"
                disabled={disabled || uploading}
                onClick={openViewer}
                aria-label="View imaging result"
              >
                {imageCount > 1 ? (
                  <Badge badgeContent={imageCount} color="primary" max={99}>
                    <VisibilityOutlinedIcon fontSize="small" />
                  </Badge>
                ) : (
                  <VisibilityOutlinedIcon fontSize="small" />
                )}
              </IconButton>
            </span>
          </Tooltip>
        ) : null}
      </Box>
      <StudyImageViewerDialog
        open={viewerOpen}
        images={images}
        currentIndex={currentIndex}
        loading={loadingImages}
        canDelete={!readOnly && !disabled}
        deleting={deleting}
        onClose={() => setViewerOpen(false)}
        onPrev={goPrev}
        onNext={goNext}
        onDelete={() => void deleteCurrentImage()}
      />
    </>
  );
}
