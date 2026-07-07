"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Grid,
  TextField,
  Typography,
} from "@mui/material";
import PrintOutlinedIcon from "@mui/icons-material/PrintOutlined";
import { FormFieldLabel } from "@/components/FormFieldLabel";
import { DatePickerField } from "@/components/DatePickerField";
import { useConsultationDebouncedSave } from "@/components/consultation/useConsultationDebouncedSave";
import { ConsultationSectionTitle } from "@/components/consultation/ConsultationSectionTitle";
import type { ConsultationPatient } from "@/components/consultation/consultationTypes";
import { commonFieldProps, fieldMultilineInputSx } from "@/components/fieldInputStyles";
import {
  buildMedicalCertificateFormWithPrefill,
  persistMedicalCertificate,
  type MedicalCertificateForm,
} from "@/lib/medicalCertificate";
import { openMedicalCertificatePrintWindow } from "@/lib/medicalCertificatePrint";

const tabPanelSx = { pt: 2, minHeight: 280 };

function ReadOnlyLine({ label, value }: { label: string; value: string }) {
  return (
    <Box sx={{ mb: 1.5 }}>
      <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.25 }}>
        {label}
      </Typography>
      <Typography variant="body2" sx={{ textTransform: "uppercase" }}>
        {value.trim() || "—"}
      </Typography>
    </Box>
  );
}

export default function MedicalCertificatePanel({
  transId,
  patient,
}: {
  transId: string;
  patient: ConsultationPatient;
}) {
  const [form, setForm] = useState<MedicalCertificateForm | null>(null);
  const [rowId, setRowId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError("");
    void (async () => {
      const { form: loaded, rowId: id, error } = await buildMedicalCertificateFormWithPrefill(transId);
      if (cancelled) return;
      setLoading(false);
      if (error) {
        setLoadError(error);
        setForm(null);
        setRowId(null);
      } else {
        setForm(loaded);
        setRowId(id);
      }
      setHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [transId]);

  const runPersist = useCallback(async () => {
    if (!hydrated || !form) return;
    setSaveError("");
    setSaving(true);
    const { rowId: newId, error } = await persistMedicalCertificate(transId, rowId, form);
    setSaving(false);
    if (error) {
      setSaveError(error);
      return;
    }
    if (newId && !rowId) setRowId(newId);
  }, [hydrated, transId, rowId, form]);

  const saveTrigger = useMemo(() => form, [form]);

  useConsultationDebouncedSave({
    ownTabIndex: 6,
    hydrated,
    runPersist,
    trigger: saveTrigger,
  });

  async function handlePrint() {
    if (!form) return;

    setPrinting(true);
    try {
      await runPersist();
      const ok = await openMedicalCertificatePrintWindow({
        patient,
        cert: form,
      });
      if (!ok) {
        window.alert(
          "Could not load the medical certificate PDF template. Ensure templates/LIFEHUB-MEDICAL-Certificate.pdf is present on the server.",
        );
      }
    } finally {
      setPrinting(false);
    }
  }

  if (!form && loading) {
    return (
      <Box sx={{ ...tabPanelSx, display: "flex", justifyContent: "center", py: 4 }}>
        <CircularProgress size={28} />
      </Box>
    );
  }

  if (!form) {
    return (
      <Box sx={tabPanelSx}>
        {loadError ? (
          <Alert severity="error">{loadError}</Alert>
        ) : (
          <Typography color="text.secondary">Could not load medical certificate.</Typography>
        )}
      </Box>
    );
  }

  return (
    <Box sx={tabPanelSx}>
      <ConsultationSectionTitle>Medical certificate</ConsultationSectionTitle>

      {loadError ? (
        <Alert severity="error" sx={{ mb: 2 }}>
          {loadError}
        </Alert>
      ) : null}
      {saveError ? (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setSaveError("")}>
          {saveError}
        </Alert>
      ) : null}

      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2, minHeight: 24 }}>
        {loading ? (
          <CircularProgress size={18} />
        ) : saving ? (
          <Typography variant="caption" color="text.secondary">
            Saving…
          </Typography>
        ) : null}
      </Box>

      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 5 }}>
          <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1.5, color: "info.main" }}>
            Patient (from record)
          </Typography>
          <ReadOnlyLine label="Name" value={patient.name} />
          <ReadOnlyLine label="Age / Sex" value={patient.ageSex} />
          <ReadOnlyLine label="Address" value={patient.address} />
          <ReadOnlyLine label="Contact number" value={patient.contactNo} />
        </Grid>

        <Grid size={{ xs: 12, md: 7 }}>
          <FormFieldLabel htmlFor="med-cert-chief-complaint" variant="consultation">
            Chief complaint
          </FormFieldLabel>
          <TextField
            id="med-cert-chief-complaint"
            hiddenLabel
            multiline
            minRows={2}
            placeholder=" "
            value={form.chief_complaint}
            onChange={(e) => setForm((prev) => (prev ? { ...prev, chief_complaint: e.target.value } : prev))}
            disabled={loading}
            {...commonFieldProps}
            sx={[fieldMultilineInputSx, { mb: 2 }]}
          />

          <FormFieldLabel htmlFor="med-cert-pe-findings" variant="consultation">
            Findings upon physical examination
          </FormFieldLabel>
          <TextField
            id="med-cert-pe-findings"
            hiddenLabel
            multiline
            minRows={3}
            placeholder=" "
            value={form.physical_exam_findings}
            onChange={(e) =>
              setForm((prev) => (prev ? { ...prev, physical_exam_findings: e.target.value } : prev))
            }
            disabled={loading}
            {...commonFieldProps}
            sx={[fieldMultilineInputSx, { mb: 2 }]}
          />

          <FormFieldLabel htmlFor="med-cert-impression" variant="consultation">
            Clinical impression
          </FormFieldLabel>
          <TextField
            id="med-cert-impression"
            hiddenLabel
            multiline
            minRows={2}
            placeholder=" "
            value={form.clinical_impression}
            onChange={(e) =>
              setForm((prev) => (prev ? { ...prev, clinical_impression: e.target.value } : prev))
            }
            disabled={loading}
            {...commonFieldProps}
            sx={[fieldMultilineInputSx, { mb: 2 }]}
          />

          <FormFieldLabel htmlFor="med-cert-recommendations" variant="consultation">
            Recommendations / remarks
          </FormFieldLabel>
          <TextField
            id="med-cert-recommendations"
            hiddenLabel
            multiline
            minRows={3}
            placeholder=" "
            value={form.recommendations_remarks}
            onChange={(e) =>
              setForm((prev) => (prev ? { ...prev, recommendations_remarks: e.target.value } : prev))
            }
            disabled={loading}
            {...commonFieldProps}
            sx={[fieldMultilineInputSx, { mb: 2 }]}
          />

          <DatePickerField
            id="med-cert-issued-date"
            label="Issued date"
            labelVariant="consultation"
            value={form.issued_date}
            onChange={(e) =>
              setForm((prev) => (prev ? { ...prev, issued_date: e.target.value } : prev))
            }
            disabled={loading}
            sx={{ mb: 2, maxWidth: 220 }}
            slotProps={{ htmlInput: { max: "9999-12-31" } }}
          />
        </Grid>
      </Grid>

      <Box sx={{ display: "flex", justifyContent: "flex-end", mt: 2 }}>
        <Button
          type="button"
          variant="contained"
          color="secondary"
          disabled={loading || printing}
          onClick={() => void handlePrint()}
          startIcon={printing ? <CircularProgress size={18} color="inherit" /> : <PrintOutlinedIcon />}
          sx={{ textTransform: "none" }}
        >
          {printing ? "Preparing…" : "Print medical certificate"}
        </Button>
      </Box>
    </Box>
  );
}
