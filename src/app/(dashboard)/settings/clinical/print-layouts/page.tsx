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
import {
  CLINICAL_PRINT_REF_SIZES,
  emptyPhysicianSignatureLayoutFormFields,
  physicianSignatureLayoutFormFieldsFromDb,
  type ClinicalPrintLayoutRow,
  type ClinicalPrintTemplateKey,
} from "@/lib/clinicalPrintLayouts";
import type { ImageLayoutFormFields } from "@/lib/labResultsPrintLayout";
import { useAppToast } from "@/hooks/useAppToast";

const fieldSx = {
  fullWidth: true as const,
  sx: { "& .MuiOutlinedInput-root": { minHeight: 44, borderRadius: 2 } },
};

function ImageSignatureSlotFields({
  title,
  fields,
  onChange,
}: {
  title: string;
  fields: ImageLayoutFormFields;
  onChange: (next: ImageLayoutFormFields) => void;
}) {
  return (
    <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2, p: 1.5 }}>
      <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>
        {title}
      </Typography>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
        <TextField
          label="X (refX)"
          type="number"
          value={fields.print_ref_x}
          onChange={(e) => onChange({ ...fields, print_ref_x: e.target.value })}
          {...fieldSx}
        />
        <TextField
          label="Y from top"
          type="number"
          value={fields.print_ref_from_top}
          onChange={(e) => onChange({ ...fields, print_ref_from_top: e.target.value })}
          {...fieldSx}
        />
        <TextField
          label="Width"
          type="number"
          value={fields.print_ref_width}
          onChange={(e) => onChange({ ...fields, print_ref_width: e.target.value })}
          {...fieldSx}
        />
        <TextField
          label="Height"
          type="number"
          value={fields.print_ref_height}
          onChange={(e) => onChange({ ...fields, print_ref_height: e.target.value })}
          {...fieldSx}
        />
      </Stack>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ mt: 1.5 }}>
        <TextField
          label="Page index"
          type="number"
          value={fields.print_page_index}
          onChange={(e) => onChange({ ...fields, print_page_index: e.target.value })}
          sx={[fieldSx.sx, { width: { xs: "100%", sm: "25%" } }]}
        />
      </Stack>
    </Box>
  );
}

type LayoutFormState = Record<ClinicalPrintTemplateKey, ImageLayoutFormFields>;

function emptyForms(): LayoutFormState {
  return {
    consultation: emptyPhysicianSignatureLayoutFormFields(),
    prescription: emptyPhysicianSignatureLayoutFormFields(),
    medical_certificate: emptyPhysicianSignatureLayoutFormFields(),
  };
}

function rowsToForms(rows: ClinicalPrintLayoutRow[]): LayoutFormState {
  const forms = emptyForms();
  for (const row of rows) {
    forms[row.template_key] = physicianSignatureLayoutFormFieldsFromDb(row.physician_signature_layout);
  }
  return forms;
}

const TEMPLATE_META: Record<
  ClinicalPrintTemplateKey,
  { title: string; pdfFile: string; refLabel: string }
> = {
  consultation: {
    title: "Consultation form",
    pdfFile: "templates/Consultation Template.pdf",
    refLabel: "US Letter 612×792 pt",
  },
  prescription: {
    title: "Prescription (RX)",
    pdfFile: "templates/RX Template.pdf",
    refLabel: "A5 420×595 pt",
  },
  medical_certificate: {
    title: "Medical certificate",
    pdfFile: "templates/LIFEHUB-MEDICAL-Certificate.pdf",
    refLabel: "A5 420×596 pt",
  },
};

export default function SettingsClinicalPrintLayoutsPage() {
  const [forms, setForms] = useState<LayoutFormState>(emptyForms());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savingKey, setSavingKey] = useState<ClinicalPrintTemplateKey | null>(null);
  const { showToast, Toast } = useAppToast();

  const load = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      const res = await authenticatedFetch("/api/settings/clinical-print-layouts");
      const json = (await res.json().catch(() => null)) as {
        layouts?: ClinicalPrintLayoutRow[];
        error?: string;
      } | null;
      if (!res.ok || json?.error) {
        setError(json?.error ?? "Failed to load print layouts.");
        return;
      }
      setForms(rowsToForms(json?.layouts ?? []));
    } catch {
      setError("Failed to load print layouts.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const saveLayout = async (templateKey: ClinicalPrintTemplateKey) => {
    setSavingKey(templateKey);
    setError("");
    showToast("Saving layout…", "info");
    try {
      const res = await authenticatedFetch("/api/settings/clinical-print-layouts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          template_key: templateKey,
          physician_signature_layout: forms[templateKey],
        }),
      });
      const json = (await res.json().catch(() => null)) as {
        layout?: ClinicalPrintLayoutRow;
        error?: string;
      } | null;
      if (!res.ok || json?.error) {
        showToast(json?.error ?? "Could not save layout.", "error");
        return;
      }
      if (json?.layout) {
        setForms((prev) => ({
          ...prev,
          [templateKey]: physicianSignatureLayoutFormFieldsFromDb(json.layout!.physician_signature_layout),
        }));
      }
      showToast(`${TEMPLATE_META[templateKey].title} layout saved.`, "success");
    } catch {
      showToast("Could not save layout.", "error");
    } finally {
      setSavingKey(null);
    }
  };

  const renderSection = (templateKey: ClinicalPrintTemplateKey) => {
    const meta = TEMPLATE_META[templateKey];
    const ref = CLINICAL_PRINT_REF_SIZES[templateKey];
    return (
      <Box key={templateKey}>
        <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 0.5 }}>
          {meta.title}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          PDF: {meta.pdfFile}. Reference size: {meta.refLabel} ({ref.refW}×{ref.refH} pt). Coordinates use refFromTop
          (distance from the top edge). Upload signature images under User management → Users (physician/admin).
        </Typography>
        <ImageSignatureSlotFields
          title="Physician signature image"
          fields={forms[templateKey]}
          onChange={(physician_signature) =>
            setForms((prev) => ({ ...prev, [templateKey]: physician_signature }))
          }
        />
        <Box sx={{ display: "flex", justifyContent: "flex-end", mt: 2 }}>
          <Button
            variant="contained"
            startIcon={
              savingKey === templateKey ? <CircularProgress size={18} color="inherit" /> : <SaveOutlinedIcon />
            }
            disabled={savingKey != null}
            onClick={() => void saveLayout(templateKey)}
          >
            {savingKey === templateKey ? "Saving…" : "Save"}
          </Button>
        </Box>
      </Box>
    );
  };

  return (
    <>
      <Toast />
      <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 720, mx: "auto" }}>
        <Typography variant="h5" fontWeight={800} sx={{ mb: 1 }}>
          Clinical print layouts
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Position physician signature images on consultation, prescription, and medical certificate PDFs. Same
          coordinate model as lab result templates.
        </Typography>

        {error ? (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError("")}>
            {error}
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
                {renderSection("consultation")}
                <Divider />
                {renderSection("prescription")}
                <Divider />
                {renderSection("medical_certificate")}
              </Stack>
            )}
          </CardContent>
        </Card>
      </Box>
    </>
  );
}
