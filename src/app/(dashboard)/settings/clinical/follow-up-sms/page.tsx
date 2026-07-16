"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import SaveOutlinedIcon from "@mui/icons-material/SaveOutlined";
import { authenticatedFetch } from "@/lib/authenticatedFetch";
import {
  DEFAULT_CLINIC_FOLLOW_UP_SMS_SETTINGS,
  type ClinicFollowUpSmsSettings,
} from "@/lib/clinicSettings";
import { clinicTimeZone } from "@/lib/queueTicketDate";
import { useAppToast } from "@/hooks/useAppToast";

export default function FollowUpSmsSettingsPage() {
  const { showToast, Toast } = useAppToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [daysPrior, setDaysPrior] = useState(String(DEFAULT_CLINIC_FOLLOW_UP_SMS_SETTINGS.followUpSmsDaysPrior));
  const [priorTime, setPriorTime] = useState(DEFAULT_CLINIC_FOLLOW_UP_SMS_SETTINGS.followUpSmsPriorTime);
  const [dayofTime, setDayofTime] = useState(DEFAULT_CLINIC_FOLLOW_UP_SMS_SETTINGS.followUpSmsDayofTime);

  const applySettings = (s: ClinicFollowUpSmsSettings) => {
    setDaysPrior(String(s.followUpSmsDaysPrior));
    setPriorTime(s.followUpSmsPriorTime);
    setDayofTime(s.followUpSmsDayofTime);
  };

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const res = await authenticatedFetch("/api/settings/clinical/follow-up-sms", { cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as {
        settings?: ClinicFollowUpSmsSettings;
        error?: string;
      };
      if (!res.ok) {
        setLoadError(json.error ?? `Failed to load settings (${res.status})`);
        return;
      }
      if (json.settings) applySettings(json.settings);
    } catch {
      setLoadError("Failed to load follow-up SMS settings.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    const days = Number(daysPrior);
    if (!Number.isFinite(days) || days < 0 || days > 30 || !Number.isInteger(days)) {
      showToast("Days prior must be a whole number from 0 to 30.", "error");
      return;
    }
    if (!/^\d{2}:\d{2}$/.test(priorTime) || !/^\d{2}:\d{2}$/.test(dayofTime)) {
      showToast("Times must be in HH:mm format.", "error");
      return;
    }

    setSaving(true);
    try {
      const res = await authenticatedFetch("/api/settings/clinical/follow-up-sms", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          followUpSmsDaysPrior: days,
          followUpSmsPriorTime: priorTime,
          followUpSmsDayofTime: dayofTime,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        settings?: ClinicFollowUpSmsSettings;
        error?: string;
      };
      if (!res.ok) {
        showToast(json.error ?? `Save failed (${res.status})`, "error");
        return;
      }
      if (json.settings) applySettings(json.settings);
      showToast("Follow-up SMS settings saved.", "success");
    } catch {
      showToast("Failed to save settings.", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 720 }}>
      <Typography variant="h5" fontWeight={800} sx={{ mb: 0.5 }}>
        Follow-up SMS schedule
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Configure how many days before the follow-up patients are texted, and the clinic-local send times (
        {clinicTimeZone()}).
      </Typography>

      {loadError ? (
        <Alert severity="error" sx={{ mb: 2 }}>
          {loadError}
        </Alert>
      ) : null}

      <Card sx={{ borderRadius: 2 }}>
        <CardContent>
          {loading ? (
            <Box sx={{ display: "grid", placeItems: "center", py: 6 }}>
              <CircularProgress size={28} />
            </Box>
          ) : (
            <Stack spacing={2.5}>
              <TextField
                label="Days prior"
                type="number"
                value={daysPrior}
                onChange={(e) => setDaysPrior(e.target.value)}
                inputProps={{ min: 0, max: 30, step: 1 }}
                helperText="How many days before the follow-up date to send the advance reminder (0–30)."
                fullWidth
              />
              <TextField
                label="Prior reminder time"
                type="time"
                value={priorTime}
                onChange={(e) => setPriorTime(e.target.value.slice(0, 5))}
                InputLabelProps={{ shrink: true }}
                helperText="Clinic-local time to send the advance reminder."
                fullWidth
              />
              <TextField
                label="Follow-up day reminder time"
                type="time"
                value={dayofTime}
                onChange={(e) => setDayofTime(e.target.value.slice(0, 5))}
                InputLabelProps={{ shrink: true }}
                helperText="Clinic-local time to send the reminder on the follow-up date."
                fullWidth
              />
              <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
                <Button
                  variant="contained"
                  startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <SaveOutlinedIcon />}
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
      <Toast />
    </Box>
  );
}
