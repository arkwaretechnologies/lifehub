"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import AddOutlinedIcon from "@mui/icons-material/AddOutlined";
import CloseIcon from "@mui/icons-material/Close";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import PrintOutlinedIcon from "@mui/icons-material/PrintOutlined";
import SaveOutlinedIcon from "@mui/icons-material/SaveOutlined";
import ScienceOutlinedIcon from "@mui/icons-material/ScienceOutlined";
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
  Chip,
  FormControl,
  FormControlLabel,
  Grid,
  IconButton,
  MenuItem,
  Radio,
  RadioGroup,
  Select,
  Link,
  Snackbar,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { useAuth } from "@/components/AuthProvider";
import { authenticatedFetch } from "@/lib/authenticatedFetch";
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
  parseLabRequestPackageId,
  deleteLabRequestsForEncounter,
  fetchLabRequestItemsForRequestIds,
  fetchLabRequestsForEncounter,
  parsePatientIdForLab,
  type EncounterLabRequestSummary,
  type LabRequestItemPriority,
} from "@/lib/labRequests";
import {
  applyPanelLabTestToggle,
  collapseComponentsToPanel,
  expandPanelTestIds,
  fetchLabCatalogGrouped,
  filterLabRequestItemsForResultEntry,
  getComponentTestIds,
  isLabPackageTestSatisfiedInUI,
  testHasPanelComponents,
  type LabCatalogSection,
  type LabTestCatalogItem,
} from "@/lib/labTests";
import { LabOrderCatalogSections } from "@/components/laboratory/LabOrderCatalogSections";
import { fetchActiveLabPricesByTestIds } from "@/lib/labServicePrices";
import { fetchActiveLabPackagesWithTests, type LabPackageWithTests } from "@/lib/labPackages";
import { openPlansTreatmentPrintWindow, openPrescriptionPrintWindow } from "@/lib/prescriptionPrint";
import type { UserProfile } from "@/lib/types";
import {
  fetchActiveProductsPreview,
  fetchProductsByIds,
  formatProductOptionLabel,
  searchActiveProducts,
  type ProductCatalogRow,
} from "@/lib/pharmacyProducts";
import { supabase } from "@/lib/supabaseClient";
import {
  fetchCurrentMedicationsForEncounter,
  replaceCurrentMedicationsForEncounter,
} from "@/lib/currentMedications";
import {
  buildImagingRequestLinesFromCatalog,
  fetchActiveImagingCatalog,
  imagingSelectionEqual,
  imagingSelectionFromRequestItems,
  parseImagingBlockToSelection,
  upsertImagingBlock,
  type ImagingCatalogRow,
  type ImagingLineSelection,
} from "@/lib/imagingCatalog";
import { imagingSelectionHasChecked, fetchImagingRequestItemsForRequestIdsClient } from "@/lib/imagingRequests";
import type { LabRequestItemView } from "@/app/api/laboratory/lab-request/route";

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

function isCollectedY(v: string | null | undefined): boolean {
  return String(v ?? "").trim().toUpperCase() === "Y";
}

const emptyPlansForm: EncounterPlansTreatmentForm = {
  plan_labs: false,
  plan_imaging: false,
  plan_medications: false,
  plan_referral: false,
  plan_notes: "",
  disposition: null,
};

/** Imaging checklist + notes block helpers: `@/lib/imagingCatalog`. */

function isMedicationLineFilled(line: MedicationLineDraft): boolean {
  if (line.productId.trim() !== "") return true;
  return line.manualEntry && line.manualName.trim() !== "";
}

function hasMedicationLinesSelected(lines: MedicationLineDraft[]): boolean {
  return lines.some(isMedicationLineFilled);
}

/** Quantity required when a product is selected: non-empty and a finite number greater than 0. */
function isValidMedicationQuantity(q: string): boolean {
  const s = String(q).trim();
  if (!s) return false;
  const n = Number(s);
  return Number.isFinite(n) && n > 0;
}

function medicationRowsMissingQuantity(lines: MedicationLineDraft[]): boolean {
  return lines.some((l) => isMedicationLineFilled(l) && !isValidMedicationQuantity(l.quantity));
}

function medicationRowsMissingManualName(lines: MedicationLineDraft[]): boolean {
  return lines.some((l) => l.manualEntry && l.manualName.trim() === "" && l.productId.trim() === "");
}

function medicationLineDisplayName(
  line: MedicationLineDraft,
  productCache: Record<string, ProductCatalogRow>,
): string {
  if (line.productId.trim() !== "") {
    const p = productCache[line.productId];
    return p ? formatProductOptionLabel(p) : line.productId;
  }
  return line.manualName.trim();
}

/** Stable compare for medications modal dirty check (ignores row keys). */
function medicationLinesSnapshot(lines: MedicationLineDraft[]): string {
  return JSON.stringify(
    lines.map((l) => ({
      productId: l.productId.trim(),
      manualName: l.manualName.trim(),
      manualEntry: l.manualEntry,
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
  manualName: string;
  manualEntry: boolean;
  quantity: string;
  unit: string;
  frequency: string;
  notes: string;
};

function newMedicationLine(): MedicationLineDraft {
  return {
    key: crypto.randomUUID(),
    productId: "",
    manualName: "",
    manualEntry: false,
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

function labSelectionSnapshot(testIds: Iterable<string>, pkgIds: Iterable<string>): string {
  return JSON.stringify({
    tests: [...testIds].map((id) => String(id).trim()).filter(Boolean).sort(),
    pkgs: [...pkgIds].map((id) => String(id).trim()).filter(Boolean).sort(),
  });
}

function medicationLinesFromSnapshot(snapshot: string): MedicationLineDraft[] {
  try {
    const arr = JSON.parse(snapshot) as Array<{
      productId?: string;
      manualName?: string;
      manualEntry?: boolean;
      quantity?: string;
      unit?: string;
      frequency?: string;
      notes?: string;
    }>;
    if (!Array.isArray(arr) || arr.length === 0) return [newMedicationLine()];
    return arr.map((row) => {
      const productId = String(row.productId ?? "").trim();
      const manualName = String(row.manualName ?? "").trim();
      const manualEntry = row.manualEntry === true || (productId === "" && manualName !== "");
      return {
        key: crypto.randomUUID(),
        productId,
        manualName,
        manualEntry,
        quantity: String(row.quantity ?? "").trim(),
        unit: String(row.unit ?? "").trim(),
        frequency: String(row.frequency ?? "").trim(),
        notes: String(row.notes ?? "").trim(),
      };
    });
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
  const labCatalogTests = useMemo(() => labSections.flatMap((s) => s.tests), [labSections]);
  const labCatalogTestsRef = useRef(labCatalogTests);
  labCatalogTestsRef.current = labCatalogTests;
  const [labTestsLoading, setLabTestsLoading] = useState(false);
  const [labTestsError, setLabTestsError] = useState("");
  const [selectedLabTestIds, setSelectedLabTestIds] = useState<Set<string>>(() => new Set());
  const [labSubmitting, setLabSubmitting] = useState(false);
  const [labRequestPriority, setLabRequestPriority] = useState<LabRequestItemPriority>("Routine");
  const [labClinicalDiagnosis, setLabClinicalDiagnosis] = useState("");
  const [labRequestRemarks, setLabRequestRemarks] = useState("");
  const [labDialogError, setLabDialogError] = useState("");
  const [labToastOpen, setLabToastOpen] = useState(false);
  const [labToastMessage, setLabToastMessage] = useState("");
  const [encounterLabRequests, setEncounterLabRequests] = useState<EncounterLabRequestSummary[]>([]);
  const [requestedTestIdSet, setRequestedTestIdSet] = useState<Set<string>>(() => new Set());
  const [labEncounterError, setLabEncounterError] = useState("");
  const [labPriceByTestId, setLabPriceByTestId] = useState<Map<string, number>>(() => new Map());
  const [labPackages, setLabPackages] = useState<LabPackageWithTests[]>([]);
  const [selectedLabPackageIds, setSelectedLabPackageIds] = useState<Set<string>>(() => new Set());
  const [paidLabRequestIds, setPaidLabRequestIds] = useState<Set<string>>(() => new Set());
  const [paidImagingRequestIds, setPaidImagingRequestIds] = useState<Set<string>>(() => new Set());
  const [primaryPaidImagingRequestId, setPrimaryPaidImagingRequestId] = useState("");
  const [encounterImagingRequestIds, setEncounterImagingRequestIds] = useState<string[]>([]);
  /** Catalog codes already on a saved imaging_request (paid or unpaid). */
  const [savedImagingCatalogCodes, setSavedImagingCatalogCodes] = useState<Set<string>>(() => new Set());
  /** Lab requests that have at least one saved `lab_results` row (payment not required). */
  const [labRequestIdsWithResults, setLabRequestIdsWithResults] = useState<Set<string>>(() => new Set());

  const [labsModalMode, setLabsModalMode] = useState<"order" | "amend">("order");
  const [imagingModalMode, setImagingModalMode] = useState<"order" | "amend">("order");
  const [amendConfirmOpen, setAmendConfirmOpen] = useState(false);
  const [amendPendingWarnings, setAmendPendingWarnings] = useState<string[]>([]);
  const [amendPendingKind, setAmendPendingKind] = useState<"lab" | "imaging" | null>(null);
  const [amendSaveReminderOpen, setAmendSaveReminderOpen] = useState(false);
  const [amendSaveReminderText, setAmendSaveReminderText] = useState("");

  const [labResultsModalOpen, setLabResultsModalOpen] = useState(false);
  const [labResultsRequestId, setLabResultsRequestId] = useState("");
  const [labResultsLoading, setLabResultsLoading] = useState(false);
  const [labResultsError, setLabResultsError] = useState("");
  const [labResultsItems, setLabResultsItems] = useState<LabRequestItemView[]>([]);

  const [imagingModalOpen, setImagingModalOpen] = useState(false);
  const [imagingCatalog, setImagingCatalog] = useState<ImagingCatalogRow[]>([]);
  const [imagingCatalogError, setImagingCatalogError] = useState("");
  const [imagingForm, setImagingForm] = useState<Record<string, ImagingLineSelection>>({});

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
  const [printPlansLoading, setPrintPlansLoading] = useState(false);
  const [medicationLines, setMedicationLines] = useState<MedicationLineDraft[]>([]);
  const productCacheRef = useRef(productCache);
  productCacheRef.current = productCache;
  const formRef = useRef(form);
  formRef.current = form;
  const imagingCatalogRef = useRef<ImagingCatalogRow[]>([]);
  const imagingOpenedForParseRef = useRef(false);
  const imagingBaselineRef = useRef<Record<string, ImagingLineSelection>>({});
  const labSelectionBaselineRef = useRef("");
  const labsBaselineCapturedRef = useRef(false);
  const medsBaselineStrRef = useRef("");
  const medsBaselineReadyRef = useRef(false);

  type PlansModalKind = "labs" | "imaging" | "medications";
  const [unsavedCloseDialog, setUnsavedCloseDialog] = useState<PlansModalKind | null>(null);

  useEffect(() => {
    imagingCatalogRef.current = imagingCatalog;
  }, [imagingCatalog]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const r = await fetchActiveImagingCatalog();
      if (cancelled) return;
      if (r.error) setImagingCatalogError(r.error);
      else {
        setImagingCatalogError("");
        setImagingCatalog(r.rows);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /** New orders: hydrate modal from plan_notes. Amend mode loads from imaging_request_items in openImagingAmendModal. */
  useEffect(() => {
    if (!imagingModalOpen) {
      imagingOpenedForParseRef.current = false;
      return;
    }
    if (imagingModalMode === "amend") return;
    if (imagingCatalog.length === 0) return;
    if (!imagingOpenedForParseRef.current) {
      const parsed = parseImagingBlockToSelection(formRef.current.plan_notes ?? "", imagingCatalog);
      setImagingForm(parsed);
      imagingBaselineRef.current = parsed;
      imagingOpenedForParseRef.current = true;
    }
  }, [imagingModalOpen, imagingCatalog, imagingModalMode]);

  /** Capture lab modal baseline once after catalog load (order mode). Amend mode sets baseline in openLabAmendModal. */
  useEffect(() => {
    if (!labsModalOpen) {
      labsBaselineCapturedRef.current = false;
      return;
    }
    if (labsModalMode === "amend" || labTestsLoading) return;
    if (labsBaselineCapturedRef.current) return;
    labSelectionBaselineRef.current = labSelectionSnapshot(selectedLabTestIds, selectedLabPackageIds);
    labsBaselineCapturedRef.current = true;
  }, [labsModalOpen, labsModalMode, labTestsLoading, selectedLabTestIds, selectedLabPackageIds]);

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
    setSelectedLabPackageIds(new Set());
    setImagingForm({});
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
              manualName: "",
              manualEntry: false,
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
                (brand
                  ? s.products.find((p) => (p.brand_name ?? "").trim().toLowerCase() === brand.toLowerCase())
                  : null) ??
                null;
              if (match) break;
            }
          }

          if (match) mergeIntoProductCache([match]);

          if (match) {
            return {
              key: crypto.randomUUID(),
              productId: match.id,
              manualName: "",
              manualEntry: false,
              quantity: d.quantity,
              unit: match.unit_of_measure ?? d.unit,
              frequency: m.frequency ?? "",
              notes: m.notes ?? "",
            } as MedicationLineDraft;
          }

          return {
            key: crypto.randomUUID(),
            productId: "",
            manualName: name,
            manualEntry: true,
            quantity: d.quantity,
            unit: d.unit,
            frequency: m.frequency ?? "",
            notes: m.notes ?? "",
          } as MedicationLineDraft;
        }),
      );

      if (cancelled) return;

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
    setLabToastOpen(false);
    setLabRequestPriority("Routine");
    setLabClinicalDiagnosis("");
    setLabRequestRemarks("");
    setSelectedLabPackageIds(new Set());
  }, [labsModalOpen]);

  /** Stable primitives for lab package prune effect (React 19 requires a fixed-size dep list; avoids Set/array identity issues). */
  const labPackagePruneSelectedKey = useMemo(() => [...selectedLabTestIds].sort().join(","), [selectedLabTestIds]);
  const labPackagePruneRequestedKey = useMemo(() => [...requestedTestIdSet].sort().join(","), [requestedTestIdSet]);
  const labPackagePruneCatalogSig = useMemo(
    () =>
      labPackages
        .map((p) => `${p.id}:${[...p.labTestIds].sort().join(",")}`)
        .sort()
        .join("|"),
    [labPackages],
  );

  const labPackagePruneInputsRef = useRef({
    labPackages,
    selectedLabTestIds,
    requestedTestIdSet,
    labCatalogTests,
  });
  labPackagePruneInputsRef.current = {
    labPackages,
    selectedLabTestIds,
    requestedTestIdSet,
    labCatalogTests,
  };

  useEffect(() => {
    if (!labsModalOpen) return;
    const {
      labPackages: pkgs,
      selectedLabTestIds: sel,
      requestedTestIdSet: req,
      labCatalogTests: catalog,
    } = labPackagePruneInputsRef.current;
    if (pkgs.length === 0) return;
    setSelectedLabPackageIds((prev) => {
      const next = new Set<string>();
      for (const id of prev) {
        const pkg = pkgs.find((p) => p.id === id);
        if (
          pkg &&
          pkg.labTestIds.length > 0 &&
          pkg.labTestIds.every((tid) =>
            isLabPackageTestSatisfiedInUI(tid, catalog, sel, req),
          )
        ) {
          next.add(id);
        }
      }
      if (next.size === prev.size) {
        let same = true;
        for (const x of next) {
          if (!prev.has(x)) {
            same = false;
            break;
          }
        }
        if (same) return prev;
      }
      return next;
    });
  }, [
    labsModalOpen,
    labPackagePruneSelectedKey,
    labPackagePruneRequestedKey,
    labPackagePruneCatalogSig,
    labCatalogTests,
  ]);

  /** Paid (`lab_sales`) and requests that already have result rows — drives View result vs View catalog. */
  const syncPaidAndResultsFromRequestIds = useCallback(async (reqIds: string[], catalog?: LabTestCatalogItem[]) => {
    if (reqIds.length === 0) {
      setPaidLabRequestIds(new Set());
      setLabRequestIdsWithResults(new Set());
      return;
    }
    const catalogForFilter = catalog ?? labCatalogTestsRef.current;
    const { data: salesRows } = await supabase.from("lab_sales").select("lab_request_id").in("lab_request_id", reqIds);
    const paid = new Set<string>();
    for (const row of (salesRows ?? []) as Array<{ lab_request_id: string | null }>) {
      const id = String(row.lab_request_id ?? "").trim();
      if (id) paid.add(id);
    }
    setPaidLabRequestIds(paid);

    const itemRes = await fetchLabRequestItemsForRequestIds(supabase, reqIds);
    if (itemRes.error) return;
    const itemRows = filterLabRequestItemsForResultEntry(itemRes.items, catalogForFilter);
    const itemToReq = new Map<string, string>();
    for (const r of itemRows) {
      const row = r as { id?: string; lab_request_id?: string };
      if (row.id && row.lab_request_id) itemToReq.set(row.id, row.lab_request_id);
    }
    const itemIds = [...itemToReq.keys()];
    const withResults = new Set<string>();
    if (itemIds.length > 0) {
      const { data: resRows } = await supabase
        .from("lab_results")
        .select("lab_request_item_id")
        .in("lab_request_item_id", itemIds);
      for (const rr of (resRows ?? []) as Array<{ lab_request_item_id?: string | null }>) {
        const iid = String(rr.lab_request_item_id ?? "").trim();
        const rid = itemToReq.get(iid);
        if (rid) withResults.add(rid);
      }
    }
    setLabRequestIdsWithResults(withResults);
  }, []);

  const refreshSavedImagingCatalogCodes = useCallback(async (imagingRequestId?: string) => {
    const reqId = (imagingRequestId ?? primaryPaidImagingRequestId).trim();
    if (!reqId) {
      setSavedImagingCatalogCodes(new Set());
      return;
    }
    const catalog =
      imagingCatalogRef.current.length > 0
        ? imagingCatalogRef.current
        : (await fetchActiveImagingCatalog()).rows;
    const { rows: items, error } = await fetchImagingRequestItemsForRequestIdsClient([reqId]);
    if (error) return;
    const sel = imagingSelectionFromRequestItems(catalog, items);
    setSavedImagingCatalogCodes(
      new Set(Object.keys(sel).filter((code) => sel[code]?.checked)),
    );
  }, [primaryPaidImagingRequestId]);

  const syncPaidImagingForEncounter = useCallback(async () => {
    const { data: reqRows, error: rErr } = await supabase
      .from("imaging_requests")
      .select("id")
      .eq("encounter_id", transId)
      .order("created_at", { ascending: false });
    if (rErr) {
      setPaidImagingRequestIds(new Set());
      setPrimaryPaidImagingRequestId("");
      setEncounterImagingRequestIds([]);
      return;
    }
    const reqIds = ((reqRows ?? []) as Array<{ id: string }>).map((r) => r.id).filter(Boolean);
    if (reqIds.length === 0) {
      setPaidImagingRequestIds(new Set());
      setPrimaryPaidImagingRequestId("");
      setEncounterImagingRequestIds([]);
      return;
    }
    setEncounterImagingRequestIds(reqIds);
    if (reqIds.length > 0) {
      setForm((f) => (f.plan_imaging ? f : { ...f, plan_imaging: true }));
    }
    const { data: salesRows } = await supabase
      .from("lab_sales")
      .select("imaging_request_id")
      .in("imaging_request_id", reqIds);
    const paid = new Set<string>();
    for (const row of (salesRows ?? []) as Array<{ imaging_request_id?: string | null }>) {
      const id = String(row.imaging_request_id ?? "").trim();
      if (id) paid.add(id);
    }
    setPaidImagingRequestIds(paid);
    const primaryPaid = reqIds.find((id) => paid.has(id)) ?? "";
    setPrimaryPaidImagingRequestId(primaryPaid);
    const primaryReq = primaryPaid || reqIds[0] || "";
    if (primaryReq) await refreshSavedImagingCatalogCodes(primaryReq);
    else setSavedImagingCatalogCodes(new Set());
  }, [transId, refreshSavedImagingCatalogCodes]);

  useEffect(() => {
    if (!labsModalOpen) return;
    let cancelled = false;
    setLabTestsLoading(true);
    setLabTestsError("");
    setLabEncounterError("");
    void (async () => {
      try {
        const [cat, enc, pkgRes] = await Promise.all([
          fetchLabCatalogGrouped(),
          fetchLabRequestsForEncounter(transId),
          fetchActiveLabPackagesWithTests(),
        ]);
        if (cancelled) return;

        const catalogFromFetch = cat.error ? [] : cat.sections.flatMap((s) => s.tests);
        const activePkgList = !pkgRes.error ? pkgRes.packages.filter((p) => p.labTestIds.length > 0) : [];
        if (!pkgRes.error) {
          setLabPackages(activePkgList);
        }
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
          setPaidLabRequestIds(new Set());
          setLabRequestIdsWithResults(new Set());
          setSelectedLabPackageIds(new Set());
        } else {
          setEncounterLabRequests(enc.requests);
          setRequestedTestIdSet(new Set(enc.requestedTestIds));
          if (isNew) {
            // In a new consultation, allow editing/removal of previously saved lab selections.
            setSelectedLabTestIds(new Set(enc.requestedTestIds));
          }
          // Restore package chips from saved lab requests (View catalog).
          const activePkgIdSet = new Set(activePkgList.map((p) => p.id));
          const restoredPkgs = new Set<string>();
          for (const req of enc.requests) {
            for (const lp of req.lab_packages) {
              const sid = String(lp.id);
              if (activePkgIdSet.has(sid)) restoredPkgs.add(sid);
            }
          }
          setSelectedLabPackageIds(restoredPkgs);

          const reqIds = enc.requests.map((r) => r.id).filter(Boolean);
          if (!cancelled) await syncPaidAndResultsFromRequestIds(reqIds, catalogFromFetch);
        }
      } catch (e) {
        if (!cancelled) {
          setLabTestsError(e instanceof Error ? e.message : "Failed to load laboratory data.");
        }
      } finally {
        if (!cancelled) setLabTestsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [labsModalOpen, transId, isNew, syncPaidAndResultsFromRequestIds]);

  // Keep paid / results LAB state fresh even when the catalog modal is closed.
  // This drives the "View catalog" vs "View result" action next to LABS.
  useEffect(() => {
    if (!hydrated || loading) return;
    let cancelled = false;
    void (async () => {
      const enc = await fetchLabRequestsForEncounter(transId);
      if (cancelled) return;
      if (enc.error) {
        setLabEncounterError(enc.error);
        setEncounterLabRequests([]);
        setRequestedTestIdSet(new Set());
        setPaidLabRequestIds(new Set());
        setLabRequestIdsWithResults(new Set());
        return;
      }
      setLabEncounterError("");
      setEncounterLabRequests(enc.requests);
      setRequestedTestIdSet(new Set(enc.requestedTestIds));
      const reqIds = enc.requests.map((r) => r.id).filter(Boolean);
      if (cancelled) return;
      await syncPaidAndResultsFromRequestIds(reqIds);
      await syncPaidImagingForEncounter();
    })();
    return () => {
      cancelled = true;
    };
  }, [transId, hydrated, loading, syncPaidAndResultsFromRequestIds, syncPaidImagingForEncounter]);

  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent<{ transId?: string }>;
      if (!ce.detail?.transId || ce.detail.transId !== transId) return;
      void (async () => {
        const enc = await fetchLabRequestsForEncounter(transId);
        if (enc.error) return;
        setEncounterLabRequests(enc.requests);
        setRequestedTestIdSet(new Set(enc.requestedTestIds));
        await syncPaidAndResultsFromRequestIds(enc.requests.map((r) => r.id).filter(Boolean));
        await syncPaidImagingForEncounter();
      })();
    };
    window.addEventListener("lifehub:lab-requests-updated", handler);
    return () => window.removeEventListener("lifehub:lab-requests-updated", handler);
  }, [transId, syncPaidAndResultsFromRequestIds, syncPaidImagingForEncounter]);

  const toggleLabTestSelection = useCallback(
    (testId: string) => {
      setSelectedLabTestIds((prev) => {
        if (testHasPanelComponents(labCatalogTests, testId)) {
          return applyPanelLabTestToggle(testId, labCatalogTests, prev);
        }
        const next = new Set(prev);
        if (next.has(testId)) next.delete(testId);
        else next.add(testId);
        return next;
      });
    },
    [labCatalogTests],
  );

  const toggleLabPackageSelection = useCallback(
    (pkg: LabPackageWithTests) => {
      if (pkg.labTestIds.length === 0) return;
      const wasOn = selectedLabPackageIds.has(pkg.id);
      setSelectedLabPackageIds((prev) => {
        const next = new Set(prev);
        if (wasOn) next.delete(pkg.id);
        else next.add(pkg.id);
        return next;
      });
      setSelectedLabTestIds((sel) => {
        const n2 = new Set(sel);
        if (wasOn) {
          for (const tid of pkg.labTestIds) {
            n2.delete(tid);
            if (testHasPanelComponents(labCatalogTests, tid)) {
              for (const cid of getComponentTestIds(labCatalogTests, tid)) n2.delete(cid);
            }
          }
        } else {
          for (const tid of pkg.labTestIds) {
            n2.add(tid);
            if (testHasPanelComponents(labCatalogTests, tid)) {
              for (const cid of getComponentTestIds(labCatalogTests, tid)) n2.delete(cid);
            }
          }
        }
        return n2;
      });
    },
    [selectedLabPackageIds, labCatalogTests],
  );

  const addLabPackageFromDropdown = useCallback(
    (packageId: string) => {
      const pkg = labPackages.find((p) => p.id === packageId);
      if (!pkg || pkg.labTestIds.length === 0) return;
      if (selectedLabPackageIds.has(pkg.id)) return;
      setSelectedLabPackageIds((prev) => new Set(prev).add(pkg.id));
      setSelectedLabTestIds((sel) => {
        const n2 = new Set(sel);
        for (const tid of pkg.labTestIds) {
          n2.add(tid);
          if (testHasPanelComponents(labCatalogTests, tid)) {
            for (const cid of getComponentTestIds(labCatalogTests, tid)) n2.delete(cid);
          }
        }
        return n2;
      });
    },
    [labPackages, selectedLabPackageIds, labCatalogTests],
  );

  const syncStructuredPrescription = useCallback(async () => {
    const withProducts = medicationLines.filter((l) => l.productId.trim() !== "");
    if (withProducts.length === 0) {
      return { prescriptionId: null as string | null, error: null as string | null };
    }
    const patientId = Number(patient.patientId);
    if (!Number.isFinite(patientId)) {
      return { prescriptionId: null, error: "Patient id is missing; cannot save prescription for pharmacy." };
    }
    const physId =
      profile != null && typeof profile.user_id === "number" && Number.isFinite(profile.user_id)
        ? profile.user_id
        : null;
    const rxLines = withProducts.map((l) => ({
      productId: l.productId.trim(),
      quantityPrescribed: Math.max(1, Math.round(Number(l.quantity.trim()) || 0)),
      sig: [l.frequency.trim(), l.notes.trim()].filter(Boolean).join(" · ") || null,
    }));
    const res = await authenticatedFetch("/api/consultation/prescription", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        transId,
        patientId,
        physicianUserId: physId,
        rxLines,
      }),
    });
    const j = (await res.json().catch(() => ({}))) as {
      error?: string;
      prescriptionId?: string | null;
    };
    if (!res.ok || j.error) {
      return { prescriptionId: null, error: j.error ?? "Could not save prescription." };
    }
    return { prescriptionId: j.prescriptionId ?? null, error: null };
  }, [medicationLines, patient.patientId, profile, transId]);

  const printPlansTreatment = useCallback(async () => {
    const notes = form.plan_notes.trim();
    if (!notes) {
      window.alert("Enter plan/treatment notes before printing.");
      return;
    }
    const u = profile as UserProfile | null;
    const fullname = u?.fullname?.trim() ?? "";
    const specialty = u?.specialty?.trim() ?? "";
    const licenseNo = u?.license_no?.trim() ?? "";
    const ptrNo = u?.ptr_no?.trim() ?? "";
    const s2No = u?.s2_no?.trim() ?? "";

    setPrintPlansLoading(true);
    try {
      const ok = await openPlansTreatmentPrintWindow({
        patient,
        physician: { fullname, specialty, licenseNo, ptrNo, s2No },
        planNotes: form.plan_notes,
        transId,
      });
      if (!ok) {
        window.alert(
          "Could not load the prescription PDF template. Ensure templates/RX Template.pdf is present on the server.",
        );
      }
    } finally {
      setPrintPlansLoading(false);
    }
  }, [form.plan_notes, patient, profile, transId]);

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
      .filter(isMedicationLineFilled)
      .map((l) => ({
        drugLine: medicationLineDisplayName(l, productCache),
        quantity: l.quantity,
        unit: l.unit,
        notes: l.notes,
      }));

    setPrintRxLoading(true);
    try {
      const rx = await syncStructuredPrescription();
      if (rx.error) {
        window.alert(rx.error);
        return;
      }
      const ok = await openPrescriptionPrintWindow({
        patient,
        physician: { fullname, specialty, licenseNo, ptrNo, s2No },
        medications,
        transId,
      });
      if (!ok) {
        window.alert(
          "Could not load the prescription PDF template. Ensure templates/RX Template.pdf is present on the server.",
        );
      }
    } finally {
      setPrintRxLoading(false);
    }
  }, [patient, profile, medicationLines, productCache, syncStructuredPrescription]);

  const saveEncounterMedications = useCallback(async () => {
    if (medicationRowsMissingManualName(medicationLines)) {
      setMedToastSeverity("error");
      setMedToastMessage("Enter a product name for manual medications.");
      setMedToastOpen(true);
      return;
    }
    if (medicationRowsMissingQuantity(medicationLines)) {
      setMedToastSeverity("error");
      setMedToastMessage("Add quantity of a product.");
      setMedToastOpen(true);
      return;
    }
    setMedSaveLoading(true);
    try {
      const rows = medicationLines
        .filter(isMedicationLineFilled)
        .map((l) => {
          const medicationName = medicationLineDisplayName(l, productCache);
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
      const rx = await syncStructuredPrescription();
      if (rx.error) {
        setMedToastSeverity("error");
        setMedToastMessage(rx.error);
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
  }, [transId, medicationLines, productCache, syncStructuredPrescription]);

  const visibleLabSections = useMemo(() => labSections.filter((s) => s.tests.length > 0), [labSections]);

  const testsCoveredBySelectedPackages = useMemo(() => {
    const s = new Set<string>();
    for (const pkg of labPackages) {
      if (!selectedLabPackageIds.has(pkg.id)) continue;
      for (const tid of pkg.labTestIds) {
        s.add(tid);
        for (const t of expandPanelTestIds([tid], labCatalogTests)) s.add(t);
      }
    }
    return s;
  }, [labPackages, selectedLabPackageIds, labCatalogTests]);

  const labSelectedTotal = useMemo(() => {
    let sum = 0;
    for (const pkg of labPackages) {
      if (selectedLabPackageIds.has(pkg.id)) sum += pkg.package_price;
    }
    for (const id of selectedLabTestIds) {
      if (testsCoveredBySelectedPackages.has(id)) continue;
      sum += labPriceByTestId.get(id) ?? 0;
    }
    return sum;
  }, [selectedLabTestIds, labPriceByTestId, labPackages, selectedLabPackageIds, testsCoveredBySelectedPackages]);

  useEffect(() => {
    const onEncounterTestIds = new Set(encounterLabRequests.flatMap((r) => r.labTestIds));
    const unstagedLab: Array<{ name: string; price: number; testId?: string }> = [];
    for (const pkg of labPackages) {
      if (!selectedLabPackageIds.has(pkg.id)) continue;
      unstagedLab.push({ name: `${pkg.name} (laboratory package)`, price: pkg.package_price });
    }
    for (const id of selectedLabTestIds) {
      if (testsCoveredBySelectedPackages.has(id)) continue;
      if (onEncounterTestIds.has(id)) continue;
      const t = labCatalogTests.find((x) => x.id === id);
      unstagedLab.push({
        name: t?.name ?? `Lab test ${id.slice(0, 8)}…`,
        price: labPriceByTestId.get(id) ?? 0,
        testId: id,
      });
    }

    const unstagedImaging: Array<{ name: string; price: number }> = [];
    const catalogForDraft =
      imagingCatalog.length > 0 ? imagingCatalog : imagingCatalogRef.current;
    for (const c of catalogForDraft) {
      if (!c.code || !imagingForm[c.code]?.checked) continue;
      if (savedImagingCatalogCodes.has(c.code)) continue;
      unstagedImaging.push({ name: c.name, price: Math.round(c.default_price * 100) / 100 });
    }

    window.dispatchEvent(
      new CustomEvent("lifehub:consultation-charges-draft", {
        detail: { transId, unstagedLab, unstagedImaging },
      }),
    );
  }, [
    transId,
    encounterLabRequests,
    selectedLabTestIds,
    selectedLabPackageIds,
    labPackages,
    labCatalogTests,
    labPriceByTestId,
    testsCoveredBySelectedPackages,
    imagingCatalog,
    imagingForm,
    savedImagingCatalogCodes,
  ]);

  /** Paid at cashier OR lab already has saved result rows (results may exist without `lab_sales`). */
  const canViewLabResults = useMemo(() => {
    if (encounterLabRequests.length === 0) return false;
    for (const r of encounterLabRequests) {
      if (paidLabRequestIds.has(r.id)) return true;
      if (labRequestIdsWithResults.has(r.id)) return true;
    }
    return false;
  }, [encounterLabRequests, paidLabRequestIds, labRequestIdsWithResults]);

  const viewResultsLabRequestId = useMemo(() => {
    for (const r of encounterLabRequests) {
      if (paidLabRequestIds.has(r.id)) return r.id;
    }
    for (const r of encounterLabRequests) {
      if (labRequestIdsWithResults.has(r.id)) return r.id;
    }
    return encounterLabRequests[0]?.id ?? "";
  }, [encounterLabRequests, paidLabRequestIds, labRequestIdsWithResults]);

  const primaryPaidLabRequestId = useMemo(() => {
    for (const r of encounterLabRequests) {
      if (paidLabRequestIds.has(r.id)) return r.id;
    }
    return "";
  }, [encounterLabRequests, paidLabRequestIds]);

  const canEditPaidLabs = paidLabRequestIds.size > 0;
  const canEditPaidImaging = paidImagingRequestIds.size > 0;

  const patientPayloadForAmend = useCallback(
    () => ({
      id: parsePatientIdForLab(patient.patientId),
      name: patient.name,
      contact_no: patient.contactNo?.trim() ? patient.contactNo.trim() : null,
    }),
    [patient.patientId, patient.name, patient.contactNo],
  );

  const openLabResultsModal = useCallback((labRequestId: string) => {
    const id = String(labRequestId ?? "").trim();
    if (!id) return;
    setLabResultsError("");
    setLabResultsItems([]);
    setLabResultsRequestId(id);
    setLabResultsModalOpen(true);
  }, []);

  useEffect(() => {
    if (!labResultsModalOpen) return;
    const id = labResultsRequestId.trim();
    if (!id) return;
    let cancelled = false;
    setLabResultsLoading(true);
    setLabResultsError("");
    void (async () => {
      try {
        const res = await authenticatedFetch(`/api/laboratory/lab-request?labRequestId=${encodeURIComponent(id)}`, { cache: "no-store" });
        const json = (await res.json().catch(() => ({}))) as { error?: string; items?: LabRequestItemView[] };
        if (cancelled) return;
        if (!res.ok) {
          setLabResultsError(json.error ?? `Request failed (${res.status})`);
          setLabResultsItems([]);
          return;
        }
        setLabResultsItems(Array.isArray(json.items) ? json.items : []);
      } catch {
        if (cancelled) return;
        setLabResultsError("Failed to load lab results.");
        setLabResultsItems([]);
      } finally {
        if (!cancelled) setLabResultsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [labResultsModalOpen, labResultsRequestId]);

  const labDialogFooterHint = useMemo(() => {
    if (labsModalMode === "amend") {
      const n = selectedLabTestIds.size;
      if (n === 0) return "Select tests for this order";
      return `${n} test${n === 1 ? "" : "s"} · ${money2(labSelectedTotal)} (balance settled at cashier if changed)`;
    }
    const nReq = requestedTestIdSet.size;
    const nNew = selectedLabTestIds.size;
    if (nReq === 0 && nNew === 0) return "Select tests to request";
    if (nReq === 0) return `${nNew} test${nNew === 1 ? "" : "s"} selected · ${money2(labSelectedTotal)}`;
    if (nNew === 0) return `${nReq} already requested — select more to add another request`;
    return `${nReq} already requested · ${nNew} new selected · ${money2(labSelectedTotal)}`;
  }, [labsModalMode, requestedTestIdSet, selectedLabTestIds, labSelectedTotal]);

  const submitLabAmend = useCallback(
    async (acknowledgedWarnings = false) => {
      const labRequestId = primaryPaidLabRequestId.trim();
      if (!labRequestId) {
        setLabDialogError("No paid lab order found for this visit.");
        return;
      }
      setLabDialogError("");
      setLabSubmitting(true);
      const packageIds = [...selectedLabPackageIds]
        .map((pid) => parseLabRequestPackageId(pid))
        .filter((n): n is number => n != null);
      const payload = patientPayloadForAmend();
      if (payload.id == null) {
        setLabSubmitting(false);
        setLabDialogError("Patient id is required.");
        return;
      }
      try {
        const res = await authenticatedFetch("/api/consultation/diagnostic-amend/lab", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            encounterId: transId,
            labRequestId,
            labTestIds: [...selectedLabTestIds],
            packageIds,
            itemPriority: labRequestPriority,
            acknowledgedWarnings,
            patient: payload,
          }),
        });
        const json = (await res.json().catch(() => ({}))) as {
          error?: string;
          warnings?: string[];
          amountDelta?: number;
          needsCashier?: boolean;
          queueDisplay?: string;
        };
        if (res.status === 409 && json.error === "CONFIRM_WARNINGS") {
          setAmendPendingWarnings(Array.isArray(json.warnings) ? json.warnings : []);
          setAmendPendingKind("lab");
          setAmendConfirmOpen(true);
          return;
        }
        if (!res.ok) {
          setLabDialogError(json.error ?? `Request failed (${res.status})`);
          return;
        }
        setLabToastMessage(
          json.needsCashier
            ? `Order updated. Patient owes ${money2(json.amountDelta ?? 0)} at cashier.`
            : json.amountDelta != null && json.amountDelta < 0
              ? `Order updated. Refund ${money2(Math.abs(json.amountDelta))} at cashier.`
              : "Lab order updated.",
        );
        setLabToastOpen(true);
        setAmendSaveReminderText(
          json.needsCashier
            ? "Laboratory order updated. You can keep adding or removing tests here until you are finished, then use Save consultation. The patient will settle the lab balance at the cashier after that."
            : "Laboratory order updated. You can keep adding or removing tests here until you are finished, then use Save consultation.",
        );
        setAmendSaveReminderOpen(true);
        const encRefresh = await fetchLabRequestsForEncounter(transId);
        if (!encRefresh.error) {
          setEncounterLabRequests(encRefresh.requests);
          setRequestedTestIdSet(new Set(encRefresh.requestedTestIds));
          await syncPaidAndResultsFromRequestIds(encRefresh.requests.map((r) => r.id).filter(Boolean));
        }
        window.dispatchEvent(new CustomEvent("lifehub:lab-requests-updated", { detail: { transId } }));
        labSelectionBaselineRef.current = labSelectionSnapshot(selectedLabTestIds, selectedLabPackageIds);
        labsBaselineCapturedRef.current = true;
        setUnsavedCloseDialog(null);
        setLabsModalOpen(false);
        setLabsModalMode("order");
      } catch {
        setLabDialogError("Could not save lab order changes.");
      } finally {
        setLabSubmitting(false);
      }
    },
    [
      primaryPaidLabRequestId,
      selectedLabPackageIds,
      selectedLabTestIds,
      patientPayloadForAmend,
      transId,
      labRequestPriority,
      syncPaidAndResultsFromRequestIds,
    ],
  );

  const submitImagingAmend = useCallback(
    async (acknowledgedWarnings = false) => {
      const imagingRequestId = primaryPaidImagingRequestId.trim();
      if (!imagingRequestId) {
        setImagingCatalogError("No paid imaging order found for this visit.");
        return;
      }
      setImagingCatalogError("");
      const payload = patientPayloadForAmend();
      if (payload.id == null) {
        setImagingCatalogError("Patient id is required.");
        return;
      }
      try {
        const res = await authenticatedFetch("/api/consultation/diagnostic-amend/imaging", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            encounterId: transId,
            imagingRequestId,
            selection: imagingForm,
            acknowledgedWarnings,
            patient: payload,
          }),
        });
        const json = (await res.json().catch(() => ({}))) as {
          error?: string;
          warnings?: string[];
          amountDelta?: number;
          needsCashier?: boolean;
        };
        if (res.status === 409 && json.error === "CONFIRM_WARNINGS") {
          setAmendPendingWarnings(Array.isArray(json.warnings) ? json.warnings : []);
          setAmendPendingKind("imaging");
          setAmendConfirmOpen(true);
          return;
        }
        if (!res.ok) {
          setImagingCatalogError(json.error ?? `Request failed (${res.status})`);
          return;
        }
        setLabToastMessage(
          json.needsCashier
            ? `Imaging updated. Patient owes ${money2(json.amountDelta ?? 0)} at cashier.`
            : json.amountDelta != null && json.amountDelta < 0
              ? `Imaging updated. Refund ${money2(Math.abs(json.amountDelta))} at cashier.`
              : "Imaging order updated.",
        );
        setLabToastOpen(true);
        setAmendSaveReminderText(
          json.needsCashier
            ? "Imaging order updated. You can keep adding or removing studies here until you are finished, then use Save consultation. The patient will settle the imaging balance at the cashier after that."
            : "Imaging order updated. You can keep adding or removing studies here until you are finished, then use Save consultation.",
        );
        setAmendSaveReminderOpen(true);
        imagingBaselineRef.current = { ...imagingForm };
        await syncPaidImagingForEncounter();
        await refreshSavedImagingCatalogCodes(imagingRequestId);
        window.dispatchEvent(new CustomEvent("lifehub:imaging-updated", { detail: { transId } }));
        setUnsavedCloseDialog(null);
        setImagingModalOpen(false);
        setImagingModalMode("order");
      } catch {
        setImagingCatalogError("Could not save imaging order changes.");
      }
    },
    [
      primaryPaidImagingRequestId,
      imagingForm,
      patientPayloadForAmend,
      transId,
      syncPaidImagingForEncounter,
      refreshSavedImagingCatalogCodes,
    ],
  );

  const openLabAmendModal = useCallback(async () => {
    const labRequestId = primaryPaidLabRequestId.trim();
    if (!labRequestId) return;
    setLabsModalMode("amend");
    setLabDialogError("");
    setLabsModalOpen(true);
    setLabTestsLoading(true);
    try {
      const [cat, stored, pkgRes] = await Promise.all([
        fetchLabCatalogGrouped(),
        fetchLabRequestItemsForRequestIds(supabase, [labRequestId]),
        fetchActiveLabPackagesWithTests(),
      ]);
      const catalogFromFetch = cat.error ? [] : cat.sections.flatMap((s) => s.tests);
      if (!cat.error) {
        setLabSections(cat.sections);
        const pricesAll = await fetchActiveLabPricesByTestIds(catalogFromFetch.map((t) => t.id));
        if (!pricesAll.error) setLabPriceByTestId(pricesAll.pricesByTestId);
      }
      if (!pkgRes.error) setLabPackages(pkgRes.packages.filter((p) => p.labTestIds.length > 0));
      const billable = stored.items.filter((i) => i.is_billable).map((i) => i.lab_test_id);
      const testSet = new Set(collapseComponentsToPanel(billable, catalogFromFetch));
      const pkgSet = new Set<string>();
      const req = encounterLabRequests.find((r) => r.id === labRequestId);
      if (req) {
        for (const lp of req.lab_packages) pkgSet.add(String(lp.id));
      }
      setSelectedLabTestIds(testSet);
      setSelectedLabPackageIds(pkgSet);
      labSelectionBaselineRef.current = labSelectionSnapshot(testSet, pkgSet);
      labsBaselineCapturedRef.current = true;
    } finally {
      setLabTestsLoading(false);
    }
  }, [primaryPaidLabRequestId, encounterLabRequests]);

  const openImagingAmendModal = useCallback(async () => {
    const imagingRequestId = primaryPaidImagingRequestId.trim();
    if (!imagingRequestId) return;
    setImagingModalMode("amend");
    setImagingCatalogError("");
    imagingOpenedForParseRef.current = true;
    try {
      const { rows: catalog, error: catErr } = await fetchActiveImagingCatalog();
      if (catErr) {
        setImagingCatalogError(catErr);
        return;
      }
      const { rows: items, error: iErr } = await fetchImagingRequestItemsForRequestIdsClient([imagingRequestId]);
      if (iErr) {
        setImagingCatalogError(iErr);
        return;
      }
      const next = imagingSelectionFromRequestItems(catalog, items);
      setImagingCatalog(catalog);
      setImagingForm(next);
      imagingBaselineRef.current = { ...next };
      setSavedImagingCatalogCodes(
        new Set(Object.keys(next).filter((code) => next[code]?.checked)),
      );
      setImagingModalOpen(true);
    } catch {
      setImagingCatalogError("Could not load imaging order.");
    }
  }, [primaryPaidImagingRequestId]);

  const submitLabRequest = useCallback(async () => {
    setLabDialogError("");
    setLabToastOpen(false);
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

    const remarksTrim = labRequestRemarks.trim();
    const diagTrim = labClinicalDiagnosis.trim();

    const packageIds = [...selectedLabPackageIds]
      .map((pid) => parseLabRequestPackageId(pid))
      .filter((n): n is number => n != null);

    const { labRequestId, error } = await createLabRequestWithItems({
      encounterId: transId,
      patientId: parsePatientIdForLab(patient.patientId),
      referringPhysician: patient.referringPhysician?.trim() ? patient.referringPhysician.trim() : null,
      physicianId,
      priority: labRequestPriority,
      clinicalDiagnosis: diagTrim !== "" ? diagTrim : null,
      remarks: remarksTrim !== "" ? remarksTrim : null,
      labTestIds: [...selectedLabTestIds],
      itemPriority: labRequestPriority,
      packageIds,
    });
    setLabSubmitting(false);
    if (error) {
      setLabDialogError(error);
      return;
    }
    setLabToastMessage("Lab Request Saved");
    setLabToastOpen(true);
    setSelectedLabTestIds(new Set());
    setSelectedLabPackageIds(new Set());
    const encRefresh = await fetchLabRequestsForEncounter(transId);
    if (!encRefresh.error) {
      setEncounterLabRequests(encRefresh.requests);
      setRequestedTestIdSet(new Set(encRefresh.requestedTestIds));
      setLabEncounterError("");
      await syncPaidAndResultsFromRequestIds(encRefresh.requests.map((r) => r.id).filter(Boolean));
      window.dispatchEvent(new CustomEvent("lifehub:lab-requests-updated", { detail: { transId } }));
    }
    labSelectionBaselineRef.current = labSelectionSnapshot(new Set(), new Set());
    labsBaselineCapturedRef.current = true;
    setUnsavedCloseDialog(null);
    setLabsModalOpen(false);
    setLabsModalMode("order");
  }, [
    transId,
    patient.patientId,
    patient.referringPhysician,
    profile,
    selectedLabTestIds,
    isNew,
    syncPaidAndResultsFromRequestIds,
    labClinicalDiagnosis,
    labRequestRemarks,
    labRequestPriority,
    selectedLabPackageIds,
    labCatalogTests,
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
    setLabsModalMode("order");
  }, [labTestsLoading, selectedLabTestIds, requestedTestIdSet, encounterLabRequests]);

  const closeImagingModal = useCallback(() => {
    setForm((f) => {
      const lines = buildImagingRequestLinesFromCatalog(imagingCatalogRef.current, imagingForm);
      const hasSavedImagingRequest = encounterImagingRequestIds.length > 0;
      if (lines.length === 0) {
        if (hasSavedImagingRequest) {
          return { ...f, plan_imaging: true };
        }
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
    setImagingModalMode("order");
  }, [imagingForm, encounterImagingRequestIds.length]);

  const closeMedicationsModal = useCallback(() => {
    medsBaselineReadyRef.current = false;
    setForm((f) => ({ ...f, plan_medications: hasMedicationLinesSelected(medicationLines) }));
    setMedicationsModalOpen(false);
  }, [medicationLines]);

  /** Discard unstaged lab picks, then sync main LABS checkbox (off if no saved requests). */
  const discardLabsModalClose = useCallback(() => {
    setSelectedLabTestIds(new Set());
    setSelectedLabPackageIds(new Set());
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
    const lines = buildImagingRequestLinesFromCatalog(imagingCatalogRef.current, baseline);
    const hasSavedImagingRequest = encounterImagingRequestIds.length > 0;
    setForm((f) => ({
      ...f,
      plan_imaging: lines.length > 0 || hasSavedImagingRequest,
      plan_notes:
        lines.length === 0 && !hasSavedImagingRequest
          ? upsertImagingBlock(f.plan_notes ?? "", [])
          : f.plan_notes,
    }));
    setImagingForm(baseline);
    setImagingModalOpen(false);
    setImagingModalMode("order");
  }, [encounterImagingRequestIds.length]);

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
    if (
      labSelectionSnapshot(selectedLabTestIds, selectedLabPackageIds) !== labSelectionBaselineRef.current
    ) {
      setUnsavedCloseDialog("labs");
      return;
    }
    closeLabsModal();
  }, [selectedLabTestIds, selectedLabPackageIds, closeLabsModal]);

  const requestCloseImagingModal = useCallback(() => {
    if (!imagingSelectionEqual(imagingForm, imagingBaselineRef.current)) {
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
                        if (c) {
                          const viewId = viewResultsLabRequestId.trim();
                          if (canViewLabResults && viewId) {
                            openLabResultsModal(viewId);
                          } else {
                            setLabsModalMode("order");
                            setLabsModalOpen(true);
                          }
                        } else setLabsModalOpen(false);
                      }}
                    />
                  }
                  label="LABS"
                  sx={consultFormControlLabelSx}
                />
                {(form.plan_labs || encounterLabRequests.length > 0) && !loading ? (
                  <Stack spacing={0.25} sx={{ ml: 0.5 }}>
                    <Button
                      type="button"
                      variant="text"
                      size="small"
                      onClick={() => {
                        if (canViewLabResults && viewResultsLabRequestId) {
                          openLabResultsModal(viewResultsLabRequestId);
                          return;
                        }
                        setLabsModalMode("order");
                        setLabsModalOpen(true);
                      }}
                      sx={{ textTransform: "uppercase", minWidth: "auto", py: 0.25, px: 0.75 }}
                    >
                      {canViewLabResults ? "View result" : "View catalog"}
                    </Button>
                    {canEditPaidLabs ? (
                      <Button
                        type="button"
                        variant="text"
                        size="small"
                        onClick={() => void openLabAmendModal()}
                        sx={{ textTransform: "uppercase", minWidth: "auto", py: 0.25, px: 0.75 }}
                      >
                        Edit or add test
                      </Button>
                    ) : null}
                  </Stack>
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
                  <Stack spacing={0.25} sx={{ ml: 0.5 }}>
                    <Button
                      type="button"
                      variant="text"
                      size="small"
                      onClick={() => {
                        setImagingModalMode("order");
                        setImagingModalOpen(true);
                      }}
                      sx={{ textTransform: "uppercase", minWidth: "auto", py: 0.25, px: 0.75 }}
                    >
                      View studies
                    </Button>
                    {canEditPaidImaging ? (
                      <Button
                        type="button"
                        variant="text"
                        size="small"
                        onClick={() => void openImagingAmendModal()}
                        sx={{ textTransform: "uppercase", minWidth: "auto", py: 0.25, px: 0.75 }}
                      >
                        Edit or add study
                      </Button>
                    ) : null}
                  </Stack>
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

          <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 1 }}>
            <Button
              type="button"
              variant="outlined"
              color="secondary"
              size="small"
              disabled={loading || printPlansLoading || !form.plan_notes.trim()}
              onClick={() => void printPlansTreatment()}
              startIcon={
                printPlansLoading ? <CircularProgress size={16} color="inherit" /> : <PrintOutlinedIcon />
              }
              sx={{ textTransform: "none", fontWeight: 700 }}
            >
              {printPlansLoading ? "Preparing…" : "Print Plans/Treatment"}
            </Button>
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
          LABORATORY REQUEST{labsModalMode === "amend" ? " — EDIT ORDER" : ""}
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
            <Stack spacing={2} sx={{ mb: 2.5 }}>
              <FormControl variant="standard">
                <Typography
                  id="plans-labs-priority-label"
                  variant="caption"
                  fontWeight={700}
                  sx={{ display: "block", mb: 0.5 }}
                >
                  Priority
                </Typography>
                <RadioGroup
                  row
                  aria-labelledby="plans-labs-priority-label"
                  name="lab-request-priority"
                  value={labRequestPriority}
                  onChange={(e) => setLabRequestPriority(e.target.value as LabRequestItemPriority)}
                >
                  <FormControlLabel value="Routine" control={<Radio size="small" />} label="Routine" sx={consultFormControlLabelSx} />
                  <FormControlLabel value="STAT" control={<Radio size="small" />} label="STAT" sx={consultFormControlLabelSx} />
                </RadioGroup>
              </FormControl>
              <TextField
                label="Clinical data / provisional diagnosis"
                value={labClinicalDiagnosis}
                onChange={(e) => setLabClinicalDiagnosis(e.target.value)}
                fullWidth
                multiline
                minRows={2}
                variant="outlined"
                size="small"
              />
              <TextField
                label="Remarks"
                value={labRequestRemarks}
                onChange={(e) => setLabRequestRemarks(e.target.value)}
                fullWidth
                multiline
                minRows={2}
                variant="outlined"
                size="small"
              />
            </Stack>
          )}
          {!labTestsLoading && !labTestsError && visibleLabSections.length > 0 ? (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
              {labPackages.length > 0 ? (
                <Box
                  sx={{
                    border: "1px solid",
                    borderColor: "divider",
                    borderRadius: 1,
                    p: 1.5,
                    bgcolor: "background.paper",
                    breakInside: "avoid",
                  }}
                >
                  <Typography
                    variant="subtitle2"
                    fontWeight={800}
                    color="info.main"
                    sx={{ letterSpacing: "0.06em", mb: 1.25 }}
                  >
                    LAB PACKAGES
                  </Typography>
                  <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ display: "block", mb: 0.75 }}>
                    Add lab package
                  </Typography>
                  <FormControl fullWidth size="small" variant="outlined">
                    <Select
                      value=""
                      displayEmpty
                      inputProps={{ "aria-label": "Add lab package" }}
                      onChange={(e) => {
                        const v = String(e.target.value ?? "");
                        if (v) addLabPackageFromDropdown(v);
                      }}
                      renderValue={(v) =>
                        v === "" ? (
                          <Typography component="span" variant="body2" color="text.secondary">
                            Select a package to add…
                          </Typography>
                        ) : (
                          labPackages.find((p) => p.id === v)?.name ?? ""
                        )
                      }
                    >
                      <MenuItem value="" disabled>
                        <em>Select a package…</em>
                      </MenuItem>
                      {labPackages.map((pkg) => (
                        <MenuItem
                          key={pkg.id}
                          value={pkg.id}
                          disabled={selectedLabPackageIds.has(pkg.id)}
                          sx={{ alignItems: "flex-start", whiteSpace: "normal", py: 1 }}
                        >
                          <Box sx={{ display: "flex", justifyContent: "space-between", gap: 2, width: "100%" }}>
                            <Box sx={{ minWidth: 0 }}>
                              <Typography variant="body2" fontWeight={700}>
                                {pkg.name}
                              </Typography>
                            </Box>
                            <Typography variant="caption" fontWeight={800} sx={{ flexShrink: 0 }}>
                              {money2(pkg.package_price)}
                            </Typography>
                          </Box>
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  {selectedLabPackageIds.size > 0 ? (
                    <Box sx={{ mt: 1.5 }}>
                      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.75 }}>
                        Selected packages
                      </Typography>
                      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75 }}>
                        {labPackages
                          .filter((p) => selectedLabPackageIds.has(p.id))
                          .map((pkg) => (
                            <Chip
                              key={pkg.id}
                              label={`${pkg.name} · ${money2(pkg.package_price)}`}
                              size="small"
                              onDelete={() => toggleLabPackageSelection(pkg)}
                              sx={{ fontWeight: 600 }}
                            />
                          ))}
                      </Box>
                    </Box>
                  ) : null}
                </Box>
              ) : null}
            <LabOrderCatalogSections
              layout="columns"
              sections={labSections}
              catalogTests={labCatalogTests}
              selectedTestIds={selectedLabTestIds}
              onToggleTest={toggleLabTestSelection}
              priceByTestId={labPriceByTestId}
              testsCoveredByPackages={testsCoveredBySelectedPackages}
              requestedTestIds={labsModalMode === "amend" || isNew ? undefined : requestedTestIdSet}
              catalogMode={labsModalMode}
            />
            </Box>
          ) : null}
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
              onClick={() =>
                void (labsModalMode === "amend" ? submitLabAmend(false) : submitLabRequest())
              }
              startIcon={<SaveOutlinedIcon />}
              sx={{ textTransform: "none" }}
            >
              {labSubmitting
                ? "Saving…"
                : labsModalMode === "amend"
                  ? "Save changes"
                  : "Save Request"}
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
        open={labResultsModalOpen}
        onClose={() => setLabResultsModalOpen(false)}
        maxWidth="lg"
        fullWidth
        aria-labelledby="plans-lab-results-dialog-title"
        slotProps={{
          paper: {
            sx: { maxHeight: "92vh" },
          },
        }}
      >
        <DialogTitle
          id="plans-lab-results-dialog-title"
          sx={{
            fontWeight: 800,
            textAlign: "center",
            letterSpacing: "0.08em",
            bgcolor: "info.main",
            color: "info.contrastText",
            py: 1.5,
          }}
        >
          LAB RESULTS
        </DialogTitle>
        <DialogContent dividers sx={{ px: { xs: 2, sm: 2.5 }, py: 2, overflow: "auto" }}>
          {labResultsError ? (
            <Alert severity="error" sx={{ mb: 2 }} onClose={() => setLabResultsError("")}>
              {labResultsError}
            </Alert>
          ) : null}
          {labResultsLoading ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
              <CircularProgress size={32} />
            </Box>
          ) : labResultsItems.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              No lab results found for this request.
            </Typography>
          ) : (
            <TableContainer>
              <Table size="small" sx={{ "& th, & td": { verticalAlign: "top" } }}>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 800 }}>Test</TableCell>
                    <TableCell sx={{ fontWeight: 800 }}>Collected</TableCell>
                    <TableCell sx={{ fontWeight: 800 }}>Result</TableCell>
                    <TableCell sx={{ fontWeight: 800 }}>Unit</TableCell>
                    <TableCell sx={{ fontWeight: 800 }}>Reference</TableCell>
                    <TableCell sx={{ fontWeight: 800 }}>Flag</TableCell>
                    <TableCell sx={{ fontWeight: 800 }}>Status</TableCell>
                    <TableCell sx={{ fontWeight: 800 }}>Remarks</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {labResultsItems.map((it) => (
                    <TableRow key={it.id} hover>
                      <TableCell sx={{ fontWeight: 700 }}>
                        {it.test_name ?? it.lab_test_id}
                        <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                          Specimen: {it.specimen_type ?? "—"}
                        </Typography>
                      </TableCell>
                      <TableCell>{isCollectedY(it.collected_item) ? "Y" : "—"}</TableCell>
                      <TableCell>{(it.result_value ?? "").trim() || "—"}</TableCell>
                      <TableCell>{(it.result_unit ?? "").trim() || "—"}</TableCell>
                      <TableCell>{(it.reference_range ?? "").trim() || "—"}</TableCell>
                      <TableCell>{(it.flag ?? "").trim() || "—"}</TableCell>
                      <TableCell>{(it.result_status ?? "").trim() || "—"}</TableCell>
                      <TableCell>{(it.remarks ?? "").trim() || "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 2, py: 1.5, justifyContent: "space-between", flexWrap: "wrap", gap: 1 }}>
          <Typography variant="caption" color="text.secondary" sx={{ mr: "auto" }}>
            Request ID: <Box component="span" sx={{ fontFamily: "monospace" }}>{labResultsRequestId}</Box>
          </Typography>
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
            <Button
              type="button"
              variant="outlined"
              startIcon={<ScienceOutlinedIcon />}
              onClick={() => {
                const id = labResultsRequestId.trim();
                if (!id) return;
                window.open(`/laboratory/results?labRequestId=${encodeURIComponent(id)}`, "_blank", "noopener,noreferrer");
              }}
              sx={{ textTransform: "none" }}
            >
              Open in Lab Results
            </Button>
            <Button onClick={() => setLabResultsModalOpen(false)} color="error" variant="outlined" startIcon={<CloseIcon />} sx={{ textTransform: "none" }}>
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
        maxWidth="md"
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
          IMAGING{imagingModalMode === "amend" ? " — EDIT ORDER" : ""}
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
          {imagingCatalogError ? (
            <Alert severity="error" sx={{ mb: 2 }}>
              {imagingCatalogError}
            </Alert>
          ) : null}
          {imagingCatalog.length === 0 && !imagingCatalogError ? (
            <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, py: 3 }}>
              <CircularProgress size={28} />
              <Typography variant="body2" color="text.secondary" textAlign="center">
                Loading imaging catalog… If this never finishes, add the <strong>imaging_catalog</strong> table (see
                Settings → Laboratory → Imaging).
              </Typography>
            </Box>
          ) : (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {imagingCatalog.map((c) => {
                const row = imagingForm[c.code] ?? { checked: false, view: "" };
                const label = (c.view_field_label ?? "VIEW").trim() || "VIEW";
                return (
                  <Box key={c.code}>
                    <FormControlLabel
                      sx={imagingCheckboxLabelSx}
                      control={
                        <Checkbox
                          size="small"
                          checked={row.checked}
                          onChange={(_, checked) =>
                            setImagingForm((prev) => ({
                              ...prev,
                              [c.code]: { ...(prev[c.code] ?? { checked: false, view: "" }), checked },
                            }))
                          }
                        />
                      }
                      label={
                        <Box
                          component="span"
                          sx={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 1 }}
                        >
                          <Typography component="span" variant="body2" sx={{ textTransform: "uppercase" }}>
                            {c.name}
                          </Typography>
                          <Typography component="span" variant="caption" sx={{ fontWeight: 800, whiteSpace: "nowrap" }}>
                            {money2(Number(c.default_price))}
                          </Typography>
                        </Box>
                      }
                    />
                    {c.requires_view_field ? (
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
                          {label}:
                        </Typography>
                        <TextField
                          size="small"
                          placeholder=" "
                          hiddenLabel
                          value={row.view}
                          onChange={(e) =>
                            setImagingForm((prev) => ({
                              ...prev,
                              [c.code]: { ...(prev[c.code] ?? { checked: false, view: "" }), view: e.target.value },
                            }))
                          }
                          sx={[medicationOutlinedFieldSx, { flex: 1, minWidth: 160 }]}
                        />
                      </Box>
                    ) : null}
                  </Box>
                );
              })}
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 2, py: 1.5, justifyContent: "space-between", flexWrap: "wrap", gap: 1 }}>
          <Button
            type="button"
            variant="contained"
            color="secondary"
            disabled={
              imagingCatalog.length === 0 ||
              imagingSelectionEqual(imagingForm, imagingBaselineRef.current)
            }
            startIcon={<SaveOutlinedIcon />}
            onClick={() => {
              if (imagingModalMode === "amend") {
                void submitImagingAmend(false);
                return;
              }
              void (async () => {
                const lines = buildImagingRequestLinesFromCatalog(imagingCatalog, imagingForm);
                if (lines.length > 0 && imagingSelectionHasChecked(imagingForm)) {
                  const patientId = Number(patient.patientId);
                  if (Number.isFinite(patientId)) {
                    const imgRes = await authenticatedFetch("/api/imaging/imaging-request", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        encounterId: transId,
                        patientId,
                        selection: imagingForm,
                        remarks: "Consultation imaging order",
                      }),
                    });
                    const imgJson = (await imgRes.json().catch(() => ({}))) as { error?: string };
                    if (!imgRes.ok || imgJson.error) {
                      setImagingCatalogError(imgJson.error ?? "Could not save imaging request.");
                      return;
                    }
                  }
                }
                setForm((f) => ({
                  ...f,
                  plan_imaging: lines.length > 0,
                  plan_notes: upsertImagingBlock(f.plan_notes ?? "", lines),
                }));
                imagingBaselineRef.current = { ...imagingForm };
                window.dispatchEvent(new CustomEvent("lifehub:imaging-updated", { detail: { transId } }));
                await syncPaidImagingForEncounter();
                setImagingModalOpen(false);
              })();
            }}
            sx={{ textTransform: "none" }}
          >
            {imagingModalMode === "amend" ? "Save changes" : "Save Request"}
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
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5 }}>
            Select pharmacy products, quantity, and sig. The list starts with the first products alphabetically; type at
            least two letters to search the full catalog. If a product is not listed, use Enter product manually.
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
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              No active products in the catalog. You can still add medications manually below.
            </Typography>
          ) : null}
          {!medProductsLoading && !medProductsError ? (
            <>
              <Grid container spacing={1.5} sx={{ mb: 1.5, display: { xs: "none", sm: "flex" } }}>
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
                <Grid size={{ sm: 4 }}>
                  <Typography variant="caption" fontWeight={700} color="info.main" sx={{ letterSpacing: "0.06em" }}>
                    SIG
                  </Typography>
                </Grid>
                <Grid size={{ sm: 1 }} sx={{ minWidth: 40 }} />
              </Grid>
              {medicationLines.map((line, idx) => {
                const selected = line.productId ? (productCache[line.productId] ?? null) : null;
                const lineFilled = isMedicationLineFilled(line);
                return (
                  <Box key={line.key} sx={{ mb: 1.75 }}>
                    <Grid container spacing={1.5} alignItems="flex-start">
                      <Grid size={{ xs: 12, sm: 5 }}>
                        {line.manualEntry ? (
                          <TextField
                            size="small"
                            fullWidth
                            label="Product name"
                            placeholder="Enter medication name"
                            value={line.manualName}
                            onChange={(e) =>
                              setMedicationLines((rows) =>
                                rows.map((r) => (r.key === line.key ? { ...r, manualName: e.target.value } : r)),
                              )
                            }
                            sx={medicationOutlinedFieldSx}
                          />
                        ) : (
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
                                        manualName: "",
                                        manualEntry: false,
                                        unit: p?.unit_of_measure ?? r.unit,
                                      }
                                    : r,
                                ),
                              );
                            }}
                          />
                        )}
                        <Link
                          component="button"
                          type="button"
                          variant="body2"
                          underline="hover"
                          onClick={() =>
                            setMedicationLines((rows) =>
                              rows.map((r) =>
                                r.key === line.key
                                  ? line.manualEntry
                                    ? {
                                        ...r,
                                        manualEntry: false,
                                        manualName: "",
                                      }
                                    : {
                                        ...r,
                                        manualEntry: true,
                                        productId: "",
                                        manualName: r.manualName,
                                      }
                                  : r,
                              ),
                            )
                          }
                          sx={{ display: "inline-block", mt: 0.75, cursor: "pointer" }}
                        >
                          {line.manualEntry ? "Search catalog" : "Enter product manually"}
                        </Link>
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
                          error={lineFilled && !isValidMedicationQuantity(line.quantity)}
                          onChange={(e) =>
                            setMedicationLines((rows) =>
                              rows.map((r) => (r.key === line.key ? { ...r, quantity: e.target.value } : r)),
                            )
                          }
                          sx={medicationOutlinedFieldSx}
                        />
                      </Grid>
                      <Grid size={{ xs: 12, sm: 4 }} sx={{ mt: { xs: 1, sm: 0 } }}>
                        <TextField
                          size="small"
                          fullWidth
                          label="Sig"
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
                      <Grid
                        size={{ xs: 12, sm: 1 }}
                        sx={{ display: "flex", alignItems: "center", justifyContent: { xs: "flex-end", sm: "center" }, pt: { xs: 0.5, sm: 1 } }}
                      >
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
                    {idx < medicationLines.length - 1 ? <Divider sx={{ mt: 2 }} /> : null}
                  </Box>
                );
              })}
              <Button
                type="button"
                variant="outlined"
                size="small"
                onClick={() => setMedicationLines((prev) => [...prev, newMedicationLine()])}
                startIcon={<AddOutlinedIcon />}
                sx={{ textTransform: "none", mt: 1.75 }}
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
              ? "Your lab order has unsaved changes. Use Save changes or Save request first, or close without saving."
              : unsavedCloseDialog === "imaging"
                ? "Your imaging order has unsaved changes. Use Save changes or Save request first, or close without saving."
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

      <Dialog open={amendSaveReminderOpen} onClose={() => setAmendSaveReminderOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 800 }}>Save consultation</DialogTitle>
        <DialogContent>
          <Typography variant="body2">{amendSaveReminderText}</Typography>
        </DialogContent>
        <DialogActions sx={{ px: 2, py: 1.5 }}>
          <Button onClick={() => setAmendSaveReminderOpen(false)} variant="contained" sx={{ textTransform: "none" }}>
            OK
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={amendConfirmOpen} onClose={() => setAmendConfirmOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 800 }}>Confirm order change</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 1.5 }}>
            Some tests or studies you are removing may already have specimen collected, results entered, or imaging
            captured. Continuing may require lab or imaging staff to redo work.
          </Typography>
          <Stack component="ul" spacing={0.5} sx={{ m: 0, pl: 2.5 }}>
            {amendPendingWarnings.map((w) => (
              <Typography key={w} component="li" variant="body2">
                {w}
              </Typography>
            ))}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 2, py: 1.5 }}>
          <Button onClick={() => setAmendConfirmOpen(false)} sx={{ textTransform: "none" }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color="warning"
            onClick={() => {
              setAmendConfirmOpen(false);
              if (amendPendingKind === "lab") void submitLabAmend(true);
              else if (amendPendingKind === "imaging") void submitImagingAmend(true);
              setAmendPendingKind(null);
            }}
            sx={{ textTransform: "none" }}
          >
            Continue anyway
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={labToastOpen}
        autoHideDuration={4000}
        onClose={() => setLabToastOpen(false)}
        anchorOrigin={{ vertical: "top", horizontal: "center" }}
      >
        <Alert
          severity="success"
          variant="filled"
          onClose={() => setLabToastOpen(false)}
          sx={{ width: "100%" }}
        >
          {labToastMessage}
        </Alert>
      </Snackbar>
    </Box>
  );
}
