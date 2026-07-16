"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import AddOutlinedIcon from "@mui/icons-material/AddOutlined";
import CloseIcon from "@mui/icons-material/Close";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import PrintOutlinedIcon from "@mui/icons-material/PrintOutlined";
import SaveOutlinedIcon from "@mui/icons-material/SaveOutlined";
import ScienceOutlinedIcon from "@mui/icons-material/ScienceOutlined";
import CameraAltOutlinedIcon from "@mui/icons-material/CameraAltOutlined";
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
import MedicationSigField from "@/components/consultation/MedicationSigField";
import { consultFormControlLabelSx } from "@/components/consultation/ConsultationSectionTitle";
import { useConsultationSave } from "@/components/consultation/consultationSaveContext";
import {
  ENCOUNTER_DISPOSITION_VALUES,
  emptyEncounterPlansTreatmentForm,
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
  deleteUnpaidLabRequestsForEncounter,
  fetchLabRequestItemsForRequestIds,
  fetchLabRequestPackageIdsByRequestIdMap,
  fetchLabRequestsForEncounter,
  fetchLabSoldTestIdsByRequestIds,
  parsePatientIdForLab,
  type EncounterLabRequestSummary,
  type FetchLabRequestsForEncounterResult,
  type LabRequestItemPriority,
  type LabRequestItemStoredRow,
} from "@/lib/labRequests";
import {
  applyPanelLabTestToggle,
  collapseComponentsToPanel,
  expandPanelTestIds,
  filterLabRequestItemsForResultEntry,
  getComponentTestIds,
  isLabPackageTestSatisfiedInUI,
  testHasPanelComponents,
  type LabCatalogSection,
  type LabTestCatalogItem,
} from "@/lib/labTests";
import { LabOrderCatalogSections } from "@/components/laboratory/LabOrderCatalogSections";
import { PackageSelectionConfirmDialog } from "@/components/laboratory/PackageSelectionConfirmDialog";
import { getCachedLabCatalogAndPackages, invalidateLabCatalogCache, LAB_CATALOG_INVALIDATED_EVENT } from "@/lib/labCatalogCache";
import { fetchActiveLabPricesByTestIds } from "@/lib/labServicePrices";
import {
  getLabPackageAddConflicts,
  hasLabPackageAddConflicts,
  hydrateLabSelectionFromEncounter,
  imagingCatalogCodesCoveredByActivePackages,
  imagingCatalogCodesCoveredByPackages,
  labPackageHasMembers,
  restoreLabPackageCatalogIdsFromRequests,
  catalogPackageIdForNumericId,
  syncImagingFormWithSelectedPackages,
  applyRemovedPackageImagingSelection,
  type LabPackageWithTests,
} from "@/lib/labPackages";
import { openPlansTreatmentPrintWindow, openPrescriptionPrintWindow } from "@/lib/prescriptionPrint";
import { fetchPhysicianSignatureBytes } from "@/lib/signaturePrintFetch";
import type { UserProfile } from "@/lib/types";
import {
  fetchActiveProductsPreview,
  fetchProductsByIds,
  formatProductOptionLabel,
  searchActiveProducts,
  type ProductCatalogRow,
} from "@/lib/pharmacyProducts";
import type { PrescriptionCartLine } from "@/lib/pharmacyPosDb";
import { fetchPrescriptionCartByEncounterAuth } from "@/lib/pharmacyPrescriptionCart";
import { fetchPaidPhysicianLineStatusForEncounter } from "@/lib/physicianFeeSales";
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
import {
  computeUnpaidLabSavePayload,
  filterNewImagingSelection,
  filterNewLabTestIds,
  filterNewPackageIds,
} from "@/lib/encounterDiagnosticOrderState";
import {
  imagingItemHasConsultationViewableResult,
  imagingSelectionHasChecked,
  deleteImagingRequestsForEncounter,
  fetchImagingRequestItemsForRequestIdsClient,
  pruneUnpaidEncounterImagingToSelection,
  type ImagingRequestItemRow,
} from "@/lib/imagingRequests";
import type { LabRequestItemView } from "@/app/api/laboratory/lab-request/route";
import type { ImagingRequestHeaderView } from "@/app/api/imaging/imaging-request/route";
import ImagingStudyImageUpload from "@/components/imaging/ImagingStudyImageUpload";
import { isImagingItemResultReceived } from "@/lib/imagingQueueSync";

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

const emptyPlansForm: EncounterPlansTreatmentForm = emptyEncounterPlansTreatmentForm();

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
  return lines.some(
    (l) => !l.dispensedLocked && isMedicationLineFilled(l) && !isValidMedicationQuantity(l.quantity),
  );
}

function medicationRowsMissingManualName(lines: MedicationLineDraft[]): boolean {
  return lines.some(
    (l) =>
      !l.dispensedLocked &&
      l.manualEntry &&
      l.manualName.trim() === "" &&
      l.productId.trim() === "",
  );
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
  prescriptionItemId?: string;
  /** Dispensed at pharmacy POS — read-only in consultation. */
  dispensedLocked?: boolean;
};

function applyDispensedPrescriptionFlags(
  lines: MedicationLineDraft[],
  rxLines: PrescriptionCartLine[],
): MedicationLineDraft[] {
  const dispensedRx = rxLines.filter((rx) => rx.dispensed === true);
  if (dispensedRx.length === 0) {
    return lines.map((l) => ({ ...l, dispensedLocked: false }));
  }

  const usedItemIds = new Set<string>();
  const flagged = lines.map((line) => {
    if (line.prescriptionItemId) {
      const rx = dispensedRx.find((r) => r.pharmacy_prescription_item_id === line.prescriptionItemId);
      if (rx) {
        usedItemIds.add(rx.pharmacy_prescription_item_id);
        return { ...line, dispensedLocked: true, prescriptionItemId: rx.pharmacy_prescription_item_id };
      }
    }
    if (line.productId.trim()) {
      const rx = dispensedRx.find(
        (r) => r.product_id === line.productId.trim() && !usedItemIds.has(r.pharmacy_prescription_item_id),
      );
      if (rx) {
        usedItemIds.add(rx.pharmacy_prescription_item_id);
        return {
          ...line,
          dispensedLocked: true,
          prescriptionItemId: rx.pharmacy_prescription_item_id,
        };
      }
    }
    return { ...line, dispensedLocked: false };
  });

  const extras: MedicationLineDraft[] = [];
  for (const rx of dispensedRx) {
    if (usedItemIds.has(rx.pharmacy_prescription_item_id)) continue;
    usedItemIds.add(rx.pharmacy_prescription_item_id);
    const label = [rx.generic_name, rx.brand_name ? `(${rx.brand_name})` : ""].filter(Boolean).join(" ").trim();
    extras.push({
      key: crypto.randomUUID(),
      productId: rx.product_id ?? "",
      manualName: rx.product_id ? "" : label || "Medication",
      manualEntry: !rx.product_id,
      quantity: String(rx.quantity_prescribed ?? ""),
      unit: "",
      frequency: "",
      notes: rx.sig ?? "",
      prescriptionItemId: rx.pharmacy_prescription_item_id,
      dispensedLocked: true,
    });
  }

  return extras.length > 0 ? [...flagged, ...extras] : flagged;
}

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

function encounterLabSnapshotFresh(
  snapshot: { transId: string; stale: boolean } | null,
  transId: string,
): boolean {
  return snapshot != null && snapshot.transId === transId && !snapshot.stale;
}

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
  const followUpDateLabelId = `plans-follow-up-${useId().replace(/\W/g, "")}`;
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
  const [labPricesLoading, setLabPricesLoading] = useState(false);
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
  const [encounterLabStoredItems, setEncounterLabStoredItems] = useState<LabRequestItemStoredRow[]>([]);
  const [requestedTestIdSet, setRequestedTestIdSet] = useState<Set<string>>(() => new Set());
  const [requestedPackageIdSet, setRequestedPackageIdSet] = useState<Set<number>>(() => new Set());
  const [labEncounterError, setLabEncounterError] = useState("");
  const [labPriceByTestId, setLabPriceByTestId] = useState<Map<string, number>>(() => new Map());
  const [labPackages, setLabPackages] = useState<LabPackageWithTests[]>([]);
  const [selectedLabPackageIds, setSelectedLabPackageIds] = useState<Set<string>>(() => new Set());
  const [paidLabRequestIds, setPaidLabRequestIds] = useState<Set<string>>(() => new Set());
  /** Tests actually settled on `lab_sale_items` (not merely on a request that has a sale). */
  const [soldLabTestIds, setSoldLabTestIds] = useState<Set<string>>(() => new Set());
  const [paidImagingRequestIds, setPaidImagingRequestIds] = useState<Set<string>>(() => new Set());
  const [primaryPaidImagingRequestId, setPrimaryPaidImagingRequestId] = useState("");
  const [encounterImagingRequestIds, setEncounterImagingRequestIds] = useState<string[]>([]);
  /** Union of imaging catalog codes on all imaging_requests for this encounter. */
  const [encounterImagingCatalogCodes, setEncounterImagingCatalogCodes] = useState<Set<string>>(() => new Set());
  /** Lab requests that have at least one saved `lab_results` row (payment not required). */
  const [labRequestIdsWithResults, setLabRequestIdsWithResults] = useState<Set<string>>(() => new Set());
  /** Imaging requests with findings, impression, or uploaded image (payment not required). */
  const [imagingRequestIdsWithResults, setImagingRequestIdsWithResults] = useState<Set<string>>(() => new Set());

  const [labsModalMode, setLabsModalMode] = useState<"order" | "amend">("order");
  const [imagingModalMode, setImagingModalMode] = useState<"order" | "amend">("order");
  const [amendConfirmOpen, setAmendConfirmOpen] = useState(false);
  const [amendPendingWarnings, setAmendPendingWarnings] = useState<string[]>([]);
  const [amendPendingKind, setAmendPendingKind] = useState<"lab" | "imaging" | null>(null);
  const [amendSaveReminderOpen, setAmendSaveReminderOpen] = useState(false);
  const [amendSaveReminderText, setAmendSaveReminderText] = useState("");
  const [packageAddConfirm, setPackageAddConfirm] = useState<{
    pkg: LabPackageWithTests;
    labTestNames: string[];
    imagingStudyNames: string[];
  } | null>(null);

  const [labResultsModalOpen, setLabResultsModalOpen] = useState(false);
  const [labResultsRequestId, setLabResultsRequestId] = useState("");
  const [labResultsLoading, setLabResultsLoading] = useState(false);
  const [labResultsError, setLabResultsError] = useState("");
  const [labResultsItems, setLabResultsItems] = useState<LabRequestItemView[]>([]);

  const [imagingResultsModalOpen, setImagingResultsModalOpen] = useState(false);
  const [imagingResultsRequestId, setImagingResultsRequestId] = useState("");
  const [imagingResultsLoading, setImagingResultsLoading] = useState(false);
  const [imagingResultsError, setImagingResultsError] = useState("");
  const [imagingResultsHeader, setImagingResultsHeader] = useState<ImagingRequestHeaderView | null>(null);
  const [imagingResultsItems, setImagingResultsItems] = useState<ImagingRequestItemRow[]>([]);

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
  const [medVisitSettledHint, setMedVisitSettledHint] = useState(false);
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
  const encounterLabSnapshotRef = useRef<{
    transId: string;
    result: FetchLabRequestsForEncounterResult;
    stale: boolean;
  } | null>(null);
  const medsBaselineStrRef = useRef("");
  const medsBaselineReadyRef = useRef(false);

  type PlansModalKind = "labs" | "imaging" | "medications";
  const [unsavedCloseDialog, setUnsavedCloseDialog] = useState<PlansModalKind | null>(null);

  useEffect(() => {
    imagingCatalogRef.current = imagingCatalog;
  }, [imagingCatalog]);

  const syncPlanImagingFromFormState = useCallback(
    (formState: Record<string, ImagingLineSelection>, catalog: ImagingCatalogRow[]) => {
      const lines = buildImagingRequestLinesFromCatalog(catalog, formState);
      setForm((f) => ({
        ...f,
        plan_imaging: lines.length > 0 || encounterImagingRequestIds.length > 0,
        plan_notes: upsertImagingBlock(f.plan_notes ?? "", lines),
      }));
    },
    [encounterImagingRequestIds.length],
  );

  const applyPackageImagingToConsultation = useCallback(
    (
      selectedPackageIds: Set<string>,
      opts?: { removedPackage?: LabPackageWithTests },
    ) => {
      const catalogForPkg =
        imagingCatalog.length > 0 ? imagingCatalog : imagingCatalogRef.current;
      if (catalogForPkg.length === 0) return;
      setImagingForm((prev) => {
        const next = opts?.removedPackage
          ? applyRemovedPackageImagingSelection(
              opts.removedPackage,
              labPackages,
              selectedPackageIds,
              catalogForPkg,
              prev,
            )
          : syncImagingFormWithSelectedPackages(
              labPackages,
              selectedPackageIds,
              catalogForPkg,
              prev,
            );
        if (next !== prev || opts?.removedPackage) {
          syncPlanImagingFromFormState(next, catalogForPkg);
        }
        return next !== prev || opts?.removedPackage ? next : prev;
      });
    },
    [imagingCatalog, syncPlanImagingFromFormState, labPackages],
  );

  const selectedLabPackageIdsRef = useRef(selectedLabPackageIds);
  selectedLabPackageIdsRef.current = selectedLabPackageIds;

  const prevSelectedLabPackageIdsRef = useRef<Set<string>>(new Set());
  const packageSelectionChanged = useCallback(
    (prev: ReadonlySet<string>, next: ReadonlySet<string>) => {
      if (prev.size !== next.size) return true;
      for (const id of prev) {
        if (!next.has(id)) return true;
      }
      for (const id of next) {
        if (!prev.has(id)) return true;
      }
      return false;
    },
    [],
  );

  const prevImagingCatalogLenRef = useRef(0);
  useEffect(() => {
    const len = imagingCatalog.length;
    const catalogJustLoaded = prevImagingCatalogLenRef.current === 0 && len > 0;
    prevImagingCatalogLenRef.current = len;
    if (!catalogJustLoaded || selectedLabPackageIds.size === 0) return;
    setImagingForm((prev) => {
      const next = syncImagingFormWithSelectedPackages(
        labPackages,
        selectedLabPackageIds,
        imagingCatalog,
        prev,
      );
      if (next === prev) return prev;
      syncPlanImagingFromFormState(next, imagingCatalog);
      return next;
    });
  }, [
    imagingCatalog,
    labPackages,
    selectedLabPackageIds,
    syncPlanImagingFromFormState,
  ]);

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
    if (imagingOpenedForParseRef.current) return;
    imagingOpenedForParseRef.current = true;

    let cancelled = false;
    void (async () => {
      const parsed = parseImagingBlockToSelection(formRef.current.plan_notes ?? "", imagingCatalog);
      let merged: Record<string, ImagingLineSelection> = { ...parsed };

      if (isNew && encounterImagingRequestIds.length > 0) {
        const { rows: items, error } = await fetchImagingRequestItemsForRequestIdsClient(
          encounterImagingRequestIds,
        );
        if (!cancelled && !error && items.length > 0) {
          const fromEncounter = imagingSelectionFromRequestItems(imagingCatalog, items);
          for (const [code, sel] of Object.entries(fromEncounter)) {
            if (!sel?.checked) continue;
            merged[code] = {
              ...(merged[code] ?? { checked: false, view: "" }),
              ...sel,
              checked: true,
            };
          }
        }
      }

      if (cancelled) return;
      const catalogForSync = imagingCatalog;
      const synced = syncImagingFormWithSelectedPackages(
        labPackages,
        selectedLabPackageIdsRef.current,
        catalogForSync,
        merged,
      );
      setImagingForm(() => {
        imagingBaselineRef.current = synced;
        if (synced !== merged) {
          syncPlanImagingFromFormState(synced, catalogForSync);
        }
        return synced;
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [imagingModalOpen, imagingCatalog, imagingModalMode, isNew, encounterImagingRequestIds]);

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
      const [r, rxCart, paidRes] = await Promise.all([
        fetchCurrentMedicationsForEncounter(transId),
        fetchPrescriptionCartByEncounterAuth(transId),
        fetchPaidPhysicianLineStatusForEncounter(transId),
      ]);
      if (cancelled) return;

      const hasPhysicianPaid =
        !paidRes.error &&
        (paidRes.status.exactKeys.size > 0 || paidRes.status.feesByServiceId.size > 0);
      setMedVisitSettledHint(
        hasPhysicianPaid || paidLabRequestIds.size > 0 || paidImagingRequestIds.size > 0,
      );

      const finishHydrate = (nextMedLines: MedicationLineDraft[]) => {
        const withDispensed = applyDispensedPrescriptionFlags(nextMedLines, rxCart.lines);
        const finalLines = withDispensed.length > 0 ? withDispensed : [newMedicationLine()];
        setMedicationLines(finalLines);
        medsBaselineStrRef.current = medicationLinesSnapshot(finalLines);
        medsBaselineReadyRef.current = true;
      };

      if (r.error) {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (cancelled || !medicationsModalOpen) return;
            finishHydrate([newMedicationLine()]);
          });
        });
        return;
      }
      if (r.medications.length === 0) {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (cancelled || !medicationsModalOpen) return;
            finishHydrate([]);
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
      finishHydrate(nextMedLines);
    })();
    return () => {
      cancelled = true;
    };
  }, [medicationsModalOpen, transId, paidLabRequestIds, paidImagingRequestIds]);

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
  }, [labsModalOpen]);

  const canEditUnpaidLabOrders = useMemo(
    () => encounterLabRequests.some((r) => !paidLabRequestIds.has(r.id)),
    [encounterLabRequests, paidLabRequestIds],
  );

  const paidLockedTestIds = useMemo(
    () => new Set(collapseComponentsToPanel([...soldLabTestIds], labCatalogTests)),
    [soldLabTestIds, labCatalogTests],
  );

  const paidLockedPackageNums = useMemo(() => {
    const soldCollapsed = paidLockedTestIds;
    const s = new Set<number>();
    for (const req of encounterLabRequests) {
      if (!paidLabRequestIds.has(req.id)) continue;
      for (const lp of req.lab_packages ?? []) {
        const pkgNum = parseLabRequestPackageId(lp.id);
        if (pkgNum == null) continue;
        const catalogPkg = labPackages.find((p) => parseLabRequestPackageId(p.id) === pkgNum);
        let members = catalogPkg?.labTestIds ?? [];
        if (members.length === 0 && (req.lab_packages?.length ?? 0) === 1) {
          members = [...(req.package_covered_test_ids ?? [])];
        }
        if (members.length === 0) continue;
        const collapsedMembers = collapseComponentsToPanel(members, labCatalogTests);
        if (collapsedMembers.every((tid) => soldCollapsed.has(tid))) s.add(pkgNum);
      }
    }
    return s;
  }, [encounterLabRequests, paidLabRequestIds, labPackages, labCatalogTests, paidLockedTestIds]);

  const labCatalogLockedTestIds = useMemo(() => {
    if (isNew) return undefined;
    if (labsModalMode === "amend") return paidLockedTestIds;
    if (canEditUnpaidLabOrders) return paidLockedTestIds;
    return requestedTestIdSet;
  }, [labsModalMode, isNew, canEditUnpaidLabOrders, paidLockedTestIds, requestedTestIdSet]);

  /** Stable primitives for lab package prune effect (React 19 requires a fixed-size dep list; avoids Set/array identity issues). */
  const labPackagePruneImagingKey = useMemo(
    () =>
      Object.entries(imagingForm)
        .filter(([, v]) => v?.checked)
        .map(([code]) => code)
        .sort()
        .join(","),
    [imagingForm],
  );
  const labPackagePruneSelectedKey = useMemo(() => [...selectedLabTestIds].sort().join(","), [selectedLabTestIds]);
  const labPackagePruneRequestedKey = useMemo(() => [...requestedTestIdSet].sort().join(","), [requestedTestIdSet]);
  const labPackagePruneRequestedPkgKey = useMemo(
    () => [...requestedPackageIdSet].sort((a, b) => a - b).join(","),
    [requestedPackageIdSet],
  );
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
    requestedPackageIdSet,
    labCatalogTests,
    imagingForm,
    imagingCatalog,
    isNew,
    canEditUnpaidLabOrders: false,
  });
  labPackagePruneInputsRef.current = {
    labPackages,
    selectedLabTestIds,
    requestedTestIdSet,
    requestedPackageIdSet,
    labCatalogTests,
    imagingForm,
    imagingCatalog,
    isNew,
    canEditUnpaidLabOrders,
  };

  useEffect(() => {
    if (!labsModalOpen || labsModalMode === "amend" || labTestsLoading) return;
    const {
      labPackages: pkgs,
      selectedLabTestIds: sel,
      requestedTestIdSet: req,
      requestedPackageIdSet: reqPkgs,
      labCatalogTests: catalog,
      imagingForm: imgForm,
      imagingCatalog: imgCatalog,
      isNew: isNewConsultation,
      canEditUnpaidLabOrders: canEditUnpaid,
    } = labPackagePruneInputsRef.current;
    if (pkgs.length === 0) return;
    const catalogForImaging =
      imgCatalog.length > 0 ? imgCatalog : imagingCatalogRef.current;
    const reqForLabOk = isNewConsultation ? new Set<string>() : req;
    setSelectedLabPackageIds((prev) => {
      const next = new Set<string>();
      for (const id of prev) {
        const pkg = pkgs.find((p) => p.id === id);
        const labOk =
          !pkg ||
          pkg.labTestIds.length === 0 ||
          pkg.labTestIds.every((tid) => isLabPackageTestSatisfiedInUI(tid, catalog, sel, reqForLabOk));
        const imagingOk =
          !pkg ||
          (pkg.imagingCatalogIds?.length ?? 0) === 0 ||
          pkg.imagingCatalogIds.every((cid) => {
            const row = catalogForImaging.find((c) => c.id === cid);
            return Boolean(row?.code && imgForm[row.code]?.checked);
          });
        const pkgNum = parseLabRequestPackageId(id);
        const alreadyOnEncounter = pkgNum != null && reqPkgs.has(pkgNum);
        if (pkg && labOk && imagingOk && (isNewConsultation || canEditUnpaid || !alreadyOnEncounter)) {
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
    labsModalMode,
    labTestsLoading,
    labPackagePruneSelectedKey,
    labPackagePruneRequestedKey,
    labPackagePruneRequestedPkgKey,
    labPackagePruneCatalogSig,
    labPackagePruneImagingKey,
    labCatalogTests,
    isNew,
  ]);

  /** Paid (`lab_sales`) and requests that already have result rows — drives View result vs View catalog. */
  const syncPaidAndResultsFromRequestIds = useCallback(
    async (
      reqIds: string[],
      catalog?: LabTestCatalogItem[],
      preloadItems?: LabRequestItemStoredRow[],
    ) => {
      if (reqIds.length === 0) {
        setPaidLabRequestIds(new Set());
        setSoldLabTestIds(new Set());
        setLabRequestIdsWithResults(new Set());
        setEncounterLabStoredItems([]);
        return;
      }
      const catalogForFilter = catalog ?? labCatalogTestsRef.current;
      const { data: salesRows } = await supabase
        .from("lab_sales")
        .select("lab_request_id")
        .in("lab_request_id", reqIds);
      const paid = new Set<string>();
      for (const row of (salesRows ?? []) as Array<{ lab_request_id: string | null }>) {
        const id = String(row.lab_request_id ?? "").trim();
        if (id) paid.add(id);
      }
      setPaidLabRequestIds(paid);

      const soldRes = await fetchLabSoldTestIdsByRequestIds([...paid]);
      if (!soldRes.error) {
        setSoldLabTestIds(soldRes.soldTestIds);
      } else {
        setSoldLabTestIds(new Set());
      }

      let itemRows: LabRequestItemStoredRow[];
      if (preloadItems != null) {
        itemRows = preloadItems;
      } else {
        const itemRes = await fetchLabRequestItemsForRequestIds(supabase, reqIds);
        if (itemRes.error) return;
        itemRows = itemRes.items;
      }
      setEncounterLabStoredItems(itemRows);

      const filtered = filterLabRequestItemsForResultEntry(itemRows, catalogForFilter);
      const itemToReq = new Map<string, string>();
      for (const r of filtered) {
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
    },
    [],
  );

  const refreshEncounterImagingCatalogCodes = useCallback(async (imagingRequestIds: string[]) => {
    const reqIds = imagingRequestIds.map((x) => x.trim()).filter(Boolean);
    if (reqIds.length === 0) {
      setEncounterImagingCatalogCodes(new Set());
      return;
    }
    const catalog =
      imagingCatalogRef.current.length > 0
        ? imagingCatalogRef.current
        : (await fetchActiveImagingCatalog()).rows;
    const { rows: items, error } = await fetchImagingRequestItemsForRequestIdsClient(reqIds);
    if (error) return;
    const catalogById = new Map(catalog.map((c) => [String(c.id).trim(), c.code] as const));
    const codes = new Set<string>();
    for (const row of items) {
      const code = String(row.study_code ?? "").trim();
      if (code) codes.add(code);
      const fromCatalog = catalogById.get(String(row.imaging_catalog_id ?? "").trim());
      if (fromCatalog) codes.add(fromCatalog);
    }
    setEncounterImagingCatalogCodes(codes);
  }, []);

  const syncImagingResultsFromRequestIds = useCallback(async (reqIds: string[]) => {
    if (reqIds.length === 0) {
      setImagingRequestIdsWithResults(new Set());
      return;
    }
    const { rows: items, error } = await fetchImagingRequestItemsForRequestIdsClient(reqIds);
    if (error) return;
    const withResults = new Set<string>();
    for (const row of items) {
      if (!imagingItemHasConsultationViewableResult(row)) continue;
      const rid = String(row.imaging_request_id ?? "").trim();
      if (rid) withResults.add(rid);
    }
    setImagingRequestIdsWithResults(withResults);
  }, []);

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
      setEncounterImagingCatalogCodes(new Set());
      setImagingRequestIdsWithResults(new Set());
      return;
    }
    const reqIds = ((reqRows ?? []) as Array<{ id: string }>).map((r) => r.id).filter(Boolean);
    if (reqIds.length === 0) {
      setPaidImagingRequestIds(new Set());
      setPrimaryPaidImagingRequestId("");
      setEncounterImagingRequestIds([]);
      setEncounterImagingCatalogCodes(new Set());
      setImagingRequestIdsWithResults(new Set());
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
    await refreshEncounterImagingCatalogCodes(reqIds);
    await syncImagingResultsFromRequestIds(reqIds);
  }, [transId, refreshEncounterImagingCatalogCodes, syncImagingResultsFromRequestIds]);

  const pruneEncounterImagingOrders = useCallback(
    async (formState: Record<string, ImagingLineSelection>) => {
      const catalogForPkg =
        imagingCatalog.length > 0 ? imagingCatalog : imagingCatalogRef.current;
      if (catalogForPkg.length === 0) return;
      const activePkgNums = [...selectedLabPackageIdsRef.current]
        .map((pid) => parseLabRequestPackageId(pid))
        .filter((n): n is number => n != null);
      const lockedCodes = imagingCatalogCodesCoveredByPackages(
        labPackages,
        selectedLabPackageIdsRef.current,
        catalogForPkg,
      );
      const individualIds = new Set<string>();
      for (const c of catalogForPkg) {
        if (!c.id || !c.code) continue;
        if (!formState[c.code]?.checked) continue;
        if (lockedCodes.has(c.code)) continue;
        individualIds.add(c.id);
      }
      const res = await pruneUnpaidEncounterImagingToSelection(transId, activePkgNums, individualIds);
      if (res.error) return;
      window.dispatchEvent(new CustomEvent("lifehub:imaging-updated", { detail: { transId } }));
      await syncPaidImagingForEncounter();
    },
    [transId, labPackages, imagingCatalog, syncPaidImagingForEncounter],
  );

  useEffect(() => {
    const catalogForPkg =
      imagingCatalog.length > 0 ? imagingCatalog : imagingCatalogRef.current;
    if (catalogForPkg.length === 0) return;
    const prev = prevSelectedLabPackageIdsRef.current;
    if (!packageSelectionChanged(prev, selectedLabPackageIds)) return;
    const removed = [...prev].filter((id) => !selectedLabPackageIds.has(id));
    prevSelectedLabPackageIdsRef.current = new Set(selectedLabPackageIds);
    let nextFormSnapshot: Record<string, ImagingLineSelection> | null = null;
    setImagingForm((prevForm) => {
      let next = prevForm;
      for (const id of removed) {
        const removedPkg = labPackages.find((p) => p.id === id);
        if (!removedPkg) continue;
        next = applyRemovedPackageImagingSelection(
          removedPkg,
          labPackages,
          selectedLabPackageIds,
          catalogForPkg,
          next,
        );
      }
      if (removed.length === 0) {
        next = syncImagingFormWithSelectedPackages(
          labPackages,
          selectedLabPackageIds,
          catalogForPkg,
          prevForm,
        );
      }
      if (next === prevForm) return prevForm;
      nextFormSnapshot = next;
      syncPlanImagingFromFormState(next, catalogForPkg);
      return next;
    });
    if (removed.length > 0) {
      void pruneEncounterImagingOrders(nextFormSnapshot ?? imagingForm);
    }
  }, [
    selectedLabPackageIds,
    labPackages,
    imagingCatalog,
    imagingForm,
    packageSelectionChanged,
    syncPlanImagingFromFormState,
    pruneEncounterImagingOrders,
  ]);

  useEffect(() => {
    if (!labsModalOpen) return;
    if (labsModalMode === "amend") return;
    let cancelled = false;
    setLabTestsLoading(true);
    setLabPricesLoading(false);
    setLabTestsError("");
    setLabEncounterError("");
    void (async () => {
      try {
        const snapshot = encounterLabSnapshotRef.current;
        const encounterFresh = encounterLabSnapshotFresh(snapshot, transId);

        const catalogPromise = getCachedLabCatalogAndPackages();
        const encPromise = encounterFresh
          ? Promise.resolve(snapshot!.result)
          : fetchLabRequestsForEncounter(transId, {
              includePackageDetails: !isNew,
            });

        const [catalogRes, enc] = await Promise.all([catalogPromise, encPromise]);
        if (cancelled) return;

        const activePkgList = catalogRes.packages;
        if (!catalogRes.packagesError) {
          setLabPackages(activePkgList);
        }
        if (catalogRes.catalogError) {
          setLabTestsError(catalogRes.catalogError);
          setLabSections([]);
        } else {
          setLabSections(catalogRes.sections);
        }

        const catalogFromFetch = catalogRes.catalogError
          ? []
          : catalogRes.sections.flatMap((s) => s.tests);

        if (!catalogRes.catalogError) {
          const allTestIds = catalogRes.sections.flatMap((s) => s.tests.map((t) => t.id));
          setLabPricesLoading(true);
          void fetchActiveLabPricesByTestIds(allTestIds).then((pricesAll) => {
            if (cancelled) return;
            if (!pricesAll.error) {
              setLabPriceByTestId(pricesAll.pricesByTestId);
            }
            setLabPricesLoading(false);
          });
        }

        if (enc.error) {
          setLabEncounterError(enc.error);
          setEncounterLabRequests([]);
          setEncounterLabStoredItems([]);
          setRequestedTestIdSet(new Set());
          setRequestedPackageIdSet(new Set());
          setPaidLabRequestIds(new Set());
          setLabRequestIdsWithResults(new Set());
          if (!isNew) {
            setSelectedLabTestIds(new Set());
            setSelectedLabPackageIds(new Set());
          }
        } else {
          const encData = encounterFresh ? snapshot!.result : enc;
          if (!encounterFresh) {
            setEncounterLabRequests(encData.requests);
            setEncounterLabStoredItems(encData.storedItems);
            setRequestedTestIdSet(new Set(encData.requestedTestIds));
            setRequestedPackageIdSet(new Set(encData.requestedPackageIds));
            encounterLabSnapshotRef.current = { transId, result: encData, stale: false };
          }
          const reqIds = encData.requests.map((r) => r.id).filter(Boolean);
          if (!cancelled && reqIds.length > 0) {
            await syncPaidAndResultsFromRequestIds(reqIds, catalogFromFetch, encData.storedItems);
          } else if (!cancelled) {
            setEncounterLabStoredItems(encData.storedItems);
          }
          if (cancelled) return;

          let unpaidOnVisit = false;
          if (reqIds.length > 0) {
            const { data: salesRows } = await supabase
              .from("lab_sales")
              .select("lab_request_id")
              .in("lab_request_id", reqIds);
            const paidNow = new Set(
              ((salesRows ?? []) as Array<{ lab_request_id?: string | null }>)
                .map((r) => String(r.lab_request_id ?? "").trim())
                .filter(Boolean),
            );
            unpaidOnVisit = encData.requests.some((r) => !paidNow.has(r.id));
          }

          if (isNew) {
            const hydrated = hydrateLabSelectionFromEncounter(
              encData.requests,
              activePkgList,
              catalogFromFetch,
            );
            setSelectedLabTestIds(hydrated.testIds);
            setSelectedLabPackageIds(hydrated.packageIds);
          } else if (labsModalMode === "order" && unpaidOnVisit && catalogFromFetch.length > 0) {
            const hydrated = hydrateLabSelectionFromEncounter(
              encData.requests,
              activePkgList,
              catalogFromFetch,
            );
            setSelectedLabTestIds(hydrated.testIds);
            setSelectedLabPackageIds(hydrated.packageIds);
            labSelectionBaselineRef.current = labSelectionSnapshot(
              hydrated.testIds,
              hydrated.packageIds,
            );
            labsBaselineCapturedRef.current = true;
          }
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
  }, [labsModalOpen, transId, isNew, labsModalMode, syncPaidAndResultsFromRequestIds]);

  useEffect(() => {
    if (!hydrated || loading) return;
    void getCachedLabCatalogAndPackages();
  }, [hydrated, loading]);

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
        setEncounterLabStoredItems([]);
        setRequestedTestIdSet(new Set());
        setRequestedPackageIdSet(new Set());
        setPaidLabRequestIds(new Set());
        setLabRequestIdsWithResults(new Set());
        return;
      }
      setLabEncounterError("");
      setEncounterLabRequests(enc.requests);
      setEncounterLabStoredItems(enc.storedItems);
      setRequestedTestIdSet(new Set(enc.requestedTestIds));
      setRequestedPackageIdSet(new Set(enc.requestedPackageIds));
      encounterLabSnapshotRef.current = { transId, result: enc, stale: false };
      const reqIds = enc.requests.map((r) => r.id).filter(Boolean);
      if (cancelled) return;
      await syncPaidAndResultsFromRequestIds(reqIds, undefined, enc.storedItems);
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
      void syncPaidImagingForEncounter();
    };
    window.addEventListener("lifehub:imaging-updated", handler);
    return () => window.removeEventListener("lifehub:imaging-updated", handler);
  }, [transId, syncPaidImagingForEncounter]);

  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent<{ transId?: string }>;
      if (!ce.detail?.transId || ce.detail.transId !== transId) return;
      void (async () => {
        const enc = await fetchLabRequestsForEncounter(transId);
        if (enc.error) return;
        setEncounterLabRequests(enc.requests);
        setEncounterLabStoredItems(enc.storedItems);
        setRequestedTestIdSet(new Set(enc.requestedTestIds));
        setRequestedPackageIdSet(new Set(enc.requestedPackageIds));
        encounterLabSnapshotRef.current = { transId, result: enc, stale: false };
        await syncPaidAndResultsFromRequestIds(
          enc.requests.map((r) => r.id).filter(Boolean),
          undefined,
          enc.storedItems,
        );
        await syncPaidImagingForEncounter();
      })();
    };
    window.addEventListener("lifehub:lab-requests-updated", handler);
    return () => window.removeEventListener("lifehub:lab-requests-updated", handler);
  }, [transId, syncPaidAndResultsFromRequestIds, syncPaidImagingForEncounter]);

  useEffect(() => {
    const onCatalogInvalidated = () => {
      invalidateLabCatalogCache();
    };
    window.addEventListener(LAB_CATALOG_INVALIDATED_EVENT, onCatalogInvalidated);
    return () => window.removeEventListener(LAB_CATALOG_INVALIDATED_EVENT, onCatalogInvalidated);
  }, []);

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
      if (!labPackageHasMembers(pkg)) return;
      const pkgNum = parseLabRequestPackageId(pkg.id);
      const wasOn = selectedLabPackageIds.has(pkg.id);
      if (wasOn && pkgNum != null && paidLockedPackageNums.has(pkgNum)) return;
      if (
        !isNew &&
        labsModalMode === "order" &&
        !canEditUnpaidLabOrders &&
        pkgNum != null &&
        requestedPackageIdSet.has(pkgNum) &&
        !selectedLabPackageIds.has(pkg.id)
      ) {
        return;
      }
      const remainingPackageIds = new Set(selectedLabPackageIds);
      if (wasOn) remainingPackageIds.delete(pkg.id);
      else remainingPackageIds.add(pkg.id);
      setSelectedLabPackageIds((prev) => {
        const next = new Set(prev);
        if (wasOn) next.delete(pkg.id);
        else next.add(pkg.id);
        return next;
      });
      if (pkg.labTestIds.length > 0) {
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
      }
      applyPackageImagingToConsultation(
        remainingPackageIds,
        wasOn ? { removedPackage: pkg } : undefined,
      );
    },
    [selectedLabPackageIds, labCatalogTests, applyPackageImagingToConsultation, labsModalMode, requestedPackageIdSet, isNew, canEditUnpaidLabOrders, paidLockedPackageNums],
  );

  const syncStructuredPrescription = useCallback(async () => {
    const withProducts = medicationLines.filter(
      (l) => l.productId.trim() !== "" && !l.dispensedLocked,
    );
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
      const sig =
        u?.user_id != null ? await fetchPhysicianSignatureBytes(u.user_id) : { bytes: null, contentType: null };
      const ok = await openPrescriptionPrintWindow({
        patient,
        physician: {
          fullname,
          specialty,
          licenseNo,
          ptrNo,
          s2No,
          signatureBytes: sig.bytes,
          signatureContentType: sig.contentType,
        },
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

  const applyAddLabPackage = useCallback(
    (pkg: LabPackageWithTests) => {
      const nextPackageIds = new Set(selectedLabPackageIds).add(pkg.id);
      setSelectedLabPackageIds(nextPackageIds);
      if (pkg.labTestIds.length > 0) {
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
      }
      applyPackageImagingToConsultation(nextPackageIds);
    },
    [labCatalogTests, applyPackageImagingToConsultation, selectedLabPackageIds],
  );

  const addLabPackageFromDropdown = useCallback(
    (packageId: string) => {
      const pkg = labPackages.find((p) => p.id === packageId);
      if (!pkg || !labPackageHasMembers(pkg)) return;
      if (selectedLabPackageIds.has(pkg.id)) return;
      const pkgNum = parseLabRequestPackageId(pkg.id);
      if (
        !isNew &&
        labsModalMode === "order" &&
        !canEditUnpaidLabOrders &&
        pkgNum != null &&
        requestedPackageIdSet.has(pkgNum)
      ) {
        return;
      }

      const catalogForImaging =
        imagingCatalog.length > 0 ? imagingCatalog : imagingCatalogRef.current;
      const conflict = getLabPackageAddConflicts(pkg, {
        selectedTestIds: selectedLabTestIds,
        testsCoveredByOtherSelectedPackages: testsCoveredBySelectedPackages,
        imagingForm,
        imagingCoveredByOtherPackages: imagingCatalogCodesCoveredByPackages(
          labPackages,
          selectedLabPackageIds,
          catalogForImaging,
        ),
        encounterImagingCodes: encounterImagingCatalogCodes,
        labCatalog: labCatalogTests,
        imagingCatalog: catalogForImaging,
      });

      if (hasLabPackageAddConflicts(conflict)) {
        setPackageAddConfirm({ pkg, ...conflict });
        return;
      }
      applyAddLabPackage(pkg);
    },
    [
      labPackages,
      selectedLabPackageIds,
      selectedLabTestIds,
      testsCoveredBySelectedPackages,
      imagingForm,
      imagingCatalog,
      encounterImagingCatalogCodes,
      labCatalogTests,
      applyAddLabPackage,
      labsModalMode,
      requestedPackageIdSet,
      isNew,
      canEditUnpaidLabOrders,
    ],
  );

  const testsCoveredByEncounterPackages = useMemo(() => {
    const s = new Set<string>();
    for (const req of encounterLabRequests) {
      for (const tid of req.package_covered_test_ids ?? []) {
        s.add(tid);
        for (const t of expandPanelTestIds([tid], labCatalogTests)) s.add(t);
      }
    }
    return s;
  }, [encounterLabRequests, labCatalogTests]);

  const testsCoveredByPackagesForCatalog = useMemo(() => {
    const s = new Set(testsCoveredBySelectedPackages);
    for (const id of testsCoveredByEncounterPackages) s.add(id);
    return s;
  }, [testsCoveredBySelectedPackages, testsCoveredByEncounterPackages]);

  const orderedEncounterPackages = useMemo(() => {
    const seen = new Set<number>();
    const out: Array<{ numericId: number; name: string; package_price: number }> = [];
    for (const req of encounterLabRequests) {
      for (const lp of req.lab_packages ?? []) {
        const numericId = parseLabRequestPackageId(lp.id);
        if (numericId == null || seen.has(numericId)) continue;
        seen.add(numericId);
        const catalogId = catalogPackageIdForNumericId(labPackages, numericId);
        const catalogPkg = catalogId ? labPackages.find((p) => p.id === catalogId) : undefined;
        out.push({
          numericId,
          name: catalogPkg?.name ?? lp.name ?? `Package #${numericId}`,
          package_price: catalogPkg?.package_price ?? lp.package_price ?? 0,
        });
      }
    }
    return out;
  }, [encounterLabRequests, labPackages]);

  const savedEncounterPackageIds = useMemo(
    () => encounterLabRequests.flatMap((r) => r.lab_packages ?? []),
    [encounterLabRequests],
  );

  const imagingCoveredByPackages = useMemo(() => {
    const catalog = imagingCatalog.length > 0 ? imagingCatalog : imagingCatalogRef.current;
    if (isNew) {
      return imagingCatalogCodesCoveredByPackages(labPackages, selectedLabPackageIds, catalog);
    }
    return imagingCatalogCodesCoveredByActivePackages(
      labPackages,
      selectedLabPackageIds,
      savedEncounterPackageIds,
      catalog,
    );
  }, [labPackages, selectedLabPackageIds, savedEncounterPackageIds, imagingCatalog, isNew]);

  /** Imaging in a currently selected package: checked and not individually toggleable. */
  const imagingLockedBySelectedPackages = useMemo(() => {
    const catalog = imagingCatalog.length > 0 ? imagingCatalog : imagingCatalogRef.current;
    return imagingCatalogCodesCoveredByPackages(labPackages, selectedLabPackageIds, catalog);
  }, [labPackages, selectedLabPackageIds, imagingCatalog]);

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
      const pkgNum = parseLabRequestPackageId(pkg.id);
      if (pkgNum != null && requestedPackageIdSet.has(pkgNum)) continue;
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
      if (encounterImagingCatalogCodes.has(c.code)) continue;
      if (imagingLockedBySelectedPackages.has(c.code)) continue;
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
    requestedPackageIdSet,
    selectedLabTestIds,
    selectedLabPackageIds,
    labPackages,
    labCatalogTests,
    labPriceByTestId,
    testsCoveredBySelectedPackages,
    imagingLockedBySelectedPackages,
    imagingCatalog,
    imagingForm,
    encounterImagingCatalogCodes,
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

  const canViewImagingResults = useMemo(
    () => encounterImagingRequestIds.some((id) => imagingRequestIdsWithResults.has(id)),
    [encounterImagingRequestIds, imagingRequestIdsWithResults],
  );

  const viewResultsImagingRequestId = useMemo(() => {
    for (const id of encounterImagingRequestIds) {
      if (imagingRequestIdsWithResults.has(id)) return id;
    }
    return encounterImagingRequestIds[0] ?? "";
  }, [encounterImagingRequestIds, imagingRequestIdsWithResults]);

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

  const openImagingResultsModal = useCallback((imagingRequestId: string) => {
    const id = String(imagingRequestId ?? "").trim();
    if (!id) return;
    setImagingResultsError("");
    setImagingResultsHeader(null);
    setImagingResultsItems([]);
    setImagingResultsRequestId(id);
    setImagingResultsModalOpen(true);
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

  useEffect(() => {
    if (!imagingResultsModalOpen) return;
    const id = imagingResultsRequestId.trim();
    if (!id) return;
    let cancelled = false;
    setImagingResultsLoading(true);
    setImagingResultsError("");
    void (async () => {
      try {
        const res = await authenticatedFetch(
          `/api/imaging/imaging-request?imagingRequestId=${encodeURIComponent(id)}`,
          { cache: "no-store" },
        );
        const json = (await res.json().catch(() => ({}))) as {
          error?: string;
          header?: ImagingRequestHeaderView;
          items?: ImagingRequestItemRow[];
        };
        if (cancelled) return;
        if (!res.ok) {
          setImagingResultsError(json.error ?? `Request failed (${res.status})`);
          setImagingResultsHeader(null);
          setImagingResultsItems([]);
          return;
        }
        setImagingResultsHeader(json.header ?? null);
        setImagingResultsItems(Array.isArray(json.items) ? json.items : []);
      } catch {
        if (cancelled) return;
        setImagingResultsError("Failed to load imaging results.");
        setImagingResultsHeader(null);
        setImagingResultsItems([]);
      } finally {
        if (!cancelled) setImagingResultsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [imagingResultsModalOpen, imagingResultsRequestId]);

  const labDialogFooterHint = useMemo(() => {
    if (labsModalMode === "amend") {
      const n = selectedLabTestIds.size;
      if (n === 0) return "Select tests for this order";
      return `${n} test${n === 1 ? "" : "s"} · ${money2(labSelectedTotal)} (balance settled at cashier if changed)`;
    }
    if (isNew || canEditUnpaidLabOrders) {
      const nTests = selectedLabTestIds.size;
      const nPkgs = selectedLabPackageIds.size;
      if (nTests === 0 && nPkgs === 0) return "Select tests or packages to request";
      const parts: string[] = [];
      if (nPkgs > 0) parts.push(`${nPkgs} package${nPkgs === 1 ? "" : "s"}`);
      if (nTests > 0) parts.push(`${nTests} test${nTests === 1 ? "" : "s"}`);
      const suffix = canEditUnpaidLabOrders && !isNew ? " (balance settled at cashier if changed)" : "";
      return `${parts.join(" · ")} · ${money2(labSelectedTotal)}${suffix}`;
    }
    const nReq = requestedTestIdSet.size;
    const nNew = selectedLabTestIds.size;
    if (nReq === 0 && nNew === 0) return "Select tests to request";
    if (nReq === 0) return `${nNew} test${nNew === 1 ? "" : "s"} selected · ${money2(labSelectedTotal)}`;
    if (nNew === 0) return `${nReq} already requested — select more to add another request`;
    return `${nReq} already requested · ${nNew} new selected · ${money2(labSelectedTotal)}`;
  }, [labsModalMode, isNew, canEditUnpaidLabOrders, requestedTestIdSet, selectedLabTestIds, selectedLabPackageIds, labSelectedTotal]);

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
        labSelectionBaselineRef.current = labSelectionSnapshot(selectedLabTestIds, selectedLabPackageIds);
        labsBaselineCapturedRef.current = true;
        setUnsavedCloseDialog(null);
        setLabsModalOpen(false);
        setLabsModalMode("order");
        setLabSubmitting(false);
        void (async () => {
          const encRefresh = await fetchLabRequestsForEncounter(transId);
          if (!encRefresh.error) {
            setEncounterLabRequests(encRefresh.requests);
            setRequestedTestIdSet(new Set(encRefresh.requestedTestIds));
            setRequestedPackageIdSet(new Set(encRefresh.requestedPackageIds));
            encounterLabSnapshotRef.current = { transId, result: encRefresh, stale: false };
            await syncPaidAndResultsFromRequestIds(
              encRefresh.requests.map((r) => r.id).filter(Boolean),
              undefined,
              encRefresh.storedItems,
            );
          }
          window.dispatchEvent(new CustomEvent("lifehub:lab-requests-updated", { detail: { transId } }));
        })();
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
        const packageIds = [...selectedLabPackageIds]
          .map((pid) => parseLabRequestPackageId(pid))
          .filter((n): n is number => n != null);
        const res = await authenticatedFetch("/api/consultation/diagnostic-amend/imaging", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            encounterId: transId,
            imagingRequestId,
            selection: imagingForm,
            packageIds,
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
        await refreshEncounterImagingCatalogCodes(encounterImagingRequestIds);
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
      selectedLabPackageIds,
      patientPayloadForAmend,
      transId,
      syncPaidImagingForEncounter,
      refreshEncounterImagingCatalogCodes,
      encounterImagingRequestIds,
    ],
  );

  const openLabAmendModal = useCallback(async () => {
    const labRequestId = primaryPaidLabRequestId.trim();
    if (!labRequestId) return;
    setLabsModalMode("amend");
    setLabDialogError("");
    setLabsModalOpen(true);
    setLabTestsLoading(true);
    setLabPricesLoading(false);
    try {
      const [catalogRes, stored] = await Promise.all([
        getCachedLabCatalogAndPackages(),
        fetchLabRequestItemsForRequestIds(supabase, [labRequestId]),
      ]);
      const catalogFromFetch = catalogRes.catalogError
        ? []
        : catalogRes.sections.flatMap((s) => s.tests);
      if (!catalogRes.catalogError) {
        setLabSections(catalogRes.sections);
        const allTestIds = catalogFromFetch.map((t) => t.id);
        setLabPricesLoading(true);
        void fetchActiveLabPricesByTestIds(allTestIds).then((pricesAll) => {
          if (!pricesAll.error) setLabPriceByTestId(pricesAll.pricesByTestId);
          setLabPricesLoading(false);
        });
      }
      if (!catalogRes.packagesError) {
        setLabPackages(catalogRes.packages);
      }
      const billable = stored.items.filter((i) => i.is_billable).map((i) => i.lab_test_id);
      const testSet = new Set(collapseComponentsToPanel(billable, catalogFromFetch));
      const req = encounterLabRequests.find((r) => r.id === labRequestId);
      const { map: pkgMap, error: pkgMapErr } = await fetchLabRequestPackageIdsByRequestIdMap(
        supabase,
        [labRequestId],
      );
      const junctionPkgIds = pkgMapErr ? [] : (pkgMap.get(labRequestId) ?? []);
      const labPackagesOnRequest =
        req?.lab_packages != null && req.lab_packages.length > 0
          ? req.lab_packages
          : junctionPkgIds.map((id) => ({
              id,
              name: "",
              description: null as string | null,
              package_price: 0,
            }));
      const amendSummary: EncounterLabRequestSummary = req
        ? { ...req, lab_packages: labPackagesOnRequest }
        : {
            id: labRequestId,
            request_date: "",
            request_time: null,
            priority: "Routine",
            clinical_diagnosis: null,
            remarks: null,
            created_at: "",
            labTestIds: billable,
            lab_packages: labPackagesOnRequest,
            package_covered_test_ids: [],
          };
      const pkgSet = restoreLabPackageCatalogIdsFromRequests(catalogRes.packages, [amendSummary]);
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

    if (!isNew && canEditUnpaidLabOrders) {
      const { labTestIds: labTestIdsToSave, packageIds: packageIdsToSave } = computeUnpaidLabSavePayload(
        selectedLabTestIds,
        selectedLabPackageIds,
        paidLockedTestIds,
        paidLockedPackageNums,
        labPackages,
        labCatalogTests,
      );
      const unchanged =
        labSelectionSnapshot(selectedLabTestIds, selectedLabPackageIds) ===
        labSelectionBaselineRef.current;
      if (unchanged) {
        setLabSubmitting(false);
        setLabDialogError("No changes to save.");
        return;
      }
      const delUnpaid = await deleteUnpaidLabRequestsForEncounter(transId);
      if (delUnpaid.error) {
        setLabSubmitting(false);
        setLabDialogError(delUnpaid.error);
        return;
      }
      if (labTestIdsToSave.length > 0 || packageIdsToSave.length > 0) {
        const { error } = await createLabRequestWithItems({
          encounterId: transId,
          patientId: parsePatientIdForLab(patient.patientId),
          referringPhysician: patient.referringPhysician?.trim() ? patient.referringPhysician.trim() : null,
          physicianId,
          priority: labRequestPriority,
          clinicalDiagnosis: diagTrim !== "" ? diagTrim : null,
          remarks: remarksTrim !== "" ? remarksTrim : null,
          labTestIds: labTestIdsToSave,
          itemPriority: labRequestPriority,
          packageIds: packageIdsToSave,
          skipEncounterValidation: true,
        });
        if (error) {
          setLabSubmitting(false);
          setLabDialogError(error);
          return;
        }
      }
      const activePkgNums = packageIdsToSave;
      const lockedCodes = imagingCatalogCodesCoveredByPackages(
        labPackages,
        selectedLabPackageIds,
        imagingCatalog.length > 0 ? imagingCatalog : imagingCatalogRef.current,
      );
      const individualIds = new Set<string>();
      const catalogForImaging =
        imagingCatalog.length > 0 ? imagingCatalog : imagingCatalogRef.current;
      for (const c of catalogForImaging) {
        if (!c.id || !c.code) continue;
        if (!imagingForm[c.code]?.checked) continue;
        if (lockedCodes.has(c.code)) continue;
        individualIds.add(c.id);
      }
      await pruneUnpaidEncounterImagingToSelection(transId, activePkgNums, individualIds);
      setLabToastMessage("Lab Request Saved");
      setLabToastOpen(true);
      setUnsavedCloseDialog(null);
      setLabsModalOpen(false);
      setLabsModalMode("order");
      setLabSubmitting(false);
      void (async () => {
        const encRefresh = await fetchLabRequestsForEncounter(transId);
        if (encRefresh.error) return;
        setEncounterLabRequests(encRefresh.requests);
        setEncounterLabStoredItems(encRefresh.storedItems);
        setRequestedTestIdSet(new Set(encRefresh.requestedTestIds));
        setRequestedPackageIdSet(new Set(encRefresh.requestedPackageIds));
        encounterLabSnapshotRef.current = { transId, result: encRefresh, stale: false };
        setLabEncounterError("");
        await syncPaidAndResultsFromRequestIds(
          encRefresh.requests.map((r) => r.id).filter(Boolean),
          undefined,
          encRefresh.storedItems,
        );
        window.dispatchEvent(new CustomEvent("lifehub:lab-requests-updated", { detail: { transId } }));
        window.dispatchEvent(new CustomEvent("lifehub:imaging-updated", { detail: { transId } }));
        const restored = hydrateLabSelectionFromEncounter(
          encRefresh.requests,
          labPackages,
          labCatalogTests,
        );
        setSelectedLabTestIds(restored.testIds);
        setSelectedLabPackageIds(restored.packageIds);
        labSelectionBaselineRef.current = labSelectionSnapshot(restored.testIds, restored.packageIds);
      })();
      return;
    }

    const encounterOrderState = {
      labTestIds: requestedTestIdSet,
      packageIds: requestedPackageIdSet,
      imagingCatalogIds: new Set<string>(),
      imagingCatalogCodes: encounterImagingCatalogCodes,
    };
    const labTestIdsToSave = isNew
      ? collapseComponentsToPanel([...selectedLabTestIds], labCatalogTests)
      : filterNewLabTestIds(selectedLabTestIds, encounterOrderState, labCatalogTests);
    const packageIdsToSave = isNew ? packageIds : filterNewPackageIds(packageIds, encounterOrderState);
    if (!isNew && labTestIdsToSave.length === 0 && packageIdsToSave.length === 0) {
      setLabSubmitting(false);
      setLabDialogError("All selected tests and packages are already ordered on this visit.");
      return;
    }

    if (labTestIdsToSave.length > 0 || packageIdsToSave.length > 0) {
      const { error } = await createLabRequestWithItems({
        encounterId: transId,
        patientId: parsePatientIdForLab(patient.patientId),
        referringPhysician: patient.referringPhysician?.trim() ? patient.referringPhysician.trim() : null,
        physicianId,
        priority: labRequestPriority,
        clinicalDiagnosis: diagTrim !== "" ? diagTrim : null,
        remarks: remarksTrim !== "" ? remarksTrim : null,
        labTestIds: labTestIdsToSave,
        itemPriority: labRequestPriority,
        packageIds: packageIdsToSave,
        skipEncounterValidation: isNew,
      });
      if (error) {
        setLabSubmitting(false);
        setLabDialogError(error);
        return;
      }
    }

    setLabToastMessage("Lab Request Saved");
    setLabToastOpen(true);
    setUnsavedCloseDialog(null);
    setLabsModalOpen(false);
    setLabsModalMode("order");
    labsBaselineCapturedRef.current = true;
    if (isNew) {
      labSelectionBaselineRef.current = labSelectionSnapshot(selectedLabTestIds, selectedLabPackageIds);
    } else {
      setSelectedLabTestIds(new Set());
      setSelectedLabPackageIds(new Set());
      labSelectionBaselineRef.current = labSelectionSnapshot(new Set(), new Set());
    }
    setLabSubmitting(false);

    void (async () => {
      const encRefresh = await fetchLabRequestsForEncounter(transId);
      if (encRefresh.error) return;
      setEncounterLabRequests(encRefresh.requests);
      setEncounterLabStoredItems(encRefresh.storedItems);
      setRequestedTestIdSet(new Set(encRefresh.requestedTestIds));
      setRequestedPackageIdSet(new Set(encRefresh.requestedPackageIds));
      encounterLabSnapshotRef.current = { transId, result: encRefresh, stale: false };
      setLabEncounterError("");
      await syncPaidAndResultsFromRequestIds(
        encRefresh.requests.map((r) => r.id).filter(Boolean),
        undefined,
        encRefresh.storedItems,
      );
      window.dispatchEvent(new CustomEvent("lifehub:lab-requests-updated", { detail: { transId } }));
      if (isNew) {
        const restored = hydrateLabSelectionFromEncounter(
          encRefresh.requests,
          labPackages,
          labCatalogTests,
        );
        setSelectedLabTestIds(restored.testIds);
        setSelectedLabPackageIds(restored.packageIds);
        labSelectionBaselineRef.current = labSelectionSnapshot(restored.testIds, restored.packageIds);
      }
    })();
  }, [
    transId,
    patient.patientId,
    patient.referringPhysician,
    profile,
    selectedLabTestIds,
    isNew,
    canEditUnpaidLabOrders,
    syncPaidAndResultsFromRequestIds,
    labClinicalDiagnosis,
    labRequestRemarks,
    labRequestPriority,
    selectedLabPackageIds,
    labCatalogTests,
    labPackages,
    requestedTestIdSet,
    requestedPackageIdSet,
    encounterImagingCatalogCodes,
    paidLockedTestIds,
    paidLockedPackageNums,
    imagingForm,
    imagingCatalog,
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
                        if (c) {
                          const viewId = viewResultsImagingRequestId.trim();
                          if (canViewImagingResults && viewId) {
                            openImagingResultsModal(viewId);
                          } else {
                            setImagingModalMode("order");
                            setImagingModalOpen(true);
                          }
                        } else setImagingModalOpen(false);
                      }}
                    />
                  }
                  label="IMAGING"
                  sx={consultFormControlLabelSx}
                />
                {(form.plan_imaging || encounterImagingRequestIds.length > 0) && !loading ? (
                  <Stack spacing={0.25} sx={{ ml: 0.5 }}>
                    <Button
                      type="button"
                      variant="text"
                      size="small"
                      onClick={() => {
                        if (canViewImagingResults && viewResultsImagingRequestId) {
                          openImagingResultsModal(viewResultsImagingRequestId);
                          return;
                        }
                        setImagingModalMode("order");
                        setImagingModalOpen(true);
                      }}
                      sx={{ textTransform: "uppercase", minWidth: "auto", py: 0.25, px: 0.75 }}
                    >
                      {canViewImagingResults ? "View result" : "View studies"}
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

          <Typography {...sectionLabelProps} sx={{ mt: 3 }} id={followUpDateLabelId}>
            FOLLOW-UP DATE:
          </Typography>
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={1}
            alignItems={{ xs: "stretch", sm: "center" }}
            sx={{ maxWidth: 360 }}
          >
            <TextField
              type="date"
              size="small"
              fullWidth
              hiddenLabel
              variant="outlined"
              value={form.follow_up_date}
              disabled={loading}
              aria-labelledby={followUpDateLabelId}
              InputLabelProps={{ shrink: true }}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  follow_up_date: e.target.value.slice(0, 10),
                }))
              }
              sx={notesFieldSx}
            />
            <Button
              size="small"
              variant="text"
              disabled={loading || form.follow_up_date === ""}
              onClick={() => setForm((f) => ({ ...f, follow_up_date: "" }))}
              sx={{ flexShrink: 0, alignSelf: { xs: "flex-start", sm: "center" } }}
            >
              Clear
            </Button>
          </Stack>
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
              {(labPackages.length > 0 ||
                (labsModalMode === "order" && orderedEncounterPackages.length > 0)) ? (
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
                  {labsModalMode === "order" &&
                  !isNew &&
                  !canEditUnpaidLabOrders &&
                  orderedEncounterPackages.length > 0 ? (
                    <Box sx={{ mb: 1.5 }}>
                      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.75 }}>
                        Packages on this visit
                      </Typography>
                      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75 }}>
                        {orderedEncounterPackages.map((pkg) => (
                          <Chip
                            key={pkg.numericId}
                            label={`${pkg.name} · ${money2(pkg.package_price)}`}
                            size="small"
                            variant="outlined"
                            sx={{ fontWeight: 600 }}
                          />
                        ))}
                      </Box>
                      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.75 }}>
                        Already ordered on this visit
                      </Typography>
                    </Box>
                  ) : null}
                  {labPackages.length > 0 ? (
                    <>
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
                      {labPackages.map((pkg) => {
                        const pkgNum = parseLabRequestPackageId(pkg.id);
                        const alreadyOnEncounter =
                          !isNew &&
                          !canEditUnpaidLabOrders &&
                          labsModalMode === "order" &&
                          pkgNum != null &&
                          requestedPackageIdSet.has(pkgNum);
                        return (
                        <MenuItem
                          key={pkg.id}
                          value={pkg.id}
                          disabled={selectedLabPackageIds.has(pkg.id) || alreadyOnEncounter}
                          sx={{ alignItems: "flex-start", whiteSpace: "normal", py: 1 }}
                        >
                          <Box sx={{ display: "flex", justifyContent: "space-between", gap: 2, width: "100%" }}>
                            <Box sx={{ minWidth: 0 }}>
                              <Typography variant="body2" fontWeight={700}>
                                {pkg.name}
                              </Typography>
                              {alreadyOnEncounter ? (
                                <Typography variant="caption" color="text.secondary">
                                  Already ordered on this visit
                                </Typography>
                              ) : null}
                            </Box>
                            <Typography variant="caption" fontWeight={800} sx={{ flexShrink: 0 }}>
                              {money2(pkg.package_price)}
                            </Typography>
                          </Box>
                        </MenuItem>
                        );
                      })}
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
                          .map((pkg) => {
                            const pkgNum = parseLabRequestPackageId(pkg.id);
                            const paidLocked = pkgNum != null && paidLockedPackageNums.has(pkgNum);
                            return (
                            <Chip
                              key={pkg.id}
                              label={`${pkg.name} · ${money2(pkg.package_price)}`}
                              size="small"
                              onDelete={paidLocked ? undefined : () => toggleLabPackageSelection(pkg)}
                              sx={{ fontWeight: 600 }}
                            />
                            );
                          })}
                      </Box>
                    </Box>
                  ) : null}
                    </>
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
              pricesLoading={labPricesLoading}
              testsCoveredByPackages={
                isNew || canEditUnpaidLabOrders
                  ? testsCoveredBySelectedPackages
                  : testsCoveredByPackagesForCatalog
              }
              testsLockedByPackage={testsCoveredBySelectedPackages}
              lockedTestIds={labCatalogLockedTestIds}
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
              disabled={
                labTestsLoading ||
                labSubmitting ||
                (labsModalMode === "order" &&
                  (isNew || canEditUnpaidLabOrders
                    ? labSelectionSnapshot(selectedLabTestIds, selectedLabPackageIds) ===
                      labSelectionBaselineRef.current
                    : selectedLabTestIds.size === 0 && selectedLabPackageIds.size === 0))
              }
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
        open={imagingResultsModalOpen}
        onClose={() => setImagingResultsModalOpen(false)}
        maxWidth="lg"
        fullWidth
        aria-labelledby="plans-imaging-results-dialog-title"
        slotProps={{
          paper: {
            sx: { maxHeight: "92vh" },
          },
        }}
      >
        <DialogTitle
          id="plans-imaging-results-dialog-title"
          sx={{
            fontWeight: 800,
            textAlign: "center",
            letterSpacing: "0.08em",
            bgcolor: "info.main",
            color: "info.contrastText",
            py: 1.5,
          }}
        >
          IMAGING RESULTS
        </DialogTitle>
        <DialogContent dividers sx={{ px: { xs: 2, sm: 2.5 }, py: 2, overflow: "auto" }}>
          {imagingResultsError ? (
            <Alert severity="error" sx={{ mb: 2 }} onClose={() => setImagingResultsError("")}>
              {imagingResultsError}
            </Alert>
          ) : null}
          {imagingResultsLoading ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
              <CircularProgress size={32} />
            </Box>
          ) : imagingResultsItems.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              No imaging results found for this request.
            </Typography>
          ) : (
            <>
              {imagingResultsHeader ? (
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  {(imagingResultsHeader.patient_name ?? "").trim() || "Patient"}
                  {imagingResultsHeader.queue_display
                    ? ` · Queue ${imagingResultsHeader.queue_display}`
                    : ""}
                  {` · ${imagingResultsHeader.request_date}`}
                  {imagingResultsHeader.request_time ? ` ${imagingResultsHeader.request_time}` : ""}
                </Typography>
              ) : null}
              <TableContainer>
                <Table size="small" sx={{ "& th, & td": { verticalAlign: "top" } }}>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 800 }}>Study</TableCell>
                      <TableCell sx={{ fontWeight: 800 }}>View</TableCell>
                      <TableCell sx={{ fontWeight: 800 }}>Findings</TableCell>
                      <TableCell sx={{ fontWeight: 800 }}>Impression</TableCell>
                      <TableCell align="center" sx={{ fontWeight: 800 }}>
                        Image
                      </TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {imagingResultsItems.map((it) => {
                      const hasImage = Boolean((it.image_storage_path ?? "").trim());
                      return (
                        <TableRow key={it.id} hover>
                          <TableCell sx={{ fontWeight: 700 }}>{it.study_name}</TableCell>
                          <TableCell>{(it.view_text ?? "").trim() || "—"}</TableCell>
                          <TableCell sx={{ whiteSpace: "pre-wrap", wordBreak: "break-word", maxWidth: 280 }}>
                            {(it.findings ?? "").trim() || "—"}
                          </TableCell>
                          <TableCell sx={{ whiteSpace: "pre-wrap", wordBreak: "break-word", maxWidth: 220 }}>
                            {(it.remarks ?? "").trim() || "—"}
                          </TableCell>
                          <TableCell align="center" sx={{ verticalAlign: "middle" }}>
                            <ImagingStudyImageUpload
                              itemId={it.id}
                              resultReceived={isImagingItemResultReceived(it.status) || hasImage}
                              readOnly
                              hasImage={hasImage}
                              originalFilename={it.image_original_filename}
                              onError={(msg) => setImagingResultsError(msg)}
                            />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            </>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 2, py: 1.5, justifyContent: "space-between", flexWrap: "wrap", gap: 1 }}>
          <Typography variant="caption" color="text.secondary" sx={{ mr: "auto" }}>
            Request ID:{" "}
            <Box component="span" sx={{ fontFamily: "monospace" }}>
              {imagingResultsRequestId}
            </Box>
          </Typography>
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
            <Button
              type="button"
              variant="outlined"
              startIcon={<CameraAltOutlinedIcon />}
              onClick={() => {
                const id = imagingResultsRequestId.trim();
                if (!id) return;
                window.open(
                  `/imaging/results?imagingRequestId=${encodeURIComponent(id)}`,
                  "_blank",
                  "noopener,noreferrer",
                );
              }}
              sx={{ textTransform: "none" }}
            >
              Open in Imaging Results
            </Button>
            <Button
              onClick={() => setImagingResultsModalOpen(false)}
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
                const lockedByPackage = imagingLockedBySelectedPackages.has(c.code);
                const coveredByPackage = imagingCoveredByPackages.has(c.code);
                const alreadyOnEncounter =
                  !isNew &&
                  imagingModalMode === "order" &&
                  encounterImagingCatalogCodes.has(c.code);
                const label = (c.view_field_label ?? "VIEW").trim() || "VIEW";
                return (
                  <Box key={c.code}>
                    <FormControlLabel
                      sx={imagingCheckboxLabelSx}
                      control={
                        <Checkbox
                          size="small"
                          checked={
                            alreadyOnEncounter || lockedByPackage
                              ? true
                              : row.checked
                          }
                          disabled={alreadyOnEncounter || lockedByPackage}
                          onChange={(_, checked) => {
                            if (alreadyOnEncounter || lockedByPackage) return;
                            setImagingForm((prev) => ({
                              ...prev,
                              [c.code]: { ...(prev[c.code] ?? { checked: false, view: "" }), checked },
                            }));
                          }}
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
                          <Typography
                            component="span"
                            variant="caption"
                            sx={{
                              fontWeight: 800,
                              whiteSpace: "nowrap",
                              color: lockedByPackage || coveredByPackage || alreadyOnEncounter ? "text.secondary" : undefined,
                              fontStyle: lockedByPackage || coveredByPackage || alreadyOnEncounter ? "italic" : undefined,
                            }}
                          >
                            {alreadyOnEncounter
                              ? "Already ordered on this visit"
                              : lockedByPackage
                                ? "Included in package"
                                : coveredByPackage
                                  ? "Included in package"
                                  : money2(Number(c.default_price))}
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
                const catalogForSave =
                  imagingCatalog.length > 0 ? imagingCatalog : imagingCatalogRef.current;

                if (isNew) {
                  const del = await deleteImagingRequestsForEncounter(transId);
                  if (del.error) {
                    setImagingCatalogError(del.error);
                    return;
                  }
                }

                const encounterOrderState = {
                  labTestIds: requestedTestIdSet,
                  packageIds: requestedPackageIdSet,
                  imagingCatalogIds: new Set<string>(),
                  imagingCatalogCodes: encounterImagingCatalogCodes,
                };
                const selectionToSave = isNew
                  ? imagingForm
                  : filterNewImagingSelection(imagingForm, encounterOrderState, catalogForSave);
                const lines = buildImagingRequestLinesFromCatalog(catalogForSave, selectionToSave);
                if (lines.length > 0 && imagingSelectionHasChecked(selectionToSave)) {
                  const patientId = Number(patient.patientId);
                  if (Number.isFinite(patientId)) {
                    const packageIds = [...selectedLabPackageIds]
                      .map((pid) => parseLabRequestPackageId(pid))
                      .filter((n): n is number => n != null);
                    const imgRes = await authenticatedFetch("/api/imaging/imaging-request", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        encounterId: transId,
                        patientId,
                        selection: selectionToSave,
                        remarks: "Consultation imaging order",
                        packageIds,
                      }),
                    });
                    const imgJson = (await imgRes.json().catch(() => ({}))) as { error?: string };
                    if (!imgRes.ok || imgJson.error) {
                      setImagingCatalogError(imgJson.error ?? "Could not save imaging request.");
                      return;
                    }
                  }
                } else if (
                  !isNew &&
                  imagingModalMode === "order" &&
                  imagingSelectionHasChecked(imagingForm)
                ) {
                  setImagingCatalogError("All selected imaging studies are already ordered on this visit.");
                  return;
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
              {medicationLines.some((l) => l.dispensedLocked) ? (
                <Alert severity="info" sx={{ mb: 2 }}>
                  Dispensed items cannot be changed. You can add new medications below.
                </Alert>
              ) : null}
              {medVisitSettledHint && !medicationLines.some((l) => l.dispensedLocked) ? (
                <Alert severity="info" sx={{ mb: 2 }}>
                  Visit charges may already be settled; new medications are sent to pharmacy separately.
                </Alert>
              ) : null}
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
                <Grid size={{ sm: 3 }}>
                  <Typography variant="caption" fontWeight={700} color="info.main" sx={{ letterSpacing: "0.06em" }}>
                    SIG
                  </Typography>
                </Grid>
                <Grid size={{ sm: 2 }} sx={{ minWidth: 92 }} />
              </Grid>
              {medicationLines.map((line, idx) => {
                const selected = line.productId ? (productCache[line.productId] ?? null) : null;
                const lineFilled = isMedicationLineFilled(line);
                const rowLocked = line.dispensedLocked === true;
                return (
                  <Box key={line.key} sx={{ mb: 1.75 }}>
                    <Grid container spacing={1.5} alignItems="flex-start">
                      <Grid size={{ xs: 12, sm: 5 }}>
                        {rowLocked ? (
                          <TextField
                            size="small"
                            fullWidth
                            label="Product"
                            value={
                              selected
                                ? formatProductOptionLabel(selected)
                                : line.manualName.trim() || line.productId
                            }
                            disabled
                            sx={medicationOutlinedFieldSx}
                          />
                        ) : line.manualEntry ? (
                          <TextField
                            size="small"
                            fullWidth
                            label="Product name"
                            placeholder="Enter medication name"
                            value={line.manualName}
                            disabled={rowLocked}
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
                              if (rowLocked) return;
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
                        {!rowLocked ? (
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
                        ) : null}
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
                          disabled={rowLocked}
                          error={lineFilled && !rowLocked && !isValidMedicationQuantity(line.quantity)}
                          onChange={(e) =>
                            setMedicationLines((rows) =>
                              rows.map((r) => (r.key === line.key ? { ...r, quantity: e.target.value } : r)),
                            )
                          }
                          sx={medicationOutlinedFieldSx}
                        />
                      </Grid>
                      <Grid size={{ xs: 12, sm: 3 }} sx={{ mt: { xs: 1, sm: 0 } }}>
                        <MedicationSigField
                          label="Sig"
                          placeholder=" "
                          value={line.notes}
                          disabled={rowLocked}
                          onChange={(notes) =>
                            setMedicationLines((rows) =>
                              rows.map((r) => (r.key === line.key ? { ...r, notes } : r)),
                            )
                          }
                        />
                      </Grid>
                      <Grid
                        size={{ xs: 12, sm: 2 }}
                        sx={{
                          display: "flex",
                          alignItems: "flex-start",
                          justifyContent: { xs: "flex-end", sm: "flex-start" },
                          pt: { xs: rowLocked ? 0 : 0.5, sm: 1.75 },
                          minWidth: { sm: 92 },
                          flexShrink: 0,
                        }}
                      >
                        {rowLocked ? (
                          <Chip
                            label="Dispensed"
                            size="small"
                            color="success"
                            sx={{
                              fontWeight: 700,
                              flexShrink: 0,
                              maxWidth: "none",
                              "& .MuiChip-label": { overflow: "visible", whiteSpace: "nowrap", px: 1 },
                            }}
                          />
                        ) : (
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
                        )}
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

      <PackageSelectionConfirmDialog
        open={packageAddConfirm != null}
        packageName={packageAddConfirm?.pkg.name ?? ""}
        labTestNames={packageAddConfirm?.labTestNames ?? []}
        imagingStudyNames={packageAddConfirm?.imagingStudyNames ?? []}
        onCancel={() => setPackageAddConfirm(null)}
        onConfirm={() => {
          if (packageAddConfirm) applyAddLabPackage(packageAddConfirm.pkg);
          setPackageAddConfirm(null);
        }}
      />

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
