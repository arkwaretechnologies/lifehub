"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Divider,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import SaveOutlinedIcon from "@mui/icons-material/SaveOutlined";
import { authenticatedFetch } from "@/lib/authenticatedFetch";
import SignatureUploadField from "@/components/SignatureUploadField";
import { useAppToast } from "@/hooks/useAppToast";
import {
  IMAGING_SIGNATURE_ROLE_LABELS,
  IMAGING_SIGNATURE_ROLES,
  type ImagingSignatureRole,
} from "@/lib/imagingResultSignatures";
import type { ImagingResultSignatoriesMap } from "@/lib/imagingResultSignatories";

type SignatoryForm = {
  full_name: string;
  license_no: string;
};

type SignatoryFormState = Record<ImagingSignatureRole, SignatoryForm>;

const SIGNATORY_SECTIONS = IMAGING_SIGNATURE_ROLES.map((key) => ({
  key,
  title: IMAGING_SIGNATURE_ROLE_LABELS[key],
}));

const fieldSx = {
  fullWidth: true as const,
  sx: { "& .MuiOutlinedInput-root": { minHeight: 44, borderRadius: 2 } },
};

function emptyForm(): SignatoryFormState {
  return {
    radtech: { full_name: "", license_no: "" },
    radtech_ultrasound: { full_name: "", license_no: "" },
    radiologist: { full_name: "", license_no: "" },
    cardiologist: { full_name: "", license_no: "" },
  };
}

function mapToForm(s: ImagingResultSignatoriesMap): SignatoryFormState {
  const out = emptyForm();
  for (const role of IMAGING_SIGNATURE_ROLES) {
    out[role] = {
      full_name: s[role].full_name ?? "",
      license_no: s[role].license_no ?? "",
    };
  }
  return out;
}

function emptyPreviewState(): Record<ImagingSignatureRole, string | null> {
  return { radtech: null, radtech_ultrasound: null, radiologist: null, cardiologist: null };
}

function emptyHasState(): Record<ImagingSignatureRole, boolean> {
  return { radtech: false, radtech_ultrasound: false, radiologist: false, cardiologist: false };
}

export default function SettingsImagingSignatoriesPage() {
  const [form, setForm] = useState<SignatoryFormState>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [sigPreview, setSigPreview] = useState(emptyPreviewState);
  const [sigHas, setSigHas] = useState(emptyHasState);
  const [sigUploading, setSigUploading] = useState<ImagingSignatureRole | null>(null);

  const loadSignaturePreview = useCallback(async (role: ImagingSignatureRole) => {
    const res = await authenticatedFetch(`/api/settings/laboratory/imaging-signatories/${role}/signature`);
    const json = (await res.json().catch(() => null)) as {
      url?: string | null;
      storagePath?: string | null;
      error?: string;
    } | null;
    if (!res.ok || json?.error) return;
    setSigPreview((prev) => ({ ...prev, [role]: json?.url ?? null }));
    setSigHas((prev) => ({ ...prev, [role]: Boolean(json?.storagePath) }));
  }, []);

  const loadAllSignaturePreviews = useCallback(async () => {
    await Promise.all(IMAGING_SIGNATURE_ROLES.map((role) => loadSignaturePreview(role)));
  }, [loadSignaturePreview]);

  const load = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      const res = await authenticatedFetch("/api/settings/laboratory/imaging-signatories");
      const json = (await res.json().catch(() => null)) as {
        signatories?: ImagingResultSignatoriesMap;
        error?: string;
      } | null;
      if (!res.ok || json?.error) {
        setError(json?.error ?? "Failed to load signatories.");
        return;
      }
      if (json?.signatories) setForm(mapToForm(json.signatories));
      await loadAllSignaturePreviews();
    } catch {
      setError("Failed to load signatories.");
    } finally {
      setLoading(false);
    }
  }, [loadAllSignaturePreviews]);

  useEffect(() => {
    void load();
  }, [load]);

  const { showToast, Toast } = useAppToast();

  const uploadSignature = async (role: ImagingSignatureRole, file: File) => {
    setError("");
    setSigUploading(role);
    showToast("Uploading signature…", "info");
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await authenticatedFetch(`/api/settings/laboratory/imaging-signatories/${role}/signature`, {
        method: "POST",
        body,
      });
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok || json?.error) {
        showToast(json?.error ?? "Could not upload signature.", "error");
        return;
      }
      await loadSignaturePreview(role);
      showToast("Signature uploaded.", "success");
    } catch {
      showToast("Could not upload signature.", "error");
    } finally {
      setSigUploading(null);
    }
  };

  const removeSignature = async (role: ImagingSignatureRole) => {
    setError("");
    setSigUploading(role);
    showToast("Removing signature…", "info");
    try {
      const res = await authenticatedFetch(`/api/settings/laboratory/imaging-signatories/${role}/signature`, {
        method: "DELETE",
      });
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok || json?.error) {
        showToast(json?.error ?? "Could not remove signature.", "error");
        return;
      }
      setSigPreview((prev) => ({ ...prev, [role]: null }));
      setSigHas((prev) => ({ ...prev, [role]: false }));
      showToast("Signature removed.", "success");
    } catch {
      showToast("Could not remove signature.", "error");
    } finally {
      setSigUploading(null);
    }
  };

  const handleSave = async () => {
    setError("");
    setSuccess(false);
    setSaving(true);
    try {
      const payload: Record<string, { full_name: string | null; license_no: string | null }> = {};
      for (const role of IMAGING_SIGNATURE_ROLES) {
        payload[role] = {
          full_name: form[role].full_name.trim() || null,
          license_no: form[role].license_no.trim() || null,
        };
      }
      const res = await authenticatedFetch("/api/settings/laboratory/imaging-signatories", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json().catch(() => null)) as {
        signatories?: ImagingResultSignatoriesMap;
        error?: string;
      } | null;
      if (!res.ok || json?.error) {
        setError(json?.error ?? "Could not save signatories.");
        return;
      }
      if (json?.signatories) setForm(mapToForm(json.signatories));
      await loadAllSignaturePreviews();
      setSuccess(true);
    } catch {
      setError("Could not save signatories.");
    } finally {
      setSaving(false);
    }
  };

  const renderSection = (title: string, key: ImagingSignatureRole) => (
    <Box>
      <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1.5 }}>
        {title}
      </Typography>
      <Stack spacing={2}>
        <TextField
          label="Full name"
          value={form[key].full_name}
          onChange={(e) =>
            setForm((prev) => ({
              ...prev,
              [key]: { ...prev[key], full_name: e.target.value },
            }))
          }
          {...fieldSx}
        />
        <TextField
          label="License no."
          value={form[key].license_no}
          onChange={(e) =>
            setForm((prev) => ({
              ...prev,
              [key]: { ...prev[key], license_no: e.target.value },
            }))
          }
          {...fieldSx}
        />
        <SignatureUploadField
          label="Signature image"
          previewUrl={sigPreview[key]}
          hasSignature={sigHas[key]}
          uploading={sigUploading === key}
          onUpload={(file) => void uploadSignature(key, file)}
          onRemove={() => void removeSignature(key)}
        />
      </Stack>
    </Box>
  );

  return (
    <>
      <Toast />
      <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 720, mx: "auto" }}>
        <Typography variant="h5" fontWeight={800} sx={{ mb: 1 }}>
          Imaging signatories
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Names, license numbers, and signature images for imaging result forms. Text and image positions on each PDF
          can be configured under Settings → Laboratory → Imaging result templates.
        </Typography>

        {error ? (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError("")}>
            {error}
          </Alert>
        ) : null}
        {success ? (
          <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess(false)}>
            Signatories saved.
          </Alert>
        ) : null}

        <Card variant="outlined">
          <CardContent>
            {loading ? (
              <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
                <CircularProgress />
              </Box>
            ) : (
              <Stack spacing={3}>
                {SIGNATORY_SECTIONS.map((section, index) => (
                  <Box key={section.key}>
                    {index > 0 ? <Divider sx={{ mb: 3 }} /> : null}
                    {renderSection(section.title, section.key)}
                  </Box>
                ))}
                <Box sx={{ display: "flex", justifyContent: "flex-end", pt: 1 }}>
                  <Button
                    variant="contained"
                    startIcon={saving ? <CircularProgress size={18} color="inherit" /> : <SaveOutlinedIcon />}
                    onClick={() => void handleSave()}
                    disabled={saving}
                  >
                    {saving ? "Saving…" : "Save"}
                  </Button>
                </Box>
              </Stack>
            )}
          </CardContent>
        </Card>
      </Box>
    </>
  );
}
