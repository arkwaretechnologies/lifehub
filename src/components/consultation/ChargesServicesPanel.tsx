"use client";

import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import AddOutlinedIcon from "@mui/icons-material/AddOutlined";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  IconButton,
  InputAdornment,
  Snackbar,
  TextField,
  Typography,
} from "@mui/material";
import { useAuth } from "@/components/AuthProvider";
import type { ConsultationPatient } from "@/components/consultation/consultationTypes";
import { useConsultationSave } from "@/components/consultation/consultationSaveContext";
import { ConsultationActiveTabContext } from "@/components/consultation/consultationTabContext";
import { fetchActivePhysicianServices, type PhysicianServiceRow } from "@/lib/physicianServices";
import { fetchActiveDiscountTypes, type DiscountTypeRow } from "@/lib/discountTypes";
import {
  buildLabAdditionalDueDisplayItems,
  buildLabDueDisplayItemsForRequest,
  fetchLabRequestsForEncounter,
  parseLabRequestPackageId,
  resolveLabPackageDisplayContext,
  type EncounterLabRequestSummary,
} from "@/lib/labRequests";
import { fetchActiveLabPricesByTestIds } from "@/lib/labServicePrices";
import { fetchLabTestsByIds } from "@/lib/labTests";
import type { DiagnosticAmendmentRow } from "@/lib/diagnosticAmendments";
import { authenticatedFetch } from "@/lib/authenticatedFetch";
import { IMAGING_CATALOG_TABLE } from "@/lib/imagingCatalog";
import { fetchImagingRequestItemsForRequestIdsClient } from "@/lib/imagingRequests";
import { supabase } from "@/lib/supabaseClient";
import {
  fetchLatestPhysicianFeeSaleForEncounter,
  fetchPaidPhysicianLineStatusForEncounter,
  fetchPhysicianFeeSaleItemsWithServiceNames,
  isPhysicianChargeLinePaid,
  PHYSICIAN_FEE_STATUS_PAID,
  physicianChargeLineKey,
  replacePhysicianFeeSaleItems,
  resolveValidPhysicianId,
  type PaidPhysicianLineStatus,
  upsertPhysicianFeeSaleForEncounter,
} from "@/lib/physicianFeeSales";
import type { UserProfile } from "@/lib/types";

function moneyNum(v: number | string): number {
  const n = typeof v === "number" ? v : Number(String(v));
  return Number.isFinite(n) ? n : 0;
}

function formatMoney(v: number | string): string {
  const n = moneyNum(v);
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function pctNum(v: number | string | null | undefined): number {
  const n = typeof v === "number" ? v : Number(String(v ?? ""));
  return Number.isFinite(n) ? n : 0;
}

type PricedItem = { name: string; price: number; testId?: string };

type PendingAmendmentView = {
  kind: "lab" | "imaging";
  amountDelta: number;
  added: PricedItem[];
  removed: PricedItem[];
};

function roundMoney2(n: number): number {
  return Math.round(n * 100) / 100;
}

function saleLineAmount(unitPrice: unknown, quantity: unknown, discount: unknown): number {
  const qty = moneyNum(quantity as number | string) || 1;
  return roundMoney2(
    qty * moneyNum(unitPrice as number | string) - moneyNum(discount as number | string),
  );
}

async function labSaleTestIdsForRequest(requestId: string): Promise<Set<string>> {
  const { data: sales } = await supabase.from("lab_sales").select("id").eq("lab_request_id", requestId);
  if (!sales?.length) return new Set();
  const saleIds = (sales as Array<{ id: string }>).map((s) => s.id).filter(Boolean);
  const { data: lines } = await supabase
    .from("lab_sale_items")
    .select("lab_test_id")
    .in("lab_sale_id", saleIds);
  const ids = new Set<string>();
  for (const r of (lines ?? []) as Array<{ lab_test_id?: string | null }>) {
    const tid = String(r.lab_test_id ?? "").trim();
    if (tid) ids.add(tid);
  }
  return ids;
}

async function labSaleLinesForRequest(requestId: string): Promise<PricedItem[]> {
  const { data: sales } = await supabase.from("lab_sales").select("id").eq("lab_request_id", requestId);
  if (!sales?.length) return [];
  const saleIds = (sales as Array<{ id: string }>).map((s) => s.id).filter(Boolean);
  const { data: lines } = await supabase
    .from("lab_sale_items")
    .select("lab_test_id, unit_price, quantity, discount")
    .in("lab_sale_id", saleIds);
  const rows = (lines ?? []) as Array<{
    lab_test_id?: string | null;
    unit_price?: number | string | null;
    quantity?: number | null;
    discount?: number | string | null;
  }>;
  const testIds = [...new Set(rows.map((r) => String(r.lab_test_id ?? "").trim()).filter(Boolean))];
  const tests = testIds.length > 0 ? await fetchLabTestsByIds(testIds) : { testsById: new Map(), error: null };
  const out: PricedItem[] = [];
  for (const r of rows) {
    const tid = String(r.lab_test_id ?? "").trim();
    if (!tid) continue;
    const name = tests.testsById.get(tid)?.name ?? `Lab test ${tid.slice(0, 8)}…`;
    out.push({ name, price: saleLineAmount(r.unit_price, r.quantity, r.discount) });
  }
  return out;
}

async function fetchImagingCatalogNamesByIds(catalogIds: string[]): Promise<Map<string, string>> {
  const ids = [...new Set(catalogIds.map((x) => String(x).trim()).filter(Boolean))];
  const map = new Map<string, string>();
  if (ids.length === 0) return map;
  const { data, error } = await supabase.from(IMAGING_CATALOG_TABLE).select("id, name, code").in("id", ids);
  if (error) return map;
  for (const raw of data ?? []) {
    const id = String((raw as { id?: string }).id ?? "").trim();
    const label =
      String((raw as { name?: string }).name ?? "").trim() ||
      String((raw as { code?: string }).code ?? "").trim();
    if (id && label) map.set(id, label);
  }
  return map;
}

function imagingStudyDisplayName(
  catalogId: string,
  namesByCatalogId: Map<string, string>,
  saleNotes?: string | null,
): string {
  const fromNotes = String(saleNotes ?? "").trim();
  if (fromNotes) return fromNotes;
  const id = String(catalogId).trim();
  const fromMap = id ? namesByCatalogId.get(id) : undefined;
  if (fromMap?.trim()) return fromMap.trim();
  return "Imaging study";
}

async function imagingSaleCatalogIdsForRequest(requestId: string): Promise<Set<string>> {
  const { data: sales } = await supabase.from("lab_sales").select("id").eq("imaging_request_id", requestId);
  if (!sales?.length) return new Set();
  const saleIds = (sales as Array<{ id: string }>).map((s) => s.id).filter(Boolean);
  const { data: lines } = await supabase
    .from("lab_sale_items")
    .select("imaging_catalog_id")
    .in("lab_sale_id", saleIds);
  const ids = new Set<string>();
  for (const r of (lines ?? []) as Array<{ imaging_catalog_id?: string | null }>) {
    const id = String(r.imaging_catalog_id ?? "").trim();
    if (id) ids.add(id);
  }
  return ids;
}

async function imagingSaleLinesForRequest(requestId: string): Promise<PricedItem[]> {
  const { data: sales } = await supabase.from("lab_sales").select("id").eq("imaging_request_id", requestId);
  if (!sales?.length) return [];
  const saleIds = (sales as Array<{ id: string }>).map((s) => s.id).filter(Boolean);
  const { data: lines } = await supabase
    .from("lab_sale_items")
    .select("imaging_catalog_id, unit_price, quantity, discount, notes")
    .in("lab_sale_id", saleIds);
  const rows = (lines ?? []) as Array<{
    imaging_catalog_id?: string | null;
    unit_price?: number | string | null;
    quantity?: number | null;
    discount?: number | string | null;
    notes?: string | null;
  }>;
  const catalogIds = [...new Set(rows.map((r) => String(r.imaging_catalog_id ?? "").trim()).filter(Boolean))];
  const itemRes = await fetchImagingRequestItemsForRequestIdsClient([requestId]);
  const namesByCatalogId = new Map<string, string>();
  for (const r of itemRes.rows) {
    const id = String(r.imaging_catalog_id ?? "").trim();
    if (!id) continue;
    const label = r.study_name?.trim() || r.study_code?.trim();
    if (label) namesByCatalogId.set(id, label);
  }
  const catalogNames = await fetchImagingCatalogNamesByIds(catalogIds);
  for (const [id, label] of catalogNames) {
    if (!namesByCatalogId.has(id)) namesByCatalogId.set(id, label);
  }
  const out: PricedItem[] = [];
  for (const r of rows) {
    const cid = String(r.imaging_catalog_id ?? "").trim();
    if (!cid) continue;
    const name = imagingStudyDisplayName(cid, namesByCatalogId, r.notes);
    out.push({ name, price: saleLineAmount(r.unit_price, r.quantity, r.discount) });
  }
  return out;
}

function DiagnosticItemList({ items }: { items: PricedItem[] }) {
  if (items.length === 0) return null;
  return (
    <Box component="ul" sx={{ m: 0, pl: 2.25 }}>
      {items.map((it, idx) => (
        <Box component="li" key={`${it.name}-${idx}`} sx={{ mb: 0.25 }}>
          <Typography variant="body2" component="span">
            {it.name}
          </Typography>
          <Typography variant="body2" component="span" sx={{ fontWeight: 800, ml: 1 }}>
            {formatMoney(it.price)}
          </Typography>
        </Box>
      ))}
    </Box>
  );
}

type ChargeLineDraft = {
  key: string;
  serviceId: string;
  price: string;
  discountTypeId: string;
};

function newChargeLine(): ChargeLineDraft {
  return {
    key: crypto.randomUUID(),
    serviceId: "",
    price: "",
    discountTypeId: "",
  };
}

function PaidStatusChip() {
  return <Chip label="Paid" size="small" color="success" sx={{ fontWeight: 700, height: 22 }} />;
}

function linesSnapshot(lines: ChargeLineDraft[]): string {
  return JSON.stringify(
    lines.map((l) => ({
      serviceId: l.serviceId.trim(),
      price: String(l.price ?? "").trim(),
      discountTypeId: l.discountTypeId.trim(),
    })),
  );
}

export default function ChargesServicesPanel({ transId, patient }: { transId: string; patient: ConsultationPatient }) {
  const { user, profile } = useAuth();
  const { registerSaveHandler, setPanelDirty } = useConsultationSave();
  const [loadingServices, setLoadingServices] = useState(true);
  const [loadingDiscounts, setLoadingDiscounts] = useState(true);
  const [error, setError] = useState("");
  const [services, setServices] = useState<PhysicianServiceRow[]>([]);
  const [discounts, setDiscounts] = useState<DiscountTypeRow[]>([]);
  const [lines, setLines] = useState<ChargeLineDraft[]>(() => [newChargeLine()]);
  const [saveLoading, setSaveLoading] = useState(false);
  const [toastOpen, setToastOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [toastSeverity, setToastSeverity] = useState<"success" | "error">("success");
  const [existingSaleId, setExistingSaleId] = useState<string | null>(null);
  const baselineRef = useRef<string>(linesSnapshot([newChargeLine()]));
  const hydratedRef = useRef(false);
  const [labPaidItems, setLabPaidItems] = useState<PricedItem[]>([]);
  const [labDueItems, setLabDueItems] = useState<PricedItem[]>([]);
  const [imagingPaidItems, setImagingPaidItems] = useState<PricedItem[]>([]);
  const [imagingDueItems, setImagingDueItems] = useState<PricedItem[]>([]);
  const [pendingLabAmendment, setPendingLabAmendment] = useState<PendingAmendmentView | null>(null);
  const [pendingImagingAmendment, setPendingImagingAmendment] = useState<PendingAmendmentView | null>(null);
  const [draftLabItems, setDraftLabItems] = useState<PricedItem[]>([]);
  const [draftImagingItems, setDraftImagingItems] = useState<PricedItem[]>([]);
  const activeTab = useContext(ConsultationActiveTabContext);
  const [paidPhysicianLines, setPaidPhysicianLines] = useState<PaidPhysicianLineStatus>(() => ({
    exactKeys: new Set(),
    feesByServiceId: new Map(),
  }));

  const refreshPaidStatuses = useCallback(async () => {
    const paidRes = await fetchPaidPhysicianLineStatusForEncounter(transId);
    if (!paidRes.error) setPaidPhysicianLines(paidRes.status);

    let amendRows: DiagnosticAmendmentRow[] = [];
    try {
      const amendRes = await authenticatedFetch(
        `/api/consultation/diagnostic-amend?encounterId=${encodeURIComponent(transId)}`,
        { cache: "no-store" },
      );
      const amendJson = (await amendRes.json().catch(() => ({}))) as {
        amendments?: DiagnosticAmendmentRow[];
        amendment?: DiagnosticAmendmentRow | null;
      };
      if (amendRes.ok) {
        amendRows = Array.isArray(amendJson.amendments)
          ? amendJson.amendments
          : amendJson.amendment
            ? [amendJson.amendment]
            : [];
      }
    } catch {
      amendRows = [];
    }
    const labAmend = amendRows.find((r) => r.lab_request_id);
    const imgAmend = amendRows.find((r) => r.imaging_request_id);
    setPendingLabAmendment(
      labAmend
        ? {
            kind: "lab",
            amountDelta: moneyNum(labAmend.amount_delta),
            added: (labAmend.summary_json?.added ?? []).map((l) => ({
              name: l.label,
              price: moneyNum(l.amount),
            })),
            removed: (labAmend.summary_json?.removed ?? []).map((l) => ({
              name: l.label,
              price: moneyNum(l.amount),
            })),
          }
        : null,
    );
    setPendingImagingAmendment(
      imgAmend
        ? {
            kind: "imaging",
            amountDelta: moneyNum(imgAmend.amount_delta),
            added: (imgAmend.summary_json?.added ?? []).map((l) => ({
              name: l.label,
              price: moneyNum(l.amount),
            })),
            removed: (imgAmend.summary_json?.removed ?? []).map((l) => ({
              name: l.label,
              price: moneyNum(l.amount),
            })),
          }
        : null,
    );
  }, [transId]);

  useEffect(() => {
    let cancelled = false;
    setLoadingServices(true);
    setError("");
    void (async () => {
      const r = await fetchActivePhysicianServices();
      if (cancelled) return;
      setLoadingServices(false);
      if (r.error) {
        setError(r.error);
        setServices([]);
      } else {
        setServices(r.services);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoadingDiscounts(true);
    void (async () => {
      const r = await fetchActiveDiscountTypes();
      if (cancelled) return;
      setLoadingDiscounts(false);
      if (r.error) {
        const msg = r.error ?? "Failed to load discounts.";
        setError((prev) => (prev ? prev : msg));
        setDiscounts([]);
      } else {
        setDiscounts(r.discounts);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    void refreshPaidStatuses();
  }, [refreshPaidStatuses]);

  useEffect(() => {
    let cancelled = false;
    setExistingSaleId(null);
    hydratedRef.current = false;
    void (async () => {
      await refreshPaidStatuses();
      if (cancelled) return;
      const r = await fetchLatestPhysicianFeeSaleForEncounter(transId);
      if (cancelled) return;
      if (r.error) return;
      if (!r.sale) return;
      setExistingSaleId(r.sale.id);
      if (!r.sale.notes) return;
      try {
        const parsed = JSON.parse(r.sale.notes) as { charges_services_lines?: Array<{ serviceId?: string; price?: string; discountTypeId?: string }> };
        const arr = parsed?.charges_services_lines ?? [];
        if (!Array.isArray(arr) || arr.length === 0) return;
        const next = arr.map((row) => ({
            key: crypto.randomUUID(),
            serviceId: String(row.serviceId ?? ""),
            price: String(row.price ?? ""),
            discountTypeId: String(row.discountTypeId ?? ""),
          }));
        baselineRef.current = linesSnapshot(next);
        hydratedRef.current = true;
        setLines(next);
      } catch {
        // ignore invalid JSON
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [transId, refreshPaidStatuses]);

  useEffect(() => {
    // If there was no saved sale loaded, treat the current lines as baseline once services load.
    if (hydratedRef.current) return;
    if (loadingServices) return;
    baselineRef.current = linesSnapshot(lines);
    hydratedRef.current = true;
  }, [loadingServices, lines]);

  const refreshLabBillingSections = useCallback(async () => {
    setLabPaidItems([]);
    setLabDueItems([]);
    const enc = await fetchLabRequestsForEncounter(transId);
    if (enc.error || enc.requests.length === 0) return;

    const requests = [...enc.requests].sort((a, b) => a.created_at.localeCompare(b.created_at));
    const reqIds = requests.map((r) => r.id).filter(Boolean);
    const { data: salesRows } = await supabase.from("lab_sales").select("lab_request_id").in("lab_request_id", reqIds);
    const paidReqIds = new Set(
      ((salesRows ?? []) as Array<{ lab_request_id?: string }>)
        .map((r) => String(r.lab_request_id ?? "").trim())
        .filter(Boolean),
    );

    const allTestIds = [...new Set(requests.flatMap((r) => r.labTestIds))];
    if (allTestIds.length === 0) return;

    const prices = await fetchActiveLabPricesByTestIds(allTestIds);
    if (prices.error) return;
    const tests = await fetchLabTestsByIds(allTestIds);
    if (tests.error) return;

    const junctionPkgNums = [
      ...new Set(
        requests
          .flatMap((r) => r.lab_packages ?? [])
          .map((p) => parseLabRequestPackageId(p.id))
          .filter((n): n is number => n != null),
      ),
    ];
    const pkgCtx = await resolveLabPackageDisplayContext(allTestIds, junctionPkgNums);
    if (pkgCtx.error) return;

    const paid: PricedItem[] = [];
    const due: PricedItem[] = [];
    const dueTestIds = new Set<string>();

    for (const req of requests) {
      if (paidReqIds.has(req.id)) {
        const saleLines = await labSaleLinesForRequest(req.id);
        const saleTestIds = await labSaleTestIdsForRequest(req.id);
        paid.push(...saleLines);

        for (const item of buildLabAdditionalDueDisplayItems(
          req,
          saleTestIds,
          prices.pricesByTestId,
          tests.testsById,
          pkgCtx.membersByPackageId,
          pkgCtx.packageDetailsLookup,
        )) {
          const id = item.testId?.trim();
          if (id && dueTestIds.has(id)) continue;
          if (id) dueTestIds.add(id);
          due.push(item);
        }
      } else {
        for (const item of buildLabDueDisplayItemsForRequest(
          req,
          prices.pricesByTestId,
          tests.testsById,
          pkgCtx.membersByPackageId,
          pkgCtx.packageDetailsLookup,
        )) {
          const id = item.testId?.trim();
          if (id && dueTestIds.has(id)) continue;
          if (id) dueTestIds.add(id);
          due.push(item);
        }
      }
    }

    const sortItems = (list: PricedItem[]) =>
      list.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
    setLabPaidItems(sortItems(paid));
    setLabDueItems(sortItems(due));
  }, [transId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await refreshLabBillingSections();
      await refreshPaidStatuses();
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshLabBillingSections, refreshPaidStatuses]);

  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent<{ transId?: string }>;
      if (!ce.detail?.transId || ce.detail.transId !== transId) return;
      void refreshLabBillingSections();
      void refreshPaidStatuses();
    };
    window.addEventListener("lifehub:lab-requests-updated", handler);
    return () => {
      window.removeEventListener("lifehub:lab-requests-updated", handler);
    };
  }, [refreshLabBillingSections, refreshPaidStatuses, transId]);

  const refreshImagingBillingSections = useCallback(async () => {
    setImagingPaidItems([]);
    setImagingDueItems([]);
    const { data: reqRows } = await supabase
      .from("imaging_requests")
      .select("id, created_at")
      .eq("encounter_id", transId)
      .order("created_at", { ascending: true });
    const requests = (reqRows ?? []) as Array<{ id: string; created_at: string }>;
    if (requests.length === 0) return;

    const reqIds = requests.map((r) => r.id).filter(Boolean);
    const { data: salesRows } = await supabase
      .from("lab_sales")
      .select("imaging_request_id")
      .in("imaging_request_id", reqIds);
    const paidReqIds = new Set(
      ((salesRows ?? []) as Array<{ imaging_request_id?: string }>)
        .map((r) => String(r.imaging_request_id ?? "").trim())
        .filter(Boolean),
    );

    const itemRes = await fetchImagingRequestItemsForRequestIdsClient(reqIds);
    if (itemRes.error) return;

    const paid: PricedItem[] = [];
    const due: PricedItem[] = [];

    const pushDue = (items: PricedItem[]) => {
      for (const item of items) {
        if (roundMoney2(moneyNum(item.price)) <= 0) continue;
        due.push(item);
      }
    };

    for (const req of requests) {
      const rows = itemRes.rows.filter((r) => r.imaging_request_id === req.id);
      const currentItems: PricedItem[] = rows.map((r) => ({
        name: r.study_name?.trim() || r.study_code?.trim() || "Imaging study",
        price: roundMoney2(moneyNum(r.unit_price)),
      }));
      if (paidReqIds.has(req.id)) {
        const saleLines = await imagingSaleLinesForRequest(req.id);
        const saleCatalogIds = await imagingSaleCatalogIdsForRequest(req.id);
        paid.push(...saleLines);
        for (const row of rows) {
          const cid = String(row.imaging_catalog_id ?? "").trim();
          if (!cid || saleCatalogIds.has(cid)) continue;
          const price = roundMoney2(moneyNum(row.unit_price));
          if (price <= 0) continue;
          due.push({
            name: row.study_name?.trim() || row.study_code?.trim() || "Imaging study",
            price,
          });
        }
      } else {
        pushDue(currentItems);
      }
    }

    const sortItems = (list: PricedItem[]) =>
      list.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
    setImagingPaidItems(sortItems(paid));
    setImagingDueItems(sortItems(due));
  }, [transId]);

  useEffect(() => {
    void refreshImagingBillingSections();
    void refreshPaidStatuses();
  }, [refreshImagingBillingSections, refreshPaidStatuses]);

  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent<{ transId?: string }>;
      if (!ce.detail?.transId || ce.detail.transId !== transId) return;
      void refreshImagingBillingSections();
      void refreshPaidStatuses();
    };
    window.addEventListener("lifehub:imaging-updated", handler);
    return () => window.removeEventListener("lifehub:imaging-updated", handler);
  }, [refreshImagingBillingSections, refreshPaidStatuses, transId]);

  useEffect(() => {
    if (activeTab !== 6) return;
    void refreshLabBillingSections();
    void refreshImagingBillingSections();
    void refreshPaidStatuses();
  }, [activeTab, refreshLabBillingSections, refreshImagingBillingSections, refreshPaidStatuses]);

  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent<{
        transId?: string;
        unstagedLab?: PricedItem[];
        unstagedImaging?: PricedItem[];
      }>;
      if (ce.detail?.transId !== transId) return;
      setDraftLabItems(Array.isArray(ce.detail.unstagedLab) ? ce.detail.unstagedLab : []);
      setDraftImagingItems(Array.isArray(ce.detail.unstagedImaging) ? ce.detail.unstagedImaging : []);
    };
    window.addEventListener("lifehub:consultation-charges-draft", handler);
    return () => window.removeEventListener("lifehub:consultation-charges-draft", handler);
  }, [transId]);

  const serviceById = useMemo(() => {
    const m = new Map<string, PhysicianServiceRow>();
    for (const s of services) m.set(String(s.id), s);
    return m;
  }, [services]);

  const discountById = useMemo(() => {
    const m = new Map<string, DiscountTypeRow>();
    for (const d of discounts) m.set(String(d.id), d);
    return m;
  }, [discounts]);

  const serviceOptions = useMemo(() => services, [services]);
  const discountOptions = useMemo(() => discounts, [discounts]);

  const outlinedFieldSx = useMemo(
    () =>
      ({
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
      }) as const,
    [],
  );

  const emptyState = useMemo(() => {
    if (loadingServices) return null;
    if (error) return null;
    if (services.length > 0) return null;
    return (
      <Typography variant="body2" color="text.secondary">
        No active services found.
      </Typography>
    );
  }, [loadingServices, error, services.length]);

  const calcDiscountedPrice = useCallback(
    (line: ChargeLineDraft): string => {
      const base = moneyNum(line.price);
      const d = line.discountTypeId ? discountById.get(line.discountTypeId) ?? null : null;
      const pct = pctNum(d?.discount_pct);
      const out = base * (1 - pct / 100);
      return Number.isFinite(out) ? formatMoney(out) : formatMoney(base);
    },
    [discountById],
  );

  const physicianTotals = useMemo(() => {
    const picked = lines.filter((l) => l.serviceId.trim() !== "");
    const subtotal = picked.reduce((sum, l) => sum + moneyNum(l.price), 0);
    const discountAmount = picked.reduce((sum, l) => {
      const base = moneyNum(l.price);
      const d = l.discountTypeId ? discountById.get(l.discountTypeId) ?? null : null;
      const pct = pctNum(d?.discount_pct);
      const out = base * (1 - pct / 100);
      const disc = base - (Number.isFinite(out) ? out : base);
      return sum + disc;
    }, 0);
    const totalAmount = subtotal - discountAmount;
    const discountTypeId =
      picked.length > 0 && picked.every((l) => l.discountTypeId && l.discountTypeId === picked[0]!.discountTypeId)
        ? Number(picked[0]!.discountTypeId)
        : null;
    return {
      subtotal,
      discountAmount,
      totalAmount,
      discountTypeId: Number.isFinite(discountTypeId as number) ? (discountTypeId as number) : null,
    };
  }, [lines, discountById]);

  const sumPricedItems = (items: PricedItem[]) => items.reduce((s, it) => roundMoney2(s + it.price), 0);

  const physicianDueTotal = useMemo(() => {
    let subtotal = 0;
    let discountAmount = 0;
    for (const l of lines.filter((x) => x.serviceId.trim() !== "")) {
      if (isPhysicianChargeLinePaid(l, paidPhysicianLines)) continue;
      const base = moneyNum(l.price);
      const d = l.discountTypeId ? discountById.get(l.discountTypeId) ?? null : null;
      const pct = pctNum(d?.discount_pct);
      const out = base * (1 - pct / 100);
      subtotal += base;
      discountAmount += base - (Number.isFinite(out) ? out : base);
    }
    return roundMoney2(subtotal - discountAmount);
  }, [lines, paidPhysicianLines, discountById]);

  const labPaidTotal = useMemo(() => sumPricedItems(labPaidItems), [labPaidItems]);
  const labDueFromOrders = useMemo(() => sumPricedItems(labDueItems), [labDueItems]);
  const imagingPaidTotal = useMemo(() => sumPricedItems(imagingPaidItems), [imagingPaidItems]);
  const imagingDueFromOrders = useMemo(() => sumPricedItems(imagingDueItems), [imagingDueItems]);

  const draftLabTotal = useMemo(() => sumPricedItems(draftLabItems), [draftLabItems]);
  const draftImagingTotal = useMemo(() => sumPricedItems(draftImagingItems), [draftImagingItems]);

  const labDueDisplayItems = useMemo(() => {
    if (pendingLabAmendment && pendingLabAmendment.amountDelta > 0) {
      if (labDueItems.length > 0) return labDueItems;
      return pendingLabAmendment.added;
    }
    return labDueItems;
  }, [pendingLabAmendment, labDueItems]);

  const labDueTotal = useMemo(() => {
    if (labDueDisplayItems.length > 0) {
      return roundMoney2(sumPricedItems(labDueDisplayItems));
    }
    if (pendingLabAmendment && pendingLabAmendment.amountDelta > 0) {
      return roundMoney2(pendingLabAmendment.amountDelta);
    }
    return roundMoney2(labDueFromOrders);
  }, [labDueDisplayItems, pendingLabAmendment, labDueFromOrders]);

  const imagingDueDisplayItems = useMemo(() => {
    if (pendingImagingAmendment && pendingImagingAmendment.amountDelta > 0) {
      return pendingImagingAmendment.added.length > 0 ? pendingImagingAmendment.added : imagingDueItems;
    }
    return imagingDueItems;
  }, [pendingImagingAmendment, imagingDueItems]);

  const imagingDueTotal = useMemo(() => {
    if (pendingImagingAmendment && pendingImagingAmendment.amountDelta > 0) {
      return roundMoney2(pendingImagingAmendment.amountDelta);
    }
    return roundMoney2(imagingDueFromOrders);
  }, [pendingImagingAmendment, imagingDueFromOrders]);

  const amountDueAtCashier = roundMoney2(
    physicianDueTotal + labDueTotal + imagingDueTotal + draftLabTotal + draftImagingTotal,
  );

  const labRefundDue =
    pendingLabAmendment && pendingLabAmendment.amountDelta < 0 ? Math.abs(pendingLabAmendment.amountDelta) : 0;
  const imagingRefundDue =
    pendingImagingAmendment && pendingImagingAmendment.amountDelta < 0
      ? Math.abs(pendingImagingAmendment.amountDelta)
      : 0;

  const buildItemRowsFromLines = useCallback(
    (pickedLines: ChargeLineDraft[]): Parameters<typeof replacePhysicianFeeSaleItems>[1] => {
      const itemRows: Parameters<typeof replacePhysicianFeeSaleItems>[1] = [];
      for (const l of pickedLines) {
        const sid = Number(l.serviceId.trim());
        if (!Number.isFinite(sid) || sid <= 0) continue;
        const unitFee = moneyNum(l.price);
        const d = l.discountTypeId ? discountById.get(l.discountTypeId) ?? null : null;
        const pct = pctNum(d?.discount_pct);
        const out = unitFee * (1 - pct / 100);
        const lineDiscount = unitFee - (Number.isFinite(out) ? out : unitFee);
        itemRows.push({
          physician_service_id: sid,
          quantity: 1,
          unit_fee: unitFee,
          discount: lineDiscount,
          notes: d?.name?.trim() ? `Discount: ${d.name}` : null,
        });
      }
      return itemRows;
    },
    [discountById],
  );

  const saveCharges = useCallback(async () => {
    if (!hydratedRef.current || linesSnapshot(lines) === baselineRef.current) return;

    setSaveLoading(true);
    setToastOpen(false);
    try {
      const patientIdNum = (() => {
        const n = Number(String(patient.patientId ?? "").trim());
        return Number.isFinite(n) ? n : null;
      })();
      const physicianIdNum = (() => {
        const u = profile as UserProfile | null;
        const raw = (u as any)?.user_id ?? (user as any)?.user_id ?? (user as any)?.id;
        const n = typeof raw === "number" ? raw : Number(String(raw ?? ""));
        return Number.isFinite(n) ? n : null;
      })();

      const payloadNotes = JSON.stringify({
        charges_services_lines: lines
          .filter((l) => l.serviceId.trim() !== "")
          .map((l) => ({
            serviceId: l.serviceId.trim(),
            price: String(l.price ?? "").trim(),
            discountTypeId: l.discountTypeId.trim() || null,
          })),
      });

      const u = profile as UserProfile | null;
      const servedBy = u?.fullname?.trim() ? u.fullname.trim() : null;

      const resolvedPhysician = await resolveValidPhysicianId(physicianIdNum);
      if (resolvedPhysician.error) {
        setToastSeverity("error");
        setToastMessage(resolvedPhysician.error);
        setToastOpen(true);
        return;
      }
      if (physicianIdNum != null && resolvedPhysician.physicianId == null) {
        setToastSeverity("error");
        setToastMessage("Your user id is not found in the users table. Please re-login or contact admin.");
        setToastOpen(true);
        return;
      }

      const pickedLines = lines.filter((l) => l.serviceId.trim() !== "");
      for (const l of pickedLines) {
        const sid = Number(l.serviceId.trim());
        if (!Number.isFinite(sid) || sid <= 0) {
          setToastSeverity("error");
          setToastMessage("Invalid physician service on a charge line.");
          setToastOpen(true);
          return;
        }
      }

      const latest = await fetchLatestPhysicianFeeSaleForEncounter(transId);
      if (latest.error) {
        setToastSeverity("error");
        setToastMessage(latest.error);
        setToastOpen(true);
        return;
      }

      const paidSaleId =
        latest.sale && String(latest.sale.status ?? "").trim() === PHYSICIAN_FEE_STATUS_PAID ? latest.sale.id : null;

      let targetSaleId = existingSaleId;
      let linesToPersist = pickedLines;
      let saleTotals = physicianTotals;
      let preservePaid = false;

      if (paidSaleId) {
        const itemsRes = await fetchPhysicianFeeSaleItemsWithServiceNames([paidSaleId]);
        if (itemsRes.error) {
          setToastSeverity("error");
          setToastMessage(itemsRes.error);
          setToastOpen(true);
          return;
        }
        const existingItems = itemsRes.itemsBySaleId.get(paidSaleId) ?? [];
        const existingKeys = new Set(
          existingItems.map((it) => `${it.physician_service_id}|${moneyNum(it.unit_fee)}`),
        );
        const newOnly = pickedLines.filter((l) => {
          const sid = Number(l.serviceId.trim());
          return !existingKeys.has(`${sid}|${moneyNum(l.price)}`);
        });

        if (newOnly.length === 0) {
          baselineRef.current = linesSnapshot(lines);
          setPanelDirty("charges-services", false);
          return;
        }

        const newSubtotal = newOnly.reduce((sum, l) => sum + moneyNum(l.price), 0);
        const newDiscount = newOnly.reduce((sum, l) => {
          const base = moneyNum(l.price);
          const d = l.discountTypeId ? discountById.get(l.discountTypeId) ?? null : null;
          const pct = pctNum(d?.discount_pct);
          const out = base * (1 - pct / 100);
          return sum + (base - (Number.isFinite(out) ? out : base));
        }, 0);
        linesToPersist = newOnly;
        saleTotals = {
          subtotal: newSubtotal,
          discountAmount: newDiscount,
          totalAmount: newSubtotal - newDiscount,
          discountTypeId: physicianTotals.discountTypeId,
        };
        targetSaleId = null;
      } else if (targetSaleId && latest.sale?.id === targetSaleId) {
        preservePaid = String(latest.sale.status ?? "").trim() === PHYSICIAN_FEE_STATUS_PAID;
      }

      const itemRows = buildItemRowsFromLines(linesToPersist);
      if (itemRows.length === 0) return;

      const r = await upsertPhysicianFeeSaleForEncounter({
        existingId: targetSaleId,
        patientId: patientIdNum,
        encounterId: transId,
        physicianId: resolvedPhysician.physicianId,
        subtotal: saleTotals.subtotal,
        discountAmount: saleTotals.discountAmount,
        totalAmount: saleTotals.totalAmount,
        discountTypeId: saleTotals.discountTypeId,
        notes: payloadNotes,
        servedBy,
        preservePaidStatus: preservePaid,
      });

      if (r.error) {
        setToastSeverity("error");
        setToastMessage(r.error);
        setToastOpen(true);
        return;
      }

      const saleId = r.id;
      if (!saleId) {
        setToastSeverity("error");
        setToastMessage("Charges saved but no sale id was returned.");
        setToastOpen(true);
        return;
      }

      const itemsRes = await replacePhysicianFeeSaleItems(saleId, itemRows);
      if (itemsRes.error) {
        setToastSeverity("error");
        setToastMessage(itemsRes.error);
        setToastOpen(true);
        return;
      }

      setExistingSaleId(saleId);
      setToastSeverity("success");
      setToastMessage("Charges/services saved.");
      setToastOpen(true);
      await refreshPaidStatuses();
      baselineRef.current = linesSnapshot(lines);
      hydratedRef.current = true;
      setPanelDirty("charges-services", false);
    } finally {
      setSaveLoading(false);
    }
  }, [
    buildItemRowsFromLines,
    discountById,
    existingSaleId,
    lines,
    patient.patientId,
    physicianTotals,
    profile,
    refreshPaidStatuses,
    setPanelDirty,
    transId,
    user,
  ]);

  useEffect(() => {
    return registerSaveHandler("charges-services", saveCharges);
  }, [registerSaveHandler, saveCharges]);

  useEffect(() => {
    if (!hydratedRef.current) return;
    const dirty = linesSnapshot(lines) !== baselineRef.current;
    setPanelDirty("charges-services", dirty);
  }, [lines, setPanelDirty]);

  return (
    <Box>
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

      {loadingServices ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
          <CircularProgress size={28} />
        </Box>
      ) : null}

      {error ? (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      ) : null}

      {emptyState}

      {!loadingServices && !error && services.length > 0 ? (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1.25 }}>
          {lines.map((line, idx) => {
            const selectedService = line.serviceId ? serviceById.get(line.serviceId) ?? null : null;
            const selectedDiscount = line.discountTypeId ? discountById.get(line.discountTypeId) ?? null : null;
            const linePaid = isPhysicianChargeLinePaid(line, paidPhysicianLines);
            return (
              <Box
                key={line.key}
                sx={{
                  borderRadius: 1.5,
                  ...(linePaid
                    ? {
                        bgcolor: "rgba(46, 125, 50, 0.08)",
                        outline: "1px solid",
                        outlineColor: "success.light",
                        px: { xs: 0, md: 0.5 },
                        py: 0.5,
                      }
                    : {}),
                }}
              >
                <Box
                  sx={{
                    display: "grid",
                    gridTemplateColumns: { xs: "1fr", md: "2fr 1fr 1fr 1fr auto" },
                    gap: 1,
                    alignItems: "center",
                  }}
                >
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1, minWidth: 0 }}>
                    <Autocomplete
                      options={serviceOptions}
                      value={selectedService}
                      disabled={linePaid}
                      onChange={(_, v) => {
                        const id = v ? String(v.id) : "";
                        setLines((prev) =>
                          prev.map((r) =>
                            r.key === line.key
                              ? {
                                  ...r,
                                  serviceId: id,
                                  price: v ? String(v.default_fee ?? "") : "",
                                }
                              : r,
                          ),
                        );
                      }}
                      getOptionLabel={(o) => `${o.name} — ${formatMoney(o.default_fee)}`}
                      isOptionEqualToValue={(a, b) => String(a.id) === String(b.id)}
                      sx={{ flex: 1, minWidth: 0 }}
                      renderInput={(params) => (
                        <TextField
                          {...params}
                          label="Service"
                          placeholder="Select service"
                          size="small"
                          sx={outlinedFieldSx}
                          InputProps={{
                            ...params.InputProps,
                            endAdornment: (
                              <>
                                {linePaid ? (
                                  <InputAdornment position="end" sx={{ mr: params.InputProps.endAdornment ? 4 : 0 }}>
                                    <PaidStatusChip />
                                  </InputAdornment>
                                ) : null}
                                {params.InputProps.endAdornment}
                              </>
                            ),
                          }}
                        />
                      )}
                    />
                  </Box>

                  <TextField
                    label="Price"
                    size="small"
                    placeholder="0.00"
                    value={line.price}
                    onChange={(e) => setLines((prev) => prev.map((r) => (r.key === line.key ? { ...r, price: e.target.value } : r)))}
                    sx={outlinedFieldSx}
                    inputProps={{ inputMode: "decimal", readOnly: linePaid }}
                  />

                  <Autocomplete
                    options={discountOptions}
                    loading={loadingDiscounts}
                    value={selectedDiscount}
                    disabled={linePaid}
                    onChange={(_, v) => {
                      const id = v ? String(v.id) : "";
                      setLines((prev) => prev.map((r) => (r.key === line.key ? { ...r, discountTypeId: id } : r)));
                    }}
                    getOptionLabel={(o) => `${o.name} (${pctNum(o.discount_pct)}%)`}
                    isOptionEqualToValue={(a, b) => String(a.id) === String(b.id)}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        label="Discount"
                        placeholder="None"
                        size="small"
                        sx={outlinedFieldSx}
                      />
                    )}
                  />

                  <TextField
                    label="Discounted price"
                    size="small"
                    value={calcDiscountedPrice(line)}
                    InputProps={{ readOnly: true }}
                    sx={outlinedFieldSx}
                  />

                  <IconButton
                    aria-label="Remove service line"
                    size="small"
                    disabled={linePaid}
                    onClick={() => {
                      setLines((prev) => {
                        const next = prev.filter((l) => l.key !== line.key);
                        return next.length === 0 ? [newChargeLine()] : next;
                      });
                    }}
                  >
                    <DeleteOutlineIcon fontSize="small" />
                  </IconButton>
                </Box>

                {idx < lines.length - 1 ? <Divider sx={{ mt: 1.25 }} /> : null}
              </Box>
            );
          })}

          <Box>
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.75 }}>
              Select a service to load its default fee. You can override the price and apply a discount type.
            </Typography>
            <Box sx={{ display: "flex", justifyContent: "flex-start" }}>
              <IconButton
                aria-label="Add service"
                onClick={() => setLines((prev) => [...prev, newChargeLine()])}
                size="small"
              >
                <AddOutlinedIcon fontSize="small" />
              </IconButton>
              <Typography variant="body2" sx={{ alignSelf: "center", ml: 0.75, fontWeight: 700 }}>
                Add service
              </Typography>
            </Box>
          </Box>

          <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 1, flexWrap: "wrap", mt: 1, alignItems: "flex-start" }}>
            <Box sx={{ mr: "auto" }}>
              {draftLabItems.length > 0 ? (
                <Box sx={{ mt: 1.5, p: 1.25, borderRadius: 1.5, bgcolor: "rgba(2, 136, 209, 0.06)", border: "1px dashed", borderColor: "info.light" }}>
                  <Typography variant="subtitle2" fontWeight={800} sx={{ mb: 0.5, color: "info.dark" }}>
                    Laboratory — selected in Plans (not applied yet)
                  </Typography>
                  <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.75 }}>
                    Open Labs → Save request or Save changes to add these to the order. Cashier payment is after that. Saving
                    the consultation records the visit; it does not add lab tests by itself.
                  </Typography>
                  <DiagnosticItemList items={draftLabItems} />
                  <Typography variant="caption" sx={{ display: "block", mt: 0.5, fontWeight: 700, color: "info.dark" }}>
                    Estimated if applied: <Box component="span">{formatMoney(draftLabTotal)}</Box>
                  </Typography>
                </Box>
              ) : null}

              {draftImagingItems.length > 0 ? (
                <Box sx={{ mt: 1.5, p: 1.25, borderRadius: 1.5, bgcolor: "rgba(2, 136, 209, 0.06)", border: "1px dashed", borderColor: "info.light" }}>
                  <Typography variant="subtitle2" fontWeight={800} sx={{ mb: 0.5, color: "info.dark" }}>
                    Imaging — selected in Plans (not applied yet)
                  </Typography>
                  <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.75 }}>
                    Open Imaging → Save request or Save changes to apply these studies. After that, the patient pays at the
                    cashier. Saving the consultation records the visit; it does not apply imaging by itself.
                  </Typography>
                  <DiagnosticItemList items={draftImagingItems} />
                  <Typography variant="caption" sx={{ display: "block", mt: 0.5, fontWeight: 700, color: "info.dark" }}>
                    Estimated if applied: <Box component="span">{formatMoney(draftImagingTotal)}</Box>
                  </Typography>
                </Box>
              ) : null}

              {labPaidItems.length > 0 ? (
                <Box sx={{ mt: 1.5 }}>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}>
                    <Typography variant="subtitle2" fontWeight={800}>
                      Laboratory — paid at cashier
                    </Typography>
                    <PaidStatusChip />
                  </Box>
                  <DiagnosticItemList items={labPaidItems} />
                  <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
                    Settled total: <Box component="span" sx={{ fontWeight: 800 }}>{formatMoney(labPaidTotal)}</Box>
                  </Typography>
                </Box>
              ) : null}

              {labDueDisplayItems.length > 0 || pendingLabAmendment ? (
                <Box sx={{ mt: 1.5 }}>
                  <Typography variant="subtitle2" fontWeight={800} sx={{ mb: 0.5, color: "warning.dark" }}>
                    Laboratory — additional due at cashier
                  </Typography>
                  <DiagnosticItemList items={labDueDisplayItems} />
                  <Typography variant="caption" sx={{ display: "block", mt: 0.5, fontWeight: 700, color: "warning.dark" }}>
                    Balance due: <Box component="span">{formatMoney(labDueTotal)}</Box>
                  </Typography>
                </Box>
              ) : null}

              {imagingPaidItems.length > 0 ? (
                <Box sx={{ mt: 1.5 }}>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}>
                    <Typography variant="subtitle2" fontWeight={800}>
                      Imaging — paid at cashier
                    </Typography>
                    <PaidStatusChip />
                  </Box>
                  <DiagnosticItemList items={imagingPaidItems} />
                  <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
                    Settled total: <Box component="span" sx={{ fontWeight: 800 }}>{formatMoney(imagingPaidTotal)}</Box>
                  </Typography>
                </Box>
              ) : null}

              {imagingDueDisplayItems.length > 0 || pendingImagingAmendment ? (
                <Box sx={{ mt: 1.5 }}>
                  <Typography variant="subtitle2" fontWeight={800} sx={{ mb: 0.5, color: "warning.dark" }}>
                    Imaging — additional due at cashier
                  </Typography>
                  <DiagnosticItemList items={imagingDueDisplayItems} />
                  <Typography variant="caption" sx={{ display: "block", mt: 0.5, fontWeight: 700, color: "warning.dark" }}>
                    Balance due: <Box component="span">{formatMoney(imagingDueTotal)}</Box>
                  </Typography>
                </Box>
              ) : null}

              {(labRefundDue > 0 || imagingRefundDue > 0) && (
                <Typography variant="caption" color="info.main" display="block" sx={{ mt: 1 }}>
                  {labRefundDue > 0 ? `Laboratory refund due: ${formatMoney(labRefundDue)}. ` : ""}
                  {imagingRefundDue > 0 ? `Imaging refund due: ${formatMoney(imagingRefundDue)}.` : ""}
                </Typography>
              )}

              <Box sx={{ mt: 1.5, pt: 1, borderTop: "1px solid", borderColor: "divider" }}>
                {physicianDueTotal > 0 ? (
                  <Typography variant="body2" sx={{ mb: 0.5 }}>
                    Physician services due:{" "}
                    <Box component="span" sx={{ fontWeight: 800 }}>{formatMoney(physicianDueTotal)}</Box>
                  </Typography>
                ) : null}
                <Typography variant="body2">
                  <Box component="span" sx={{ fontWeight: 800, color: amountDueAtCashier > 0 ? "warning.dark" : "success.main" }}>
                    Amount due at cashier: {formatMoney(amountDueAtCashier)}
                  </Box>
                </Typography>
                {labPaidTotal > 0 || imagingPaidTotal > 0 ? (
                  <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
                    Paid laboratory {formatMoney(labPaidTotal)}
                    {imagingPaidTotal > 0 ? ` · Paid imaging ${formatMoney(imagingPaidTotal)}` : ""} (already settled)
                  </Typography>
                ) : null}
              </Box>
            </Box>
            <Button
              type="button"
              variant="contained"
              color="secondary"
              size="small"
              disabled={saveLoading || loadingServices}
              onClick={() => void saveCharges()}
              sx={{ textTransform: "none", alignSelf: "flex-start" }}
            >
              {saveLoading ? "Saving…" : "Save Charges"}
            </Button>
          </Box>
        </Box>
      ) : null}
    </Box>
  );
}

