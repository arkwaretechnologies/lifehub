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
import type { LabResultSignatoriesMap } from "@/lib/labResultSignatories";

type SignatoryForm = {
  full_name: string;
  license_no: string;
};

const fieldSx = {
  fullWidth: true as const,
  sx: { "& .MuiOutlinedInput-root": { minHeight: 44, borderRadius: 2 } },
};

function mapToForm(s: LabResultSignatoriesMap): { medtech: SignatoryForm; pathologist: SignatoryForm } {
  return {
    medtech: {
      full_name: s.medtech.full_name ?? "",
      license_no: s.medtech.license_no ?? "",
    },
    pathologist: {
      full_name: s.pathologist.full_name ?? "",
      license_no: s.pathologist.license_no ?? "",
    },
  };
}

export default function SettingsLabSignatoriesPage() {
  const [form, setForm] = useState<{ medtech: SignatoryForm; pathologist: SignatoryForm }>({
    medtech: { full_name: "", license_no: "" },
    pathologist: { full_name: "", license_no: "" },
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const load = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      const res = await authenticatedFetch("/api/settings/laboratory/signatories");
      const json = (await res.json().catch(() => null)) as {
        signatories?: LabResultSignatoriesMap;
        error?: string;
      } | null;
      if (!res.ok || json?.error) {
        setError(json?.error ?? "Failed to load signatories.");
        return;
      }
      if (json?.signatories) setForm(mapToForm(json.signatories));
    } catch {
      setError("Failed to load signatories.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSave = async () => {
    setError("");
    setSuccess(false);
    setSaving(true);
    try {
      const res = await authenticatedFetch("/api/settings/laboratory/signatories", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          medtech: {
            full_name: form.medtech.full_name.trim() || null,
            license_no: form.medtech.license_no.trim() || null,
          },
          pathologist: {
            full_name: form.pathologist.full_name.trim() || null,
            license_no: form.pathologist.license_no.trim() || null,
          },
        }),
      });
      const json = (await res.json().catch(() => null)) as {
        signatories?: LabResultSignatoriesMap;
        error?: string;
      } | null;
      if (!res.ok || json?.error) {
        setError(json?.error ?? "Could not save signatories.");
        return;
      }
      if (json?.signatories) setForm(mapToForm(json.signatories));
      setSuccess(true);
    } catch {
      setError("Could not save signatories.");
    } finally {
      setSaving(false);
    }
  };

  const renderSection = (
    title: string,
    key: "medtech" | "pathologist",
  ) => (
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
      </Stack>
    </Box>
  );

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 720, mx: "auto" }}>
      <Typography variant="h5" fontWeight={800} sx={{ mb: 1 }}>
        Lab result signatories
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Names and license numbers printed on laboratory result forms. Position on each PDF is configured
        under Settings → Laboratory → Result templates.
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
              {renderSection("Medical Technologist", "medtech")}
              <Divider />
              {renderSection("Pathologist", "pathologist")}
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
  );
}
