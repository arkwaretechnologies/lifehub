"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Typography,
} from "@mui/material";
import SaveOutlinedIcon from "@mui/icons-material/SaveOutlined";
import { authenticatedFetch } from "@/lib/authenticatedFetch";
import { useAppToast } from "@/hooks/useAppToast";

export default function SettingsClinicalRxTemplatesPage() {
  const [files, setFiles] = useState<string[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const { showToast, Toast } = useAppToast();

  const load = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      const res = await authenticatedFetch("/api/prescription-templates");
      const json = (await res.json().catch(() => null)) as {
        files?: string[];
        selected?: string | null;
        error?: string;
      } | null;
      if (!res.ok || json?.error) {
        setError(json?.error ?? "Failed to load RX templates.");
        return;
      }
      const list = Array.isArray(json?.files) ? json.files : [];
      setFiles(list);
      setSelected(json?.selected && list.includes(json.selected) ? json.selected : "");
    } catch {
      setError("Failed to load RX templates.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    setSaving(true);
    setError("");
    showToast("Saving RX template…", "info");
    try {
      const res = await authenticatedFetch("/api/prescription-templates", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: selected.trim() ? selected : null }),
      });
      const json = (await res.json().catch(() => null)) as {
        selected?: string | null;
        error?: string;
      } | null;
      if (!res.ok || json?.error) {
        showToast(json?.error ?? "Could not save RX template.", "error");
        return;
      }
      setSelected(json?.selected ?? "");
      showToast(
        json?.selected ? `Using ${json.selected} for Print RX.` : "RX template cleared; default will be used.",
        "success",
      );
    } catch {
      showToast("Could not save RX template.", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 720 }}>
      <Typography variant="h5" fontWeight={700} sx={{ mb: 0.5 }}>
        RX templates
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Choose which prescription pad PDF to use when you print RX. Place PDF files in{" "}
        <code>templates/RX/</code> on the server, then select one here. This preference is saved for your
        user account (Admin / Physician).
      </Typography>

      <Toast />

      {error ? (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      ) : null}

      <Card variant="outlined" sx={{ borderRadius: 2 }}>
        <CardContent>
          {loading ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
              <CircularProgress size={28} />
            </Box>
          ) : files.length === 0 ? (
            <Alert severity="warning">
              No PDF files found in <code>templates/RX/</code>. Add files there and refresh this page.
            </Alert>
          ) : (
            <Stack spacing={2}>
              <FormControl fullWidth>
                <InputLabel id="rx-template-select-label">RX template</InputLabel>
                <Select
                  labelId="rx-template-select-label"
                  label="RX template"
                  value={selected}
                  onChange={(e) => setSelected(String(e.target.value))}
                  sx={{ borderRadius: 2, minHeight: 44 }}
                >
                  <MenuItem value="">
                    <em>Default (RX Template.pdf if present)</em>
                  </MenuItem>
                  {files.map((name) => (
                    <MenuItem key={name} value={name}>
                      {name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
                <Button
                  variant="contained"
                  startIcon={saving ? <CircularProgress size={18} color="inherit" /> : <SaveOutlinedIcon />}
                  disabled={saving}
                  onClick={() => void save()}
                >
                  Save
                </Button>
              </Box>
            </Stack>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}
