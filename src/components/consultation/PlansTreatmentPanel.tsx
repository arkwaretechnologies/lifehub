"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import AddOutlinedIcon from "@mui/icons-material/AddOutlined";
import CloseIcon from "@mui/icons-material/Close";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import PrintOutlinedIcon from "@mui/icons-material/PrintOutlined";
import SaveOutlinedIcon from "@mui/icons-material/SaveOutlined";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Divider,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  Grid,
  IconButton,
  Radio,
  RadioGroup,
  Snackbar,
  TextField,
  Typography,
} from "@mui/material";
import { useAuth } from "@/components/AuthProvider";
import type { ConsultationPatient } from "@/components/consultation/consultationTypes";
import MedicationProductAutocomplete from "@/components/consultation/MedicationProductAutocomplete";
import { consultFormControlLabelSx } from "@/components/consultation/ConsultationSectionTitle";
import { useConsultationSave } from "@/components/consultation/consultationSaveContext";
import {
  ENCOUNTER_DISPOSITION_VALUES,
  fetchEncounterPlansTreatment,
  persistEncounterPlansTreatment,
  type EncounterDisposition,
  type EncounterPlansTreatmentForm,
} from "@/lib/consultationData";
import { formatDateMMDDYYYY } from "@/lib/dateDisplay";
import {
  createLabRequestWithItems,
  deleteLabRequestsForEncounter,
  fetchLabRequestsForEncounter,
  parsePatientIdForLab,
  type EncounterLabRequestSummary,
} from "@/lib/labRequests";
import {
  fetchLabCatalogGrouped,
  type LabCatalogSection,
} from "@/lib/labTests";
import { fetchActiveLabPricesByTestIds } from "@/lib/labServicePrices";
import { openPrescriptionPrintWindow } from "@/lib/prescriptionPrint";
import type { UserProfile } from "@/lib/types";
import {
  fetchActiveProductsPreview,
  fetchProductsByIds,
  formatProductOptionLabel,
  searchActiveProducts,
  type ProductCatalogRow,
} from "@/lib/pharmacyProducts";
import {
  fetchCurrentMedicationsForEncounter,
  replaceCurrentMedicationsForEncounter,
} from "@/lib/currentMedications";
import { fetchActivePhysicianServices, type PhysicianServiceRow } from "@/lib/physicianServices";

const tabPanelSx = { pt: 2, minHeight: 280 };

const cardOuterSx = {
  border: "1px solid",
  borderColor: "grey.900",
  borderRadius: 1,
  overflow: "hidden",
  bgcolor: "background.paper",
} as const;

const sectionLabelProps = {
  component: "h3" as const,
  variant: "body2" as const,
  fontWeight: 700,
  color: "info.main" as const,
  sx: {
    letterSpacing: "0.02em",
    display: "block",
    mb: 1.5,
    textTransform: "uppercase" as const,
  },
};

const notesFieldSx = {
  "& .MuiOutlinedInput-root": {
    borderRadius: 0,
    bgcolor: "background.paper",
    "& fieldset": { border: "none" },
    "&:hover fieldset": { border: "none" },
    "&.Mui-focused fieldset": { border: "none" },
  },
  "& .MuiInputBase-input": {
    py: 2,
    px: 2,
  },
} as const;

const DISPOSITION_LABELS: Record<EncounterDisposition, string> = {
  Home: "HOME",
  "Medico Legal": "MEDICO LEGAL",
  "Advise Admission": "ADVISE ADMISSION",
  Absconded: "ABSCONDED",
  DAMA: "DAMA",
};

function formatLabRequestTime(t: string | null | undefined): string {
  if (t == null || String(t).trim() === "") return "";
  const s = String(t).trim();
  if (s.length >= 5 && s[2] === ":") return s.slice(0, 5);
  const m = s.match(/(\d{1,2}:\d{2})/);
  return m?.[1] ?? "";
}

const emptyPlansForm: EncounterPlansTreatmentForm = {
  plan_labs: false,
  plan_imaging: false,
  plan_medications: false,
  plan_referral: false,
  plan_notes: "",
  disposition: null,
};

/** Imaging section aligned with paper form (LH-HPE-001). */
type ImagingFormState = {
  chestXray: boolean;
  chestXrayView: string;
  wholeAbdomenUtz: boolean;
  echo2d: boolean;
  thyroidScan: boolean;
  tvs: boolean;
};

const emptyImagingForm: ImagingFormState = {
  chestXray: false,
  chestXrayView: "",
  wholeAbdomenUtz: false,
  echo2d: false,
  thyroidScan: false,
  tvs: false,
};

const IMAGING_NOTES_START = "[IMAGING_REQUEST]";
const IMAGING_NOTES_END = "[/IMAGING_REQUEST]";

function buildImagingRequestLines(v: ImagingFormState): string[] {
  const lines: string[] = [];
  if (v.chestXray) {
    const view = v.chestXrayView.trim();
    lines.push(view ? `- Chest X-ray (View: ${view})` : "- Chest X-ray");
  }
  if (v.wholeAbdomenUtz) lines.push("- Whole Abdomen UTZ");
  if (v.echo2d) lines.push("- 2D Echo");
  if (v.thyroidScan) lines.push("- Thyroid Scan");
  if (v.tvs) lines.push("- Transvaginal UTZ (TVS)");
  return lines;
}

function upsertImagingBlock(existingNotes: string, imagingLines: string[]): string {
  const block =
    imagingLines.length === 0
      ? ""
      : [IMAGING_NOTES_START, "IMAGING REQUEST:", ...imagingLines, IMAGING_NOTES_END].join("\n");

  const notes = existingNotes ?? "";
  const start = notes.indexOf(IMAGING_NOTES_START);
  const end = notes.indexOf(IMAGING_NOTES_END);

  // If no block exists, append a new one.
  if (start === -1 || end === -1 || end < start) {
    if (!block) return notes;
    const sep = notes.trim().length ? "\n\n" : "";
    return `${notes.trimEnd()}${sep}${block}\n`;
  }

  // Replace existing block.
  const before = notes.slice(0, start).trimEnd();
  const after = notes.slice(end + IMAGING_NOTES_END.length).trimStart();
  if (!block) {
    // Remove block entirely.
    const merged = [before, after].filter(Boolean).join("\n\n");
    return merged ? `${merged}\n` : "";
  }
  const merged = [before, block, after].filter(Boolean).join("\n\n");
  return `${merged}\n`;
}

/** Restore imaging checkboxes from a saved plan_notes block when opening the modal. */
function parseImagingNotesToForm(notes: string): ImagingFormState {
  const start = notes.indexOf(IMAGING_NOTES_START);
  const end = notes.indexOf(IMAGING_NOTES_END);
  if (start === -1 || end === -1 || end < start) return { ...emptyImagingForm };
  const inner = notes.slice(start + IMAGING_NOTES_START.length, end);
  const next: ImagingFormState = { ...emptyImagingForm };
  for (const raw of inner.split("\n")) {
    const line = raw.trim();
    if (!line || line === "IMAGING REQUEST:") continue;
    const viewMatch = line.match(/^-\s*Chest X-ray \(View:\s*(.+)\)\s*$/);
    if (viewMatch) {
      next.chestXray = true;
      next.chestXrayView = (viewMatch[1] ?? "").trim();
      continue;
    }
    if (line === "- Chest X-ray") {
      next.chestXray = true;
      continue;
    }
    if (line === "- Whole Abdomen UTZ") next.wholeAbdomenUtz = true;
    else if (line === "- 2D Echo") next.echo2d = true;
    else if (line === "- Thyroid Scan") next.thyroidScan = true;
    else if (line === "- Transvaginal UTZ (TVS)") next.tvs = true;
  }
  return next;
}

function hasMedicationLinesSelected(lines: MedicationLineDraft[]): boolean {
  return lines.some((l) => l.productId.trim() !== "");
}

/** Quantity required when a product is selected: non-empty and a finite number greater than 0. */
function isValidMedicationQuantity(q: string): boolean {
  const s = String(q).trim();
  if (!s) return false;
  const n = Number(s);
  return Number.isFinite(n) && n > 0;
}

function medicationRowsMissingQuantity(lines: MedicationLineDraft[]): boolean {
  return lines.some((l) => l.productId.trim() !== "" && !isValidMedicationQuantity(l.quantity));
}

function imagingFormsEqual(a: ImagingFormState, b: ImagingFormState): boolean {
  return (
    a.chestXray === b.chestXray &&
    a.chestXrayView === b.chestXrayView &&
    a.wholeAbdomenUtz === b.wholeAbdomenUtz &&
    a.echo2d === b.echo2d &&
    a.thyroidScan === b.thyroidScan &&
    a.tvs === b.tvs
  );
}

/** Stable compare for medications modal dirty check (ignores row keys). */
function medicationLinesSnapshot(lines: MedicationLineDraft[]): string {
  return JSON.stringify(
    lines.map((l) => ({
      productId: l.productId.trim(),
      quantity: l.quantity.trim(),
      unit: l.unit.trim(),
      frequency: l.frequency.trim(),
      notes: l.notes.trim(),
    })),
  );
}

type MedicationLineDraft = {
  key: string;
  productId: string;
  quantity: string;
  unit: string;
  frequency: string;
  notes: string;
};

function newMedicationLine(): MedicationLineDraft {
  return {
    key: crypto.randomUUID(),
    productId: "",
    quantity: "",
    unit: "",
    frequency: "",
    notes: "",
  };
}

function money2(v: number): string {
  const n = Number(v);
  const out = Number.isFinite(n) ? n : 0;
  return out.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function medicationLinesFromSnapshot(snapshot: string): MedicationLineDraft[] {
  try {
    const arr = JSON.parse(snapshot) as Array<{
      productId?: string;
      quantity?: string;
      unit?: string;
      frequency?: string;
      notes?: string;
    }>;
    if (!Array.isArray(arr) || arr.length === 0) return [newMedicationLine()];
    return arr.map((row) => ({
      key: crypto.randomUUID(),
      productId: String(row.productId ?? "").trim(),
      quantity: String(row.quantity ?? "").trim(),
      unit: String(row.unit ?? "").trim(),
      frequency: String(row.frequency ?? "").trim(),
      notes: String(row.notes ?? "").trim(),
    }));
  } catch {
    return [newMedicationLine()];
  }
}

const imagingCheckboxLabelSx = {
  ...consultFormControlLabelSx,
  display: "flex",
  flexDirection: "row",
  alignItems: "center",
  ml: 0,
  mr: 0,
  gap: 0.5,
  "& .MuiFormControlLabel-label": { display: "inline", lineHeight: 1.35 },
} as const;

/** Room for label + text in small outlined fields (avoids clipped placeholders). */
const medicationOutlinedFieldSx = {
  "& .MuiOutlinedInput-root": {
    bgcolor: "background.paper",
    minHeight: 44,
    alignItems: "center",
  },
  "& .MuiOutlinedInput-input, & .MuiInputBase-input": {
    py: 1.125,
    lineHeight: 1.5,
    height: "auto",
    boxSizing: "border-box" as const,
  },
  "& .MuiInputLabel-root": {
    lineHeight: 1.3,
  },
} as const;

export default function PlansTreatmentPanel({
  transId,
  patient,
  isNew = false,
}: {
  transId: string;
  patient: ConsultationPatient;
  isNew?: boolean;
}) {
  const { profile } = useAuth();
  const dispositionLabelId = `plans-disp-${useId().replace(/\W/g, "")}`;
  const [form, setForm] = useState<EncounterPlansTreatmentForm>(emptyPlansForm);
  const [loadError, setLoadError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const { registerSaveHandler, setPanelDirty } = useConsultationSave();

  const [labsModalOpen, setLabsModalOpen] = useState(false);
  const [labSections, setLabSections] = useState<LabCatalogSection[]>([]);
  const [labTestsLoading, setLabTestsLoading] = useState(false);
  const [labTestsError, setLabTestsError] = useState("");
  const [selectedLabTestIds, setSelectedLabTestIds] = useState<Set<string>>(() => new Set());
  const [labSubmitting, setLabSubmitting] = useState(false);
  const [labDialogError, setLabDialogError] = useState("");
  const [labDialogSuccess, setLabDialogSuccess] = useState("");
  const [encounterLabRequests, setEncounterLabRequests] = useState<EncounterLabRequestSummary[]>([]);
  const [requestedTestIdSet, setRequestedTestIdSet] = useState<Set<string>>(() => new Set());
  const [labEncounterError, setLabEncounterError] = useState("");
  const [labPriceByTestId, setLabPriceByTestId] = useState<Map<string, number>>(() => new Map());

  const [imagingModalOpen, setImagingModalOpen] = useState(false);
  const [imagingForm, setImagingForm] = useState<ImagingFormState>(emptyImagingForm);
  const [imagingPriceByKey, setImagingPriceByKey] = useState<Record<string, number>>({});

  const [medicationsModalOpen, setMedicationsModalOpen] = useState(false);
  const [medProductPreview, setMedProductPreview] = useState<ProductCatalogRow[]>([]);
  const [productCache, setProductCache] = useState<Record<string, ProductCatalogRow>>({});
  const [medProductsLoading, setMedProductsLoading] = useState(false);
  const [medProductsError, setMedProductsError] = useState("");
  const [medSaveLoading, setMedSaveLoading] = useState(false);
  const [medToastOpen, setMedToastOpen] = useState(false);
  const [medToastMessage, setMedToastMessage] = useState("");
  const [medToastSeverity, setMedToastSeverity] = useState<"success" | "error">("success");
  const [printRxLoading, setPrintRxLoading] = useState(false);
  const [medicationLines, setMedicationLines] = useState<MedicationLineDraft[]>([]);
  const productCacheRef = useRef(productCache);
  productCacheRef.current = productCache;
  const formRef = useRef(form);
  formRef.current = form;
  const prevImagingOpenRef = useRef(false);
  const imagingBaselineRef = useRef<ImagingFormState>(emptyImagingForm);
  const medsBaselineStrRef = useRef("");
  const medsBaselineReadyRef = useRef(false);

  type PlansModalKind = "labs" | "imaging" | "medications";
  const [unsavedCloseDialog, setUnsavedCloseDialog] = useState<PlansModalKind | null>(null);

  /** When the imaging modal opens, load checkboxes from the saved IMAGING block in plan_notes. */
  useEffect(() => {
    if (imagingModalOpen) {
      if (!prevImagingOpenRef.current) {
        const parsed = parseImagingNotesToForm(formRef.current.plan_notes ?? "");
        setImagingForm(parsed);
        imagingBaselineRef.current = parsed;
      }
      prevImagingOpenRef.current = true;
    } else {
      prevImagingOpenRef.current = false;
    }
  }, [imagingModalOpen]);

  useEffect(() => {
    if (!imagingModalOpen) return;
    let cancelled = false;
    void (async () => {
      const r = await fetchActivePhysicianServices();
      if (cancelled || r.error) return;
      const lookup = new Map<string, PhysicianServiceRow>();
      for (const s of r.services) {
        lookup.set(`${s.service_type}`.trim().toLowerCase() + "|" + `${s.name}`.trim().toLowerCase(), s);
      }
      const get = (serviceType: string, name: string): number => {
        const key = `${serviceType}`.trim().toLowerCase() + "|" + `${name}`.trim().toLowerCase();
        const s = lookup.get(key) ?? null;
        const n = s ? (typeof s.default_fee === "number" ? s.default_fee : Number(String(s.default_fee ?? ""))) : 0;
        return Number.isFinite(n) ? n : 0;
      };
      setImagingPriceByKey({
        chestXray: get("Imaging", "Chest X-ray"),
        wholeAbdomenUtz: get("Imaging", "Whole Abdomen UTZ"),
        echo2d: get("Imaging", "2D Echo"),
        thyroidScan: get("Imaging", "Thyroid Scan"),
        tvs: get("Imaging", "Transvaginal UTZ (TVS)"),
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [imagingModalOpen]);

  const mergeIntoProductCache = useCallback((rows: ProductCatalogRow[]) => {
    if (rows.length === 0) return;
    setProductCache((prev) => {
      const next = { ...prev };
      for (const p of rows) next[p.id] = p;
      return next;
    });
  }, []);

  const medicationProductIdsKey = useMemo(
    () => [...new Set(medicationLines.map((l) => l.productId).filter(Boolean))].sort().join(","),
    [medicationLines],
  );

  useEffect(() => {
    setSelectedLabTestIds(new Set());
    setImagingForm(emptyImagingForm);
    setMedicationLines([]);
    setProductCache({});
    setMedProductPreview([]);
  }, [transId]);

  useEffect(() => {
    if (!medicationsModalOpen) return;
    setMedToastOpen(false);
    setMedicationLines((prev) => (prev.length === 0 ? [newMedicationLine()] : prev));
  }, [medicationsModalOpen]);

  useEffect(() => {
    if (!medicationsModalOpen) medsBaselineReadyRef.current = false;
  }, [medicationsModalOpen]);

  useEffect(() => {
    if (!medicationsModalOpen) return;
    let cancelled = false;
    void (async () => {
      const r = await fetchCurrentMedicationsForEncounter(transId);
      if (cancelled) return;
      if (r.error) {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (cancelled || !medicationsModalOpen) return;
            setMedicationLines((prev) => {
              const next = prev.length > 0 ? prev : [newMedicationLine()];
              medsBaselineStrRef.current = medicationLinesSnapshot(next);
              medsBaselineReadyRef.current = true;
              return next;
            });
          });
        });
        return;
      }
      if (r.medications.length === 0) {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (cancelled || !medicationsModalOpen) return;
            setMedicationLines((prev) => {
              const next = prev.length > 0 ? prev : [newMedicationLine()];
              medsBaselineStrRef.current = medicationLinesSnapshot(next);
              medsBaselineReadyRef.current = true;
              return next;
            });
          });
        });
        return;
      }

      const parseDosage = (dosage: string | null): { quantity: string; unit: string } => {
        if (!dosage) return { quantity: "", unit: "" };
        const s = String(dosage).trim();
        if (!s) return { quantity: "", unit: "" };
        const m = s.match(/^(\d+(?:\.\d+)?)\s*(.*)$/);
        if (!m) return { quantity: s, unit: "" };
        const q = m[1] ?? "";
        const u = (m[2] ?? "").trim();
        return { quantity: q, unit: u };
      };

      const normalize = (s: string) => s.trim().replace(/\s+/g, " ");
      const parseMedicationLabelForSearch = (label: string): { generic: string; brand: string; base: string } => {
        const raw = normalize(label);
        const base = normalize(raw.split("—")[0] ?? raw); // drop "— strength · form"
        const m = base.match(/^(.*?)\s*\((.*?)\)\s*$/); // "Generic (Brand)"
        if (!m) return { generic: base, brand: "", base };
        return { generic: normalize(m[1] ?? ""), brand: normalize(m[2] ?? ""), base };
      };

      const resolved = await Promise.all(
        r.medications.map(async (m) => {
          const d = parseDosage(m.dosage);
          const name = String(m.medication_name ?? "").trim();
          if (!name) {
            return {
              key: crypto.randomUUID(),
              productId: "",
              quantity: d.quantity,
              unit: d.unit,
              frequency: m.frequency ?? "",
              notes: m.notes ?? "",
            } as MedicationLineDraft;
          }

          // Try local cache/preview first (fast path).
          const cached =
            Object.values(productCacheRef.current).find((p) => formatProductOptionLabel(p).toLowerCase() === name.toLowerCase()) ??
            medProductPreview.find((p) => formatProductOptionLabel(p).toLowerCase() === name.toLowerCase()) ??
            null;

          const { generic, brand, base } = parseMedicationLabelForSearch(name);
          const queries = [
            name, // full label (may fail if it includes strength/form)
            base, // "Generic (Brand)"
            [generic, brand].filter(Boolean).join(" "),
            generic,
            brand,
          ]
            .map((q) => normalize(q))
            .filter((q, i, arr) => q.length > 0 && arr.indexOf(q) === i);

          let match: ProductCatalogRow | null = cached;
          if (!match) {
            for (const q of queries) {
              const s = await searchActiveProducts(q, 20);
              if (s.error) continue;
              match =
                s.products.find((p) => formatProductOptionLabel(p).toLowerCase() === name.toLowerCase()) ??
                s.products.find((p) => p.generic_name.trim().toLowerCase() === generic.toLowerCase()) ??
                s.products.find((p) => (p.brand_name ?? "").trim().toLowerCase() === brand.toLowerCase()) ??
                s.products[0] ??
                null;
              if (match) break;
            }
          }

          if (match) mergeIntoProductCache([match]);

          return {
            key: crypto.randomUUID(),
            productId: match?.id ?? "",
            quantity: d.quantity,
            unit: match?.unit_of_measure ?? d.unit,
            frequency: m.frequency ?? "",
            notes: m.notes ?? "",
          } as MedicationLineDraft;
        }),
      );

      if (cancelled) return;
      const missingNames = r.medications
        .filter((m, i) => resolved[i] != null && resolved[i]!.productId.trim() === "")
        .map((m) => m.medication_name)
        .filter(Boolean);
      if (missingNames.length > 0) {
        setMedToastSeverity("error");
        setMedToastMessage(`Some medications could not be matched to products. Please reselect: ${missingNames.join(", ")}`);
        setMedToastOpen(true);
      }

      const nextMedLines = resolved.length === 0 ? [newMedicationLine()] : resolved;
      setMedicationLines(nextMedLines);
      medsBaselineStrRef.current = medicationLinesSnapshot(nextMedLines);
      medsBaselineReadyRef.current = true;
    })();
    return () => {
      cancelled = true;
    };
  }, [medicationsModalOpen, transId]);

  useEffect(() => {
    if (!medicationsModalOpen) return;
    let cancelled = false;
    setMedProductsLoading(true);
    setMedProductsError("");
    void (async () => {
      const r = await fetchActiveProductsPreview(120);
      if (cancelled) return;
      setMedProductsLoading(false);
      if (r.error) {
        setMedProductsError(r.error);
        setMedProductPreview([]);
      } else {
        setMedProductPreview(r.products);
        mergeIntoProductCache(r.products);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [medicationsModalOpen, mergeIntoProductCache]);

  useEffect(() => {
    if (!medicationsModalOpen) return;
    if (medicationProductIdsKey === "") return;
    const ids = medicationProductIdsKey.split(",").filter(Boolean);
    const missing = ids.filter((id) => !productCacheRef.current[id]);
    if (missing.length === 0) return;
    let cancelled = false;
    void fetchProductsByIds(missing).then((r) => {
      if (cancelled || r.error) return;
      mergeIntoProductCache(r.products);
    });
    return () => {
      cancelled = true;
    };
  }, [medicationsModalOpen, medicationProductIdsKey, mergeIntoProductCache]);

  useEffect(() => {
    if (!labsModalOpen) return;
    setLabDialogError("");
    setLabDialogSuccess("");
  }, [labsModalOpen]);

  useEffect(() => {
    if (!labsModalOpen) return;
    let cancelled = false;
    setLabTestsLoading(true);
    setLabTestsError("");
    setLabEncounterError("");
    void (async () => {
      const [cat, enc] = await Promise.all([
        fetchLabCatalogGrouped(),
        fetchLabRequestsForEncounter(transId),
      ]);
      if (cancelled) return;
      setLabTestsLoading(false);
      if (cat.error) {
        setLabTestsError(cat.error);
        setLabSections([]);
      } else {
        setLabSections(cat.sections);
      }

      // Load prices for all tests in the catalog so each row can display a price.
      if (!cat.error) {
        const allTestIds = cat.sections.flatMap((s) => s.tests.map((t) => t.id));
        const pricesAll = await fetchActiveLabPricesByTestIds(allTestIds);
        if (!cancelled && !pricesAll.error) {
          setLabPriceByTestId(pricesAll.pricesByTestId);
        }
      }

      if (enc.error) {
        setLabEncounterError(enc.error);
        setEncounterLabRequests([]);
        setRequestedTestIdSet(new Set());
      } else {
        setEncounterLabRequests(enc.requests);
        setRequestedTestIdSet(new Set(enc.requestedTestIds));
        if (isNew) {
          // In a new consultation, allow editing/removal of previously saved lab selections.
          setSelectedLabTestIds(new Set(enc.requestedTestIds));
        }
        // Keep labPriceByTestId from the catalog fetch above.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [labsModalOpen, transId, isNew]);

  const toggleLabTestSelection = useCallback((testId: string) => {
    setSelectedLabTestIds((prev) => {
      const next = new Set(prev);
      if (next.has(testId)) next.delete(testId);
      else next.add(testId);
      return next;
    });
  }, []);

  const printMedicationPrescription = useCallback(async () => {
    if (medicationRowsMissingQuantity(medicationLines)) {
      setMedToastSeverity("error");
      setMedToastMessage("Missing quantity of a product.");
      setMedToastOpen(true);
      return;
    }
    const u = profile as UserProfile | null;
    const fullname = u?.fullname?.trim() ?? "";
    const specialty = u?.specialty?.trim() ?? "";
    const licenseNo = u?.license_no?.trim() ?? "";
    const ptrNo = u?.ptr_no?.trim() ?? "";
    const s2No = u?.s2_no?.trim() ?? "";

    const medications = medicationLines
      .filter((l) => l.productId.trim() !== "")
      .map((l) => {
        const p = productCache[l.productId];
        return {
          drugLine: p ? formatProductOptionLabel(p) : l.productId,
          quantity: l.quantity,
          unit: l.unit,
          frequency: l.frequency,
          notes: l.notes,
        };
      });

    setPrintRxLoading(true);
    try {
      const ok = await openPrescriptionPrintWindow({
        patient,
        physician: { fullname, specialty, licenseNo, ptrNo, s2No },
        medications,
        transId,
      });
      if (!ok) {
        window.alert(
          "Could not load the prescription PDF template. Ensure templates/LifeHub_Prescription_Pad_Improved.pdf is present on the server.",
        );
      }
    } finally {
      setPrintRxLoading(false);
    }
  }, [patient, profile, medicationLines, productCache]);

  const saveEncounterMedications = useCallback(async () => {
    if (medicationRowsMissingQuantity(medicationLines)) {
      setMedToastSeverity("error");
      setMedToastMessage("Add quantity of a product.");
      setMedToastOpen(true);
      return;
    }
    setMedSaveLoading(true);
    try {
      const rows = medicationLines
        .filter((l) => l.productId.trim() !== "")
        .map((l) => {
          const p = productCache[l.productId];
          const medicationName = p ? formatProductOptionLabel(p) : l.productId;
          const q = l.quantity.trim();
          const u = l.unit.trim();
          const dosage = [q, u].filter(Boolean).join(" ").trim() || null;
          const frequency = l.frequency.trim() || null;
          const notes = l.notes.trim() || null;
          return { medication_name: medicationName, dosage, frequency, notes };
        });

      const r = await replaceCurrentMedicationsForEncounter(transId, rows);
      if (r.error) {
        setMedToastSeverity("error");
        setMedToastMessage(r.error);
        setMedToastOpen(true);
        return;
      }
      setForm((f) => ({ ...f, plan_medications: rows.length > 0 }));
      medsBaselineStrRef.current = medicationLinesSnapshot(medicationLines);
      setMedToastSeverity("success");
      setMedToastMessage("Medications saved.");
      setMedToastOpen(true);
    } finally {
      setMedSaveLoading(false);
    }
  }, [transId, medicationLines, productCache]);

  const visibleLabSections = useMemo(
    () => labSections.filter((s) => s.tests.length > 0),
    [labSections]
  );

  const labSelectedTotal = useMemo(() => {
    let sum = 0;
    for (const id of selectedLabTestIds) {
      sum += labPriceByTestId.get(id) ?? 0;
    }
    return sum;
  }, [selectedLabTestIds, labPriceByTestId]);

  const labDialogFooterHint = useMemo(() => {
    const nReq = requestedTestIdSet.size;
    const nNew = selectedLabTestIds.size;
    if (nReq === 0 && nNew === 0) return "Select tests to request";
    if (nReq === 0) return `${nNew} test${nNew === 1 ? "" : "s"} selected · ${money2(labSelectedTotal)}`;
    if (nNew === 0) return `${nReq} already requested — select more to add another request`;
    return `${nReq} already requested · ${nNew} new selected · ${money2(labSelectedTotal)}`;
  }, [requestedTestIdSet, selectedLabTestIds, labSelectedTotal]);

  const submitLabRequest = useCallback(async () => {
    setLabDialogError("");
    setLabDialogSuccess("");
    setLabSubmitting(true);
    const physicianId =
      profile != null && typeof profile.user_id === "number" && Number.isFinite(profile.user_id)
        ? profile.user_id
        : null;
    if (isNew) {
      const del = await deleteLabRequestsForEncounter(transId);
      if (del.error) {
        setLabSubmitting(false);
        setLabDialogError(del.error);
        return;
      }
    }

    const { labRequestId, error } = await createLabRequestWithItems({
      encounterId: transId,
      patientId: parsePatientIdForLab(patient.patientId),
      referringPhysician: patient.referringPhysician?.trim() ? patient.referringPhysician.trim() : null,
      physicianId,
      priority: "Routine",
      remarks: null,
      labTestIds: [...selectedLabTestIds],
      itemPriority: "Routine",
    });
    setLabSubmitting(false);
    if (error) {
      setLabDialogError(error);
      return;
    }
    setLabDialogSuccess(`Lab request saved (${labRequestId?.slice(0, 8)}…).`);
    setSelectedLabTestIds(new Set());
    const encRefresh = await fetchLabRequestsForEncounter(transId);
    if (!encRefresh.error) {
      setEncounterLabRequests(encRefresh.requests);
      setRequestedTestIdSet(new Set(encRefresh.requestedTestIds));
      setLabEncounterError("");
      window.dispatchEvent(new CustomEvent("lifehub:lab-requests-updated", { detail: { transId } }));
    }
  }, [
    transId,
    patient.patientId,
    patient.referringPhysician,
    profile,
    selectedLabTestIds,
    isNew,
  ]);

  const closeLabsModal = useCallback(() => {
    setForm((f) => ({
      ...f,
      plan_labs:
        labTestsLoading
          ? f.plan_labs
          : selectedLabTestIds.size > 0 ||
            requestedTestIdSet.size > 0 ||
            encounterLabRequests.length > 0,
    }));
    setLabsModalOpen(false);
  }, [labTestsLoading, selectedLabTestIds, requestedTestIdSet, encounterLabRequests]);

  const closeImagingModal = useCallback(() => {
    setForm((f) => {
      const lines = buildImagingRequestLines(imagingForm);
      if (lines.length === 0) {
        return {
          ...f,
          plan_imaging: false,
          plan_notes: upsertImagingBlock(f.plan_notes ?? "", []),
        };
      }
      // Keep saved plan_notes as-is; unstaged modal edits are dropped (next open re-parses from notes).
      return f;
    });
    setImagingModalOpen(false);
  }, [imagingForm]);

  const closeMedicationsModal = useCallback(() => {
    medsBaselineReadyRef.current = false;
    setForm((f) => ({ ...f, plan_medications: hasMedicationLinesSelected(medicationLines) }));
    setMedicationsModalOpen(false);
  }, [medicationLines]);

  /** Discard unstaged lab picks, then sync main LABS checkbox (off if no saved requests). */
  const discardLabsModalClose = useCallback(() => {
    setSelectedLabTestIds(new Set());
    setForm((f) => ({
      ...f,
      plan_labs:
        labTestsLoading
          ? f.plan_labs
          : requestedTestIdSet.size > 0 || encounterLabRequests.length > 0,
    }));
    setLabsModalOpen(false);
  }, [labTestsLoading, requestedTestIdSet, encounterLabRequests]);

  /** Revert imaging to last opened/saved baseline; uncheck main if baseline has no studies. */
  const discardImagingModalClose = useCallback(() => {
    const baseline = { ...imagingBaselineRef.current };
    const lines = buildImagingRequestLines(baseline);
    setForm((f) => ({
      ...f,
      plan_imaging: lines.length > 0,
      plan_notes: lines.length === 0 ? upsertImagingBlock(f.plan_notes ?? "", []) : f.plan_notes,
    }));
    setImagingForm(baseline);
    setImagingModalOpen(false);
  }, []);

  /** Revert medications to baseline snapshot; uncheck main if no products in baseline. */
  const discardMedicationsModalClose = useCallback(() => {
    const restored = medicationLinesFromSnapshot(medsBaselineStrRef.current);
    medsBaselineReadyRef.current = false;
    setMedicationLines(restored);
    setForm((f) => ({
      ...f,
      plan_medications: hasMedicationLinesSelected(restored),
    }));
    setMedicationsModalOpen(false);
  }, []);

  const requestCloseLabsModal = useCallback(() => {
    if (selectedLabTestIds.size > 0) {
      setUnsavedCloseDialog("labs");
      return;
    }
    closeLabsModal();
  }, [selectedLabTestIds, closeLabsModal]);

  const requestCloseImagingModal = useCallback(() => {
    if (!imagingFormsEqual(imagingForm, imagingBaselineRef.current)) {
      setUnsavedCloseDialog("imaging");
      return;
    }
    closeImagingModal();
  }, [imagingForm, closeImagingModal]);

  const requestCloseMedicationsModal = useCallback(() => {
    if (medProductsLoading) {
      setMedToastSeverity("error");
      setMedToastMessage("Still loading medications. Please wait before closing.");
      setMedToastOpen(true);
      return;
    }
    if (
      medsBaselineReadyRef.current &&
      medicationLinesSnapshot(medicationLines) !== medsBaselineStrRef.current
    ) {
      setUnsavedCloseDialog("medications");
      return;
    }
    closeMedicationsModal();
  }, [medicationLines, closeMedicationsModal, medProductsLoading]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError("");
    void (async () => {
      const { form: next, error } = await fetchEncounterPlansTreatment(transId);
      if (cancelled) return;
      setLoading(false);
      if (error) {
        setLoadError(error);
        setForm(emptyPlansForm);
      } else {
        setForm(next);
      }
      setHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [transId]);

  const runPersist = useCallback(async () => {
    if (!hydrated) return;
    setSaveError("");
    setSaving(true);
    const { error } = await persistEncounterPlansTreatment(transId, form);
    setSaving(false);
    if (error) setSaveError(error);
    else setPanelDirty("plans-treatment", false);
  }, [hydrated, transId, form, setPanelDirty]);

  useEffect(() => {
    if (!hydrated) return;
    return registerSaveHandler("plans-treatment", runPersist);
  }, [registerSaveHandler, runPersist, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    setPanelDirty("plans-treatment", true);
  }, [form, hydrated, setPanelDirty]);

  return (
    <Box sx={tabPanelSx}>
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
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1, minHeight: 22 }}>
        {loading ? (
          <CircularProgress size={18} />
        ) : saving ? (
          <Typography variant="caption" color="text.secondary">
            Saving…
          </Typography>
        ) : null}
      </Box>

      <Box sx={cardOuterSx}>
        <Box
          sx={{
            bgcolor: "info.main",
            color: "info.contrastText",
            py: 1.25,
            px: 2,
            textAlign: "center",
          }}
        >
          <Typography variant="subtitle1" fontWeight={800} letterSpacing="0.1em">
            PLANS/TREATMENT
          </Typography>
        </Box>

        <Box sx={{ p: { xs: 2, sm: 2.5 } }}>
          <Typography {...sectionLabelProps}>PLAN/TREATMENT:</Typography>

          <Grid container spacing={{ xs: 0.5, sm: 1 }} sx={{ mb: 2, alignItems: "center" }}>
            <Grid size={{ xs: "auto" }}>
              <Box sx={{ display: "flex", alignItems: "center", flexWrap: "wrap", columnGap: 0.5 }}>
                <FormControlLabel
                  control={
                    <Checkbox
                      size="small"
                      checked={form.plan_labs}
                      disabled={loading}
                      onChange={(_, c) => {
                        setForm((f) => ({ ...f, plan_labs: c }));
                        if (c) setLabsModalOpen(true);
                        else setLabsModalOpen(false);
                      }}
                    />
                  }
                  label="LABS"
                  sx={consultFormControlLabelSx}
                />
                {form.plan_labs && !loading ? (
                  <Button
                    type="button"
                    variant="text"
                    size="small"
                    onClick={() => setLabsModalOpen(true)}
                    sx={{ textTransform: "uppercase", minWidth: "auto", py: 0.25, px: 0.75 }}
                  >
                    View catalog
                  </Button>
                ) : null}
              </Box>
            </Grid>
            <Grid size={{ xs: "auto" }}>
              <Box sx={{ display: "flex", alignItems: "center", flexWrap: "wrap", columnGap: 0.5 }}>
                <FormControlLabel
                  control={
                    <Checkbox
                      size="small"
                      checked={form.plan_imaging}
                      disabled={loading}
                      onChange={(_, c) => {
                        setForm((f) => ({ ...f, plan_imaging: c }));
                        if (c) setImagingModalOpen(true);
                        else setImagingModalOpen(false);
                      }}
                    />
                  }
                  label="IMAGING"
                  sx={consultFormControlLabelSx}
                />
                {form.plan_imaging && !loading ? (
                  <Button
                    type="button"
                    variant="text"
                    size="small"
                    onClick={() => setImagingModalOpen(true)}
                    sx={{ textTransform: "uppercase", minWidth: "auto", py: 0.25, px: 0.75 }}
                  >
                    View studies
                  </Button>
                ) : null}
              </Box>
            </Grid>
            <Grid size={{ xs: "auto" }}>
              <Box sx={{ display: "flex", alignItems: "center", flexWrap: "wrap", columnGap: 0.5 }}>
                <FormControlLabel
                  control={
                    <Checkbox
                      size="small"
                      checked={form.plan_medications}
                      disabled={loading}
                      onChange={(_, c) => {
                        setForm((f) => ({ ...f, plan_medications: c }));
                        if (c) setMedicationsModalOpen(true);
                        else {
                          setMedicationsModalOpen(false);
                          setMedicationLines([]);
                        }
                      }}
                    />
                  }
                  label="MEDICATIONS"
                  sx={consultFormControlLabelSx}
                />
                {form.plan_medications && !loading ? (
                  <Button
                    type="button"
                    variant="text"
                    size="small"
                    onClick={() => setMedicationsModalOpen(true)}
                    sx={{ textTransform: "uppercase", minWidth: "auto", py: 0.25, px: 0.75 }}
                  >
                    View products
                  </Button>
                ) : null}
              </Box>
            </Grid>
          </Grid>
          <Box sx={{ mb: 2 }}>
            <FormControlLabel
              control={
                <Checkbox
                  size="small"
                  checked={form.plan_referral}
                  disabled={loading}
                  onChange={(_, c) => setForm((f) => ({ ...f, plan_referral: c }))}
                />
              }
              label="REFERRAL"
              sx={consultFormControlLabelSx}
            />
          </Box>

          <TextField
            fullWidth
            multiline
            minRows={10}
            placeholder=" "
            hiddenLabel
            variant="outlined"
            value={form.plan_notes}
            disabled={loading}
            onChange={(e) => setForm((f) => ({ ...f, plan_notes: e.target.value }))}
            sx={[notesFieldSx, { mb: 3 }]}
          />

          <Typography {...sectionLabelProps} id={dispositionLabelId}>
            DISPOSITION:
          </Typography>
          <FormControl
            component="fieldset"
            variant="standard"
            disabled={loading}
            aria-labelledby={dispositionLabelId}
            sx={{ width: "100%" }}
          >
            <RadioGroup
              value={form.disposition ?? ""}
              onChange={(_, v) =>
                setForm((f) => ({
                  ...f,
                  disposition: v === "" ? null : (v as EncounterDisposition),
                }))
              }
              sx={{
                display: "flex",
                flexDirection: "row",
                flexWrap: "wrap",
                columnGap: { xs: 1, sm: 2 },
                rowGap: 1,
              }}
            >
              <FormControlLabel
                value=""
                control={<Radio size="small" />}
                label="NONE"
                sx={consultFormControlLabelSx}
              />
              {ENCOUNTER_DISPOSITION_VALUES.map((value) => (
                <FormControlLabel
                  key={value}
                  value={value}
                  control={<Radio size="small" />}
                  label={DISPOSITION_LABELS[value]}
                  sx={consultFormControlLabelSx}
                />
              ))}
            </RadioGroup>
          </FormControl>
        </Box>
      </Box>

      <Dialog
        open={labsModalOpen}
        onClose={() => {
          requestCloseLabsModal();
        }}
        maxWidth="lg"
        fullWidth
        aria-labelledby="plans-labs-dialog-title"
        slotProps={{
          paper: {
            sx: { maxHeight: "92vh" },
          },
        }}
      >
        <DialogTitle
          id="plans-labs-dialog-title"
          sx={{
            fontWeight: 800,
            textAlign: "center",
            letterSpacing: "0.08em",
            bgcolor: "info.main",
            color: "info.contrastText",
            py: 1.5,
          }}
        >
          LABORATORY REQUEST
        </DialogTitle>
        <DialogContent
          dividers
          sx={{
            px: { xs: 2, sm: 2.5 },
            py: 2,
            maxHeight: { xs: "70vh", md: "calc(92vh - 140px)" },
            overflow: "auto",
          }}
        >
          {labDialogError ? (
            <Alert severity="error" sx={{ mb: 2 }} onClose={() => setLabDialogError("")}>
              {labDialogError}
            </Alert>
          ) : null}
          {labDialogSuccess ? (
            <Alert severity="success" sx={{ mb: 2 }} onClose={() => setLabDialogSuccess("")}>
              {labDialogSuccess}
            </Alert>
          ) : null}
          {labEncounterError ? (
            <Alert severity="warning" sx={{ mb: 2 }} onClose={() => setLabEncounterError("")}>
              Could not load existing lab requests: {labEncounterError}
            </Alert>
          ) : null}
          {labTestsLoading ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
              <CircularProgress size={32} />
            </Box>
          ) : labTestsError ? (
            <Alert severity="error">{labTestsError}</Alert>
          ) : visibleLabSections.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              No lab tests found in the catalog.
            </Typography>
          ) : (
            <Box
              sx={{
                columnCount: { xs: 1, sm: 2, md: 3 },
                columnGap: 2.5,
              }}
            >
              {visibleLabSections.map((section) => (
                <Box
                  key={String(section.category.id)}
                  sx={{
                    breakInside: "avoid",
                    pageBreakInside: "avoid",
                    mb: 2.5,
                    border: "1px solid",
                    borderColor: "divider",
                    borderRadius: 1,
                    p: 1.5,
                    bgcolor: "background.paper",
                  }}
                >
                  <Typography
                    component="h3"
                    variant="subtitle2"
                    fontWeight={800}
                    color="info.main"
                    sx={{
                      letterSpacing: "0.06em",
                      mb: 1.25,
                      display: "block",
                    }}
                  >
                    {section.category.name.toUpperCase()}
                  </Typography>
                  <Box sx={{ display: "flex", flexDirection: "column", gap: 0.25 }}>
                    {section.tests.map((test) => {
                      const alreadyRequested = !isNew && requestedTestIdSet.has(test.id);
                      const checked = alreadyRequested || selectedLabTestIds.has(test.id);
                      return (
                        <FormControlLabel
                          key={test.id}
                          sx={{
                            ...consultFormControlLabelSx,
                            display: "flex",
                            flexDirection: "row",
                            alignItems: "center",
                            ml: 0,
                            mr: 0,
                            gap: 0.5,
                            "& .MuiFormControlLabel-label": { display: "inline", lineHeight: 1.35 },
                          }}
                          control={
                            <Checkbox
                              size="small"
                              checked={checked}
                              disabled={alreadyRequested}
                              onChange={() => {
                                if (alreadyRequested) return;
                                toggleLabTestSelection(test.id);
                              }}
                            />
                          }
                          label={
                            <Box component="span" sx={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 1 }}>
                              <Typography component="span" variant="body2" sx={{ textTransform: "uppercase" }}>
                                {test.name}
                              </Typography>
                              <Typography component="span" variant="caption" sx={{ fontWeight: 800, whiteSpace: "nowrap" }}>
                                {money2(labPriceByTestId.get(test.id) ?? 0)}
                              </Typography>
                            </Box>
                          }
                        />
                      );
                    })}
                  </Box>
                </Box>
              ))}
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 2, py: 1.5, justifyContent: "space-between", flexWrap: "wrap", gap: 1 }}>
          <Typography variant="caption" color="text.secondary" sx={{ mr: "auto" }}>
            {labDialogFooterHint}
          </Typography>
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
            <Button
              type="button"
              variant="contained"
              color="secondary"
              disabled={labTestsLoading || labSubmitting || selectedLabTestIds.size === 0}
              onClick={() => void submitLabRequest()}
              startIcon={<SaveOutlinedIcon />}
              sx={{ textTransform: "none" }}
            >
              {labSubmitting ? "Saving…" : "Save Request"}
            </Button>
            <Button
              onClick={requestCloseLabsModal}
              color="error"
              variant="outlined"
              startIcon={<CloseIcon />}
              sx={{ textTransform: "none" }}
            >
              Close
            </Button>
          </Box>
        </DialogActions>
      </Dialog>

      <Dialog
        open={imagingModalOpen}
        onClose={() => {
          requestCloseImagingModal();
        }}
        maxWidth="sm"
        fullWidth
        aria-labelledby="plans-imaging-dialog-title"
        slotProps={{
          paper: {
            sx: { maxHeight: "92vh" },
          },
        }}
      >
        <DialogTitle
          id="plans-imaging-dialog-title"
          sx={{
            fontWeight: 800,
            textAlign: "center",
            letterSpacing: "0.08em",
            bgcolor: "info.main",
            color: "info.contrastText",
            py: 1.5,
          }}
        >
          IMAGING
        </DialogTitle>
        <DialogContent
          dividers
          sx={{
            px: { xs: 2, sm: 2.5 },
            py: 2,
            maxHeight: { xs: "70vh", md: "calc(92vh - 120px)" },
            overflow: "auto",
          }}
        >
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <Box>
              <FormControlLabel
                sx={imagingCheckboxLabelSx}
                control={
                  <Checkbox
                    size="small"
                    checked={imagingForm.chestXray}
                    onChange={(_, c) => setImagingForm((f) => ({ ...f, chestXray: c }))}
                  />
                }
                label={
                  <Box component="span" sx={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 1 }}>
                    <Typography component="span" variant="body2" sx={{ textTransform: "uppercase" }}>
                      Chest X-ray
                    </Typography>
                    <Typography component="span" variant="caption" sx={{ fontWeight: 800, whiteSpace: "nowrap" }}>
                      {money2(imagingPriceByKey.chestXray ?? 0)}
                    </Typography>
                  </Box>
                }
              />
              <Box
                sx={{
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "center",
                  gap: 1,
                  pl: { xs: 0, sm: 4 },
                  mt: 0.5,
                }}
              >
                <Typography variant="body2" sx={{ textTransform: "uppercase", fontWeight: 600 }}>
                  View:
                </Typography>
                <TextField
                  size="small"
                  placeholder=" "
                  hiddenLabel
                  value={imagingForm.chestXrayView}
                  onChange={(e) => setImagingForm((f) => ({ ...f, chestXrayView: e.target.value }))}
                  sx={[medicationOutlinedFieldSx, { flex: 1, minWidth: 160 }]}
                />
              </Box>
            </Box>

            <FormControlLabel
              sx={imagingCheckboxLabelSx}
              control={
                <Checkbox
                  size="small"
                  checked={imagingForm.wholeAbdomenUtz}
                  onChange={(_, c) => setImagingForm((f) => ({ ...f, wholeAbdomenUtz: c }))}
                />
              }
              label={
                <Box component="span" sx={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 1 }}>
                  <Typography component="span" variant="body2" sx={{ textTransform: "uppercase" }}>
                    Whole Abdomen UTZ
                  </Typography>
                  <Typography component="span" variant="caption" sx={{ fontWeight: 800, whiteSpace: "nowrap" }}>
                    {money2(imagingPriceByKey.wholeAbdomenUtz ?? 0)}
                  </Typography>
                </Box>
              }
            />
            <FormControlLabel
              sx={imagingCheckboxLabelSx}
              control={
                <Checkbox
                  size="small"
                  checked={imagingForm.echo2d}
                  onChange={(_, c) => setImagingForm((f) => ({ ...f, echo2d: c }))}
                />
              }
              label={
                <Box component="span" sx={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 1 }}>
                  <Typography component="span" variant="body2" sx={{ textTransform: "uppercase" }}>
                    2D Echo
                  </Typography>
                  <Typography component="span" variant="caption" sx={{ fontWeight: 800, whiteSpace: "nowrap" }}>
                    {money2(imagingPriceByKey.echo2d ?? 0)}
                  </Typography>
                </Box>
              }
            />
            <FormControlLabel
              sx={imagingCheckboxLabelSx}
              control={
                <Checkbox
                  size="small"
                  checked={imagingForm.thyroidScan}
                  onChange={(_, c) => setImagingForm((f) => ({ ...f, thyroidScan: c }))}
                />
              }
              label={
                <Box component="span" sx={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 1 }}>
                  <Typography component="span" variant="body2" sx={{ textTransform: "uppercase" }}>
                    Thyroid Scan
                  </Typography>
                  <Typography component="span" variant="caption" sx={{ fontWeight: 800, whiteSpace: "nowrap" }}>
                    {money2(imagingPriceByKey.thyroidScan ?? 0)}
                  </Typography>
                </Box>
              }
            />
            <FormControlLabel
              sx={imagingCheckboxLabelSx}
              control={
                <Checkbox
                  size="small"
                  checked={imagingForm.tvs}
                  onChange={(_, c) => setImagingForm((f) => ({ ...f, tvs: c }))}
                />
              }
              label={
                <Box component="span" sx={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 1 }}>
                  <Typography component="span" variant="body2" sx={{ textTransform: "uppercase" }}>
                    Transvaginal UTZ (TVS)
                  </Typography>
                  <Typography component="span" variant="caption" sx={{ fontWeight: 800, whiteSpace: "nowrap" }}>
                    {money2(imagingPriceByKey.tvs ?? 0)}
                  </Typography>
                </Box>
              }
            />
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 2, py: 1.5, justifyContent: "space-between", flexWrap: "wrap", gap: 1 }}>
          <Button
            type="button"
            variant="contained"
            color="secondary"
            disabled={imagingFormsEqual(imagingForm, imagingBaselineRef.current)}
            startIcon={<SaveOutlinedIcon />}
            onClick={() => {
              const lines = buildImagingRequestLines(imagingForm);
              setForm((f) => ({
                ...f,
                plan_imaging: lines.length > 0,
                plan_notes: upsertImagingBlock(f.plan_notes ?? "", lines),
              }));
              imagingBaselineRef.current = { ...imagingForm };
              window.dispatchEvent(new CustomEvent("lifehub:imaging-updated", { detail: { transId } }));
              setImagingModalOpen(false);
            }}
            sx={{ textTransform: "none" }}
          >
            Save Request
          </Button>
          <Button
            onClick={requestCloseImagingModal}
            color="error"
            variant="outlined"
            startIcon={<CloseIcon />}
            sx={{ textTransform: "none" }}
          >
            Close
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={medicationsModalOpen}
        onClose={() => {
          requestCloseMedicationsModal();
        }}
        maxWidth="md"
        fullWidth
        aria-labelledby="plans-medications-dialog-title"
        slotProps={{
          paper: {
            sx: { maxHeight: "92vh" },
          },
        }}
      >
        <DialogTitle
          id="plans-medications-dialog-title"
          sx={{
            fontWeight: 800,
            textAlign: "center",
            letterSpacing: "0.08em",
            bgcolor: "info.main",
            color: "info.contrastText",
            py: 1.5,
          }}
        >
          MEDICATIONS
        </DialogTitle>
        <DialogContent
          dividers
          sx={{
            px: { xs: 2, sm: 2.5 },
            py: 2,
            maxHeight: { xs: "70vh", md: "calc(92vh - 120px)" },
            overflow: "auto",
          }}
        >
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Select pharmacy products, quantity, and unit. The list starts with the first products alphabetically; type at
            least two letters to search the full catalog. Unit defaults from each product's recorded unit of measure and
            can be edited.
          </Typography>
          <Snackbar
            open={medToastOpen}
            autoHideDuration={3500}
            onClose={() => setMedToastOpen(false)}
            anchorOrigin={{ vertical: "top", horizontal: "center" }}
          >
            <Alert
              severity={medToastSeverity}
              variant="filled"
              onClose={() => setMedToastOpen(false)}
              sx={{ width: "100%" }}
            >
              {medToastMessage}
            </Alert>
          </Snackbar>
          {medProductsLoading && medProductPreview.length === 0 ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
              <CircularProgress size={32} />
            </Box>
          ) : medProductsError ? (
            <Alert severity="error" sx={{ mb: 2 }}>
              {medProductsError}
            </Alert>
          ) : null}
          {!medProductsLoading && !medProductsError && medProductPreview.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              No active products in the catalog.
            </Typography>
          ) : null}
          {!medProductsLoading && !medProductsError && medProductPreview.length > 0 ? (
            <>
              <Grid container spacing={1} sx={{ mb: 1, display: { xs: "none", sm: "flex" } }}>
                <Grid size={{ sm: 5 }}>
                  <Typography variant="caption" fontWeight={700} color="info.main" sx={{ letterSpacing: "0.06em" }}>
                    PRODUCT
                  </Typography>
                </Grid>
                <Grid size={{ sm: 2 }}>
                  <Typography variant="caption" fontWeight={700} color="info.main" sx={{ letterSpacing: "0.06em" }}>
                    QTY
                  </Typography>
                </Grid>
                <Grid size={{ sm: 3 }}>
                  <Typography variant="caption" fontWeight={700} color="info.main" sx={{ letterSpacing: "0.06em" }}>
                    UNIT
                  </Typography>
                </Grid>
                <Grid size={{ sm: 2 }}>
                  <Typography variant="caption" fontWeight={700} color="info.main" sx={{ letterSpacing: "0.06em" }}>
                    FREQUENCY
                  </Typography>
                </Grid>
                <Grid size={{ sm: 4 }}>
                  <Typography variant="caption" fontWeight={700} color="info.main" sx={{ letterSpacing: "0.06em" }}>
                    NOTES
                  </Typography>
                </Grid>
                <Grid size={{ sm: 1 }} />
              </Grid>
              {medicationLines.map((line, idx) => {
                const selected = line.productId ? (productCache[line.productId] ?? null) : null;
                return (
                  <Box key={line.key} sx={{ mb: 1.25 }}>
                    <Grid container spacing={1} alignItems="center">
                      <Grid size={{ xs: 12, sm: 5 }}>
                        <MedicationProductAutocomplete
                          previewProducts={medProductPreview}
                          previewLoading={medProductsLoading}
                          value={selected}
                          textFieldSx={medicationOutlinedFieldSx}
                          onChange={(p) => {
                            if (p) mergeIntoProductCache([p]);
                            setMedicationLines((rows) =>
                              rows.map((r) =>
                                r.key === line.key
                                  ? {
                                      ...r,
                                      productId: p?.id ?? "",
                                      unit: p?.unit_of_measure ?? r.unit,
                                    }
                                  : r,
                              ),
                            );
                          }}
                        />
                      </Grid>
                      <Grid size={{ xs: 6, sm: 2 }}>
                        <TextField
                          size="small"
                          fullWidth
                          label="Qty"
                          placeholder=" "
                          type="number"
                          inputProps={{ min: 0, step: "any" }}
                          value={line.quantity}
                          error={line.productId.trim() !== "" && !isValidMedicationQuantity(line.quantity)}
                          onChange={(e) =>
                            setMedicationLines((rows) =>
                              rows.map((r) => (r.key === line.key ? { ...r, quantity: e.target.value } : r)),
                            )
                          }
                          sx={medicationOutlinedFieldSx}
                        />
                      </Grid>
                      <Grid size={{ xs: 6, sm: 3 }}>
                        <TextField
                          size="small"
                          fullWidth
                          label="Unit"
                          placeholder=" "
                          value={line.unit}
                          onChange={(e) =>
                            setMedicationLines((rows) =>
                              rows.map((r) => (r.key === line.key ? { ...r, unit: e.target.value } : r)),
                            )
                          }
                          sx={medicationOutlinedFieldSx}
                        />
                      </Grid>
                      <Grid size={{ xs: 12, sm: 2 }}>
                        <TextField
                          size="small"
                          fullWidth
                          label="Frequency"
                          placeholder=" "
                          value={line.frequency}
                          onChange={(e) =>
                            setMedicationLines((rows) =>
                              rows.map((r) => (r.key === line.key ? { ...r, frequency: e.target.value } : r)),
                            )
                          }
                          sx={medicationOutlinedFieldSx}
                        />
                      </Grid>
                      <Grid size={{ xs: 12, sm: 4 }}>
                        <TextField
                          size="small"
                          fullWidth
                          label="Notes"
                          placeholder=" "
                          value={line.notes}
                          onChange={(e) =>
                            setMedicationLines((rows) =>
                              rows.map((r) => (r.key === line.key ? { ...r, notes: e.target.value } : r)),
                            )
                          }
                          sx={medicationOutlinedFieldSx}
                        />
                      </Grid>
                      <Grid size={{ xs: 12, sm: "auto" }} sx={{ display: "flex", alignItems: "center" }}>
                        <IconButton
                          aria-label="Remove medication line"
                          size="small"
                          onClick={() => {
                            setMedicationLines((prev) => {
                              const next = prev.filter((l) => l.key !== line.key);
                              return next.length === 0 ? [newMedicationLine()] : next;
                            });
                          }}
                        >
                          <DeleteOutlineIcon fontSize="small" />
                        </IconButton>
                      </Grid>
                    </Grid>
                    {idx < medicationLines.length - 1 ? <Divider sx={{ mt: 1.25 }} /> : null}
                  </Box>
                );
              })}
              <Button
                type="button"
                variant="outlined"
                size="small"
                onClick={() => setMedicationLines((prev) => [...prev, newMedicationLine()])}
                startIcon={<AddOutlinedIcon />}
                sx={{ textTransform: "none", mt: 1 }}
              >
                Add medication
              </Button>
            </>
          ) : null}
        </DialogContent>
        <DialogActions sx={{ px: 2, py: 1.5, justifyContent: "flex-end", flexWrap: "wrap", gap: 1 }}>
          <Button
            type="button"
            variant="contained"
            color="secondary"
            disabled={
              medSaveLoading ||
              medProductsLoading ||
              !medsBaselineReadyRef.current ||
              medicationLinesSnapshot(medicationLines) === medsBaselineStrRef.current
            }
            onClick={() => void saveEncounterMedications()}
            startIcon={<SaveOutlinedIcon />}
            sx={{ textTransform: "none" }}
          >
            {medSaveLoading ? "Saving…" : "Save Medications"}
          </Button>
          <Button
            type="button"
            variant="outlined"
            color="secondary"
            disabled={printRxLoading}
            onClick={() => void printMedicationPrescription()}
            startIcon={<PrintOutlinedIcon />}
            sx={{ textTransform: "none" }}
          >
            {printRxLoading ? "Preparing…" : "Print RX"}
          </Button>
          <Button
            onClick={requestCloseMedicationsModal}
            color="error"
            variant="outlined"
            startIcon={<CloseIcon />}
            sx={{ textTransform: "none" }}
          >
            Close
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={unsavedCloseDialog != null}
        onClose={() => setUnsavedCloseDialog(null)}
        maxWidth="xs"
        fullWidth
        aria-labelledby="plans-unsaved-close-title"
      >
        <DialogTitle id="plans-unsaved-close-title" sx={{ fontWeight: 800 }}>
          Unsaved changes
        </DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" color="text.secondary">
            {unsavedCloseDialog === "labs"
              ? "You have lab tests selected that are not saved yet. Save your request before closing, or close without saving."
              : unsavedCloseDialog === "imaging"
                ? "Your imaging selections are not saved to the plan yet. Save your request before closing, or close without saving."
                : unsavedCloseDialog === "medications"
                  ? "Your medication changes are not saved yet. Save medications before closing, or close without saving."
                  : ""}
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 2, py: 1.5, gap: 1, flexWrap: "wrap" }}>
          <Button
            type="button"
            variant="text"
            color="inherit"
            onClick={() => setUnsavedCloseDialog(null)}
            sx={{ textTransform: "none" }}
          >
            Keep editing
          </Button>
          <Button
            type="button"
            variant="outlined"
            color="error"
            onClick={() => {
              const k = unsavedCloseDialog;
              setUnsavedCloseDialog(null);
              if (k === "labs") discardLabsModalClose();
              else if (k === "imaging") discardImagingModalClose();
              else if (k === "medications") discardMedicationsModalClose();
            }}
            sx={{ textTransform: "none" }}
          >
            Close without saving
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
