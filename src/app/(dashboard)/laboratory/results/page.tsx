"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import CampaignOutlinedIcon from "@mui/icons-material/CampaignOutlined";
import ReplayIcon from "@mui/icons-material/Replay";
import HistoryOutlinedIcon from "@mui/icons-material/HistoryOutlined";
import ScienceOutlinedIcon from "@mui/icons-material/ScienceOutlined";
import PrintOutlinedIcon from "@mui/icons-material/PrintOutlined";
import SaveOutlinedIcon from "@mui/icons-material/SaveOutlined";
import ClearOutlinedIcon from "@mui/icons-material/ClearOutlined";
import SmsOutlinedIcon from "@mui/icons-material/SmsOutlined";
import SearchIcon from "@mui/icons-material/Search";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  CircularProgress,
  Divider,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  FormControl,
  FormControlLabel,
  IconButton,
  InputAdornment,
  Menu,
  MenuItem,
  Select,
  Snackbar,
  Stack,
  TextField,
  TablePagination,
  Tooltip,
  Typography,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";

function formatLabRequestDateTime(requestDate: string, requestTime: string | null): string {
  const d = formatDateMMDDYYYY(requestDate);
  const t = formatLabTime(requestTime);
  if (!d) return t === "—" ? "—" : t;
  return t === "—" ? d : `${d} · ${t}`;
}

function formatSmsSentAt(value: string | null | undefined): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "—";
  const dt = new Date(raw);
  if (!Number.isFinite(dt.getTime())) return raw;
  return dt.toLocaleString();
}
import { commonFieldProps, fieldInputSx } from "@/components/fieldInputStyles";
import { FormFieldLabel } from "@/components/FormFieldLabel";
import type { QueueTicketStatus } from "@/lib/queueReception";
import type { LabQueueRow } from "@/app/api/laboratory/lab-queue/route";
import type { LabRequestHeaderView, LabRequestItemView } from "@/app/api/laboratory/lab-request/route";
import type { PatientPriorLabResultEntry } from "@/app/api/laboratory/patient-lab-history/route";
import { formatDateMMDDYYYY, formatLabTime, formatQueueTicketWhen } from "@/lib/dateDisplay";
import { authenticatedFetch } from "@/lib/authenticatedFetch";
import { recallQueueTicketAnnounce } from "@/lib/queueReception";
import { canRecallQueueTicket, recallQueueButtonTooltip } from "@/lib/queueRecall";
import { mergeAutoFlagIntoLabResultRow } from "@/lib/labResultAutoFlag";
import { compareLabTestSortOrder } from "@/lib/labTests";
import { openLabResultsPrintWindow } from "@/lib/labResultsPrint";
import { openLabTestChecklistPrintWindow } from "@/lib/labTestChecklistPrint";
import {
  categoryCollectState,
  isLabItemCollectedFlag,
} from "@/lib/labCategoryCollectUi";
import { labQueueDisplayChipColor } from "@/lib/labQueuePresentation";
import {
  canLabCallPatient,
  canOpenLabQueueRequest,
  canOpenLabResultsQueueTicket,
  isSpecimenCollectedOnTicket,
  labCallButtonTooltip,
  labQueueRequestButtonTooltip,
} from "@/lib/labQueueUi";

type LabResultCategorySection = {
  categoryId: string;
  categoryName: string;
  sortOrder: number;
  items: LabRequestItemView[];
};

function groupItemsByCategory(items: LabRequestItemView[]): LabResultCategorySection[] {
  const byCat = new Map<string, LabResultCategorySection>();
  for (const it of items) {
    const categoryId = String(it.category_id ?? "other").trim() || "other";
    const categoryName = (it.category_name ?? "Other").trim() || "Other";
    const sortOrder = it.category_sort_order ?? 9999;
    const existing = byCat.get(categoryId);
    if (existing) {
      existing.items.push(it);
    } else {
      byCat.set(categoryId, { categoryId, categoryName, sortOrder, items: [it] });
    }
  }
  for (const section of byCat.values()) {
    section.items.sort((a, b) =>
      compareLabTestSortOrder(
        { sort_order: a.test_sort_order, name: a.test_name, tieId: a.lab_test_id },
        { sort_order: b.test_sort_order, name: b.test_name, tieId: b.lab_test_id },
      ),
    );
  }
  return [...byCat.values()].sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.categoryName.localeCompare(b.categoryName, undefined, { sensitivity: "base" });
  });
}

function labResultItemMatchesQuery(
  it: LabRequestItemView,
  categoryName: string,
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const hay = [it.test_name, it.test_code, it.lab_test_id, it.specimen_type, categoryName]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return hay.includes(q);
}

function filterResultSections(
  sections: LabResultCategorySection[],
  query: string,
): LabResultCategorySection[] {
  const q = query.trim();
  if (!q) return sections;
  return sections
    .map((section) => {
      const items = section.items.filter((it) => labResultItemMatchesQuery(it, section.categoryName, q));
      return items.length > 0 ? { ...section, items } : null;
    })
    .filter((s): s is LabResultCategorySection => s != null);
}

type LabResultPersistRow = {
  lab_request_item_id?: string;
  result_value?: string | null;
  result_unit?: string | null;
  reference_range?: string | null;
  flag?: string | null;
  remarks?: string | null;
  status?: string | null;
};

async function persistLabResultItem(
  it: LabRequestItemView,
): Promise<{ ok: true; row: LabResultPersistRow } | { ok: false; error: string }> {
  const id = it.id.trim();
  if (!id) return { ok: false, error: "Missing lab request item id." };
  try {
    const res = await authenticatedFetch("/api/laboratory/lab-results", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        labRequestItemId: id,
        result_value: it.result_value ?? null,
        result_unit: it.result_unit ?? null,
        reference_range: it.reference_range ?? null,
        flag: it.flag ?? null,
        remarks: it.remarks ?? null,
        status: it.result_status ?? "Pending",
      }),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string; row?: LabResultPersistRow };
    if (!res.ok) {
      return { ok: false, error: json.error ?? `Request failed (${res.status})` };
    }
    if (!json.row?.lab_request_item_id?.trim()) {
      return { ok: false, error: "Save succeeded but no result row was returned." };
    }
    return { ok: true, row: json.row };
  } catch {
    return { ok: false, error: "Failed to save result." };
  }
}

function mergePersistedLabResultRow(
  item: LabRequestItemView,
  row: LabResultPersistRow,
  patientSex: string | null,
): LabRequestItemView {
  const rid = row.lab_request_item_id?.trim();
  if (!rid || item.id !== rid) return item;
  const next: LabRequestItemView = {
    ...item,
    result_value: row.result_value ?? null,
    result_unit: row.result_unit ?? null,
    reference_range: row.reference_range ?? null,
    flag: row.flag ?? null,
    remarks: row.remarks ?? null,
    result_status: row.status ?? item.result_status,
  };
  return mergeAutoFlagIntoLabResultRow(next, patientSex);
}

function isLabItemCollected(it: LabRequestItemView): boolean {
  return isLabItemCollectedFlag(it.collected_item);
}

export default function LabResultsPage() {
  const theme = useTheme();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [queueSearch, setQueueSearch] = useState("");
  const [debouncedQueueSearch, setDebouncedQueueSearch] = useState("");
  const [queueSearchLoading, setQueueSearchLoading] = useState(false);
  const [queueSearchError, setQueueSearchError] = useState("");
  const [queueSearchRows, setQueueSearchRows] = useState<LabQueueRow[]>([]);
  const [queueSearchCount, setQueueSearchCount] = useState(0);
  const [queueSearchPage, setQueueSearchPage] = useState(0);
  const [queueSearchPageSize, setQueueSearchPageSize] = useState(10);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rows, setRows] = useState<LabQueueRow[]>([]);
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);

  const [selectedRequestId, setSelectedRequestId] = useState<string>("");
  const [reqLoading, setReqLoading] = useState(false);
  const [reqError, setReqError] = useState("");
  const [reqItems, setReqItems] = useState<LabRequestItemView[]>([]);
  const [testSearchQuery, setTestSearchQuery] = useState("");
  const [reqHeader, setReqHeader] = useState<LabRequestHeaderView | null>(null);
  const [itemSavingId, setItemSavingId] = useState<string | null>(null);
  const [categoryCollectingId, setCategoryCollectingId] = useState<string | null>(null);
  const [categoryResultsSavingId, setCategoryResultsSavingId] = useState<string | null>(null);
  const [partialReleaseBusy, setPartialReleaseBusy] = useState(false);
  const [priorResultsLoading, setPriorResultsLoading] = useState(false);
  const [priorResults, setPriorResults] = useState<PatientPriorLabResultEntry[]>([]);
  const [priorMenu, setPriorMenu] = useState<{ anchorEl: HTMLElement; itemId: string } | null>(null);
  const [toastOpen, setToastOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [toastSeverity, setToastSeverity] = useState<"success" | "error">("success");
  const [sendSmsBusy, setSendSmsBusy] = useState(false);
  const [resendSmsDialogOpen, setResendSmsDialogOpen] = useState(false);

  const queueTicketStatusChip = (t: LabQueueRow) => {
    const label = t.lab_display_status ?? t.status;
    return { label, color: labQueueDisplayChipColor(label, t.status) };
  };

  const loadQueue = async () => {
    setError("");
    setLoading(true);
    try {
      const res = await authenticatedFetch("/api/laboratory/lab-queue", { cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as { error?: string; rows?: LabQueueRow[] };
      if (!res.ok) {
        setError(json.error ?? `Request failed (${res.status})`);
        setRows([]);
        return;
      }
      setRows(Array.isArray(json.rows) ? json.rows : []);
    } catch {
      setError("Failed to load LAB queue.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  const loadRequest = async (labRequestIdRaw: string) => {
    const labRequestId = (labRequestIdRaw ?? "").trim();
    setReqItems([]);
    setReqHeader(null);
    setReqError("");
    setTestSearchQuery("");
    setSelectedRequestId(labRequestId);
    if (!labRequestId) return;
    setReqLoading(true);
    try {
      const res = await authenticatedFetch(`/api/laboratory/lab-request?labRequestId=${encodeURIComponent(labRequestId)}`, {
        cache: "no-store",
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        items?: LabRequestItemView[];
        header?: LabRequestHeaderView;
      };
      if (!res.ok) {
        setReqError(json.error ?? `Request failed (${res.status})`);
        return;
      }
      const header = json.header ?? null;
      setReqHeader(header);
      const sex = header?.patient_sex ?? null;
      setReqItems(
        Array.isArray(json.items) ? json.items.map((it) => mergeAutoFlagIntoLabResultRow(it, sex)) : [],
      );
    } catch {
      setReqError("Failed to load lab request details.");
    } finally {
      setReqLoading(false);
    }
  };

  useEffect(() => {
    void loadQueue();
  }, []);

  // URL-driven selection
  useEffect(() => {
    const id = (searchParams.get("labRequestId") ?? "").trim();
    if (id && id !== selectedRequestId) {
      void loadRequest(id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const sorted = useMemo(() => rows.slice().sort((a, b) => a.issued_at.localeCompare(b.issued_at)), [rows]);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQueueSearch(queueSearch), 400);
    return () => window.clearTimeout(t);
  }, [queueSearch]);

  useEffect(() => {
    const q = debouncedQueueSearch.trim();
    // For very short queries, fall back to the in-memory list (no pagination).
    if (q.length < 2) {
      setQueueSearchError("");
      setQueueSearchLoading(false);
      setQueueSearchRows([]);
      setQueueSearchCount(0);
      setQueueSearchPage(0);
      return;
    }
    let cancelled = false;
    void (async () => {
      setQueueSearchError("");
      setQueueSearchLoading(true);
      try {
        const url = `/api/laboratory/lab-queue?q=${encodeURIComponent(q)}&scope=all&days=90&page=${queueSearchPage}&pageSize=${queueSearchPageSize}`;
        const res = await authenticatedFetch(url, { cache: "no-store" });
        const json = (await res.json().catch(() => ({}))) as { error?: string; rows?: LabQueueRow[]; count?: number };
        if (cancelled) return;
        if (!res.ok) {
          setQueueSearchError(json.error ?? `Request failed (${res.status})`);
          setQueueSearchRows([]);
          setQueueSearchCount(0);
          return;
        }
        setQueueSearchRows(Array.isArray(json.rows) ? json.rows : []);
        setQueueSearchCount(Number.isFinite(Number(json.count)) ? Number(json.count) : 0);
      } catch {
        if (cancelled) return;
        setQueueSearchError("Failed to search LAB queue.");
        setQueueSearchRows([]);
        setQueueSearchCount(0);
      } finally {
        if (!cancelled) setQueueSearchLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [debouncedQueueSearch, queueSearchPage, queueSearchPageSize]);

  const filteredSorted = useMemo(() => {
    const q = queueSearch.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter((t) => {
      const hay = [t.queue_display, t.patient_name, t.encounter_id, t.lab_request_id, t.status]
        .map((v) => String(v ?? "").trim().toLowerCase())
        .filter(Boolean)
        .join(" | ");
      return hay.includes(q);
    });
  }, [queueSearch, sorted]);

  const showPaginatedSearch = debouncedQueueSearch.trim().length >= 2;
  const queueListRows = showPaginatedSearch ? queueSearchRows : filteredSorted;

  const selectedTicket = useMemo(() => {
    if (!selectedRequestId) return null;
    const match = (t: LabQueueRow) => (t.lab_request_id ?? "").trim() === selectedRequestId;
    return sorted.find(match) ?? queueSearchRows.find(match) ?? null;
  }, [selectedRequestId, sorted, queueSearchRows]);

  const requestCollectSummary = useMemo(() => {
    let collectedCount = 0;
    for (const it of reqItems) {
      if ((it.collected_item ?? "").trim().toUpperCase() === "Y") collectedCount += 1;
    }
    return {
      anyCollected: collectedCount > 0,
      allCollected: reqItems.length > 0 && collectedCount === reqItems.length,
    };
  }, [reqItems]);

  const canPartialRelease = useMemo(() => {
    if (!selectedTicket || !selectedRequestId) return false;
    const hasImaging =
      selectedTicket.includes_imaging === true || Boolean(String(selectedTicket.imaging_request_id ?? "").trim());
    if (!hasImaging) return false;
    if (selectedTicket.lab_partial_released) return false;
    if (!requestCollectSummary.anyCollected || requestCollectSummary.allCollected) return false;
    return selectedTicket.status === "Called" && selectedTicket.active_dept === "LAB";
  }, [selectedTicket, selectedRequestId, requestCollectSummary]);

  const canSendResultSms = Boolean(reqHeader?.id && reqHeader?.any_result_saved && reqHeader?.patient_contact_no);

  const priorResultsByTestId = useMemo(() => {
    const m = new Map<string, PatientPriorLabResultEntry[]>();
    for (const entry of priorResults) {
      const list = m.get(entry.lab_test_id) ?? [];
      list.push(entry);
      m.set(entry.lab_test_id, list);
    }
    return m;
  }, [priorResults]);

  useEffect(() => {
    const patientId = reqHeader?.patient_id;
    const excludeId = selectedRequestId.trim();
    if (patientId == null || !excludeId) {
      setPriorResults([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      setPriorResultsLoading(true);
      try {
        const url = `/api/laboratory/patient-lab-history?patientId=${encodeURIComponent(String(patientId))}&excludeLabRequestId=${encodeURIComponent(excludeId)}&limit=40`;
        const res = await authenticatedFetch(url, { cache: "no-store" });
        const json = (await res.json().catch(() => ({}))) as {
          error?: string;
          entries?: PatientPriorLabResultEntry[];
        };
        if (cancelled) return;
        if (!res.ok) {
          setPriorResults([]);
          return;
        }
        setPriorResults(Array.isArray(json.entries) ? json.entries : []);
      } catch {
        if (!cancelled) setPriorResults([]);
      } finally {
        if (!cancelled) setPriorResultsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reqHeader?.patient_id, selectedRequestId]);

  const applyPriorResultToItem = (itemId: string, prior: PatientPriorLabResultEntry) => {
    const sex = reqHeader?.patient_sex ?? null;
    setReqItems((prev) =>
      prev.map((x) =>
        x.id === itemId
          ? mergeAutoFlagIntoLabResultRow(
              {
                ...x,
                result_value: prior.result_value,
                result_unit: prior.result_unit ?? x.result_unit,
                reference_range: prior.reference_range ?? x.reference_range,
                flag: prior.flag ?? x.flag,
                remarks: prior.remarks ?? x.remarks,
                result_status: prior.result_status ?? (prior.result_value.trim() ? "Completed" : x.result_status),
              },
              sex,
            )
          : x,
      ),
    );
  };

  const formatPriorResultLabel = (prior: PatientPriorLabResultEntry): string => {
    const when = formatLabRequestDateTime(prior.request_date, prior.request_time);
    const unit = (prior.result_unit ?? "").trim();
    const val = prior.result_value.trim();
    return unit ? `${when} — ${val} ${unit}` : `${when} — ${val}`;
  };

  const openLabRequestFromTicket = (labRequestId: string) => {
    const lr = labRequestId.trim();
    if (!lr) return;
    router.replace(`/laboratory/results?labRequestId=${encodeURIComponent(lr)}`);
    void loadRequest(lr);
  };

  const formatTicketWhen = (t: LabQueueRow) =>
    formatQueueTicketWhen(t.issued_at, {
      ticketDate: t.ticket_date,
      requestDate: t.request_date,
      requestTime: t.request_time,
    });

  const callPatient = async (ticketId: string) => {
    const id = ticketId.trim();
    if (!id) return;
    setError("");
    setActionBusyId(id);
    try {
      const res = await authenticatedFetch("/api/reception/queue-ticket", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticketId: id, action: "call" }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(json.error ?? `Request failed (${res.status})`);
        return;
      }
      await loadQueue();
    } catch {
      setError("Failed to call patient.");
    } finally {
      setActionBusyId(null);
    }
  };

  const recallPatient = async (ticketId: string) => {
    const id = ticketId.trim();
    if (!id) return;
    setError("");
    setActionBusyId(id);
    try {
      const res = await recallQueueTicketAnnounce(id);
      if (res.error) {
        setError(res.error);
        return;
      }
    } catch {
      setError("Failed to recall patient.");
    } finally {
      setActionBusyId(null);
    }
  };

  const resultSections = useMemo(() => groupItemsByCategory(reqItems), [reqItems]);

  const filteredResultSections = useMemo(
    () => filterResultSections(resultSections, testSearchQuery),
    [resultSections, testSearchQuery],
  );

  const resultSectionByCategoryId = useMemo(
    () => new Map(resultSections.map((s) => [s.categoryId, s])),
    [resultSections],
  );

  const testSearchMatchCount = useMemo(
    () => filteredResultSections.reduce((n, s) => n + s.items.length, 0),
    [filteredResultSections],
  );

  const testSearchActive = testSearchQuery.trim().length > 0;

  useEffect(() => {
    const q = testSearchQuery.trim();
    if (!q) return;
    const sections = filterResultSections(resultSections, q);
    const firstId = sections[0]?.items[0]?.id;
    if (!firstId) return;
    const t = window.setTimeout(() => {
      document.getElementById(`lab-res-card-${firstId}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 0);
    return () => window.clearTimeout(t);
  }, [testSearchQuery, resultSections]);

  const releasePartialCollection = async () => {
    if (!selectedTicket?.id) return;
    setReqError("");
    setPartialReleaseBusy(true);
    try {
      const res = await authenticatedFetch("/api/laboratory/partial-collection-release", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticketId: selectedTicket.id }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setReqError(json.error ?? `Request failed (${res.status})`);
        return;
      }
      await loadQueue();
      setToastSeverity("success");
      setToastMessage("Patient released for imaging. Urine/fecalysis can be collected later.");
      setToastOpen(true);
    } catch {
      setReqError("Failed to release patient for imaging.");
    } finally {
      setPartialReleaseBusy(false);
    }
  };

  const saveCategoryCollected = async (section: LabResultCategorySection, collected: boolean) => {
    const ids = section.items.map((it) => it.id.trim()).filter(Boolean);
    if (ids.length === 0) return;
    setReqError("");
    setCategoryCollectingId(section.categoryId);
    try {
      const res = await authenticatedFetch("/api/laboratory/specimen-item", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ labRequestItemIds: ids, collected }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setReqError(json.error ?? `Request failed (${res.status})`);
        return;
      }
      setReqItems((prev) =>
        prev.map((it) => (ids.includes(it.id) ? { ...it, collected_item: collected ? "Y" : null } : it)),
      );
      const lr = selectedRequestId.trim();
      if (lr) await loadRequest(lr);
      await loadQueue();
    } catch {
      setReqError("Failed to save specimen status.");
    } finally {
      setCategoryCollectingId(null);
    }
  };

  const saveResult = async (it: LabRequestItemView) => {
    const id = it.id.trim();
    if (!id) return;
    if (!isLabItemCollected(it)) return;
    setReqError("");
    setItemSavingId(id);
    try {
      const result = await persistLabResultItem(it);
      if (!result.ok) {
        setReqError(result.error);
        setToastSeverity("error");
        setToastMessage(result.error);
        setToastOpen(true);
        return;
      }
      const rid = result.row.lab_request_item_id!.trim();
      setReqItems((prev) =>
        prev.map((x) => (x.id === rid ? mergePersistedLabResultRow(x, result.row, reqHeader?.patient_sex ?? null) : x)),
      );
      setReqHeader((prev) => (prev ? { ...prev, any_result_saved: true } : prev));
      void loadQueue();
      setReqError("");
      setToastSeverity("success");
      setToastMessage("Result saved.");
      setToastOpen(true);
    } catch {
      const msg = "Failed to save result.";
      setReqError(msg);
      setToastSeverity("error");
      setToastMessage(msg);
      setToastOpen(true);
    } finally {
      setItemSavingId(null);
    }
  };

  const saveCategoryResults = async (section: LabResultCategorySection) => {
    const targets = section.items.filter(isLabItemCollected);
    if (targets.length === 0) return;
    setReqError("");
    setCategoryResultsSavingId(section.categoryId);
    const patientSex = reqHeader?.patient_sex ?? null;
    try {
      let savedCount = 0;
      for (const it of targets) {
        const result = await persistLabResultItem(it);
        if (!result.ok) {
          setReqError(result.error);
          setToastSeverity("error");
          setToastMessage(result.error);
          setToastOpen(true);
          return;
        }
        savedCount += 1;
        const rid = result.row.lab_request_item_id!.trim();
        setReqItems((prev) =>
          prev.map((x) => (x.id === rid ? mergePersistedLabResultRow(x, result.row, patientSex) : x)),
        );
      }
      setReqHeader((prev) => (prev ? { ...prev, any_result_saved: true } : prev));
      await loadQueue();
      setReqError("");
      setToastSeverity("success");
      setToastMessage(`Saved ${savedCount} result${savedCount === 1 ? "" : "s"}.`);
      setToastOpen(true);
    } catch {
      const msg = "Failed to save results.";
      setReqError(msg);
      setToastSeverity("error");
      setToastMessage(msg);
      setToastOpen(true);
    } finally {
      setCategoryResultsSavingId(null);
    }
  };

  const handlePrintLabResults = async () => {
    if (!reqHeader || reqItems.length === 0) return;
    const ok = await openLabResultsPrintWindow({ header: reqHeader, items: reqItems });
    if (!ok) {
      setToastSeverity("error");
      setToastMessage("Could not generate lab result PDF. Check that template files exist and try again.");
      setToastOpen(true);
    }
  };

  const handlePrintTestChecklist = () => {
    if (!reqHeader || reqItems.length === 0) return;
    openLabTestChecklistPrintWindow({
      header: reqHeader,
      sections: resultSections.map((s) => ({
        categoryName: s.categoryName,
        items: s.items,
      })),
    });
  };

  const sendResultReadySms = async (forceResend: boolean) => {
    if (!reqHeader) return;
    setReqError("");
    setSendSmsBusy(true);
    try {
      const res = await authenticatedFetch("/api/laboratory/lab-result-ready-sms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          labRequestId: reqHeader.id,
          forceResend,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        code?: string;
        result_sms_sent_at?: string;
      };
      if (!res.ok) {
        if (res.status === 409 && json.code === "alreadySentNeedsConfirm" && !forceResend) {
          setResendSmsDialogOpen(true);
          return;
        }
        const msg = json.error ?? `Request failed (${res.status})`;
        setReqError(msg);
        setToastSeverity("error");
        setToastMessage(msg);
        setToastOpen(true);
        return;
      }
      const sentAt = String(json.result_sms_sent_at ?? "").trim();
      if (sentAt) {
        setReqHeader((prev) => (prev ? { ...prev, result_sms_sent_at: sentAt } : prev));
      }
      setToastSeverity("success");
      setToastMessage(forceResend ? "SMS resent to patient." : "SMS sent to patient.");
      setToastOpen(true);
    } catch {
      const msg = "Failed to send SMS.";
      setReqError(msg);
      setToastSeverity("error");
      setToastMessage(msg);
      setToastOpen(true);
    } finally {
      setSendSmsBusy(false);
    }
  };

  const flagOptions = ["Normal", "High", "Low", "Critical", "Abnormal"] as const;
  const statusOptions = ["Pending", "In Progress", "Completed", "Cancelled"] as const;

  /** Match Medical History / consultation outlined fields: light grey border, modest radius, white fill. */
  const fieldSx = useMemo(() => {
    const outlineBorder = "#ced4da";
    const outlineBorderHover = "#adb5bd";
    return {
      ...fieldInputSx,
      // Match consultation fields (`fieldInputSx` height: 40)
      "& .MuiInputBase-root": { height: 40 },
      "& .MuiOutlinedInput-root": {
        borderRadius: 8,
        bgcolor: "#fff",
        boxShadow: "none",
      },
      "& .MuiOutlinedInput-notchedOutline": {
        borderRadius: 8,
        borderWidth: 1,
        borderColor: outlineBorder,
      },
      "&:hover:not(.Mui-disabled) .MuiOutlinedInput-notchedOutline": { borderColor: outlineBorderHover },
      "& .Mui-focused .MuiOutlinedInput-notchedOutline": {
        borderColor: theme.palette.primary.main,
        borderWidth: 1,
      },
      "& .MuiInputBase-input, & .MuiSelect-select": {
        color: theme.palette.text.primary,
        fontWeight: 500,
      },
      "& .MuiSelect-select": {
        height: "100%",
        display: "flex",
        alignItems: "center",
        textTransform: "none",
      },
      "& .Mui-disabled .MuiOutlinedInput-notchedOutline": {
        borderColor: alpha(theme.palette.action.disabled, 0.35),
      },
      "& .Mui-disabled .MuiInputBase-input, & .Mui-disabled .MuiSelect-select": {
        color: theme.palette.text.disabled,
      },
    };
  }, [theme]);

  return (
    <>
      <Snackbar
        open={toastOpen}
        autoHideDuration={3500}
        onClose={() => setToastOpen(false)}
        anchorOrigin={{ vertical: "top", horizontal: "center" }}
      >
        <Alert severity={toastSeverity} variant="filled" onClose={() => setToastOpen(false)} sx={{ width: "100%" }}>
          {toastMessage}
        </Alert>
      </Snackbar>
      <Dialog open={resendSmsDialogOpen} onClose={() => (sendSmsBusy ? null : setResendSmsDialogOpen(false))}>
        <DialogTitle>Resend SMS?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            A result-ready text message was already sent for this request. Do you want to send another message?
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setResendSmsDialogOpen(false)} disabled={sendSmsBusy}>
            Cancel
          </Button>
          <Button
            color="secondary"
            variant="contained"
            disabled={sendSmsBusy}
            onClick={() => {
              setResendSmsDialogOpen(false);
              void sendResultReadySms(true);
            }}
          >
            {sendSmsBusy ? <CircularProgress size={18} color="inherit" /> : "Resend"}
          </Button>
        </DialogActions>
      </Dialog>

      <Typography variant="h5" sx={{ mb: 3 }}>
        Lab Results
      </Typography>

      {error ? (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      ) : null}

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", md: "420px 1fr" },
          gap: 2,
          alignItems: "start",
        }}
      >
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <Card>
            <CardContent sx={{ p: 3 }}>
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  mb: 2,
                  gap: 2,
                  flexWrap: "wrap",
                }}
              >
                <Typography variant="subtitle1" fontWeight={700}>
                  Today’s LAB queue
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Active tickets only
                </Typography>
              </Box>

              {loading ? (
                <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
                  <CircularProgress size={32} />
                </Box>
              ) : sorted.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  No active LAB queue tickets for today.
                </Typography>
              ) : (
                <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                  {sorted.map((t) => {
                    const active = (t.lab_request_id ?? "").trim() === selectedRequestId;
                    const canOpen = canOpenLabQueueRequest(t.status, t.lab_request_id, {
                      labAnyCollected: t.lab_any_collected,
                    });
                    const statusChip = queueTicketStatusChip(t);
                    return (
                      <Card
                        key={t.id}
                        variant="outlined"
                        sx={{
                          borderRadius: 2,
                          cursor: canOpen ? "pointer" : "default",
                          borderColor: active ? "secondary.main" : "divider",
                          bgcolor: active ? "action.hover" : "background.paper",
                        }}
                        onClick={() => {
                          const lr = (t.lab_request_id ?? "").trim();
                          if (
                            !lr ||
                            !canOpenLabQueueRequest(t.status, lr, { labAnyCollected: t.lab_any_collected })
                          )
                            return;
                          openLabRequestFromTicket(lr);
                        }}
                      >
                        <CardContent sx={{ p: 1.5, "&:last-child": { pb: 1.5 } }}>
                          <Box sx={{ display: "flex", justifyContent: "space-between", gap: 2 }}>
                            <Box sx={{ minWidth: 0 }}>
                              <Typography variant="body2" fontWeight={800} sx={{ fontFamily: "monospace" }}>
                                {t.queue_display}
                              </Typography>
                              <Typography variant="caption" color="text.secondary" noWrap>
                                {t.patient_name ?? "—"}
                              </Typography>
                            </Box>
                            <Box sx={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 0.75 }}>
                              <Chip label={statusChip.label} color={statusChip.color} size="small" />
                              <Typography variant="caption" color="text.secondary" sx={{ textAlign: "right" }}>
                                {formatTicketWhen(t)}
                              </Typography>
                            </Box>
                          </Box>
                          <Box sx={{ mt: 1, display: "flex", justifyContent: "flex-end", gap: 1, flexWrap: "wrap" }}>
                            <Tooltip
                              title={labCallButtonTooltip(t.status, {
                                includesImaging: t.includes_imaging,
                                specimenCollected: isSpecimenCollectedOnTicket(t.notes),
                                labAnyCollected: t.lab_any_collected,
                                labAllCollected: t.lab_all_collected,
                                imagingAllCaptured: t.imaging_all_captured,
                                activeDept: t.active_dept,
                              })}
                            >
                              <span>
                                <Button
                                  variant="contained"
                                  color="secondary"
                                  size="small"
                                  startIcon={
                                    actionBusyId === t.id ? (
                                      <CircularProgress size={16} color="inherit" />
                                    ) : (
                                      <CampaignOutlinedIcon fontSize="small" />
                                    )
                                  }
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void callPatient(t.id);
                                  }}
                                  disabled={
                                    (t.can_lab_call ??
                                      canLabCallPatient(t.status, {
                                        includesImaging: t.includes_imaging,
                                        specimenCollected: isSpecimenCollectedOnTicket(t.notes),
                                        labAnyCollected: t.lab_any_collected,
                                        labAllCollected: t.lab_all_collected,
                                        imagingAllCaptured: t.imaging_all_captured,
                                        activeDept: t.active_dept,
                                      })) !== true || actionBusyId === t.id
                                  }
                                  sx={{ borderRadius: 999, textTransform: "none", fontWeight: 700 }}
                                >
                                  Call
                                </Button>
                              </span>
                            </Tooltip>
                            <Tooltip title={recallQueueButtonTooltip(t.status)}>
                              <span>
                                <Button
                                  variant="outlined"
                                  color="secondary"
                                  size="small"
                                  startIcon={
                                    actionBusyId === t.id ? (
                                      <CircularProgress size={16} color="inherit" />
                                    ) : (
                                      <ReplayIcon fontSize="small" />
                                    )
                                  }
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void recallPatient(t.id);
                                  }}
                                  disabled={!canRecallQueueTicket(t.status) || actionBusyId === t.id}
                                  sx={{ borderRadius: 999, textTransform: "none", fontWeight: 700 }}
                                >
                                  Recall
                                </Button>
                              </span>
                            </Tooltip>
                            <Tooltip
                              title={labQueueRequestButtonTooltip(t.status, t.lab_request_id, {
                                labAnyCollected: t.lab_any_collected,
                              })}
                            >
                              <span>
                                <Button
                                  variant="outlined"
                                  size="small"
                                  startIcon={<ScienceOutlinedIcon fontSize="small" />}
                                  disabled={!canOpen}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const lr = (t.lab_request_id ?? "").trim();
                                    if (
                                      !lr ||
                                      !canOpenLabQueueRequest(t.status, lr, {
                                        labAnyCollected: t.lab_any_collected,
                                      })
                                    )
                                      return;
                                    openLabRequestFromTicket(lr);
                                  }}
                                  sx={{ borderRadius: 999, textTransform: "none", fontWeight: 700 }}
                                >
                                  Request
                                </Button>
                              </span>
                            </Tooltip>
                          </Box>
                        </CardContent>
                      </Card>
                    );
                  })}
                </Box>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent sx={{ p: 3 }}>
              <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 2, gap: 2, flexWrap: "wrap" }}>
                <Typography variant="subtitle1" fontWeight={700}>
                  Search patient / encounter
                </Typography>
              </Box>

              <Box sx={{ mb: 2 }}>
                <FormFieldLabel htmlFor="lab-results-queue-search" variant="consultation">
                  Find patient / encounter
                </FormFieldLabel>
                <TextField
                  id="lab-results-queue-search"
                  hiddenLabel
                  placeholder="Patient name or encounter ID (trans_id)…"
                  value={queueSearch}
                  onChange={(e) => {
                    setQueueSearch(e.target.value);
                    setQueueSearchPage(0);
                  }}
                  {...commonFieldProps}
                  sx={[fieldInputSx, { "& .MuiInputBase-input": { textTransform: "none" } }]}
                  slotProps={{
                    input: {
                      startAdornment: (
                        <InputAdornment position="start">
                          <SearchIcon fontSize="small" sx={{ color: "info.main" }} />
                        </InputAdornment>
                      ),
                    },
                  }}
                />
                {queueSearchError ? (
                  <Alert severity="error" sx={{ mt: 1 }}>
                    {queueSearchError}
                  </Alert>
                ) : null}
                {queueSearch.trim() ? (
                  <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.75 }}>
                    Showing {queueListRows.length} of {showPaginatedSearch ? queueSearchCount : sorted.length} ticket
                    {(showPaginatedSearch ? queueSearchCount : sorted.length) === 1 ? "" : "s"}
                  </Typography>
                ) : (
                  <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.75 }}>
                    Type at least 2 characters to search.
                  </Typography>
                )}
              </Box>

              {showPaginatedSearch && queueSearchLoading ? (
                <Box sx={{ display: "flex", justifyContent: "center", py: 2 }}>
                  <CircularProgress size={24} />
                </Box>
              ) : queueListRows.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  No tickets match your search.
                </Typography>
              ) : (
                <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                  {queueListRows.map((t) => {
                    const active = (t.lab_request_id ?? "").trim() === selectedRequestId;
                    const canOpen = canOpenLabResultsQueueTicket(t.status, t.lab_request_id, {
                      fromHistoricalSearch: true,
                    });
                    return (
                      <Card
                        key={t.id}
                        variant="outlined"
                        sx={{
                          borderRadius: 2,
                          cursor: canOpen ? "pointer" : "default",
                          borderColor: active ? "secondary.main" : "divider",
                          bgcolor: active ? "action.hover" : "background.paper",
                          opacity: canOpen ? 1 : 0.72,
                        }}
                        onClick={() => {
                          const lr = (t.lab_request_id ?? "").trim();
                          if (!lr || !canOpenLabResultsQueueTicket(t.status, lr, { fromHistoricalSearch: true })) return;
                          openLabRequestFromTicket(lr);
                        }}
                      >
                        <CardContent sx={{ p: 1.5, "&:last-child": { pb: 1.5 } }}>
                          <Box sx={{ display: "flex", justifyContent: "space-between", gap: 2 }}>
                            <Box sx={{ minWidth: 0 }}>
                              <Typography variant="body2" fontWeight={800} sx={{ fontFamily: "monospace" }}>
                                {t.queue_display}
                              </Typography>
                              <Typography variant="caption" color="text.secondary" noWrap>
                                {t.patient_name ?? "—"}
                              </Typography>
                            </Box>
                            <Box sx={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 0.75 }}>
                              <Chip
                                label={queueTicketStatusChip(t).label}
                                color={queueTicketStatusChip(t).color}
                                size="small"
                              />
                              <Typography variant="caption" color="text.secondary" sx={{ textAlign: "right" }}>
                                {formatTicketWhen(t)}
                              </Typography>
                            </Box>
                          </Box>
                          {canOpen ? (
                            <Typography variant="caption" color="primary.main" sx={{ display: "block", mt: 1, fontWeight: 700 }}>
                              Open lab results
                            </Typography>
                          ) : null}
                        </CardContent>
                      </Card>
                    );
                  })}
                </Box>
              )}

              {showPaginatedSearch ? (
                <TablePagination
                  component="div"
                  count={queueSearchCount}
                  page={queueSearchPage}
                  onPageChange={(_, p) => setQueueSearchPage(p)}
                  rowsPerPage={queueSearchPageSize}
                  rowsPerPageOptions={[5, 10, 20, 50]}
                  onRowsPerPageChange={(e) => {
                    const n = Number.parseInt(String(e.target.value ?? "10"), 10);
                    setQueueSearchPageSize(Number.isFinite(n) && n > 0 ? n : 10);
                    setQueueSearchPage(0);
                  }}
                  labelRowsPerPage="Rows per page"
                  sx={{
                    mt: 1,
                    "& .MuiTablePagination-toolbar": { textTransform: "none" },
                    "& .MuiTablePagination-select": { textTransform: "none" },
                    "& .MuiTablePagination-selectLabel, & .MuiTablePagination-displayedRows": { textTransform: "none" },
                  }}
                />
              ) : null}
            </CardContent>
          </Card>
        </Box>

        <Card>
          <CardContent sx={{ p: 3 }}>
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2, flexWrap: "wrap", mb: 1 }}>
              <Typography variant="subtitle1" fontWeight={800}>
                Request details
              </Typography>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<PrintOutlinedIcon />}
                  disabled={!reqHeader || reqItems.length === 0}
                  onClick={() => void handlePrintLabResults()}
                >
                  Print Laboratory Results
                </Button>
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<PrintOutlinedIcon />}
                  disabled={!reqHeader || reqItems.length === 0}
                  onClick={handlePrintTestChecklist}
                >
                  Print Test Checklist
                </Button>
                <Tooltip
                  title={
                    !reqHeader
                      ? "Load a lab request first."
                      : !reqHeader.any_result_saved
                        ? "Save at least one result first."
                        : !reqHeader.patient_contact_no
                          ? "Patient contact number is missing."
                          : "Send text message to patient."
                  }
                >
                  <span>
                    <Button
                      variant="contained"
                      color="secondary"
                      size="small"
                      startIcon={sendSmsBusy ? <CircularProgress size={16} color="inherit" /> : <SmsOutlinedIcon />}
                      disabled={!canSendResultSms || sendSmsBusy}
                      onClick={() => void sendResultReadySms(false)}
                    >
                      Send text to patient
                    </Button>
                  </span>
                </Tooltip>
              </Stack>
            </Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Select a ticket on the left to view requested tests. Check Collected on each category to mark every test in that group as collected and enable result entry.
              {reqHeader?.patient_id != null && priorResults.length > 0
                ? " Use “Previous result” on each line to copy a value from this patient’s earlier lab orders."
                : null}
            </Typography>
            {selectedTicket &&
            (selectedTicket.includes_imaging || selectedTicket.imaging_request_id) ? (
              <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 2 }}>
                <Tooltip title="Release patient for imaging while urine/fecalysis (or other pending categories) are still outstanding. Ticket returns to Waiting so imaging can call the patient.">
                  <span>
                    <Button
                      variant="outlined"
                      color="secondary"
                      size="small"
                      disabled={!canPartialRelease || partialReleaseBusy}
                      onClick={() => void releasePartialCollection()}
                      sx={{ textTransform: "none", fontWeight: 700 }}
                    >
                      {partialReleaseBusy ? (
                        <CircularProgress size={18} />
                      ) : (
                        "Partially collected"
                      )}
                    </Button>
                  </span>
                </Tooltip>
              </Box>
            ) : null}
            {selectedTicket?.lab_partial_released && !selectedTicket.lab_all_collected ? (
              <Alert severity="info" sx={{ mb: 2 }}>
                Partial collection released for imaging. Mark remaining categories as collected when the patient provides urine/fecalysis samples.
              </Alert>
            ) : null}
            {priorResultsLoading ? (
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
                Loading previous results…
              </Typography>
            ) : null}

            {reqHeader ? (
              <Box
                sx={{
                  mb: 2,
                  p: 1.5,
                  borderRadius: 2,
                  border: "1px solid",
                  borderColor: "divider",
                  bgcolor: alpha(theme.palette.primary.main, 0.04),
                  display: "grid",
                  gap: 1.25,
                  gridTemplateColumns: { xs: "1fr", sm: "repeat(2, minmax(0, 1fr))" },
                }}
              >
                <Box>
                  <Typography variant="caption" color="text.secondary" fontWeight={700} display="block">
                    Patient ID
                  </Typography>
                  <Typography variant="body2" sx={{ fontFamily: "monospace" }}>
                    {reqHeader.patient_id != null ? String(reqHeader.patient_id) : "—"}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary" fontWeight={700} display="block">
                    Name
                  </Typography>
                  <Typography variant="body2">{reqHeader.patient_name ?? selectedTicket?.patient_name ?? "—"}</Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary" fontWeight={700} display="block">
                    Date / time
                  </Typography>
                  <Typography variant="body2">
                    {formatLabRequestDateTime(reqHeader.request_date, reqHeader.request_time)}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary" fontWeight={700} display="block">
                    Queue No
                  </Typography>
                  <Typography variant="body2" sx={{ fontFamily: "monospace" }}>
                    {reqHeader.queue_display ?? selectedTicket?.queue_display ?? "—"}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary" fontWeight={700} display="block">
                    Contact No
                  </Typography>
                  <Typography variant="body2">{reqHeader.patient_contact_no ?? "—"}</Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary" fontWeight={700} display="block">
                    Last result-ready SMS
                  </Typography>
                  <Typography variant="body2">{formatSmsSentAt(reqHeader.result_sms_sent_at)}</Typography>
                </Box>
              </Box>
            ) : null}

            <Divider sx={{ mb: 2 }} />

            {reqError ? (
              <Alert severity="error" sx={{ mb: 2 }}>
                {reqError}
              </Alert>
            ) : null}

            {!selectedRequestId ? (
              <Typography variant="body2" color="text.secondary">
                No request selected.
              </Typography>
            ) : reqLoading ? (
              <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
                <CircularProgress size={28} />
              </Box>
            ) : reqItems.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                No items found.
              </Typography>
            ) : (
              <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <Box sx={{ maxWidth: 480 }}>
                  <TextField
                    {...commonFieldProps}
                    hiddenLabel
                    placeholder="Search tests by name, code, or category…"
                    value={testSearchQuery}
                    onChange={(e) => setTestSearchQuery(e.target.value)}
                    sx={[fieldInputSx, { "& .MuiInputBase-input": { textTransform: "none" } }]}
                    slotProps={{
                      input: {
                        startAdornment: (
                          <InputAdornment position="start">
                            <SearchIcon fontSize="small" sx={{ color: "info.main" }} />
                          </InputAdornment>
                        ),
                        endAdornment: testSearchActive ? (
                          <InputAdornment position="end">
                            <IconButton
                              size="small"
                              aria-label="Clear test search"
                              onClick={() => setTestSearchQuery("")}
                              edge="end"
                            >
                              <ClearOutlinedIcon fontSize="small" />
                            </IconButton>
                          </InputAdornment>
                        ) : undefined,
                      },
                    }}
                  />
                  {testSearchActive ? (
                    <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.75 }}>
                      {testSearchMatchCount} of {reqItems.length} test{reqItems.length === 1 ? "" : "s"} match &ldquo;
                      {testSearchQuery.trim()}&rdquo;
                    </Typography>
                  ) : null}
                </Box>

                {testSearchActive && filteredResultSections.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    No tests match your search.
                  </Typography>
                ) : (
                  filteredResultSections.map((section) => {
                  const fullSection = resultSectionByCategoryId.get(section.categoryId) ?? section;
                  const { allCollected, indeterminate } = categoryCollectState(fullSection.items);
                  const categoryBusy = categoryCollectingId === section.categoryId;
                  const categoryResultsSaving = categoryResultsSavingId === section.categoryId;
                  const categoryHasCollectedItems = fullSection.items.some(isLabItemCollected);
                  return (
                    <Box
                      key={section.categoryId}
                      sx={{
                        border: "1px solid",
                        borderColor: "divider",
                        borderRadius: 2,
                        bgcolor: "background.paper",
                        overflow: "hidden",
                      }}
                    >
                      <Box
                        sx={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 2,
                          px: 1.5,
                          py: 1.25,
                          bgcolor: alpha(theme.palette.info.main, 0.06),
                          borderBottom: "1px solid",
                          borderColor: "divider",
                        }}
                      >
                        <Box sx={{ minWidth: 0 }}>
                          <Typography
                            variant="subtitle2"
                            fontWeight={800}
                            color="info.main"
                            sx={{ letterSpacing: "0.06em" }}
                          >
                            {section.categoryName.toUpperCase()}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {testSearchActive
                              ? `${section.items.length} of ${fullSection.items.length} test${fullSection.items.length === 1 ? "" : "s"}`
                              : `${section.items.length} test${section.items.length === 1 ? "" : "s"}`}
                          </Typography>
                        </Box>
                        <Stack direction="row" spacing={1} alignItems="center" sx={{ flexShrink: 0, flexWrap: "wrap" }}>
                          <Button
                            variant="outlined"
                            size="small"
                            startIcon={
                              categoryResultsSaving ? (
                                <CircularProgress size={16} color="inherit" />
                              ) : (
                                <SaveOutlinedIcon fontSize="small" />
                              )
                            }
                            disabled={!categoryHasCollectedItems || categoryBusy || categoryResultsSaving}
                            onClick={() => void saveCategoryResults(fullSection)}
                            sx={{ textTransform: "none", fontWeight: 700, whiteSpace: "nowrap" }}
                          >
                            Save all results
                          </Button>
                          <FormControlLabel
                            sx={{ m: 0, alignItems: "center" }}
                            control={
                              <Checkbox
                                checked={allCollected}
                                indeterminate={indeterminate}
                                disabled={categoryBusy || categoryResultsSaving}
                                onChange={(_, checked) => void saveCategoryCollected(fullSection, checked)}
                              />
                            }
                            label={
                              <Typography variant="caption" fontWeight={800}>
                                Collected
                              </Typography>
                            }
                            labelPlacement="start"
                          />
                        </Stack>
                      </Box>

                      <Box sx={{ display: "flex", flexDirection: "column", gap: 1.25, p: 1.5 }}>
                        {section.items.map((it) => {
                          const categoryCollected = isLabItemCollected(it);
                          const busy =
                            itemSavingId === it.id || categoryBusy || categoryResultsSaving;
                          const priorOptions = priorResultsByTestId.get(it.lab_test_id) ?? [];
                          return (
                            <Box
                              key={it.id}
                              id={`lab-res-card-${it.id}`}
                              sx={{
                                border: "1px solid #000",
                                borderRadius: 2,
                                px: 1.5,
                                py: 1.25,
                                bgcolor: "#fff",
                                color: "#000",
                                display: "flex",
                                flexDirection: "column",
                                gap: 1.25,
                              }}
                            >
                              <Box sx={{ minWidth: 0, color: "#000" }}>
                                <Typography variant="body2" fontWeight={800} noWrap sx={{ color: "#000" }}>
                                  {it.test_name ?? it.lab_test_id}
                                </Typography>
                                <Typography variant="caption" sx={{ color: "#000" }}>
                                  Specimen: {it.specimen_type ?? "—"}
                                  {it.priority ? ` · Priority: ${it.priority}` : ""}
                                </Typography>
                                {it.result_unit || it.reference_range ? (
                                  <Typography variant="caption" sx={{ display: "block", color: "#000" }}>
                                    {[it.result_unit ? `Unit: ${it.result_unit}` : null, it.reference_range ? `Ref: ${it.reference_range}` : null]
                                      .filter(Boolean)
                                      .join(" · ")}
                                  </Typography>
                                ) : null}
                              </Box>

                      <Box
                        sx={{
                          display: "grid",
                          gridTemplateColumns: { xs: "1fr", sm: "1.2fr 0.8fr" },
                          gap: 1.5,
                          color: "#000",
                        }}
                      >
                        <Box sx={{ gridColumn: { xs: "1", sm: "1 / -1" } }}>
                          {priorOptions.length > 0 ? (
                            <Box sx={{ mb: 1 }}>
                              <FormFieldLabel htmlFor={`lab-res-${it.id}-prior`} variant="consultation">
                                Previous result
                              </FormFieldLabel>
                              <Button
                                id={`lab-res-${it.id}-prior`}
                                variant="outlined"
                                size="small"
                                disabled={!categoryCollected || busy}
                                fullWidth
                                endIcon={<HistoryOutlinedIcon fontSize="small" />}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setPriorMenu({ anchorEl: e.currentTarget, itemId: it.id });
                                }}
                                sx={{
                                  borderRadius: 2,
                                  textTransform: "none",
                                  fontWeight: 700,
                                  justifyContent: "space-between",
                                  bgcolor: "#fff",
                                }}
                              >
                                Select previous result…
                              </Button>
                              <Menu
                                anchorEl={priorMenu?.itemId === it.id ? priorMenu.anchorEl : null}
                                open={priorMenu?.itemId === it.id}
                                onClose={() => setPriorMenu(null)}
                                slotProps={{ paper: { sx: { maxWidth: 420 } } }}
                              >
                                {priorOptions.map((prior, idx) => (
                                  <MenuItem
                                    key={`${prior.lab_request_id}-${idx}`}
                                    sx={{ textTransform: "none", whiteSpace: "normal" }}
                                    onClick={() => {
                                      applyPriorResultToItem(it.id, prior);
                                      setPriorMenu(null);
                                    }}
                                  >
                                    {formatPriorResultLabel(prior)}
                                  </MenuItem>
                                ))}
                              </Menu>
                            </Box>
                          ) : null}
                          <FormFieldLabel htmlFor={`lab-res-${it.id}-value`} variant="consultation">
                            Result
                          </FormFieldLabel>
                          <TextField
                            id={`lab-res-${it.id}-value`}
                            hiddenLabel
                            {...commonFieldProps}
                            value={it.result_value ?? ""}
                            onChange={(e) => {
                              const v = e.target.value;
                              setReqItems((prev) =>
                                prev.map((x) =>
                                  x.id === it.id
                                    ? mergeAutoFlagIntoLabResultRow({ ...x, result_value: v }, reqHeader?.patient_sex ?? null)
                                    : x,
                                ),
                              );
                            }}
                            disabled={!categoryCollected || busy}
                            sx={fieldSx}
                          />
                        </Box>
                        <Box>
                          <FormFieldLabel htmlFor={`lab-res-${it.id}-unit`} variant="consultation">
                            Unit
                          </FormFieldLabel>
                          <TextField
                            id={`lab-res-${it.id}-unit`}
                            hiddenLabel
                            {...commonFieldProps}
                            value={it.result_unit ?? ""}
                            onChange={(e) =>
                              setReqItems((prev) => prev.map((x) => (x.id === it.id ? { ...x, result_unit: e.target.value } : x)))
                            }
                            disabled={!categoryCollected || busy}
                            sx={[fieldSx, { "& .MuiInputBase-input": { textTransform: "none" } }]}
                          />
                        </Box>
                        <Box>
                          <FormFieldLabel htmlFor={`lab-res-${it.id}-ref`} variant="consultation">
                            Reference range
                          </FormFieldLabel>
                          <TextField
                            id={`lab-res-${it.id}-ref`}
                            hiddenLabel
                            {...commonFieldProps}
                            value={it.reference_range ?? ""}
                            onChange={(e) => {
                              const v = e.target.value;
                              setReqItems((prev) =>
                                prev.map((x) =>
                                  x.id === it.id
                                    ? mergeAutoFlagIntoLabResultRow({ ...x, reference_range: v }, reqHeader?.patient_sex ?? null)
                                    : x,
                                ),
                              );
                            }}
                            disabled={!categoryCollected || busy}
                            sx={fieldSx}
                          />
                        </Box>
                        <Box>
                          <FormFieldLabel htmlFor={`lab-res-${it.id}-flag`} variant="consultation">
                            Flag
                          </FormFieldLabel>
                          <FormControl size="small" disabled={!categoryCollected || busy} sx={fieldSx} fullWidth>
                            <Select
                              id={`lab-res-${it.id}-flag`}
                              displayEmpty
                              value={(it.flag ?? "").trim()}
                              renderValue={(v) => (v ? String(v) : "—")}
                              onChange={(e) =>
                                setReqItems((prev) =>
                                  prev.map((x) => (x.id === it.id ? { ...x, flag: String(e.target.value || "") } : x)),
                                )
                              }
                            >
                              <MenuItem value="" sx={{ textTransform: "none" }}>
                                —
                              </MenuItem>
                              {flagOptions.map((f) => (
                                <MenuItem key={f} value={f} sx={{ textTransform: "none" }}>
                                  {f}
                                </MenuItem>
                              ))}
                            </Select>
                          </FormControl>
                        </Box>
                        <Box>
                          <FormFieldLabel htmlFor={`lab-res-${it.id}-status`} variant="consultation">
                            Status
                          </FormFieldLabel>
                          <FormControl size="small" disabled={!categoryCollected || busy} sx={fieldSx} fullWidth>
                            <Select
                              id={`lab-res-${it.id}-status`}
                              value={(it.result_status ?? "Pending").trim()}
                              onChange={(e) =>
                                setReqItems((prev) =>
                                  prev.map((x) => (x.id === it.id ? { ...x, result_status: String(e.target.value || "Pending") } : x)),
                                )
                              }
                            >
                              {statusOptions.map((s) => (
                                <MenuItem key={s} value={s} sx={{ textTransform: "none" }}>
                                  {s}
                                </MenuItem>
                              ))}
                            </Select>
                          </FormControl>
                        </Box>
                        <Box>
                          <FormFieldLabel htmlFor={`lab-res-${it.id}-remarks`} variant="consultation">
                            Remarks
                          </FormFieldLabel>
                          <TextField
                            id={`lab-res-${it.id}-remarks`}
                            hiddenLabel
                            {...commonFieldProps}
                            value={it.remarks ?? ""}
                            onChange={(e) =>
                              setReqItems((prev) => prev.map((x) => (x.id === it.id ? { ...x, remarks: e.target.value } : x)))
                            }
                            disabled={!categoryCollected || busy}
                            sx={fieldSx}
                          />
                        </Box>
                      </Box>

                              <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
                                <Button
                                  variant="contained"
                                  color="secondary"
                                  size="small"
                                  startIcon={
                                    busy ? <CircularProgress size={16} color="inherit" /> : <SaveOutlinedIcon fontSize="small" />
                                  }
                                  disabled={!categoryCollected || busy}
                                  onClick={() => void saveResult(it)}
                                  sx={{ borderRadius: 999, textTransform: "none", fontWeight: 800 }}
                                >
                                  Save result
                                </Button>
                              </Box>
                            </Box>
                          );
                        })}
                      </Box>
                    </Box>
                  );
                })
                )}
              </Box>
            )}
          </CardContent>
        </Card>
      </Box>
    </>
  );
}

