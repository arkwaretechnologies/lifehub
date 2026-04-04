"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import Image from "next/image";
import {
  Box,
  Card,
  CardContent,
  TextField,
  Button,
  Typography,
  Grid,
  MenuItem,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  Divider,
  Alert,
  CircularProgress,
  InputAdornment,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  Tooltip,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import { supabase } from "@/lib/supabaseClient";
import { FormFieldLabel } from "@/components/FormFieldLabel";
import {
  commonFieldProps,
  emailFieldInputSx,
  fieldInputSx,
  menuItemSx,
} from "@/components/fieldInputStyles";

/** App users table: `fullname` + `role` (RLS must allow SELECT for signed-in role). */
const APP_USERS_TABLE = "users";

/** Row shape from `public.patients` (PostgREST may return `id` as string for bigint). */
type PatientRow = {
  id: string | number;
  name: string | null;
  date_of_birth: string | null;
  civil_status: string | null;
  address: string | null;
  contact_no: string | null;
  email_address: string | null;
  occupation: string | null;
  referring_physician: string | null;
  philhealth_no: number | null;
  created_at: string;
  sex: string | null;
  updated_at: string | null;
};

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

const PAGE_SIZE_OPTIONS = [20, 50, 100] as const;

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

/** Suffix only (9 digits) for display after fixed "09" prefix. */
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

function normalizeFormFieldValue(field: keyof PatientForm, raw: string): string {
  if (field === "dob") return raw;
  if (field === "emailAddress") return raw.toLowerCase();
  if (field === "contactNo") return normalizeContactNoInput(raw);
  if (field === "referringPhysician") {
    const t = raw.trim();
    if (/^\d+$/.test(t)) return t;
    return t.toUpperCase();
  }
  return raw.toUpperCase();
}

/** Schema uses `integer`; values outside 32-bit signed range become null. */
function parsePhilhealthNo(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return null;
  const n = Number.parseInt(digits, 10);
  if (!Number.isFinite(n) || n < 0 || n > 2_147_483_647) return null;
  return n;
}

function formatDateDisplay(iso: string | null): string {
  if (!iso) return "";
  return iso.length >= 10 ? iso.slice(0, 10) : iso;
}

function patientRowToForm(p: PatientRow): PatientForm {
  return {
    name: (p.name ?? "").toUpperCase(),
    sex: (p.sex ?? "").toUpperCase(),
    dob: formatDateDisplay(p.date_of_birth),
    civilStatus: (p.civil_status ?? "").toUpperCase(),
    address: (p.address ?? "").toUpperCase(),
    contactNo: normalizeContactNoInput(String(p.contact_no ?? "")),
    emailAddress: (p.email_address ?? "").toLowerCase(),
    occupation: (p.occupation ?? "").toUpperCase(),
    referringPhysician:
      p.referring_physician === null || p.referring_physician === undefined
        ? ""
        : String(p.referring_physician).trim(),
    philHealthNo: p.philhealth_no != null ? String(p.philhealth_no) : "",
  };
}

type PhysicianUserRow = { user_id: string | number; fullname: string | null };

type ReferringPhysicianOption = { userId: string; label: string };

function buildReferringPhysicianMenuOptions(
  physicians: PhysicianUserRow[],
  currentValue: string,
): ReferringPhysicianOption[] {
  const opts: ReferringPhysicianOption[] = [];
  for (const p of physicians) {
    if (p.user_id === null || p.user_id === undefined) continue;
    const name = (p.fullname ?? "").trim();
    if (!name) continue;
    opts.push({
      userId: String(p.user_id),
      label: name.toUpperCase(),
    });
  }
  opts.sort((a, b) => a.label.localeCompare(b.label));
  const ids = new Set(opts.map((o) => o.userId));
  const cur = currentValue.trim();
  if (cur && !ids.has(cur)) {
    if (/^\d+$/.test(cur)) {
      opts.unshift({ userId: cur, label: `USER ID ${cur}` });
    } else {
      opts.unshift({ userId: cur, label: cur.toUpperCase() });
    }
  }
  return opts;
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

function formToRowPayload(form: PatientForm) {
  return {
    name: form.name.trim().toUpperCase(),
    date_of_birth: form.dob || null,
    civil_status: form.civilStatus.trim().toUpperCase() || null,
    address: form.address.trim().toUpperCase() || null,
    contact_no: form.contactNo.trim().toUpperCase() || null,
    email_address: form.emailAddress.trim().toLowerCase() || null,
    occupation: form.occupation.trim().toUpperCase() || null,
    referring_physician: (() => {
      const v = form.referringPhysician.trim();
      if (!v) return null;
      if (/^\d+$/.test(v)) {
        const n = Number(v);
        return Number.isSafeInteger(n) ? n : v;
      }
      return v.toUpperCase();
    })(),
    philhealth_no: parsePhilhealthNo(form.philHealthNo),
    sex: form.sex.trim().toUpperCase() || null,
  };
}

function PatientFormFields({
  form,
  onChange,
  idPrefix = "pf",
  physicians,
  physiciansLoading,
}: {
  form: PatientForm;
  onChange: (field: keyof PatientForm) => (e: React.ChangeEvent<HTMLInputElement>) => void;
  /** Avoid duplicate ids when add + edit dialogs both exist in the tree. */
  idPrefix?: string;
  physicians: PhysicianUserRow[];
  physiciansLoading: boolean;
}) {
  const id = (field: string) => `${idPrefix}-${field}`;
  const referringOptions = useMemo(
    () => buildReferringPhysicianMenuOptions(physicians, form.referringPhysician),
    [physicians, form.referringPhysician],
  );
  return (
    <>
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 6 }}>
          <FormFieldLabel htmlFor={id("name")} required>
            Name
          </FormFieldLabel>
          <TextField
            id={id("name")}
            hiddenLabel
            required
            {...commonFieldProps}
            sx={fieldInputSx}
            value={form.name}
            onChange={onChange("name")}
            inputProps={{ "aria-required": true }}
          />
        </Grid>

        <Grid size={{ xs: 6, md: 3 }}>
          <FormFieldLabel htmlFor={id("sex")} required>
            Sex
          </FormFieldLabel>
          <TextField
            id={id("sex")}
            hiddenLabel
            required
            select
            {...commonFieldProps}
            sx={fieldInputSx}
            value={form.sex}
            onChange={onChange("sex")}
            inputProps={{ "aria-required": true }}
          >
            <MenuItem value="" sx={menuItemSx}>
              —
            </MenuItem>
            <MenuItem value="MALE" sx={menuItemSx}>
              MALE
            </MenuItem>
            <MenuItem value="FEMALE" sx={menuItemSx}>
              FEMALE
            </MenuItem>
            <MenuItem value="OTHER" sx={menuItemSx}>
              OTHER
            </MenuItem>
          </TextField>
        </Grid>
        <Grid size={{ xs: 12, md: 3 }}>
          <FormFieldLabel htmlFor={id("dob")} required>
            Date of birth
          </FormFieldLabel>
          <TextField
            id={id("dob")}
            hiddenLabel
            required
            type="date"
            {...commonFieldProps}
            sx={fieldInputSx}
            value={form.dob}
            onChange={onChange("dob")}
            inputProps={{ "aria-required": true }}
          />
        </Grid>
        <Grid size={{ xs: 12, md: 3 }}>
          <FormFieldLabel htmlFor={id("civilStatus")} required>
            Civil status
          </FormFieldLabel>
          <TextField
            id={id("civilStatus")}
            hiddenLabel
            required
            select
            {...commonFieldProps}
            sx={fieldInputSx}
            value={form.civilStatus}
            onChange={onChange("civilStatus")}
            inputProps={{ "aria-required": true }}
          >
            <MenuItem value="" sx={menuItemSx}>
              —
            </MenuItem>
            <MenuItem value="SINGLE" sx={menuItemSx}>
              SINGLE
            </MenuItem>
            <MenuItem value="MARRIED" sx={menuItemSx}>
              MARRIED
            </MenuItem>
            <MenuItem value="WIDOWED" sx={menuItemSx}>
              WIDOWED
            </MenuItem>
            <MenuItem value="SEPARATED" sx={menuItemSx}>
              SEPARATED
            </MenuItem>
          </TextField>
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <FormFieldLabel htmlFor={id("address")} required>
            Address
          </FormFieldLabel>
          <TextField
            id={id("address")}
            hiddenLabel
            required
            {...commonFieldProps}
            sx={fieldInputSx}
            value={form.address}
            onChange={onChange("address")}
            inputProps={{ "aria-required": true }}
          />
        </Grid>
        <Grid size={{ xs: 12, md: 3 }}>
          <FormFieldLabel htmlFor={id("contactNo")} required>
            Contact no
          </FormFieldLabel>
          <TextField
            id={id("contactNo")}
            hiddenLabel
            required
            {...commonFieldProps}
            sx={fieldInputSx}
            placeholder="171234567"
            value={contactNoSuffix(form.contactNo)}
            onChange={(e) => {
              let d = e.target.value.replace(/\D/g, "");
              if (d.startsWith("09")) d = d.slice(2);
              const suffix = d.slice(0, 9);
              const full = suffix.length === 0 ? "" : "09" + suffix;
              const ev = {
                target: { value: full },
              } as React.ChangeEvent<HTMLInputElement>;
              onChange("contactNo")(ev);
            }}
            inputProps={{
              "aria-required": true,
              inputMode: "numeric",
              maxLength: 9,
              "aria-describedby": `${id("contactNo")}-hint`,
            }}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start" sx={{ color: "text.secondary", fontWeight: 600 }}>
                    09
                  </InputAdornment>
                ),
              },
            }}
          />
          <Typography id={`${id("contactNo")}-hint`} variant="caption" color="text.secondary" sx={{ mt: 0.5, display: "block" }}>
            Enter 9 digits (11 total with 09).
          </Typography>
        </Grid>
        <Grid size={{ xs: 12, md: 3 }}>
          <FormFieldLabel htmlFor={id("emailAddress")}>Email address</FormFieldLabel>
          <TextField
            id={id("emailAddress")}
            hiddenLabel
            type="email"
            {...commonFieldProps}
            sx={emailFieldInputSx}
            value={form.emailAddress}
            onChange={onChange("emailAddress")}
          />
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <FormFieldLabel htmlFor={id("occupation")} required>
            Occupation
          </FormFieldLabel>
          <TextField
            id={id("occupation")}
            hiddenLabel
            required
            {...commonFieldProps}
            sx={fieldInputSx}
            value={form.occupation}
            onChange={onChange("occupation")}
            inputProps={{ "aria-required": true }}
          />
        </Grid>
      </Grid>

      <Divider sx={{ my: 3 }} />
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 6 }}>
          <FormFieldLabel htmlFor={id("referringPhysician")}>Referring Physician</FormFieldLabel>
          <TextField
            id={id("referringPhysician")}
            hiddenLabel
            select
            disabled={physiciansLoading}
            {...commonFieldProps}
            sx={fieldInputSx}
            value={form.referringPhysician}
            onChange={onChange("referringPhysician")}
            SelectProps={{ displayEmpty: true }}
          >
            <MenuItem value="" sx={menuItemSx}>
              —
            </MenuItem>
            {referringOptions.map((opt) => (
              <MenuItem key={opt.userId} value={opt.userId} sx={menuItemSx}>
                {opt.label}
              </MenuItem>
            ))}
          </TextField>
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <FormFieldLabel htmlFor={id("philHealthNo")}>PhilHealth No</FormFieldLabel>
          <TextField
            id={id("philHealthNo")}
            hiddenLabel
            {...commonFieldProps}
            sx={fieldInputSx}
            value={form.philHealthNo}
            onChange={onChange("philHealthNo")}
          />
        </Grid>
      </Grid>
    </>
  );
}

/** PostgREST `.or()` filter: ilike across text columns; exact id / philhealth when numeric. */
function buildPatientSearchOrFilter(raw: string): string {
  const t = raw.trim().replace(/,/g, " ").toUpperCase();
  if (!t) return "";
  const escaped = t.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
  const likePattern = `%${escaped}%`;
  const textCols = [
    "name",
    "contact_no",
    "email_address",
    "address",
    "occupation",
    "civil_status",
    "sex",
  ] as const;
  const parts = textCols.map((c) => `${c}.ilike.${likePattern}`);
  if (/^\d+$/.test(t)) {
    parts.push(`id.eq.${t}`);
    parts.push(`referring_physician.eq.${t}`);
    const n = Number.parseInt(t, 10);
    if (Number.isFinite(n) && n >= 0 && n <= 2_147_483_647) {
      parts.push(`philhealth_no.eq.${n}`);
    }
  }
  return parts.join(",");
}

export default function PatientPage() {
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState<PatientForm>(emptyForm);
  const [addSaving, setAddSaving] = useState(false);
  const [addError, setAddError] = useState("");

  const [patients, setPatients] = useState<PatientRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<number>(20);
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError] = useState("");
  const prevSearchRef = useRef(debouncedSearch);

  const [editOpen, setEditOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | number | null>(null);
  const [editForm, setEditForm] = useState<PatientForm>(emptyForm);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState("");

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<PatientRow | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const [physicians, setPhysicians] = useState<PhysicianUserRow[]>([]);
  const [physiciansLoading, setPhysiciansLoading] = useState(true);
  const [physiciansError, setPhysiciansError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function loadPhysicians() {
      setPhysiciansLoading(true);
      setPhysiciansError("");
      const { data, error } = await supabase
        .from(APP_USERS_TABLE)
        .select("user_id, fullname")
        .ilike("role", "physician")
        .order("fullname", { ascending: true });
      if (cancelled) return;
      setPhysiciansLoading(false);
      if (error) {
        setPhysiciansError(error.message);
        setPhysicians([]);
        return;
      }
      setPhysicians((data ?? []) as PhysicianUserRow[]);
    }
    void loadPhysicians();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadPatients = useCallback(
    async (pageIndex: number) => {
      const from = pageIndex * pageSize;
      const to = from + pageSize - 1;

      setListError("");
      setLoadingList(true);

      let query = supabase
        .from("patients")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false });

      const orFilter = buildPatientSearchOrFilter(debouncedSearch);
      if (orFilter) {
        query = query.or(orFilter);
      }

      const { data, error, count } = await query.range(from, to);

      setLoadingList(false);
      if (error) {
        setListError(error.message);
        setPatients([]);
        setTotalCount(0);
        return;
      }
      setPatients((data ?? []) as PatientRow[]);
      setTotalCount(count ?? 0);
    },
    [pageSize, debouncedSearch],
  );

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(searchInput), 400);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    const searchChanged = prevSearchRef.current !== debouncedSearch;
    if (searchChanged && page !== 0) {
      prevSearchRef.current = debouncedSearch;
      setPage(0);
      return;
    }
    prevSearchRef.current = debouncedSearch;
    void loadPatients(page);
  }, [page, pageSize, debouncedSearch, loadPatients]);

  const handleAddChange = (field: keyof PatientForm) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setAddError("");
    const v = normalizeFormFieldValue(field, e.target.value);
    setAddForm((prev) => ({ ...prev, [field]: v }));
  };

  const handleEditChange = (field: keyof PatientForm) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setEditError("");
    const v = normalizeFormFieldValue(field, e.target.value);
    setEditForm((prev) => ({ ...prev, [field]: v }));
  };

  const openAdd = () => {
    setAddForm(emptyForm);
    setAddError("");
    setAddOpen(true);
  };

  const closeAdd = () => {
    setAddOpen(false);
    setAddForm(emptyForm);
    setAddError("");
  };

  const handleAddSave = async () => {
    const validation = getPatientFormValidationError(addForm);
    if (validation) {
      setAddError(validation);
      return;
    }
    setAddError("");
    setAddSaving(true);

    const { error } = await supabase.from("patients").insert(formToRowPayload(addForm));

    setAddSaving(false);
    if (error) {
      setAddError(error.message);
      return;
    }

    closeAdd();
    setPage(0);
    await loadPatients(0);
  };

  const openEdit = (p: PatientRow) => {
    setEditingId(p.id);
    setEditForm(patientRowToForm(p));
    setEditError("");
    setEditOpen(true);
  };

  const closeEdit = () => {
    setEditOpen(false);
    setEditingId(null);
    setEditForm(emptyForm);
    setEditError("");
  };

  const handleEditSave = async () => {
    if (editingId == null) return;
    const validation = getPatientFormValidationError(editForm);
    if (validation) {
      setEditError(validation);
      return;
    }
    setEditSaving(true);
    setEditError("");

    const { error } = await supabase
      .from("patients")
      .update(formToRowPayload(editForm))
      .eq("id", editingId);

    setEditSaving(false);
    if (error) {
      setEditError(error.message);
      return;
    }

    closeEdit();
    await loadPatients(page);
  };

  const openDelete = (p: PatientRow) => {
    setDeleteTarget(p);
    setDeleteOpen(true);
  };

  const closeDelete = () => {
    setDeleteOpen(false);
    setDeleteTarget(null);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);

    const { error } = await supabase.from("patients").delete().eq("id", deleteTarget.id);

    setDeleteLoading(false);
    if (error) {
      setListError(error.message);
      closeDelete();
      return;
    }

    closeDelete();
    const wasOnlyRowOnPage = patients.length === 1;
    if (wasOnlyRowOnPage && page > 0) {
      setPage((p) => p - 1);
    } else {
      await loadPatients(page);
    }
  };

  const handlePageChange = (_: unknown, newPage: number) => {
    setPage(newPage);
  };

  const handleRowsPerPageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPageSize(Number.parseInt(e.target.value, 10));
    setPage(0);
  };

  const emptyMessage =
    debouncedSearch.trim() !== ""
      ? "No patients match your search."
      : "No patients yet.";

  const physicianLabelByUserId = useMemo(() => {
    const m = new Map<string, string>();
    for (const x of physicians) {
      if (x.user_id === null || x.user_id === undefined) continue;
      const name = (x.fullname ?? "").trim().toUpperCase();
      m.set(String(x.user_id), name || `USER ${x.user_id}`);
    }
    return m;
  }, [physicians]);

  function formatReferringPhysicianCell(value: string | null): string {
    if (value === null || value === undefined || String(value).trim() === "") return "";
    const s = String(value).trim();
    if (/^\d+$/.test(s)) {
      return physicianLabelByUserId.get(s) ?? `USER ID ${s}`;
    }
    return s.toUpperCase();
  }

  return (
    <>
      <Box
        sx={{
          mb: 3,
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 2,
          width: "100%",
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Box
            sx={{
              width: 40,
              height: 40,
              borderRadius: "12px",
              overflow: "hidden",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Image
              src="/lifehub-logo.png"
              alt="LifeHub logo"
              width={40}
              height={40}
              style={{ width: "100%", height: "100%", objectFit: "contain" }}
              priority
            />
          </Box>
          <Typography variant="h6" fontWeight={800} letterSpacing={-0.5} sx={{ color: "text.primary" }}>
            LifeHub
          </Typography>
        </Box>
        <Button
          variant="contained"
          size="large"
          onClick={openAdd}
          sx={{ textTransform: "uppercase", ml: "auto" }}
        >
          Add patient record
        </Button>
      </Box>

      {physiciansError ? (
        <Alert severity="warning" sx={{ mb: 2 }} onClose={() => setPhysiciansError("")}>
          Could not load physicians: {physiciansError}
        </Alert>
      ) : null}

      <Card>
        <CardContent sx={{ p: 3 }}>
          <Typography variant="subtitle1" fontWeight={600} mb={2}>
            Patient Records
          </Typography>

          <Box sx={{ mb: 2, maxWidth: 480 }}>
            <FormFieldLabel htmlFor="patient-list-search">Search patients</FormFieldLabel>
            <TextField
              id="patient-list-search"
              hiddenLabel
              placeholder="NAME, CONTACT, EMAIL, ADDRESS, ID…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value.toUpperCase())}
              {...commonFieldProps}
              sx={fieldInputSx}
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon fontSize="small" color="action" />
                    </InputAdornment>
                  ),
                },
              }}
            />
          </Box>

          {listError ? (
            <Alert severity="error" sx={{ mb: 2 }}>
              {listError}
            </Alert>
          ) : null}

          {loadingList ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
              <CircularProgress />
            </Box>
          ) : patients.length === 0 ? (
            <Typography color="text.secondary">{emptyMessage}</Typography>
          ) : (
            <>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ textTransform: "uppercase" }}>ID</TableCell>
                      <TableCell sx={{ textTransform: "uppercase" }}>Name</TableCell>
                      <TableCell sx={{ textTransform: "uppercase" }}>Sex</TableCell>
                      <TableCell sx={{ textTransform: "uppercase" }}>DOB</TableCell>
                      <TableCell sx={{ textTransform: "uppercase" }}>Civil status</TableCell>
                      <TableCell sx={{ textTransform: "uppercase" }}>Contact</TableCell>
                      <TableCell sx={{ textTransform: "uppercase" }}>Email</TableCell>
                      <TableCell sx={{ textTransform: "uppercase" }}>Referring</TableCell>
                      <TableCell sx={{ textTransform: "uppercase" }}>PhilHealth</TableCell>
                      <TableCell align="right" sx={{ textTransform: "uppercase" }}>
                        Actions
                      </TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {patients.map((p) => (
                      <TableRow key={String(p.id)}>
                        <TableCell sx={{ textTransform: "uppercase" }}>{p.id}</TableCell>
                        <TableCell sx={{ textTransform: "uppercase" }}>{p.name}</TableCell>
                        <TableCell sx={{ textTransform: "uppercase" }}>{p.sex}</TableCell>
                        <TableCell sx={{ textTransform: "uppercase" }}>
                          {formatDateDisplay(p.date_of_birth)}
                        </TableCell>
                        <TableCell sx={{ textTransform: "uppercase" }}>{p.civil_status}</TableCell>
                        <TableCell sx={{ textTransform: "uppercase" }}>{p.contact_no}</TableCell>
                        <TableCell sx={{ textTransform: "lowercase" }}>{p.email_address}</TableCell>
                        <TableCell sx={{ textTransform: "uppercase" }}>
                          {formatReferringPhysicianCell(p.referring_physician)}
                        </TableCell>
                        <TableCell sx={{ textTransform: "uppercase" }}>{p.philhealth_no ?? ""}</TableCell>
                        <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                          <Tooltip title="Edit">
                            <IconButton size="small" color="primary" onClick={() => openEdit(p)}>
                              <EditIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Delete">
                            <IconButton size="small" color="error" onClick={() => openDelete(p)}>
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
              <TablePagination
                component="div"
                count={totalCount}
                page={page}
                onPageChange={handlePageChange}
                rowsPerPage={pageSize}
                rowsPerPageOptions={[...PAGE_SIZE_OPTIONS]}
                onRowsPerPageChange={handleRowsPerPageChange}
                labelRowsPerPage="Rows per page"
                sx={{
                  "& .MuiTablePagination-toolbar": { textTransform: "uppercase" },
                  "& .MuiTablePagination-select": { textTransform: "uppercase" },
                }}
              />
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={addOpen} onClose={closeAdd} maxWidth="md" fullWidth>
        <DialogTitle sx={{ textTransform: "uppercase" }}>Patient information</DialogTitle>
        <DialogContent>
          {addError ? (
            <Alert severity="error" sx={{ mb: 2, mt: 1 }} onClose={() => setAddError("")}>
              {addError}
            </Alert>
          ) : null}
          <Box sx={{ pt: 1 }}>
            <PatientFormFields
              form={addForm}
              onChange={handleAddChange}
              idPrefix="pf-add"
              physicians={physicians}
              physiciansLoading={physiciansLoading}
            />
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={closeAdd} disabled={addSaving} sx={{ textTransform: "uppercase" }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={() => void handleAddSave()}
            disabled={addSaving}
            startIcon={addSaving ? <CircularProgress size={18} color="inherit" /> : undefined}
            sx={{ textTransform: "uppercase" }}
          >
            {addSaving ? "Saving…" : "Save patient"}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={editOpen} onClose={closeEdit} maxWidth="md" fullWidth>
        <DialogTitle sx={{ textTransform: "uppercase" }}>Edit patient</DialogTitle>
        <DialogContent>
          {editError ? (
            <Alert severity="error" sx={{ mb: 2, mt: 1 }} onClose={() => setEditError("")}>
              {editError}
            </Alert>
          ) : null}
          <Box sx={{ pt: 1 }}>
            <PatientFormFields
              form={editForm}
              onChange={handleEditChange}
              idPrefix="pf-edit"
              physicians={physicians}
              physiciansLoading={physiciansLoading}
            />
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={closeEdit} disabled={editSaving}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={() => void handleEditSave()}
            disabled={editSaving}
            startIcon={editSaving ? <CircularProgress size={18} color="inherit" /> : undefined}
          >
            {editSaving ? "Saving…" : "Save changes"}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={deleteOpen} onClose={closeDelete}>
        <DialogTitle sx={{ textTransform: "uppercase" }}>Delete patient?</DialogTitle>
        <DialogContent>
          <Typography>
            This will permanently remove{" "}
            <strong>{deleteTarget?.name ?? `patient #${deleteTarget?.id}`}</strong> from the
            database.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeDelete} disabled={deleteLoading}>
            Cancel
          </Button>
          <Button
            color="error"
            variant="contained"
            onClick={() => void handleDeleteConfirm()}
            disabled={deleteLoading}
            startIcon={deleteLoading ? <CircularProgress size={18} color="inherit" /> : undefined}
          >
            {deleteLoading ? "Deleting…" : "Delete"}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
