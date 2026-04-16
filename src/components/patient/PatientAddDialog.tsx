"use client";

import { useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  InputAdornment,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import type { ReceptionPatientSearchRow } from "@/lib/queueReception";

type PatientForm = {
  name: string;
  sex: string;
  dob: string;
  civilStatus: string;
  address: string;
  contactNo: string;
  emailAddress: string;
  occupation: string;
  referringPhysician: string;
  philHealthNo: string;
};

const emptyForm: PatientForm = {
  name: "",
  sex: "",
  dob: "",
  civilStatus: "",
  address: "",
  contactNo: "",
  emailAddress: "",
  occupation: "",
  referringPhysician: "",
  philHealthNo: "",
};

/** Philippine mobile: 09 + 9 digits (11 total). */
function normalizeContactNoInput(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 0) return "";
  let d = digits;
  if (d.startsWith("09")) {
    return d.slice(0, 11);
  }
  if (!d.startsWith("0")) {
    d = "0" + d;
  }
  if (!d.startsWith("09")) {
    d = "09" + d.slice(1).replace(/^0+/, "");
  }
  return d.slice(0, 11);
}

function contactNoSuffix(full: string): string {
  const n = normalizeContactNoInput(full);
  if (!n.startsWith("09")) return "";
  return n.slice(2, 11);
}

function isValidEmailAddress(value: string): boolean {
  const t = value.trim();
  if (!t || /\s/.test(t) || t.includes("..")) return false;
  const re =
    /^[a-zA-Z0-9](?:[a-zA-Z0-9._%+-]*[a-zA-Z0-9])?@[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?\.[a-zA-Z]{2,}(?:\.[a-zA-Z]{2,})*$/;
  return re.test(t);
}

function parsePhilhealthNo(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return null;
  const n = Number.parseInt(digits, 10);
  if (!Number.isFinite(n) || n < 0 || n > 2_147_483_647) return null;
  return n;
}

function getPatientFormValidationError(form: PatientForm): string | null {
  if (!form.name.trim()) return "Name is required.";
  if (!form.sex.trim()) return "Sex is required.";
  if (!form.dob.trim()) return "Date of birth is required.";
  if (!form.civilStatus.trim()) return "Civil status is required.";
  if (!form.address.trim()) return "Address is required.";
  if (!form.contactNo.trim()) return "Contact number is required.";
  if (!/^09\d{9}$/.test(form.contactNo.trim())) {
    return "Contact number must be 11 digits starting with 09.";
  }
  const emailTrim = form.emailAddress.trim();
  if (emailTrim && !isValidEmailAddress(form.emailAddress)) {
    return "Enter a valid email address.";
  }
  if (!form.occupation.trim()) return "Occupation is required.";
  return null;
}

function formToApiPayload(form: PatientForm) {
  return {
    name: form.name.trim().toUpperCase(),
    sex: form.sex.trim().toUpperCase(),
    date_of_birth: form.dob || null,
    civil_status: form.civilStatus.trim().toUpperCase() || null,
    address: form.address.trim().toUpperCase() || null,
    contact_no: form.contactNo.trim() || null,
    email_address: form.emailAddress.trim().toLowerCase() || null,
    occupation: form.occupation.trim().toUpperCase() || null,
    referring_physician: form.referringPhysician.trim() || null,
    philhealth_no: parsePhilhealthNo(form.philHealthNo),
  };
}

export default function PatientAddDialog({
  open,
  initial,
  onClose,
  onCreated,
  createPatient,
}: {
  open: boolean;
  initial?: Partial<Pick<PatientForm, "name" | "contactNo">>;
  onClose: () => void;
  onCreated: (patient: ReceptionPatientSearchRow) => void;
  createPatient: (payload: ReturnType<typeof formToApiPayload>) => Promise<{ patient: ReceptionPatientSearchRow | null; error: string | null }>;
}) {
  const [form, setForm] = useState<PatientForm>(() => ({
    ...emptyForm,
    name: initial?.name ?? "",
    contactNo: normalizeContactNoInput(initial?.contactNo ?? ""),
  }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const contactSuffix = useMemo(() => contactNoSuffix(form.contactNo), [form.contactNo]);

  const setField = (k: keyof PatientForm) => (v: string) => {
    setError(null);
    setForm((p) => {
      const next = { ...p, [k]: v } as PatientForm;
      if (k === "contactNo") next.contactNo = normalizeContactNoInput(v);
      if (k === "emailAddress") next.emailAddress = v.toLowerCase();
      return next;
    });
  };

  return (
    <Dialog open={open} onClose={() => !saving && onClose()} fullWidth maxWidth="md">
      <DialogTitle sx={{ fontWeight: 900, letterSpacing: "0.04em" }}>PATIENT INFORMATION</DialogTitle>
      <DialogContent>
        <Box sx={{ pt: 1 }}>
          {error ? <Alert severity="warning" sx={{ mb: 2 }}>{error}</Alert> : null}
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, md: 6 }}>
              <Typography variant="caption" fontWeight={700}>Name *</Typography>
              <TextField value={form.name} onChange={(e) => setField("name")(e.target.value)} fullWidth />
            </Grid>
            <Grid size={{ xs: 12, md: 3 }}>
              <Typography variant="caption" fontWeight={700}>Sex *</Typography>
              <TextField select value={form.sex} onChange={(e) => setField("sex")(e.target.value)} fullWidth>
                <MenuItem value="">—</MenuItem>
                <MenuItem value="MALE">MALE</MenuItem>
                <MenuItem value="FEMALE">FEMALE</MenuItem>
                <MenuItem value="OTHER">OTHER</MenuItem>
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, md: 3 }}>
              <Typography variant="caption" fontWeight={700}>Date of birth *</Typography>
              <TextField type="date" value={form.dob} onChange={(e) => setField("dob")(e.target.value)} fullWidth InputLabelProps={{ shrink: true }} />
            </Grid>

            <Grid size={{ xs: 12, md: 3 }}>
              <Typography variant="caption" fontWeight={700}>Civil status *</Typography>
              <TextField value={form.civilStatus} onChange={(e) => setField("civilStatus")(e.target.value)} fullWidth placeholder="SINGLE / MARRIED / …" />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <Typography variant="caption" fontWeight={700}>Address *</Typography>
              <TextField value={form.address} onChange={(e) => setField("address")(e.target.value)} fullWidth />
            </Grid>
            <Grid size={{ xs: 12, md: 3 }}>
              <Typography variant="caption" fontWeight={700}>Contact no *</Typography>
              <TextField
                value={contactSuffix}
                onChange={(e) => setField("contactNo")(`09${e.target.value}`)}
                fullWidth
                placeholder="xxxxxxxxx"
                helperText="Enter 9 digits (11 total with 09)."
                InputProps={{
                  startAdornment: <InputAdornment position="start">09</InputAdornment>,
                }}
              />
            </Grid>

            <Grid size={{ xs: 12, md: 3 }}>
              <Typography variant="caption" fontWeight={700}>Email address</Typography>
              <TextField value={form.emailAddress} onChange={(e) => setField("emailAddress")(e.target.value)} fullWidth />
            </Grid>
            <Grid size={{ xs: 12, md: 3 }}>
              <Typography variant="caption" fontWeight={700}>Occupation *</Typography>
              <TextField value={form.occupation} onChange={(e) => setField("occupation")(e.target.value)} fullWidth />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <Typography variant="caption" fontWeight={700}>Referring Physician</Typography>
              <TextField value={form.referringPhysician} onChange={(e) => setField("referringPhysician")(e.target.value)} fullWidth placeholder="(optional)" />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <Typography variant="caption" fontWeight={700}>PhilHealth No</Typography>
              <TextField value={form.philHealthNo} onChange={(e) => setField("philHealthNo")(e.target.value)} fullWidth placeholder="(optional)" />
            </Grid>
          </Grid>
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={saving} sx={{ fontWeight: 800 }}>CANCEL</Button>
        <Button
          variant="contained"
          color="success"
          disabled={saving}
          onClick={() => {
            const validation = getPatientFormValidationError(form);
            if (validation) {
              setError(validation);
              return;
            }
            void (async () => {
              setSaving(true);
              setError(null);
              try {
                const { patient, error: e } = await createPatient(formToApiPayload(form));
                if (e) {
                  setError(e);
                  return;
                }
                if (patient) {
                  onCreated(patient);
                }
              } finally {
                setSaving(false);
              }
            })();
          }}
          sx={{ fontWeight: 900 }}
        >
          {saving ? "SAVING…" : "SAVE PATIENT"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

