"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  InputAdornment,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
  MenuItem,
  List,
  ListItemButton,
  ListItemText,
  FormControlLabel,
  Switch,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import RemoveIcon from "@mui/icons-material/Remove";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import PointOfSaleIcon from "@mui/icons-material/PointOfSale";
import ManageSearchIcon from "@mui/icons-material/ManageSearch";
import Inventory2OutlinedIcon from "@mui/icons-material/Inventory2Outlined";
import PriceChangeOutlinedIcon from "@mui/icons-material/PriceChangeOutlined";
import LogoutIcon from "@mui/icons-material/Logout";
import FullscreenIcon from "@mui/icons-material/Fullscreen";
import FullscreenExitIcon from "@mui/icons-material/FullscreenExit";
import BackspaceOutlinedIcon from "@mui/icons-material/BackspaceOutlined";
import CalculateOutlinedIcon from "@mui/icons-material/CalculateOutlined";
import PauseCircleOutlineIcon from "@mui/icons-material/PauseCircleOutline";
import PlaylistPlayIcon from "@mui/icons-material/PlaylistPlay";
import LocalOfferIcon from "@mui/icons-material/LocalOffer";
import RemoveShoppingCartOutlinedIcon from "@mui/icons-material/RemoveShoppingCartOutlined";
import AssignmentReturnOutlinedIcon from "@mui/icons-material/AssignmentReturnOutlined";
import { useAuth } from "@/components/AuthProvider";
import { authenticatedFetch } from "@/lib/authenticatedFetch";
import {
  openPharmacySaleReceiptPrint,
  pharmacyReceiptLineFromCart,
} from "@/lib/pharmacySaleReceiptPrint";
import { openPharmacyShiftReadingPrint } from "@/lib/pharmacyShiftReadingPrint";
import { LIFEHUB_LOGO_SRC } from "@/lib/lifehubLogo";
import type { ProductPosRow } from "@/lib/pharmacyPosDb";
import { fetchActiveDiscountTypes, type DiscountTypeRow } from "@/lib/discountTypes";
import {
  POS_BUILTIN_DISCOUNT_PRESETS,
  POS_DISCOUNT_NONE,
  computePosCartTotals,
  discountSelectionsEqual,
  formatPosDiscountButtonLabel,
  isStatutoryScPwdCode,
  selectionFromDbType,
  type PosDiscountSelection,
} from "@/lib/pharmacyPosDiscount";
import { fetchPrescriptionCartByEncounterAuth } from "@/lib/pharmacyPrescriptionCart";
import {
  aggregateShiftSales,
  closeShiftWithZ,
  fetchOpenShiftForUser,
  fetchPosProductById,
  fetchProductByBarcode,
  fetchStockLotsForProduct,
  fetchOnHandQtyByProductIds,
  getClosestStockExpiryYmd,
  openPharmacyShift,
  recordXReadingForShift,
  searchPosProducts,
  listPharmacyCategories,
  insertPharmacyCategory,
  insertProductForPos,
  formatProductOptionLabel,
  type PharmacyCategoryRow,
  type PharmacySaleSearchRow,
  type PharmacySaleVoidDetail,
  processPharmacySaleReturn,
} from "@/lib/pharmacyPosDb";
import {
  fetchPharmacySaleDetailApi,
  searchPharmacySalesByOrApi,
  voidPharmacySaleApi,
} from "@/lib/pharmacySalesApi";
import SupervisorPasswordDialog, {
  type SupervisorCartAction,
} from "@/components/pharmacy/SupervisorPasswordDialog";
import LineAuthorizationRequestDialog from "@/components/pharmacy/LineAuthorizationRequestDialog";
import {
  cartLineToSnapshot,
  createCartLineRequestApi,
  fetchCartLineRequestApi,
  subscribeCartLineRequestsForUser,
  type PharmacyCartLineRequestRow,
} from "@/lib/pharmacyCartLineRequests";
import {
  resolveApprovedCartQuantity,
  type CartLineRequestAction,
} from "@/lib/pharmacyLineRequestServer";

type CartLine = {
  key: string;
  product: ProductPosRow;
  qty: number;
  prescriptionItemId?: string | null;
};

/** Payment options shown in the pay modal (cash drawer vs e-wallet). */
const PAY_MODAL_METHODS = ["Cash", "GCash"] as const;

const HELD_SALES_STORAGE_KEY = "lifehub-pharmacy-pos-held-v1";

/** Footer POS actions: compact colorful contained buttons (high contrast on white bar). */
const POS_FOOTER_BTN_SX = {
  minHeight: 48,
  px: 2,
  fontWeight: 700,
  borderRadius: 2,
  boxShadow: 1,
  "&:hover": { boxShadow: 2 },
} as const;

/** Philippine peso denominations for drawer count (bills + peso coins only; no centavos). */
const PHP_DRAWER_DENOMS: { value: number; label: string }[] = [
  { value: 1000, label: "₱1,000" },
  { value: 500, label: "₱500" },
  { value: 200, label: "₱200" },
  { value: 100, label: "₱100" },
  { value: 50, label: "₱50" },
  { value: 20, label: "₱20" },
  { value: 10, label: "₱10" },
  { value: 5, label: "₱5" },
  { value: 1, label: "₱1" },
];

type HeldSaleSnapshot = {
  id: string;
  savedAt: number;
  label: string;
  lines: CartLine[];
  prescriptionId: string | null;
  patientId: number | null;
  patientName: string | null;
  posDiscount?: PosDiscountSelection;
};

function emptyDenomQty(): Record<string, string> {
  return Object.fromEntries(PHP_DRAWER_DENOMS.map((d) => [String(d.value), ""]));
}

/** On-hand qty in POS search table (0 if none / not loaded). */
function formatPosStockQty(qty: number | undefined): string {
  if (qty == null || !Number.isFinite(qty) || qty <= 0) return "0";
  return Number.isInteger(qty) ? String(qty) : qty.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

function parseDenomQty(raw: string): number {
  const n = parseInt(raw.replace(/\D/g, ""), 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/** Larger touch targets for cashier POS top bar (scanner-friendly). */
const POS_BAR_FIELD_SX = {
  "& .MuiOutlinedInput-root": {
    minHeight: 52,
    borderRadius: 2,
    fontSize: "1.0625rem",
  },
  "& .MuiInputBase-input": {
    py: 1.35,
    fontSize: "1.0625rem",
    lineHeight: 1.4,
  },
  "& .MuiInputBase-input::placeholder": {
    opacity: 0.65,
  },
} as const;

/** Cash count dialog: compact but readable quantity / amount fields. */
const CASH_COUNT_FIELD_SX = {
  "& .MuiOutlinedInput-root": {
    minHeight: 44,
    borderRadius: 1.5,
    fontSize: "1rem",
  },
  "& .MuiInputBase-input": {
    py: 1,
    px: 1,
    fontSize: "1rem",
    lineHeight: 1.35,
    fontVariantNumeric: "tabular-nums",
    textAlign: "right" as const,
  },
  "& .MuiInputLabel-root": {
    fontSize: "0.875rem",
  },
  "& .MuiInputLabel-shrink": {
    fontSize: "0.8125rem",
  },
} as const;

function defaultVatPct(row: ProductPosRow): number {
  if (row.vat_exempt) return 0;
  return row.vat_rate != null ? Number(row.vat_rate) : 12;
}

/** VAT-inclusive shelf price → VAT portion */
function vatPortionFromInclusive(gross: number, vatPct: number): number {
  if (vatPct <= 0 || gross <= 0) return 0;
  return gross - gross / (1 + vatPct / 100);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function parseMoneyAmount(raw: string): number {
  const t = raw.trim().replace(/,/g, "");
  if (t === "") return 0;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? round2(n) : 0;
}

/** Cash tendered field — digits with at most one decimal and two centavo places. */
function sanitizeCashTenderedInput(raw: string): string {
  let s = raw.replace(/[^\d.]/g, "");
  const dot = s.indexOf(".");
  if (dot === -1) return s;
  const whole = s.slice(0, dot);
  const frac = s.slice(dot + 1).replace(/\./g, "").slice(0, 2);
  return `${whole}.${frac}`;
}

/** Encounter `trans_id` from printed prescription QR (UUID v4 shape). */
function isEncounterTransId(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s.trim());
}

function getFullscreenElement(): Element | null {
  const d = document as Document & {
    webkitFullscreenElement?: Element | null;
    msFullscreenElement?: Element | null;
  };
  return document.fullscreenElement ?? d.webkitFullscreenElement ?? d.msFullscreenElement ?? null;
}

async function requestFullscreenEl(el: Element): Promise<void> {
  const anyEl = el as Element & {
    webkitRequestFullscreen?: () => Promise<void>;
    msRequestFullscreen?: () => Promise<void>;
  };
  if (el.requestFullscreen) await el.requestFullscreen();
  else if (anyEl.webkitRequestFullscreen) await anyEl.webkitRequestFullscreen();
  else if (anyEl.msRequestFullscreen) anyEl.msRequestFullscreen();
}

async function exitFullscreenDoc(): Promise<void> {
  const d = document as Document & {
    webkitExitFullscreen?: () => Promise<void>;
    msExitFullscreen?: () => Promise<void>;
  };
  if (document.exitFullscreen) await document.exitFullscreen();
  else if (d.webkitExitFullscreen) await d.webkitExitFullscreen();
  else if (d.msExitFullscreen) await d.msExitFullscreen();
}

export default function PharmacyPosWorkspace() {
  const { profile } = useAuth();
  const servedBy =
    profile != null && typeof profile.user_id === "number" && Number.isFinite(profile.user_id)
      ? profile.user_id
      : null;

  const [shiftId, setShiftId] = useState<string | null>(null);
  const [shiftBeginningCash, setShiftBeginningCash] = useState<number>(0);
  const [shiftOpenModal, setShiftOpenModal] = useState(false);
  const [beginInput, setBeginInput] = useState("0");

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProductPosRow[]>([]);
  /** Total on-hand qty from `stock` rows (key = product id). */
  const [resultStockQty, setResultStockQty] = useState<Record<string, number>>({});
  const [resultSel, setResultSel] = useState(0);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [cart, setCart] = useState<CartLine[]>([]);
  const [prescriptionId, setPrescriptionId] = useState<string | null>(null);
  const [patientId, setPatientId] = useState<number | null>(null);
  const [patientName, setPatientName] = useState<string | null>(null);

  const [priceCheckOpen, setPriceCheckOpen] = useState(false);
  const [priceCheckQuery, setPriceCheckQuery] = useState("");
  const [priceCheckResults, setPriceCheckResults] = useState<ProductPosRow[]>([]);
  const [priceCheckSel, setPriceCheckSel] = useState(0);
  const [priceCheckHit, setPriceCheckHit] = useState<ProductPosRow | null>(null);
  const [priceCheckHint, setPriceCheckHint] = useState<string | null>(null);
  const priceCheckSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const priceCheckInputRef = useRef<HTMLInputElement>(null);
  const [posInfo, setPosInfo] = useState<string | null>(null);

  const [payOpen, setPayOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<string>("Cash");
  const [amountTendered, setAmountTendered] = useState("");
  const [posDiscount, setPosDiscount] = useState<PosDiscountSelection>(POS_DISCOUNT_NONE);
  const [discountDialogOpen, setDiscountDialogOpen] = useState(false);
  const [discountDraft, setDiscountDraft] = useState<PosDiscountSelection>(POS_DISCOUNT_NONE);
  const [discountCustomPercent, setDiscountCustomPercent] = useState("10");
  const [discountCustomFixed, setDiscountCustomFixed] = useState("0");
  const [dbDiscountTypes, setDbDiscountTypes] = useState<DiscountTypeRow[]>([]);
  const [dbDiscountsLoading, setDbDiscountsLoading] = useState(false);
  const [checkoutErr, setCheckoutErr] = useState<string | null>(null);

  const [shiftDialogOpen, setShiftDialogOpen] = useState(false);
  const [zActualCash, setZActualCash] = useState("");

  const [cashCountOpen, setCashCountOpen] = useState(false);
  const [denomQty, setDenomQty] = useState<Record<string, string>>(emptyDenomQty);
  const [countGcashPeso, setCountGcashPeso] = useState("");
  const [countDebitPeso, setCountDebitPeso] = useState("");

  const [heldSales, setHeldSales] = useState<HeldSaleSnapshot[]>([]);
  const [heldDialogOpen, setHeldDialogOpen] = useState(false);
  const heldHydrated = useRef(false);

  /** Void a completed sale by sale # / search (not the same as removing a cart line). */
  const [voidSaleOpen, setVoidSaleOpen] = useState(false);
  const [voidOrQuery, setVoidOrQuery] = useState("");
  const [voidSaleResults, setVoidSaleResults] = useState<PharmacySaleSearchRow[]>([]);
  const [voidSaleSearchErr, setVoidSaleSearchErr] = useState<string | null>(null);
  const [voidSaleSearching, setVoidSaleSearching] = useState(false);
  const [voidSaleSelectedId, setVoidSaleSelectedId] = useState<string | null>(null);
  const [voidSaleDetail, setVoidSaleDetail] = useState<PharmacySaleVoidDetail | null>(null);
  const [voidSaleDetailLoading, setVoidSaleDetailLoading] = useState(false);
  const [voidSaleBusy, setVoidSaleBusy] = useState(false);
  const [voidReason, setVoidReason] = useState("");

  /** Return / refund: partial or full line returns on a completed sale (stock back + totals adjusted). */
  const [returnSaleOpen, setReturnSaleOpen] = useState(false);
  const [returnOrQuery, setReturnOrQuery] = useState("");
  const [returnSaleResults, setReturnSaleResults] = useState<PharmacySaleSearchRow[]>([]);
  const [returnSaleSearchErr, setReturnSaleSearchErr] = useState<string | null>(null);
  const [returnSaleSearching, setReturnSaleSearching] = useState(false);
  const [returnSaleSelectedId, setReturnSaleSelectedId] = useState<string | null>(null);
  const [returnSaleDetail, setReturnSaleDetail] = useState<PharmacySaleVoidDetail | null>(null);
  const [returnSaleDetailLoading, setReturnSaleDetailLoading] = useState(false);
  const [returnSaleBusy, setReturnSaleBusy] = useState(false);
  const [returnReason, setReturnReason] = useState("");
  const [returnQtyDraft, setReturnQtyDraft] = useState<Record<string, string>>({});

  /** Supervisor gate for cart +/- and delete. */
  const [supervisorDialog, setSupervisorDialog] = useState<{
    action: SupervisorCartAction;
    line: CartLine;
    targetQty?: number;
  } | null>(null);
  const [supervisorRequestBusy, setSupervisorRequestBusy] = useState(false);
  const [supervisorRequestErr, setSupervisorRequestErr] = useState<string | null>(null);

  /** Remote line authorization request flow. */
  const [lineAuthDialogLine, setLineAuthDialogLine] = useState<CartLine | null>(null);
  const [lineAuthBusy, setLineAuthBusy] = useState(false);
  const [lineAuthErr, setLineAuthErr] = useState<string | null>(null);
  const [pendingByLineKey, setPendingByLineKey] = useState<
    Record<string, { requestId: string; action: CartLineRequestAction }>
  >({});
  const [waitRequest, setWaitRequest] = useState<PharmacyCartLineRequestRow | null>(null);
  /** Tap cart qty to edit with numpad (then supervisor gate if changed). */
  const [editCartQtyLine, setEditCartQtyLine] = useState<CartLine | null>(null);
  const [editCartQtyDraft, setEditCartQtyDraft] = useState("1");
  const [editCartQtyErr, setEditCartQtyErr] = useState<string | null>(null);
  const editCartQtyInputRef = useRef<HTMLInputElement | null>(null);
  const editCartQtyFreshRef = useRef(true);

  const searchRef = useRef<HTMLInputElement>(null);
  const posRootRef = useRef<HTMLDivElement>(null);
  /** MUI Dialog portals to body by default; in browser fullscreen only this subtree is visible. */
  const posDialogContainer = useCallback((): HTMLElement | null => posRootRef.current, []);
  const [isFullscreen, setIsFullscreen] = useState(false);

  /** Confirm quantity + show closest expiry before adding from search / barcode. */
  const [addLineOpen, setAddLineOpen] = useState(false);
  const [addLineProduct, setAddLineProduct] = useState<ProductPosRow | null>(null);
  const [addLinePrescId, setAddLinePrescId] = useState<string | null>(null);
  const [addLineQty, setAddLineQty] = useState("1");
  const [addLineQtyErr, setAddLineQtyErr] = useState<string | null>(null);
  const [addLineExpiryReady, setAddLineExpiryReady] = useState(false);
  const [addLineExpiryInfo, setAddLineExpiryInfo] = useState<string | null>(null);
  const addLineQtyInputRef = useRef<HTMLInputElement | null>(null);
  /** After open, first digit (keyboard or numpad) replaces default `1` like a POS register. */
  const addLineQtyFreshRef = useRef(true);
  const resolvedLineRequestIdsRef = useRef<Set<string>>(new Set());
  const payCashInputRef = useRef<HTMLInputElement | null>(null);
  /** After open, first digit (keyboard or numpad) replaces the pre-filled total. */
  const payCashFreshRef = useRef(true);

  useEffect(() => {
    const onFsChange = () => {
      const el = getFullscreenElement();
      setIsFullscreen(el != null && posRootRef.current != null && el === posRootRef.current);
    };
    document.addEventListener("fullscreenchange", onFsChange);
    document.addEventListener("webkitfullscreenchange", onFsChange as EventListener);
    return () => {
      document.removeEventListener("fullscreenchange", onFsChange);
      document.removeEventListener("webkitfullscreenchange", onFsChange as EventListener);
    };
  }, []);

  const toggleFullscreen = useCallback(async () => {
    const root = posRootRef.current;
    if (!root) return;
    try {
      if (getFullscreenElement() === root) {
        await exitFullscreenDoc();
      } else {
        await requestFullscreenEl(root);
      }
    } catch {
      // User denied or API unsupported — ignore
    }
  }, []);

  /** Categories / quick add product */
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [categories, setCategories] = useState<PharmacyCategoryRow[]>([]);
  const [catCode, setCatCode] = useState("");
  const [catName, setCatName] = useState("");
  const [prodCategoryId, setProdCategoryId] = useState<number | "">("");
  const [prodGeneric, setProdGeneric] = useState("");
  const [prodBrand, setProdBrand] = useState("");
  const [prodStrength, setProdStrength] = useState("");
  const [prodUom, setProdUom] = useState("tablet");
  const [prodPrice, setProdPrice] = useState("");
  const [prodBarcode, setProdBarcode] = useState("");
  const [prodRequiresRx, setProdRequiresRx] = useState(false);
  const [catalogMsg, setCatalogMsg] = useState<string | null>(null);

  const refreshShift = useCallback(async () => {
    const { shift } = await fetchOpenShiftForUser(servedBy);
    setShiftId(shift?.id ?? null);
    setShiftBeginningCash(shift?.beginning_cash ?? 0);
    if (!shift) setShiftOpenModal(true);
    else setShiftOpenModal(false);
  }, [servedBy]);

  useEffect(() => {
    void refreshShift();
  }, [refreshShift]);

  useEffect(() => {
    if (heldHydrated.current) return;
    heldHydrated.current = true;
    try {
      const raw = sessionStorage.getItem(HELD_SALES_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as HeldSaleSnapshot[];
      if (Array.isArray(parsed)) setHeldSales(parsed);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!heldHydrated.current) return;
    try {
      sessionStorage.setItem(HELD_SALES_STORAGE_KEY, JSON.stringify(heldSales));
    } catch {
      /* ignore */
    }
  }, [heldSales]);

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    const q = query.trim();
    if (q.length < 1) {
      setResults([]);
      setResultStockQty({});
      return;
    }
    if (isEncounterTransId(q)) {
      setResults([]);
      setResultStockQty({});
      return;
    }
    searchTimer.current = setTimeout(() => {
      void (async () => {
        const qAtStart = q;
        const { products, error } = await searchPosProducts(qAtStart, 60);
        if (error) return;
        if (query.trim() !== qAtStart) return;
        setResults(products);
        setResultSel(0);
        setResultStockQty({});
        const ids = products.map((p) => p.id);
        const { qtyByProductId, error: stockErr } = await fetchOnHandQtyByProductIds(ids);
        if (query.trim() !== qAtStart) return;
        if (!stockErr) setResultStockQty(qtyByProductId);
        else setResultStockQty({});
      })();
    }, 220);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [query]);

  useEffect(() => {
    const t = window.setTimeout(() => searchRef.current?.focus(), 150);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!discountDialogOpen) return;
    let cancelled = false;
    setDbDiscountsLoading(true);
    void fetchActiveDiscountTypes().then((r) => {
      if (cancelled) return;
      if (!r.error) setDbDiscountTypes(r.discounts);
      setDbDiscountsLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [discountDialogOpen]);

  const openDiscountModal = useCallback(() => {
    setDiscountDraft(posDiscount);
    if (posDiscount.kind === "fixed") {
      setDiscountCustomFixed(String(posDiscount.fixedAmount ?? 0));
    } else if (posDiscount.kind === "percent") {
      setDiscountCustomPercent(String(posDiscount.percent ?? 10));
    }
    setDiscountDialogOpen(true);
  }, [posDiscount]);

  const applyDiscountDraft = useCallback(() => {
    let next = discountDraft;
    if (discountDraft.kind === "percent") {
      const pct = Math.max(0, Math.min(100, Number(discountCustomPercent) || 0));
      next = {
        ...discountDraft,
        percent: pct,
        label:
          discountDraft.typeCode === "PERCENT_CUSTOM"
            ? `Custom (${pct}%)`
            : discountDraft.label,
      };
    } else if (discountDraft.kind === "fixed") {
      const amt = Math.max(0, Number(discountCustomFixed) || 0);
      next = {
        kind: "fixed",
        label: `Fixed · ₱${amt.toFixed(2)}`,
        typeCode: "FIXED",
        fixedAmount: amt,
      };
    }
    setPosDiscount(next);
    setDiscountDialogOpen(false);
  }, [discountDraft, discountCustomPercent, discountCustomFixed]);

  const catalogDbDiscounts = useMemo(() => {
    const builtinCodes = new Set(POS_BUILTIN_DISCOUNT_PRESETS.map((p) => (p.typeCode ?? "").toUpperCase()));
    return dbDiscountTypes.filter((row) => {
      if (isStatutoryScPwdCode(row.code) || isStatutoryScPwdCode(row.name)) return false;
      const code = (row.code ?? "").trim().toUpperCase();
      if (code && builtinCodes.has(code)) return false;
      return true;
    });
  }, [dbDiscountTypes]);

  const openPriceCheckModal = useCallback(() => {
    setPriceCheckQuery("");
    setPriceCheckResults([]);
    setPriceCheckSel(0);
    setPriceCheckHit(null);
    setPriceCheckHint(null);
    setPriceCheckOpen(true);
  }, []);

  useEffect(() => {
    if (!priceCheckOpen) return;
    const id = window.requestAnimationFrame(() => priceCheckInputRef.current?.focus());
    return () => window.cancelAnimationFrame(id);
  }, [priceCheckOpen]);

  useEffect(() => {
    if (!priceCheckOpen) return;
    if (priceCheckSearchTimer.current) clearTimeout(priceCheckSearchTimer.current);
    const q = priceCheckQuery.trim();
    if (q.length < 1) {
      setPriceCheckResults([]);
      return;
    }
    if (isEncounterTransId(q)) {
      setPriceCheckResults([]);
      return;
    }
    priceCheckSearchTimer.current = setTimeout(() => {
      void (async () => {
        const { products, error } = await searchPosProducts(q, 50);
        if (error) return;
        setPriceCheckResults(products);
        setPriceCheckSel(0);
      })();
    }, 220);
    return () => {
      if (priceCheckSearchTimer.current) clearTimeout(priceCheckSearchTimer.current);
    };
  }, [priceCheckQuery, priceCheckOpen]);

  const commitPriceCheck = useCallback(async () => {
    const raw = priceCheckQuery.trim();
    if (!raw) {
      setPriceCheckHint("Type a barcode, search, select a row with ↑↓, then press Enter.");
      setPriceCheckHit(null);
      return;
    }
    if (isEncounterTransId(raw)) {
      setPriceCheckHint("Encounter IDs are opened from the main register bar above.");
      setPriceCheckHit(null);
      return;
    }
    const { product: byBarcode } = await fetchProductByBarcode(raw);
    if (byBarcode) {
      setPriceCheckHit(byBarcode);
      setPriceCheckHint(null);
      setPriceCheckQuery("");
      setPriceCheckResults([]);
      setPriceCheckSel(0);
      priceCheckInputRef.current?.focus();
      return;
    }
    if (priceCheckResults.length > 0 && priceCheckResults[priceCheckSel]) {
      const p = priceCheckResults[priceCheckSel];
      setPriceCheckHit(p);
      setPriceCheckHint(null);
      setPriceCheckQuery("");
      setPriceCheckResults([]);
      setPriceCheckSel(0);
      priceCheckInputRef.current?.focus();
      return;
    }
    setPriceCheckHint("No match. Try another barcode or pick from the list.");
    setPriceCheckHit(null);
  }, [priceCheckQuery, priceCheckResults, priceCheckSel]);

  const cashCountTotal = useMemo(() => {
    let sum = 0;
    for (const d of PHP_DRAWER_DENOMS) {
      const q = parseDenomQty(denomQty[String(d.value)] ?? "");
      sum += d.value * q;
    }
    sum += parseMoneyAmount(countGcashPeso);
    sum += parseMoneyAmount(countDebitPeso);
    return round2(sum);
  }, [denomQty, countGcashPeso, countDebitPeso]);

  const totals = useMemo(() => computePosCartTotals(cart, posDiscount), [cart, posDiscount]);

  const cartLineLabel = useCallback((line: CartLine) => {
    const p = line.product;
    return `${p.generic_name}${p.brand_name ? ` (${p.brand_name})` : ""}`;
  }, []);

  const applySupervisorCartAction = useCallback(
    (line: CartLine, action: SupervisorCartAction, targetQty?: number) => {
      if (action === "delete") {
        setCart((c) => c.filter((x) => x.key !== line.key));
        setPosInfo(`Removed ${cartLineLabel(line)} from cart.`);
        return;
      }
      if (action === "set_quantity" && targetQty != null && targetQty >= 1) {
        setCart((c) =>
          c.map((x) => (x.key === line.key ? { ...x, qty: targetQty } : x)),
        );
        setPosInfo(`Quantity set to ${targetQty} for ${cartLineLabel(line)}.`);
        return;
      }
      if (action === "increment") {
        setCart((c) =>
          c.map((x) => (x.key === line.key ? { ...x, qty: x.qty + 1 } : x)),
        );
        return;
      }
      setCart((c) =>
        c.map((x) =>
          x.key === line.key ? { ...x, qty: Math.max(1, x.qty - 1) } : x,
        ),
      );
    },
    [cartLineLabel],
  );

  const openSupervisorForCart = useCallback(
    (line: CartLine, action: SupervisorCartAction, targetQty?: number) => {
      if (pendingByLineKey[line.key]) return;
      setSupervisorRequestErr(null);
      setSupervisorDialog({ action, line, targetQty });
    },
    [pendingByLineKey],
  );

  const supervisorActionToRequestAction = useCallback(
    (action: SupervisorCartAction): CartLineRequestAction =>
      action === "delete" ? "delete" : "quantity_change",
    [],
  );

  const submitCartLineRequest = useCallback(
    async (
      line: CartLine,
      action: CartLineRequestAction,
      note?: string,
      requestedQty?: number,
    ): Promise<{ ok: boolean; error?: string }> => {
      const { request, error } = await createCartLineRequestApi({
        action,
        cart_line_key: line.key,
        line_snapshot: cartLineToSnapshot(line, requestedQty),
        note: note || undefined,
      });
      if (error || !request) {
        return { ok: false, error: error ?? "Failed to submit request." };
      }
      setPendingByLineKey((prev) => ({
        ...prev,
        [line.key]: { requestId: request.id, action: request.action },
      }));
      setWaitRequest(request);
      setPosInfo("Line authorization request sent. Waiting for approval…");
      return { ok: true };
    },
    [],
  );

  const handleSupervisorVerified = useCallback(() => {
    if (!supervisorDialog) return;
    const { line, action, targetQty } = supervisorDialog;
    setSupervisorDialog(null);
    setSupervisorRequestErr(null);
    applySupervisorCartAction(line, action, targetQty);
  }, [supervisorDialog, applySupervisorCartAction]);

  const handleSupervisorRequestApproval = useCallback(async () => {
    if (!supervisorDialog) return;
    const { line, action } = supervisorDialog;
    setSupervisorRequestBusy(true);
    setSupervisorRequestErr(null);
    const requestAction = supervisorActionToRequestAction(action);
    const intentNote =
      action === "set_quantity" && supervisorDialog.targetQty != null
        ? `Requested: set quantity to ${supervisorDialog.targetQty}`
        : action === "increment"
          ? "Requested: increase quantity"
          : action === "decrement"
            ? "Requested: decrease quantity"
            : "Requested: remove line";
    const requestedQty =
      action === "set_quantity" && supervisorDialog.targetQty != null
        ? supervisorDialog.targetQty
        : action === "increment"
          ? line.qty + 1
          : action === "decrement"
            ? Math.max(1, line.qty - 1)
            : undefined;
    const { ok, error } = await submitCartLineRequest(line, requestAction, intentNote, requestedQty);
    setSupervisorRequestBusy(false);
    if (!ok) {
      setSupervisorRequestErr(error ?? "Failed to submit request.");
      return;
    }
    setSupervisorDialog(null);
    setSupervisorRequestErr(null);
  }, [supervisorDialog, supervisorActionToRequestAction, submitCartLineRequest]);

  const handleLineAuthSubmit = useCallback(
    async (action: CartLineRequestAction, note: string) => {
      if (!lineAuthDialogLine) return;
      const line = lineAuthDialogLine;
      setLineAuthBusy(true);
      setLineAuthErr(null);
      const { ok, error } = await submitCartLineRequest(line, action, note || undefined);
      setLineAuthBusy(false);
      if (!ok) {
        setLineAuthErr(error ?? "Failed to submit.");
        return;
      }
      setLineAuthDialogLine(null);
      setLineAuthErr(null);
    },
    [lineAuthDialogLine, submitCartLineRequest],
  );

  const handleResolvedRequest = useCallback((row: PharmacyCartLineRequestRow) => {
    if (row.status === "pending") return;
    if (resolvedLineRequestIdsRef.current.has(row.id)) return;
    resolvedLineRequestIdsRef.current.add(row.id);

    const key = row.cart_line_key;
    setPendingByLineKey((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setWaitRequest((w) => (w?.id === row.id ? null : w));

    if (row.status === "rejected") {
      setCheckoutErr("Line authorization request was rejected.");
      return;
    }
    if (row.status !== "approved") return;

    if (row.action === "delete") {
      setCart((c) => c.filter((x) => x.key !== key));
      setPosInfo("Line authorization approved — item removed from cart.");
      return;
    }

    const newQty = resolveApprovedCartQuantity(row);
    if (newQty == null) {
      setCheckoutErr("Line authorization approved but quantity could not be determined — adjust the line manually.");
      return;
    }
    setCart((c) =>
      c.map((x) => (x.key === key ? { ...x, qty: newQty } : x)),
    );
    setPosInfo(`Line authorization approved — quantity set to ${newQty}.`);
  }, []);

  const sessionUserId =
    profile != null && typeof profile.user_id === "number" && Number.isFinite(profile.user_id)
      ? profile.user_id
      : null;

  useEffect(() => {
    if (sessionUserId == null) return;
    return subscribeCartLineRequestsForUser(sessionUserId, handleResolvedRequest);
  }, [sessionUserId, handleResolvedRequest]);

  /** Poll while waiting — realtime may not reach browser anon client without RLS. */
  useEffect(() => {
    const requestId = waitRequest?.id;
    if (!requestId) return;

    let cancelled = false;
    const poll = async () => {
      const { request, error } = await fetchCartLineRequestApi(requestId);
      if (cancelled || error || !request) return;
      if (request.status !== "pending") {
        handleResolvedRequest(request);
      }
    };

    void poll();
    const timer = setInterval(() => void poll(), 2000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [waitRequest?.id, handleResolvedRequest]);

  const payChangeDue = useMemo(() => {
    const tendered = parseMoneyAmount(amountTendered);
    return round2(Math.max(0, tendered - totals.total));
  }, [amountTendered, totals.total]);

  const discountDraftTotals = useMemo(() => {
    const draft =
      discountDraft.kind === "percent"
        ? {
            ...discountDraft,
            percent: Math.max(0, Math.min(100, Number(discountCustomPercent) || 0)),
            label:
              discountDraft.typeCode === "PERCENT_CUSTOM"
                ? `Custom (${Math.max(0, Math.min(100, Number(discountCustomPercent) || 0))}%)`
                : discountDraft.label,
          }
        : discountDraft.kind === "fixed"
          ? {
              ...discountDraft,
              fixedAmount: Math.max(0, Number(discountCustomFixed) || 0),
              label: `Fixed · ₱${Math.max(0, Number(discountCustomFixed) || 0).toFixed(2)}`,
            }
          : discountDraft;
    return computePosCartTotals(cart, draft);
  }, [cart, discountDraft, discountCustomPercent, discountCustomFixed]);

  const addProductToCart = useCallback((p: ProductPosRow, qty = 1, prescId?: string | null) => {
    setCart((prev) => {
      const exist = prev.find((l) => l.product.id === p.id && (l.prescriptionItemId ?? null) === (prescId ?? null));
      if (exist) {
        return prev.map((l) =>
          l.product.id === p.id && (l.prescriptionItemId ?? null) === (prescId ?? null)
            ? { ...l, qty: l.qty + qty }
            : l,
        );
      }
      return [...prev, { key: crypto.randomUUID(), product: p, qty, prescriptionItemId: prescId ?? null }];
    });
  }, []);

  const openAddLineModal = useCallback((p: ProductPosRow, prescItemId: string | null = null) => {
    setAddLineQtyErr(null);
    setAddLineProduct(p);
    setAddLinePrescId(prescItemId);
    addLineQtyFreshRef.current = true;
    setAddLineQty("1");
    setAddLineExpiryReady(false);
    setAddLineExpiryInfo(null);
    setAddLineOpen(true);
  }, []);

  const closeAddLineModal = useCallback(() => {
    setAddLineOpen(false);
    setAddLineProduct(null);
    setAddLinePrescId(null);
    addLineQtyFreshRef.current = true;
    setAddLineQty("1");
    setAddLineQtyErr(null);
    setAddLineExpiryReady(false);
    setAddLineExpiryInfo(null);
  }, []);

  useEffect(() => {
    if (!addLineOpen || !addLineProduct) return;
    const id = window.requestAnimationFrame(() => {
      const el = addLineQtyInputRef.current;
      if (el) {
        el.focus();
        el.select();
      }
    });
    return () => window.cancelAnimationFrame(id);
  }, [addLineOpen, addLineProduct?.id]);

  useEffect(() => {
    if (!addLineOpen || !addLineProduct) return;
    let cancelled = false;
    setAddLineExpiryReady(false);
    setAddLineExpiryInfo(null);
    void (async () => {
      const { lots, error } = await fetchStockLotsForProduct(addLineProduct.id);
      if (cancelled) return;
      setAddLineExpiryReady(true);
      if (error) {
        setAddLineExpiryInfo(`Could not load stock: ${error}`);
        return;
      }
      const ymd = getClosestStockExpiryYmd(lots);
      if (ymd) {
        setAddLineExpiryInfo(`Closest expiry: ${ymd}`);
      } else if (lots.length === 0) {
        setAddLineExpiryInfo("No stock lots on hand — add stock to track expiry.");
      } else {
        setAddLineExpiryInfo("No expiry date on active lots for this product.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [addLineOpen, addLineProduct?.id]);

  /** Re-select quantity once expiry text has loaded (re-render can clear selection). */
  useEffect(() => {
    if (!addLineOpen || !addLineExpiryReady) return;
    if (!addLineQtyFreshRef.current) return;
    const id = window.requestAnimationFrame(() => {
      addLineQtyInputRef.current?.select();
    });
    return () => window.cancelAnimationFrame(id);
  }, [addLineOpen, addLineExpiryReady]);

  const addLineNumpadDigit = useCallback((digit: string) => {
    if (!/^\d$/.test(digit)) return;
    setAddLineQtyErr(null);
    setAddLineQty((prev) => {
      if (addLineQtyFreshRef.current) {
        addLineQtyFreshRef.current = false;
        return digit;
      }
      const concat = `${prev}${digit}`.replace(/\D/g, "").slice(0, 6);
      if (concat === "") return "1";
      const n = Number.parseInt(concat, 10);
      if (!Number.isFinite(n) || n < 1) return prev;
      return String(Math.min(n, 999_999));
    });
  }, []);

  const addLineNumpadBackspace = useCallback(() => {
    setAddLineQtyErr(null);
    setAddLineQty((prev) => {
      if (prev.length <= 1) {
        addLineQtyFreshRef.current = true;
        return "1";
      }
      const next = prev.slice(0, -1).replace(/\D/g, "");
      if (next === "") {
        addLineQtyFreshRef.current = true;
        return "1";
      }
      const n = Number.parseInt(next, 10);
      if (!Number.isFinite(n) || n < 1) {
        addLineQtyFreshRef.current = true;
        return "1";
      }
      return String(n);
    });
  }, []);

  const addLineNumpadClear = useCallback(() => {
    setAddLineQtyErr(null);
    addLineQtyFreshRef.current = true;
    setAddLineQty("1");
    window.requestAnimationFrame(() => {
      const el = addLineQtyInputRef.current;
      if (el) {
        el.focus();
        el.select();
      }
    });
  }, []);

  const openEditCartQty = useCallback((line: CartLine) => {
    if (pendingByLineKey[line.key]) return;
    setEditCartQtyErr(null);
    setEditCartQtyLine(line);
    setEditCartQtyDraft(String(line.qty));
    editCartQtyFreshRef.current = true;
  }, [pendingByLineKey]);

  const closeEditCartQty = useCallback(() => {
    setEditCartQtyLine(null);
    setEditCartQtyErr(null);
  }, []);

  useEffect(() => {
    if (!editCartQtyLine) return;
    const id = window.requestAnimationFrame(() => {
      editCartQtyInputRef.current?.select();
    });
    return () => window.cancelAnimationFrame(id);
  }, [editCartQtyLine]);

  const editCartQtyNumpadDigit = useCallback((digit: string) => {
    if (!/^\d$/.test(digit)) return;
    setEditCartQtyErr(null);
    setEditCartQtyDraft((prev) => {
      if (editCartQtyFreshRef.current) {
        editCartQtyFreshRef.current = false;
        return digit;
      }
      const concat = `${prev}${digit}`.replace(/\D/g, "").slice(0, 6);
      if (concat === "") return "1";
      const n = Number.parseInt(concat, 10);
      if (!Number.isFinite(n) || n < 1) return prev;
      return String(Math.min(n, 999_999));
    });
  }, []);

  const editCartQtyNumpadBackspace = useCallback(() => {
    setEditCartQtyErr(null);
    setEditCartQtyDraft((prev) => {
      if (prev.length <= 1) {
        editCartQtyFreshRef.current = true;
        return "1";
      }
      const next = prev.slice(0, -1).replace(/\D/g, "");
      if (next === "") {
        editCartQtyFreshRef.current = true;
        return "1";
      }
      const n = Number.parseInt(next, 10);
      if (!Number.isFinite(n) || n < 1) {
        editCartQtyFreshRef.current = true;
        return "1";
      }
      return String(n);
    });
  }, []);

  const editCartQtyNumpadClear = useCallback(() => {
    setEditCartQtyErr(null);
    editCartQtyFreshRef.current = true;
    setEditCartQtyDraft("1");
    window.requestAnimationFrame(() => editCartQtyInputRef.current?.select());
  }, []);

  const confirmEditCartQty = useCallback(() => {
    setEditCartQtyErr(null);
    if (!editCartQtyLine) return;
    const n = Math.round(Number.parseInt(editCartQtyDraft.replace(/\D/g, ""), 10));
    if (!Number.isFinite(n) || n < 1) {
      setEditCartQtyErr("Enter a whole number of at least 1.");
      return;
    }
    if (n === editCartQtyLine.qty) {
      closeEditCartQty();
      return;
    }
    const line = editCartQtyLine;
    closeEditCartQty();
    openSupervisorForCart(line, "set_quantity", n);
  }, [editCartQtyLine, editCartQtyDraft, closeEditCartQty, openSupervisorForCart]);

  const confirmAddLineFromModal = useCallback(() => {
    setAddLineQtyErr(null);
    if (!addLineProduct) return;
    const n = Math.round(Number.parseInt(addLineQty.replace(/\D/g, ""), 10));
    if (!Number.isFinite(n) || n < 1) {
      setAddLineQtyErr("Enter a whole number of at least 1.");
      return;
    }
    addProductToCart(addLineProduct, n, addLinePrescId);
    closeAddLineModal();
    setQuery("");
    setResults([]);
    setResultSel(0);
    searchRef.current?.focus();
  }, [addLineProduct, addLineQty, addLinePrescId, addProductToCart, closeAddLineModal]);

  const loadPrescriptionFromEncounter = useCallback(
    async (transId: string) => {
      const tid = transId.trim();
      if (!tid) return;
      setPosInfo(null);
      const res = await fetchPrescriptionCartByEncounterAuth(tid);
      if (res.error) {
        setCheckoutErr(res.error);
        return;
      }
      if (!res.prescriptionId || res.lines.length === 0) {
        setCheckoutErr("No prescription on file for this encounter.");
        setPrescriptionId(null);
        setPatientId(null);
        setPatientName(null);
        return;
      }

      const pendingLines = res.lines.filter((ln) => !ln.dispensed && ln.product_id);
      const dispensedCount = res.lines.filter((ln) => ln.dispensed).length;

      setCheckoutErr(null);
      setPrescriptionId(res.prescriptionId);
      setPatientId(res.patientId);
      setPatientName(res.patientName);
      if (pendingLines.length === 0) {
        setCart([]);
        setPosInfo(
          dispensedCount > 0
            ? `All prescription items for ${res.patientName ?? "this patient"} have already been dispensed.`
            : "No billable products on this prescription.",
        );
        return;
      }

      const nextCart: CartLine[] = [];
      for (const ln of pendingLines) {
        const pid = ln.product_id!;
        const { product } = await fetchPosProductById(pid);
        if (!product) continue;
        const price = ln.unit_price ?? product.unit_price;
        const merged: ProductPosRow = { ...product, unit_price: price };
        nextCart.push({
          key: crypto.randomUUID(),
          product: merged,
          qty: Math.max(1, Math.round(Number(ln.quantity_prescribed))),
          prescriptionItemId: ln.pharmacy_prescription_item_id,
        });
      }
      setCart(nextCart);

      if (dispensedCount > 0) {
        setPosInfo(
          `Loaded ${pendingLines.length} item(s) for ${res.patientName ?? "patient"}. ${dispensedCount} already-dispensed item(s) were excluded.`,
        );
      } else {
        setPosInfo(`Loaded prescription for ${res.patientName ?? "patient"}.`);
      }
    },
    [],
  );

  /** One field: type to search, scan barcode, or scan/paste encounter UUID — Enter commits. */
  const submitOmnibar = useCallback(async () => {
    const raw = query.trim();
    if (!raw) return;
    if (addLineOpen) return;
    setPosInfo(null);

    if (isEncounterTransId(raw)) {
      await loadPrescriptionFromEncounter(raw);
      setQuery("");
      setResults([]);
      searchRef.current?.focus();
      return;
    }

    const { product: byBarcode } = await fetchProductByBarcode(raw);
    if (byBarcode) {
      openAddLineModal(byBarcode, null);
      return;
    }

    if (results.length > 0 && results[resultSel]) {
      const p = results[resultSel];
      openAddLineModal(p, null);
      return;
    }

    setPosInfo("No barcode match and no row selected. Type to search, use ↑↓, then Enter — or scan an encounter ID.");
  }, [query, results, resultSel, addLineOpen, openAddLineModal, loadPrescriptionFromEncounter]);

  const startShift = useCallback(async () => {
    const n = Number(beginInput);
    if (!Number.isFinite(n) || n < 0) return;
    const { shiftId: sid, error } = await openPharmacyShift({
      openedBy: servedBy,
      beginningCash: n,
      branchCode: profile?.branch_code ?? null,
    });
    if (error) {
      setCheckoutErr(error);
      return;
    }
    setShiftId(sid);
    setShiftBeginningCash(n);
    setShiftOpenModal(false);
  }, [beginInput, servedBy, profile?.branch_code]);

  const focusPayCashField = useCallback(() => {
    window.requestAnimationFrame(() => {
      const el = payCashInputRef.current;
      if (el) {
        el.focus();
        el.select();
      }
    });
  }, []);

  useEffect(() => {
    if (!payOpen || paymentMethod !== "Cash") return;
    payCashFreshRef.current = true;
    const id = window.requestAnimationFrame(() => {
      const el = payCashInputRef.current;
      if (el) {
        el.focus();
        el.select();
      }
    });
    return () => window.cancelAnimationFrame(id);
  }, [payOpen, paymentMethod, totals.total]);

  const payNumpadDigit = useCallback((digit: string) => {
    if (!/^\d$/.test(digit)) return;
    setAmountTendered((prev) => {
      if (payCashFreshRef.current) {
        payCashFreshRef.current = false;
        return digit;
      }
      return sanitizeCashTenderedInput(prev + digit);
    });
  }, []);

  const payNumpadDecimal = useCallback(() => {
    setAmountTendered((prev) => {
      if (payCashFreshRef.current) {
        payCashFreshRef.current = false;
        return "0.";
      }
      if (prev.includes(".")) return prev;
      return prev === "" ? "0." : `${prev}.`;
    });
  }, []);

  const payNumpadBackspace = useCallback(() => {
    setAmountTendered((prev) => {
      if (payCashFreshRef.current || prev.length <= 1) {
        payCashFreshRef.current = true;
        return "";
      }
      payCashFreshRef.current = false;
      return prev.slice(0, -1);
    });
  }, []);

  const payNumpadClear = useCallback(() => {
    const amt = totals.total.toFixed(2);
    payCashFreshRef.current = true;
    setAmountTendered(amt);
    focusPayCashField();
  }, [totals.total, focusPayCashField]);

  const openPaymentModal = useCallback(() => {
    if (!shiftId || cart.length === 0) return;
    setPaymentMethod((pm) => (pm === "GCash" || pm === "Cash" ? pm : "Cash"));
    payCashFreshRef.current = true;
    setAmountTendered(totals.total.toFixed(2));
    setPayOpen(true);
  }, [totals.total, shiftId, cart.length]);

  const pay = useCallback(async () => {
    setCheckoutErr(null);
    if (!shiftId) {
      setCheckoutErr("Start a shift with beginning cash before completing a sale.");
      return;
    }
    if (cart.length === 0) return;
    const tendered =
      paymentMethod.toLowerCase() === "cash" ? Number(amountTendered) || 0 : totals.total;
    const change =
      paymentMethod.toLowerCase() === "cash" ? Math.max(0, tendered - totals.total) : null;
    if (paymentMethod.toLowerCase() === "cash" && tendered + 1e-9 < totals.total) {
      setCheckoutErr("Amount tendered is less than total.");
      return;
    }
    const { qtyByProductId, error: stockErr } = await fetchOnHandQtyByProductIds(
      cart.map((l) => l.product.id),
    );
    if (stockErr) {
      setCheckoutErr(stockErr);
      return;
    }
    for (const line of cart) {
      const have = qtyByProductId[line.product.id] ?? 0;
      if (have + 1e-9 < line.qty) {
        setCheckoutErr(
          `Insufficient stock for ${cartLineLabel(line)} (need ${line.qty}, have ${have}).`,
        );
        return;
      }
    }
    const lines = cart.map((l) => ({
      productId: l.product.id,
      quantity: l.qty,
      unitPrice: l.product.unit_price,
      discount: 0,
      pharmacyPrescriptionItemId: l.prescriptionItemId ?? null,
    }));
    const receiptLines = cart.map((l) => pharmacyReceiptLineFromCart(l.product, l.qty));
    const receiptPayloadBase = {
      branchCode: profile?.branch_code ?? null,
      cashierName: profile?.fullname?.trim() || profile?.username?.trim() || null,
      patientName: patientName,
      paymentMethod,
      lines: receiptLines,
      itemsGross: totals.gross,
      discountLabel: totals.discountApplied > 0 ? posDiscount.label : null,
      discountAmount: totals.discountApplied,
      vatAmount: totals.vat,
      totalAmount: totals.total,
      amountTendered: paymentMethod.toLowerCase() === "cash" ? tendered : null,
      changeAmount: change,
      soldAt: new Date(),
    };
    const res = await authenticatedFetch("/api/pharmacy/complete-sale", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        shiftId,
        patientId,
        prescriptionId,
        servedBy,
        paymentMethod,
        amountTendered: paymentMethod.toLowerCase() === "cash" ? tendered : null,
        changeAmount: change,
        discountAmount: totals.discountApplied,
        discountType: totals.discountApplied > 0 ? posDiscount.typeCode : null,
        subtotal: totals.subtotal,
        vatAmount: totals.vat,
        totalAmount: totals.total,
        lines,
      }),
    });
    const payload = (await res.json().catch(() => ({}))) as {
      saleId?: string;
      orNumber?: string;
      error?: string;
    };
    if (!res.ok) {
      setCheckoutErr(payload.error ?? "Checkout failed.");
      return;
    }
    const saleId = payload.saleId;
    if (!saleId) {
      setCheckoutErr("Checkout failed.");
      return;
    }
    const saleRef = payload.orNumber?.trim();
    if (!saleRef) {
      setCheckoutErr("Checkout succeeded but sale reference was missing.");
      return;
    }
    setCart([]);
    setPayOpen(false);
    setPrescriptionId(null);
    setPatientId(null);
    setPatientName(null);
    setPosDiscount(POS_DISCOUNT_NONE);
    setAmountTendered("");
    openPharmacySaleReceiptPrint({ ...receiptPayloadBase, orNumber: saleRef });
  }, [
    shiftId,
    cart,
    cartLineLabel,
    paymentMethod,
    amountTendered,
    totals,
    patientId,
    prescriptionId,
    servedBy,
    posDiscount,
    patientName,
    profile,
  ]);

  const runXReading = useCallback(async () => {
    if (!shiftId) return;
    const { snapshot, error } = await aggregateShiftSales(shiftId);
    if (error || !snapshot) {
      setCheckoutErr(error ?? "Reading failed");
      return;
    }
    const r = await recordXReadingForShift({ shiftId, createdBy: servedBy });
    if (r.error) {
      setCheckoutErr(r.error);
      return;
    }
    openPharmacyShiftReadingPrint({
      readingType: "X",
      snapshot,
      branchCode: profile?.branch_code ?? null,
      cashierName: profile?.fullname ?? null,
    });
  }, [shiftId, servedBy, profile?.branch_code, profile?.fullname]);

  const holdCurrentSale = useCallback(() => {
    if (cart.length === 0) {
      setCheckoutErr("Cart is empty — nothing to hold.");
      return;
    }
    const label = `Hold · ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · ${cart.length} line(s) · ₱${totals.total.toFixed(2)}`;
    const snap: HeldSaleSnapshot = {
      id: crypto.randomUUID(),
      savedAt: Date.now(),
      label,
      lines: cart.map((l) => ({ ...l })),
      prescriptionId,
      patientId,
      patientName,
      posDiscount,
    };
    setHeldSales((h) => [...h, snap]);
    setCart([]);
    setPrescriptionId(null);
    setPatientId(null);
    setPatientName(null);
    setPosDiscount(POS_DISCOUNT_NONE);
    setPosInfo("Sale held. Use Held carts to recall.");
  }, [cart, totals.total, prescriptionId, patientId, patientName, posDiscount]);

  const recallHeldSale = useCallback((h: HeldSaleSnapshot) => {
    if (cart.length > 0) {
      const ok = window.confirm("Replace the current cart with this held sale?");
      if (!ok) return;
    }
    setCart(h.lines.map((l) => ({ ...l, key: crypto.randomUUID() })));
    setPrescriptionId(h.prescriptionId);
    setPatientId(h.patientId);
    setPatientName(h.patientName);
    setPosDiscount(h.posDiscount ?? POS_DISCOUNT_NONE);
    setHeldSales((list) => list.filter((x) => x.id !== h.id));
    setHeldDialogOpen(false);
    setPosInfo("Recalled held sale.");
  }, [cart.length]);

  const discardHeldSale = useCallback((id: string) => {
    setHeldSales((list) => list.filter((x) => x.id !== id));
  }, []);

  const openVoidSaleModal = useCallback(() => {
    setVoidOrQuery("");
    setVoidSaleResults([]);
    setVoidSaleSearchErr(null);
    setVoidSaleSelectedId(null);
    setVoidSaleDetail(null);
    setVoidReason("");
    setVoidSaleOpen(true);
  }, []);

  const runVoidSaleSearch = useCallback(async () => {
    setVoidSaleSearchErr(null);
    setVoidSaleSelectedId(null);
    setVoidSaleDetail(null);
    setVoidSaleSearching(true);
    try {
      const { sales, error } = await searchPharmacySalesByOrApi(voidOrQuery, 30);
      if (error) {
        setVoidSaleResults([]);
        setVoidSaleSearchErr(error);
        return;
      }
      setVoidSaleResults(sales);
      if (sales.length === 0) {
        setVoidSaleSearchErr("No completed sales match that sale # / reference.");
      }
    } finally {
      setVoidSaleSearching(false);
    }
  }, [voidOrQuery]);

  useEffect(() => {
    if (!voidSaleOpen || !voidSaleSelectedId) {
      setVoidSaleDetail(null);
      return;
    }
    let cancelled = false;
    setVoidSaleDetailLoading(true);
    void (async () => {
      const { detail, error } = await fetchPharmacySaleDetailApi(voidSaleSelectedId);
      if (cancelled) return;
      setVoidSaleDetailLoading(false);
      if (error) {
        setCheckoutErr(error);
        setVoidSaleDetail(null);
        return;
      }
      setVoidSaleDetail(detail);
    })();
    return () => {
      cancelled = true;
    };
  }, [voidSaleOpen, voidSaleSelectedId]);

  const commitVoidPaidSale = useCallback(async () => {
    if (!voidSaleSelectedId || !voidSaleDetail) return;
    const ok = window.confirm(
      `Void sale ${voidSaleDetail.sale.or_number} for ₱${(Number(voidSaleDetail.sale.total_amount) || 0).toFixed(2)}? Stock will be put back on hand.`,
    );
    if (!ok) return;
    setVoidSaleBusy(true);
    setCheckoutErr(null);
    const { error } = await voidPharmacySaleApi(voidSaleSelectedId, voidReason.trim() || undefined);
    setVoidSaleBusy(false);
    if (error) {
      setCheckoutErr(error);
      return;
    }
    setVoidSaleOpen(false);
    setPosInfo(`Voided sale ${voidSaleDetail.sale.or_number}.`);
  }, [voidSaleSelectedId, voidSaleDetail, voidReason]);

  const openReturnSaleModal = useCallback(() => {
    setReturnOrQuery("");
    setReturnSaleResults([]);
    setReturnSaleSearchErr(null);
    setReturnSaleSelectedId(null);
    setReturnSaleDetail(null);
    setReturnReason("");
    setReturnQtyDraft({});
    setReturnSaleOpen(true);
  }, []);

  const runReturnSaleSearch = useCallback(async () => {
    setReturnSaleSearchErr(null);
    setReturnSaleSelectedId(null);
    setReturnSaleDetail(null);
    setReturnQtyDraft({});
    setReturnSaleSearching(true);
    try {
      const { sales, error } = await searchPharmacySalesByOrApi(returnOrQuery, 30);
      if (error) {
        setReturnSaleResults([]);
        setReturnSaleSearchErr(error);
        return;
      }
      setReturnSaleResults(sales);
      if (sales.length === 0) {
        setReturnSaleSearchErr("No completed sales match that sale # / reference.");
      }
    } finally {
      setReturnSaleSearching(false);
    }
  }, [returnOrQuery]);

  useEffect(() => {
    if (!returnSaleOpen || !returnSaleSelectedId) {
      setReturnSaleDetail(null);
      return;
    }
    let cancelled = false;
    setReturnSaleDetailLoading(true);
    void (async () => {
      const { detail, error } = await fetchPharmacySaleDetailApi(returnSaleSelectedId);
      if (cancelled) return;
      setReturnSaleDetailLoading(false);
      if (error) {
        setCheckoutErr(error);
        setReturnSaleDetail(null);
        return;
      }
      setReturnSaleDetail(detail);
    })();
    return () => {
      cancelled = true;
    };
  }, [returnSaleOpen, returnSaleSelectedId]);

  useEffect(() => {
    if (!returnSaleOpen || !returnSaleDetail) return;
    const next: Record<string, string> = {};
    for (const ln of returnSaleDetail.lines) {
      next[ln.id] = "";
    }
    setReturnQtyDraft(next);
  }, [returnSaleOpen, returnSaleDetail?.sale.id]);

  const commitReturnRefund = useCallback(async () => {
    if (!returnSaleSelectedId || !returnSaleDetail) return;
    const lineReturns: { itemId: string; returnQty: number }[] = [];
    for (const ln of returnSaleDetail.lines) {
      const raw = (returnQtyDraft[ln.id] ?? "").trim().replace(/\D/g, "");
      if (!raw) continue;
      const n = Math.round(Number.parseInt(raw, 10));
      if (!Number.isFinite(n) || n < 1) continue;
      if (n > ln.quantity) {
        setCheckoutErr(`Line #${ln.linenum}: cannot return ${n} — only ${ln.quantity} sold.`);
        return;
      }
      lineReturns.push({ itemId: ln.id, returnQty: n });
    }
    if (lineReturns.length === 0) {
      setCheckoutErr("Enter a return quantity (1 or more) on at least one line.");
      return;
    }
    const est = lineReturns.reduce((sum, r) => {
      const ln = returnSaleDetail.lines.find((l) => l.id === r.itemId);
      return sum + (ln ? r.returnQty * ln.unit_price : 0);
    }, 0);
    const ok = window.confirm(
      `Process return/refund on ${returnSaleDetail.sale.or_number}? About ₱${est.toFixed(2)} in merchandise will be adjusted; stock goes back to the shelf (by lot when tracked).`,
    );
    if (!ok) return;
    setReturnSaleBusy(true);
    setCheckoutErr(null);
    const uid =
      profile != null && typeof profile.user_id === "number" && Number.isFinite(profile.user_id)
        ? profile.user_id
        : null;
    const { error } = await processPharmacySaleReturn({
      saleId: returnSaleSelectedId,
      lineReturns,
      reason: returnReason.trim() || undefined,
      returnedByUserId: uid,
    });
    setReturnSaleBusy(false);
    if (error) {
      setCheckoutErr(error);
      return;
    }
    setReturnSaleOpen(false);
    setPosInfo(`Return/refund saved for ${returnSaleDetail.sale.or_number}.`);
  }, [returnSaleSelectedId, returnSaleDetail, returnQtyDraft, returnReason, profile]);

  const printCashCountSlip = useCallback(() => {
    const rows = PHP_DRAWER_DENOMS.map((d) => {
      const q = parseDenomQty(denomQty[String(d.value)] ?? "");
      if (q === 0) return "";
      return `<tr><td>${d.label}</td><td align="right">${q}</td><td align="right">PHP ${round2(d.value * q).toFixed(2)}</td></tr>`;
    }).join("");
    const g = parseMoneyAmount(countGcashPeso);
    const db = parseMoneyAmount(countDebitPeso);
    const extraRows = [
      g > 0 ? `<tr><td>GCash</td><td align="right">—</td><td align="right">PHP ${g.toFixed(2)}</td></tr>` : "",
      db > 0 ? `<tr><td>Debit card</td><td align="right">—</td><td align="right">PHP ${db.toFixed(2)}</td></tr>` : "",
    ].join("");
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html><head><title>Cash count</title>
      <style>body{font-family:system-ui,sans-serif;padding:16px;} table{border-collapse:collapse;width:100%;max-width:480px} th,td{padding:6px;border-bottom:1px solid #eee} th{text-align:left}</style>
      </head><body>
      <img src="${LIFEHUB_LOGO_SRC}" alt="LifeHub" style="height:36px;object-fit:contain" />
      <h2>Cash count</h2>
      <p>Beginning cash (shift): PHP ${shiftBeginningCash.toFixed(2)}</p>
      <table>
        <thead><tr><th>Item</th><th align="right">Qty</th><th align="right">Amount</th></tr></thead>
        <tbody>${rows}${extraRows}</tbody>
      </table>
      <p><strong>Total counted: PHP ${cashCountTotal.toFixed(2)}</strong></p>
      <p style="color:#666;font-size:12px">${new Date().toLocaleString()}</p>
      </body></html>`);
    w.document.close();
    w.focus();
    w.print();
  }, [denomQty, countGcashPeso, countDebitPeso, cashCountTotal, shiftBeginningCash]);

  const applyCashCountToZ = useCallback(() => {
    setZActualCash(String(cashCountTotal));
    setCashCountOpen(false);
    setShiftDialogOpen(true);
    setPosInfo("Total copied to End of shift → Actual cash. Confirm and run Z-reading to close.");
  }, [cashCountTotal]);

  const runZReading = useCallback(async () => {
    if (!shiftId) return;
    const actual = Number(zActualCash);
    if (!Number.isFinite(actual)) return;
    const { snapshot: snapBefore } = await aggregateShiftSales(shiftId);
    const err = await closeShiftWithZ({
      shiftId,
      closedBy: servedBy,
      actualCash: actual,
    });
    if (err.error) {
      setCheckoutErr(err.error);
      return;
    }
    if (snapBefore) {
      openPharmacyShiftReadingPrint({
        readingType: "Z",
        snapshot: { ...snapBefore, closedAt: new Date().toISOString() },
        actualCash: actual,
        branchCode: profile?.branch_code ?? null,
        cashierName: profile?.fullname ?? null,
      });
    }
    setShiftDialogOpen(false);
    setZActualCash("");
    setShiftId(null);
    setShiftOpenModal(true);
  }, [shiftId, servedBy, zActualCash, profile?.branch_code, profile?.fullname]);

  const openCatalog = useCallback(async () => {
    const { rows, error } = await listPharmacyCategories();
    if (error) setCatalogMsg(error);
    else {
      setCatalogMsg(null);
      setCategories(rows);
      if (rows.length && prodCategoryId === "") setProdCategoryId(rows[0].id);
    }
    setCatalogOpen(true);
  }, [prodCategoryId]);

  const saveCategory = useCallback(async () => {
    const e = await insertPharmacyCategory({ code: catCode, name: catName });
    setCatalogMsg(e.error ?? "Category saved.");
    const { rows } = await listPharmacyCategories();
    setCategories(rows);
  }, [catCode, catName]);

  const saveProduct = useCallback(async () => {
    if (prodCategoryId === "") return;
    const price = Number(prodPrice);
    if (!prodGeneric.trim() || !Number.isFinite(price)) {
      setCatalogMsg("Generic name and valid price required.");
      return;
    }
    const r = await insertProductForPos({
      categoryId: prodCategoryId as number,
      genericName: prodGeneric,
      brandName: prodBrand || null,
      strength: prodStrength || null,
      unitOfMeasure: prodUom,
      unitPrice: price,
      unitCost: price * 0.7,
      barcode: prodBarcode || null,
      requiresPrescription: prodRequiresRx,
    });
    setCatalogMsg(r.error ?? "Product added.");
    if (!r.error) {
      setProdGeneric("");
      setProdBrand("");
      setProdStrength("");
      setProdPrice("");
      setProdBarcode("");
      setProdRequiresRx(false);
    }
  }, [prodCategoryId, prodGeneric, prodBrand, prodStrength, prodUom, prodPrice, prodBarcode, prodRequiresRx]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      const blockingModal =
        addLineOpen ||
        payOpen ||
        voidSaleOpen ||
        returnSaleOpen ||
        discountDialogOpen ||
        catalogOpen ||
        priceCheckOpen ||
        shiftOpenModal ||
        shiftDialogOpen ||
        cashCountOpen ||
        heldDialogOpen;
      if (blockingModal) return;

      if (e.key === "F2") {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (e.key === "F3") {
        e.preventDefault();
        holdCurrentSale();
      }
      if (e.key === "F4") {
        e.preventDefault();
        openPaymentModal();
      }
      if (e.key === "F5") {
        e.preventDefault();
        openPriceCheckModal();
      }
      if (e.key === "F6") {
        e.preventDefault();
        setCashCountOpen(true);
      }
      if (e.key === "F7") {
        e.preventDefault();
        openVoidSaleModal();
      }
      if (e.key === "F9") {
        e.preventDefault();
        setHeldDialogOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    holdCurrentSale,
    openPaymentModal,
    openPriceCheckModal,
    openVoidSaleModal,
    addLineOpen,
    payOpen,
    voidSaleOpen,
    returnSaleOpen,
    discountDialogOpen,
    catalogOpen,
    priceCheckOpen,
    shiftOpenModal,
    shiftDialogOpen,
    cashCountOpen,
    heldDialogOpen,
  ]);

  const onPriceCheckKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setPriceCheckSel((i) => Math.min(Math.max(0, priceCheckResults.length - 1), i + 1));
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setPriceCheckSel((i) => Math.max(0, i - 1));
    }
    if (e.key === "Enter") {
      e.preventDefault();
      void commitPriceCheck();
    }
  };

  const onOmnibarKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setResultSel((i) => Math.min(Math.max(0, results.length - 1), i + 1));
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setResultSel((i) => Math.max(0, i - 1));
    }
    if (e.key === "Enter") {
      e.preventDefault();
      void submitOmnibar();
    }
  };

  return (
    <Box
      ref={posRootRef}
      sx={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        overflow: "hidden",
        bgcolor: "background.default",
      }}
    >
      <Paper
        elevation={0}
        sx={{
          px: 2,
          py: 2,
          borderRadius: 0,
          borderBottom: "1px solid",
          borderColor: "divider",
          display: "flex",
          alignItems: "center",
          gap: 2,
          flexWrap: "wrap",
          bgcolor: "background.paper",
        }}
      >
        <Stack direction="row" alignItems="center" sx={{ flexShrink: 0, gap: 0 }}>
          <Box sx={{ lineHeight: 0, display: "flex", flexShrink: 0 }}>
            <Image
              src={LIFEHUB_LOGO_SRC}
              alt="LifeHub"
              width={152}
              height={44}
              style={{ objectFit: "contain", display: "block" }}
              unoptimized
            />
          </Box>
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              alignItems: "flex-start",
              lineHeight: 1.1,
              minHeight: 48,
              /** Logo PNG includes transparent padding — pull label closer to visible mark. */
              ml: { xs: -3, sm: -4 },
            }}
            aria-hidden
          >
            <Typography
              variant="overline"
              sx={{
                fontWeight: 800,
                letterSpacing: "0.14em",
                color: "primary.main",
                fontSize: "0.68rem",
                lineHeight: 1,
              }}
            >
              PHARMACY
            </Typography>
            <Typography variant="h6" sx={{ fontWeight: 900, letterSpacing: "0.04em", lineHeight: 1.1 }}>
              POS
            </Typography>
          </Box>
        </Stack>
        <Divider orientation="vertical" flexItem sx={{ display: { xs: "none", sm: "block" }, alignSelf: "stretch" }} />
        <TextField
          inputRef={searchRef}
          name="omnibar"
          placeholder="Search, scan barcode, or encounter ID — press Enter (F2 focus)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onOmnibarKeyDown}
          sx={{ flex: 1, minWidth: 280, ...POS_BAR_FIELD_SX }}
          hiddenLabel
          autoComplete="off"
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <ManageSearchIcon sx={{ fontSize: 26 }} color="primary" />
              </InputAdornment>
            ),
          }}
        />
        <Chip
          label={shiftId ? `Shift open · Beg PHP ${shiftBeginningCash.toFixed(2)}` : "No shift"}
          color={shiftId ? "success" : "warning"}
          size="medium"
          sx={{ "& .MuiChip-label": { fontSize: "0.875rem", py: 0.5 } }}
        />
        {patientName && (
          <Chip label={`Patient: ${patientName}`} size="medium" variant="outlined" color="info" sx={{ "& .MuiChip-label": { fontSize: "0.875rem" } }} />
        )}
        <Button size="medium" sx={{ minHeight: 48 }} startIcon={<Inventory2OutlinedIcon />} onClick={() => void openCatalog()}>
          Catalog
        </Button>
        <Tooltip title={isFullscreen ? "Exit full screen (Esc)" : "Full screen"}>
          <IconButton
            onClick={() => void toggleFullscreen()}
            color="primary"
            aria-label={isFullscreen ? "Exit full screen" : "Enter full screen"}
            sx={{
              ml: { xs: 0, sm: "auto" },
              minWidth: 48,
              minHeight: 48,
              border: "1px solid",
              borderColor: "divider",
              borderRadius: 2,
            }}
          >
            {isFullscreen ? <FullscreenExitIcon sx={{ fontSize: 28 }} /> : <FullscreenIcon sx={{ fontSize: 28 }} />}
          </IconButton>
        </Tooltip>
      </Paper>

      {posInfo && (
        <Alert severity="success" onClose={() => setPosInfo(null)}>
          {posInfo}
        </Alert>
      )}
      {checkoutErr && (
        <Alert severity="error" onClose={() => setCheckoutErr(null)}>
          {checkoutErr}
        </Alert>
      )}

      <Box sx={{ flex: 1, display: "flex", minHeight: 0 }}>
        <Box sx={{ flex: 1.2, minWidth: 0, p: 2, overflow: "auto" }}>
          <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
            Results (↑↓ select row, Enter or tap a row to add — same bar above for barcode or encounter ID)
          </Typography>
          <TableContainer component={Paper} variant="outlined">
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell>Product</TableCell>
                  <TableCell>Strength</TableCell>
                  <TableCell align="right">Price</TableCell>
                  <TableCell align="right">Stock</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {results.map((r, i) => (
                  <TableRow
                    key={r.id}
                    hover
                    selected={i === resultSel}
                    onClick={() => {
                      setResultSel(i);
                      openAddLineModal(r, null);
                    }}
                    sx={{ cursor: "pointer" }}
                  >
                    <TableCell>
                      {r.generic_name}
                      {r.brand_name ? ` (${r.brand_name})` : ""}
                    </TableCell>
                    <TableCell>{[r.strength, r.dosage_form].filter(Boolean).join(" · ")}</TableCell>
                    <TableCell align="right">₱{r.unit_price.toFixed(2)}</TableCell>
                    <TableCell align="right">
                      {formatPosStockQty(resultStockQty[r.id])}
                    </TableCell>
                  </TableRow>
                ))}
                {results.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} align="center">
                      <Typography variant="body2" color="text.secondary">
                        {query.trim() ? "No matches" : "Type to search"}
                      </Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>

        <Paper
          sx={{
            width: { xs: "100%", md: 400 },
            borderRadius: 0,
            borderLeft: "1px solid",
            borderColor: "divider",
            p: 2,
            display: "flex",
            flexDirection: "column",
            gap: 1.5,
          }}
        >
          <Typography variant="h6" fontWeight={800}>
            Cart
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Cart edits need supervisor authorization · <strong>Request line authorization</strong> when no supervisor is at the register ·{" "}
            <strong>Void paid sale</strong> (F7) cancels a whole receipt · <strong>Return / refund</strong> on completed sales
          </Typography>
          <Stack spacing={1} sx={{ flex: 1, overflow: "auto" }}>
            {cart.map((line) => {
              const isPending = Boolean(pendingByLineKey[line.key]);
              return (
              <Paper key={line.key} variant="outlined" sx={{ p: 1, opacity: isPending ? 0.85 : 1 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="body2" fontWeight={600} noWrap title={cartLineLabel(line)}>
                      {cartLineLabel(line)}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" display="block" noWrap>
                      ₱{line.product.unit_price.toFixed(2)} × {line.qty}
                    </Typography>
                    {isPending && (
                      <Chip label="Pending approval" size="small" color="warning" sx={{ mt: 0.5, height: 20, fontSize: 10 }} />
                    )}
                  </Box>
                  <Stack direction="row" alignItems="center" spacing={0.5}>
                    <IconButton
                      size="small"
                      disabled={isPending}
                      onClick={(ev) => {
                        ev.stopPropagation();
                        openSupervisorForCart(line, "decrement");
                      }}
                    >
                      <RemoveIcon fontSize="small" />
                    </IconButton>
                    <Button
                      size="small"
                      variant="outlined"
                      disabled={isPending}
                      onClick={(ev) => {
                        ev.stopPropagation();
                        openEditCartQty(line);
                      }}
                      sx={{
                        minWidth: 40,
                        px: 1,
                        fontWeight: 800,
                        fontVariantNumeric: "tabular-nums",
                        lineHeight: 1.2,
                      }}
                      aria-label={`Edit quantity for ${cartLineLabel(line)}`}
                    >
                      {line.qty}
                    </Button>
                    <IconButton
                      size="small"
                      disabled={isPending}
                      onClick={(ev) => {
                        ev.stopPropagation();
                        openSupervisorForCart(line, "increment");
                      }}
                    >
                      <AddIcon fontSize="small" />
                    </IconButton>
                    <IconButton
                      size="small"
                      color="error"
                      disabled={isPending}
                      onClick={(ev) => {
                        ev.stopPropagation();
                        openSupervisorForCart(line, "delete");
                      }}
                    >
                      <DeleteOutlineIcon fontSize="small" />
                    </IconButton>
                  </Stack>
                </Stack>
                <Button
                  size="small"
                  variant="text"
                  sx={{ mt: 0.5, fontSize: 11, textTransform: "none", p: 0, minHeight: 0 }}
                  disabled={isPending}
                  onClick={() => {
                    setLineAuthErr(null);
                    setLineAuthDialogLine(line);
                  }}
                >
                  Request line authorization
                </Button>
              </Paper>
            );
            })}
            {cart.length === 0 && (
              <Typography variant="body2" color="text.secondary">
                Cart is empty — search or scan to add items.
              </Typography>
            )}
          </Stack>
          <Divider />
          <Stack spacing={0.5}>
            <Stack direction="row" justifyContent="space-between">
              <Typography variant="body2">Items</Typography>
              <Typography variant="body2" sx={{ fontVariantNumeric: "tabular-nums" }}>
                ₱{totals.gross.toFixed(2)}
              </Typography>
            </Stack>
            {totals.discountApplied > 0 && (
              <Stack direction="row" justifyContent="space-between">
                <Typography variant="body2" color="success.main">
                  {posDiscount.label}
                </Typography>
                <Typography variant="body2" sx={{ fontVariantNumeric: "tabular-nums" }} color="success.main">
                  −₱{totals.discountApplied.toFixed(2)}
                </Typography>
              </Stack>
            )}
            <Stack direction="row" justifyContent="space-between">
              <Typography variant="body2" color="text.secondary">
                VAT (est.)
              </Typography>
              <Typography variant="body2" sx={{ fontVariantNumeric: "tabular-nums" }}>
                ₱{totals.vat.toFixed(2)}
              </Typography>
            </Stack>
            <Stack direction="row" justifyContent="space-between" alignItems="baseline">
              <Typography variant="h6" fontWeight={800}>
                Total
              </Typography>
              <Typography variant="h6" fontWeight={800} color="primary.main">
                ₱{totals.total.toFixed(2)}
              </Typography>
            </Stack>
          </Stack>
          <Button
            variant="outlined"
            size="large"
            fullWidth
            startIcon={<LocalOfferIcon />}
            disabled={cart.length === 0}
            onClick={openDiscountModal}
          >
            {formatPosDiscountButtonLabel(posDiscount, totals.discountApplied)}
          </Button>
          <Button
            variant="contained"
            size="large"
            fullWidth
            startIcon={<PointOfSaleIcon />}
            disabled={!shiftId || cart.length === 0}
            onClick={() => openPaymentModal()}
          >
            Pay (F4)
          </Button>
        </Paper>
      </Box>

      <Paper
        sx={{
          p: 2,
          borderRadius: 0,
          borderTop: "1px solid",
          borderColor: "divider",
          display: "flex",
          flexWrap: "wrap",
          gap: 1.5,
          alignItems: "center",
          bgcolor: (t) => t.palette.grey[50],
        }}
      >
        <Button
          variant="contained"
          color="success"
          size="medium"
          sx={POS_FOOTER_BTN_SX}
          startIcon={<CalculateOutlinedIcon />}
          onClick={() => setCashCountOpen(true)}
        >
          Cash count
        </Button>
        <Tooltip title="Return items to stock and reduce the sale total (search by sale #)">
          <Button
            variant="contained"
            color="warning"
            size="medium"
            sx={{ ...POS_FOOTER_BTN_SX, color: "rgba(0,0,0,0.87)" }}
            startIcon={<AssignmentReturnOutlinedIcon />}
            onClick={() => openReturnSaleModal()}
          >
            Return / refund
          </Button>
        </Tooltip>
        <Tooltip title="Search a completed sale by sale # and void the whole transaction (F7)">
          <Button
            variant="contained"
            color="error"
            size="medium"
            sx={POS_FOOTER_BTN_SX}
            startIcon={<RemoveShoppingCartOutlinedIcon />}
            onClick={() => openVoidSaleModal()}
          >
            Void paid sale
          </Button>
        </Tooltip>
        <Tooltip title="Look up price in a window (F5)">
          <Button
            variant="contained"
            color="info"
            size="medium"
            sx={POS_FOOTER_BTN_SX}
            startIcon={<PriceChangeOutlinedIcon />}
            onClick={() => openPriceCheckModal()}
          >
            Price check
          </Button>
        </Tooltip>
        <Tooltip title="Park this cart for another customer (F3). Recall from Held carts.">
          <span>
            <Button
              variant="contained"
              color="warning"
              size="medium"
              sx={{ ...POS_FOOTER_BTN_SX, color: "rgba(0,0,0,0.87)" }}
              startIcon={<PauseCircleOutlineIcon />}
              disabled={cart.length === 0}
              onClick={() => holdCurrentSale()}
            >
              Hold sale
            </Button>
          </span>
        </Tooltip>
        <Button
          variant="contained"
          color="secondary"
          size="medium"
          sx={POS_FOOTER_BTN_SX}
          startIcon={<PlaylistPlayIcon />}
          disabled={heldSales.length === 0}
          onClick={() => setHeldDialogOpen(true)}
        >
          Held carts{heldSales.length > 0 ? ` (${heldSales.length})` : ""}
        </Button>
        <Divider orientation="vertical" flexItem sx={{ display: { xs: "none", sm: "block" }, alignSelf: "stretch", mx: 0.5 }} />
        <Tooltip title={shiftId ? "Shift already open — use EOD to close" : "Enter beginning cash to open today's shift"}>
          <span>
            <Button
              variant="contained"
              color="primary"
              size="medium"
              sx={POS_FOOTER_BTN_SX}
              disabled={!!shiftId}
              onClick={() => setShiftOpenModal(true)}
            >
              Start shift
            </Button>
          </span>
        </Tooltip>
        <Tooltip title="End of shift">
          <Button
            variant="contained"
            size="medium"
            sx={{
              ...POS_FOOTER_BTN_SX,
              bgcolor: "#6a1b9a",
              color: "#fff",
              "&:hover": { bgcolor: "#4a148c", boxShadow: 2 },
            }}
            startIcon={<LogoutIcon />}
            onClick={() => setShiftDialogOpen(true)}
          >
            EOD
          </Button>
        </Tooltip>
        <Typography variant="caption" color="text.secondary" sx={{ flex: 1, minWidth: 200 }}>
          One bar: type, scan, or encounter UUID · Enter · F2 search · F3 hold · F4 pay · F5 price check · F6 cash count · F7 void paid sale · F9 held carts · Esc full screen
        </Typography>
      </Paper>

      <Dialog container={posDialogContainer} open={shiftOpenModal} onClose={() => shiftId && setShiftOpenModal(false)}>
        <DialogTitle>Beginning cash</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            label="Beginning cash (PHP)"
            value={beginInput}
            onChange={(e) => setBeginInput(e.target.value)}
            margin="normal"
            sx={POS_BAR_FIELD_SX}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShiftOpenModal(false)} disabled={!shiftId}>
            Cancel
          </Button>
          <Button variant="contained" onClick={() => void startShift()}>
            Open shift
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        container={posDialogContainer}
        open={priceCheckOpen}
        onClose={() => {
          setPriceCheckOpen(false);
          setPriceCheckQuery("");
          setPriceCheckResults([]);
          setPriceCheckSel(0);
          setPriceCheckHit(null);
          setPriceCheckHint(null);
        }}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Price check</DialogTitle>
        <DialogContent>
          <TextField
            inputRef={priceCheckInputRef}
            fullWidth
            hiddenLabel
            placeholder="Search or scan barcode — Enter"
            value={priceCheckQuery}
            onChange={(e) => setPriceCheckQuery(e.target.value)}
            onKeyDown={onPriceCheckKeyDown}
            sx={{ mt: 1, ...POS_BAR_FIELD_SX }}
            autoComplete="off"
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <ManageSearchIcon sx={{ fontSize: 26 }} color="primary" />
                </InputAdornment>
              ),
            }}
          />
          <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>
            ↑↓ select a row · Enter looks up price (nothing is added to the cart)
          </Typography>
          {priceCheckResults.length > 0 && (
            <TableContainer component={Paper} variant="outlined" sx={{ mt: 2, maxHeight: 220 }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell>Product</TableCell>
                    <TableCell align="right">Price</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {priceCheckResults.map((r, i) => (
                    <TableRow
                      key={r.id}
                      hover
                      selected={i === priceCheckSel}
                      onClick={() => setPriceCheckSel(i)}
                      sx={{ cursor: "pointer" }}
                    >
                      <TableCell>{formatProductOptionLabel(r)}</TableCell>
                      <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums" }}>
                        ₱{r.unit_price.toFixed(2)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
          {priceCheckHint && (
            <Alert severity="warning" sx={{ mt: 2 }} onClose={() => setPriceCheckHint(null)}>
              {priceCheckHint}
            </Alert>
          )}
          <Box
            sx={{
              mt: 3,
              p: 3,
              borderRadius: 2,
              bgcolor: priceCheckHit ? "action.hover" : "transparent",
              ...(!priceCheckHit && { border: "1px dashed", borderColor: "divider" }),
              textAlign: "center",
              minHeight: 200,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 1,
            }}
          >
            {priceCheckHit ? (
              <>
                <Typography variant="h6" fontWeight={700} sx={{ lineHeight: 1.35, px: 1 }}>
                  {formatProductOptionLabel(priceCheckHit)}
                </Typography>
                <Typography
                  component="p"
                  sx={{
                    fontSize: { xs: "2.75rem", sm: "3.5rem" },
                    fontWeight: 800,
                    color: "primary.main",
                    fontVariantNumeric: "tabular-nums",
                    lineHeight: 1.1,
                    my: 0.5,
                  }}
                >
                  ₱{priceCheckHit.unit_price.toFixed(2)}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Shelf price (VAT-inclusive)
                </Typography>
              </>
            ) : (
              <Typography variant="body1" color="text.secondary">
                Scan or type, then press Enter or Show price
              </Typography>
            )}
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
          <Button
            size="large"
            onClick={() => {
              setPriceCheckOpen(false);
              setPriceCheckQuery("");
              setPriceCheckResults([]);
              setPriceCheckSel(0);
              setPriceCheckHit(null);
              setPriceCheckHint(null);
            }}
          >
            Close
          </Button>
          <Button size="large" variant="contained" onClick={() => void commitPriceCheck()}>
            Show price
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog container={posDialogContainer} open={discountDialogOpen} onClose={() => setDiscountDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Discount</DialogTitle>
        <DialogContent>
          <Stack spacing={2.5} sx={{ mt: 0.5 }}>
            <Typography variant="body2" color="text.secondary">
              Cart subtotal (VAT-inclusive): <strong>₱{totals.gross.toFixed(2)}</strong>
              {discountDraftTotals.discountApplied > 0 ? (
                <>
                  {" "}
                  · After discount: <strong>₱{discountDraftTotals.total.toFixed(2)}</strong> (−₱
                  {discountDraftTotals.discountApplied.toFixed(2)})
                </>
              ) : null}
            </Typography>

            <Box>
              <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>
                Philippines (medicines)
              </Typography>
              <List dense disablePadding>
                {POS_BUILTIN_DISCOUNT_PRESETS.filter((p) => p.kind === "sc" || p.kind === "pwd").map((preset) => (
                  <ListItemButton
                    key={preset.typeCode}
                    selected={discountSelectionsEqual(discountDraft, preset)}
                    onClick={() => setDiscountDraft(preset)}
                    sx={{ borderRadius: 2, mb: 0.5, border: "1px solid", borderColor: "divider" }}
                  >
                    <ListItemText
                      primary={preset.label}
                      secondary={preset.description}
                      primaryTypographyProps={{ fontWeight: 700 }}
                    />
                  </ListItemButton>
                ))}
              </List>
            </Box>

            <Box>
              <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>
                Store discounts
              </Typography>
              <List dense disablePadding>
                {POS_BUILTIN_DISCOUNT_PRESETS.filter((p) => p.kind !== "sc" && p.kind !== "pwd").map((preset) => (
                  <ListItemButton
                    key={preset.typeCode}
                    selected={discountSelectionsEqual(discountDraft, preset)}
                    onClick={() => setDiscountDraft(preset)}
                    sx={{ borderRadius: 2, mb: 0.5, border: "1px solid", borderColor: "divider" }}
                  >
                    <ListItemText
                      primary={preset.label}
                      secondary={preset.description}
                      primaryTypographyProps={{ fontWeight: 600 }}
                    />
                  </ListItemButton>
                ))}
              </List>
            </Box>

            {dbDiscountsLoading ? (
              <Stack direction="row" spacing={1} alignItems="center">
                <CircularProgress size={20} />
                <Typography variant="body2" color="text.secondary">
                  Loading discount catalog…
                </Typography>
              </Stack>
            ) : catalogDbDiscounts.length > 0 ? (
              <Box>
                <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>
                  From catalog
                </Typography>
                <List dense disablePadding>
                  {catalogDbDiscounts.map((row) => {
                    const sel = selectionFromDbType(row);
                    return (
                      <ListItemButton
                        key={row.id}
                        selected={discountSelectionsEqual(discountDraft, sel)}
                        onClick={() => setDiscountDraft(sel)}
                        sx={{ borderRadius: 2, mb: 0.5, border: "1px solid", borderColor: "divider" }}
                      >
                        <ListItemText
                          primary={row.name}
                          secondary={`${row.code} · ${Number(row.discount_pct) || 0}%`}
                          primaryTypographyProps={{ fontWeight: 600 }}
                        />
                      </ListItemButton>
                    );
                  })}
                </List>
              </Box>
            ) : null}

            <Divider />

            <Typography variant="subtitle2" fontWeight={700}>
              Other
            </Typography>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
              <TextField
                fullWidth
                label="Custom % off"
                value={discountCustomPercent}
                onChange={(e) => {
                  setDiscountCustomPercent(e.target.value.replace(/[^\d.]/g, ""));
                  setDiscountDraft({
                    kind: "percent",
                    label: "Custom %",
                    typeCode: "PERCENT_CUSTOM",
                    percent: Number(e.target.value) || 0,
                  });
                }}
                onFocus={() =>
                  setDiscountDraft({
                    kind: "percent",
                    label: "Custom %",
                    typeCode: "PERCENT_CUSTOM",
                    percent: Number(discountCustomPercent) || 0,
                  })
                }
                inputProps={{ inputMode: "decimal" }}
                sx={POS_BAR_FIELD_SX}
              />
              <TextField
                fullWidth
                label="Fixed amount (PHP)"
                value={discountCustomFixed}
                onChange={(e) => {
                  setDiscountCustomFixed(e.target.value.replace(/[^\d.]/g, ""));
                  setDiscountDraft({
                    kind: "fixed",
                    label: "Fixed amount",
                    typeCode: "FIXED",
                    fixedAmount: Number(e.target.value) || 0,
                  });
                }}
                onFocus={() =>
                  setDiscountDraft({
                    kind: "fixed",
                    label: "Fixed amount",
                    typeCode: "FIXED",
                    fixedAmount: Number(discountCustomFixed) || 0,
                  })
                }
                inputProps={{ inputMode: "decimal" }}
                sx={POS_BAR_FIELD_SX}
              />
            </Stack>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ flexWrap: "wrap", gap: 1, px: 3, pb: 2 }}>
          <Button
            onClick={() => {
              setDiscountDraft(POS_DISCOUNT_NONE);
              setPosDiscount(POS_DISCOUNT_NONE);
              setDiscountCustomPercent("10");
              setDiscountCustomFixed("0");
              setDiscountDialogOpen(false);
            }}
          >
            Clear discount
          </Button>
          <Box sx={{ flex: 1 }} />
          <Button onClick={() => setDiscountDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={applyDiscountDraft}>
            Apply
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog container={posDialogContainer} open={payOpen} onClose={() => setPayOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Payment</DialogTitle>
        <DialogContent>
          <Stack spacing={2.5} sx={{ mt: 1 }}>
            <Typography variant="h6" fontWeight={700} sx={{ fontVariantNumeric: "tabular-nums" }}>
              Total due: ₱{totals.total.toFixed(2)}
            </Typography>
            <Typography variant="subtitle2" color="text.secondary">
              Pay with
            </Typography>
            <Stack direction="row" spacing={1.5}>
              {PAY_MODAL_METHODS.map((m) => (
                <Button
                  key={m}
                  fullWidth
                  size="large"
                  variant={paymentMethod === m ? "contained" : "outlined"}
                  onClick={() => {
                    setPaymentMethod(m);
                    if (m === "Cash") {
                      payCashFreshRef.current = true;
                      setAmountTendered(totals.total.toFixed(2));
                      focusPayCashField();
                    }
                  }}
                >
                  {m}
                </Button>
              ))}
            </Stack>
            {paymentMethod === "Cash" && (
              <Stack spacing={2} alignItems="center">
                <TextField
                  inputRef={payCashInputRef}
                  label="Cash received"
                  value={amountTendered}
                  onChange={(e) => {
                    payCashFreshRef.current = false;
                    setAmountTendered(sanitizeCashTenderedInput(e.target.value));
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void pay();
                    }
                  }}
                  onClick={() => {
                    payCashFreshRef.current = false;
                  }}
                  fullWidth
                  autoFocus
                  inputProps={{ inputMode: "decimal", "aria-label": "Cash received from customer" }}
                  helperText="Type or use the keypad — first key replaces the amount shown."
                  InputLabelProps={{ shrink: true }}
                  sx={{
                    maxWidth: 360,
                    width: "100%",
                    "& .MuiOutlinedInput-root": { borderRadius: 2 },
                    "& .MuiOutlinedInput-input": {
                      fontSize: "1.5rem",
                      fontWeight: 800,
                      textAlign: "center",
                      py: 1.25,
                      fontVariantNumeric: "tabular-nums",
                    },
                  }}
                />
                {payChangeDue > 0 && (
                  <Typography variant="h6" fontWeight={800} color="success.main" sx={{ fontVariantNumeric: "tabular-nums" }}>
                    Change: ₱{payChangeDue.toFixed(2)}
                  </Typography>
                )}
                <Box
                  sx={{
                    display: "grid",
                    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                    gap: 1,
                    maxWidth: 360,
                    width: "100%",
                  }}
                >
                  {(["7", "8", "9", "4", "5", "6", "1", "2", "3"] as const).map((d) => (
                    <Button
                      key={d}
                      variant="outlined"
                      size="large"
                      onClick={() => payNumpadDigit(d)}
                      sx={{
                        minHeight: 52,
                        fontSize: "1.35rem",
                        fontWeight: 800,
                        borderRadius: 2,
                        bgcolor: "background.paper",
                      }}
                    >
                      {d}
                    </Button>
                  ))}
                  <Button
                    variant="outlined"
                    color="warning"
                    size="large"
                    onClick={payNumpadClear}
                    sx={{ minHeight: 52, fontWeight: 800, borderRadius: 2, bgcolor: "background.paper" }}
                  >
                    Clear
                  </Button>
                  <Button
                    variant="outlined"
                    size="large"
                    onClick={payNumpadDecimal}
                    sx={{
                      minHeight: 52,
                      fontSize: "1.35rem",
                      fontWeight: 800,
                      borderRadius: 2,
                      bgcolor: "background.paper",
                    }}
                  >
                    .
                  </Button>
                  <Button
                    variant="outlined"
                    size="large"
                    onClick={() => payNumpadDigit("0")}
                    sx={{
                      minHeight: 52,
                      fontSize: "1.35rem",
                      fontWeight: 800,
                      borderRadius: 2,
                      bgcolor: "background.paper",
                    }}
                  >
                    0
                  </Button>
                  <Button
                    variant="outlined"
                    size="large"
                    aria-label="Backspace cash amount"
                    onClick={payNumpadBackspace}
                    sx={{ gridColumn: "1 / -1", minHeight: 52, borderRadius: 2, bgcolor: "background.paper" }}
                  >
                    <BackspaceOutlinedIcon />
                  </Button>
                </Box>
              </Stack>
            )}
            {paymentMethod === "GCash" && (
              <Typography variant="body2" color="text.secondary">
                Record this sale as GCash. The customer pays <strong>₱{totals.total.toFixed(2)}</strong> via GCash (confirm
                on your wallet app).
              </Typography>
            )}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button size="large" onClick={() => setPayOpen(false)}>
            Cancel
          </Button>
          <Button size="large" variant="contained" onClick={() => void pay()}>
            Complete sale
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog container={posDialogContainer} open={shiftDialogOpen} onClose={() => setShiftDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>End of shift</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Typography variant="body2">
              Use <strong>Cash count</strong> in the footer, then <strong>END SHIFT</strong> there to fill the field below — or type actual cash yourself.
            </Typography>
            <Typography variant="body2" color="text.secondary">
              X-reading does not close the shift. Z-reading closes the shift after you enter actual cash.
            </Typography>
            <Button variant="outlined" onClick={() => void runXReading()}>
              X-reading (print)
            </Button>
            <TextField
              label="Actual cash in drawer (for Z)"
              value={zActualCash}
              onChange={(e) => setZActualCash(e.target.value)}
              fullWidth
              sx={POS_BAR_FIELD_SX}
            />
            <Button variant="contained" color="warning" onClick={() => void runZReading()}>
              End shift (Z-reading)
            </Button>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShiftDialogOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      <Dialog container={posDialogContainer} open={cashCountOpen} onClose={() => setCashCountOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>Cash count</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Shift beginning cash: <strong>PHP {shiftBeginningCash.toFixed(2)}</strong>
          </Typography>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
              gap: 3,
              alignItems: "flex-start",
            }}
          >
            <Stack spacing={1.25}>
              <Typography variant="subtitle2" color="text.secondary">
                Cash (pieces)
              </Typography>
              {PHP_DRAWER_DENOMS.map((d) => (
                <TextField
                  key={d.value}
                  label={d.label}
                  value={denomQty[String(d.value)] ?? ""}
                  onChange={(e) =>
                    setDenomQty((prev) => ({ ...prev, [String(d.value)]: e.target.value.replace(/[^\d]/g, "") }))
                  }
                  fullWidth
                  type="text"
                  inputMode="numeric"
                  placeholder="0"
                  InputLabelProps={{ shrink: true }}
                  sx={CASH_COUNT_FIELD_SX}
                />
              ))}
            </Stack>
            <Stack spacing={1.25}>
              <Typography variant="subtitle2" color="text.secondary">
                Other tender (PHP)
              </Typography>
              <TextField
                label="GCash"
                value={countGcashPeso}
                onChange={(e) => setCountGcashPeso(e.target.value.replace(/[^\d.]/g, ""))}
                fullWidth
                type="text"
                inputMode="decimal"
                placeholder="0"
                InputLabelProps={{ shrink: true }}
                sx={CASH_COUNT_FIELD_SX}
              />
              <TextField
                label="Debit Card"
                value={countDebitPeso}
                onChange={(e) => setCountDebitPeso(e.target.value.replace(/[^\d.]/g, ""))}
                fullWidth
                type="text"
                inputMode="decimal"
                placeholder="0"
                InputLabelProps={{ shrink: true }}
                sx={CASH_COUNT_FIELD_SX}
              />
            </Stack>
          </Box>
          <Typography variant="h6" sx={{ mt: 3, fontVariantNumeric: "tabular-nums" }}>
            Total counted: PHP {cashCountTotal.toFixed(2)}
          </Typography>
        </DialogContent>
        <DialogActions sx={{ flexWrap: "wrap", gap: 1, px: 3, pb: 2 }}>
          <Button
            size="large"
            onClick={() => {
              setDenomQty(emptyDenomQty());
              setCountGcashPeso("");
              setCountDebitPeso("");
            }}
          >
            Clear quantities
          </Button>
          <Button size="large" onClick={() => void printCashCountSlip()}>
            Print slip
          </Button>
          <Button size="large" onClick={() => setCashCountOpen(false)}>
            Close
          </Button>
          <Button size="large" variant="contained" color="primary" onClick={() => applyCashCountToZ()} disabled={!shiftId}>
            END SHIFT
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog container={posDialogContainer} open={heldDialogOpen} onClose={() => setHeldDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Held carts</DialogTitle>
        <DialogContent>
          {heldSales.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              No sales on hold. Add items to the cart and tap <strong>Hold sale</strong> to park a transaction.
            </Typography>
          ) : (
            <Stack spacing={2} sx={{ mt: 1 }}>
              {heldSales.map((h) => (
                <Paper key={h.id} variant="outlined" sx={{ p: 2 }}>
                  <Typography variant="body2" fontWeight={600}>
                    {h.label}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
                    {new Date(h.savedAt).toLocaleString()} · {h.lines.length} line(s)
                  </Typography>
                  <Stack direction="row" spacing={1} flexWrap="wrap">
                    <Button size="small" variant="contained" onClick={() => recallHeldSale(h)}>
                      Recall
                    </Button>
                    <Button size="small" color="error" onClick={() => discardHeldSale(h.id)}>
                      Discard
                    </Button>
                  </Stack>
                </Paper>
              ))}
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setHeldDialogOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      <Dialog
        container={posDialogContainer}
        open={voidSaleOpen}
        onClose={() => !voidSaleBusy && setVoidSaleOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Void paid sale</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Search by sale # (or part of it). Pick the sale, review lines, then void. Inventory is returned to the lots used at checkout when possible.
          </Typography>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ mb: 2 }}>
            <TextField
              autoFocus
              fullWidth
              label="Sale #"
              value={voidOrQuery}
              onChange={(e) => setVoidOrQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void runVoidSaleSearch();
                }
              }}
              disabled={voidSaleBusy}
            />
            <Button variant="contained" disabled={voidSaleBusy || voidSaleSearching} onClick={() => void runVoidSaleSearch()}>
              {voidSaleSearching ? "Searching…" : "Search"}
            </Button>
          </Stack>
          {voidSaleSearchErr && (
            <Alert severity={voidSaleResults.length === 0 ? "warning" : "error"} sx={{ mb: 2 }} onClose={() => setVoidSaleSearchErr(null)}>
              {voidSaleSearchErr}
            </Alert>
          )}
          <TableContainer component={Paper} variant="outlined" sx={{ mb: 2, maxHeight: 220 }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell>Sale #</TableCell>
                  <TableCell>Date</TableCell>
                  <TableCell align="right">Total</TableCell>
                  <TableCell>Payment</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {voidSaleResults.map((s) => (
                  <TableRow
                    key={s.id}
                    hover
                    selected={voidSaleSelectedId === s.id}
                    sx={{ cursor: "pointer" }}
                    onClick={() => setVoidSaleSelectedId(s.id)}
                  >
                    <TableCell>{s.or_number}</TableCell>
                    <TableCell>
                      {s.sale_date}
                      {s.sale_time ? ` · ${s.sale_time}` : ""}
                    </TableCell>
                    <TableCell align="right">₱{(Number(s.total_amount) || 0).toFixed(2)}</TableCell>
                    <TableCell>{s.payment_method ?? "—"}</TableCell>
                  </TableRow>
                ))}
                {voidSaleResults.length === 0 && !voidSaleSearching && (
                  <TableRow>
                    <TableCell colSpan={4} align="center">
                      <Typography variant="body2" color="text.secondary">
                        No results yet — enter sale # and search.
                      </Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>

          {voidSaleDetailLoading && (
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
              <CircularProgress size={22} />
              <Typography variant="body2" color="text.secondary">
                Loading sale lines…
              </Typography>
            </Stack>
          )}

          {voidSaleDetail && !voidSaleDetailLoading && (
            <Stack spacing={2}>
              <Paper variant="outlined" sx={{ p: 2 }}>
                <Typography variant="subtitle2" fontWeight={700} gutterBottom>
                  Sale summary
                </Typography>
                <Typography variant="body2">
                  <strong>{voidSaleDetail.sale.or_number}</strong> · ₱{(Number(voidSaleDetail.sale.total_amount) || 0).toFixed(2)} ·{" "}
                  {voidSaleDetail.sale.payment_method ?? "—"}
                </Typography>
                <Typography variant="caption" color="text.secondary" display="block">
                  {voidSaleDetail.sale.sale_date}
                  {voidSaleDetail.sale.sale_time ? ` · ${voidSaleDetail.sale.sale_time}` : ""}
                </Typography>
              </Paper>
              <Typography variant="subtitle2" fontWeight={700}>
                Lines
              </Typography>
              <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 240 }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell>#</TableCell>
                      <TableCell>Product</TableCell>
                      <TableCell align="right">Qty</TableCell>
                      <TableCell align="right">Unit</TableCell>
                      <TableCell align="right">Line</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {voidSaleDetail.lines.map((ln) => (
                      <TableRow key={ln.id}>
                        <TableCell>{ln.linenum}</TableCell>
                        <TableCell>
                          {ln.generic_name}
                          {ln.brand_name ? ` (${ln.brand_name})` : ""}
                        </TableCell>
                        <TableCell align="right">{ln.quantity}</TableCell>
                        <TableCell align="right">₱{ln.unit_price.toFixed(2)}</TableCell>
                        <TableCell align="right">₱{(Number(ln.line_total) || ln.quantity * ln.unit_price).toFixed(2)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
              <TextField
                fullWidth
                label="Reason (optional)"
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
                disabled={voidSaleBusy}
                placeholder="e.g. Wrong item charged, customer return"
              />
            </Stack>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => !voidSaleBusy && setVoidSaleOpen(false)}>Close</Button>
          <Button
            variant="contained"
            color="error"
            disabled={!voidSaleDetail || voidSaleBusy || voidSaleDetailLoading}
            onClick={() => void commitVoidPaidSale()}
          >
            {voidSaleBusy ? "Voiding…" : "Void this sale"}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        container={posDialogContainer}
        open={returnSaleOpen}
        onClose={() => !returnSaleBusy && setReturnSaleOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Return / refund</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Find a completed sale, then enter how many units to return per line. Stock is put back (same lots as checkout when tracked). Sale totals and VAT are adjusted; if every line is fully returned, the sale is marked void.
          </Typography>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ mb: 2 }}>
            <TextField
              autoFocus
              fullWidth
              label="Sale #"
              value={returnOrQuery}
              onChange={(e) => setReturnOrQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void runReturnSaleSearch();
                }
              }}
              disabled={returnSaleBusy}
            />
            <Button variant="contained" disabled={returnSaleBusy || returnSaleSearching} onClick={() => void runReturnSaleSearch()}>
              {returnSaleSearching ? "Searching…" : "Search"}
            </Button>
          </Stack>
          {returnSaleSearchErr && (
            <Alert severity={returnSaleResults.length === 0 ? "warning" : "error"} sx={{ mb: 2 }} onClose={() => setReturnSaleSearchErr(null)}>
              {returnSaleSearchErr}
            </Alert>
          )}
          <TableContainer component={Paper} variant="outlined" sx={{ mb: 2, maxHeight: 220 }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell>Sale #</TableCell>
                  <TableCell>Date</TableCell>
                  <TableCell align="right">Total</TableCell>
                  <TableCell>Payment</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {returnSaleResults.map((s) => (
                  <TableRow
                    key={s.id}
                    hover
                    selected={returnSaleSelectedId === s.id}
                    sx={{ cursor: "pointer" }}
                    onClick={() => setReturnSaleSelectedId(s.id)}
                  >
                    <TableCell>{s.or_number}</TableCell>
                    <TableCell>
                      {s.sale_date}
                      {s.sale_time ? ` · ${s.sale_time}` : ""}
                    </TableCell>
                    <TableCell align="right">₱{(Number(s.total_amount) || 0).toFixed(2)}</TableCell>
                    <TableCell>{s.payment_method ?? "—"}</TableCell>
                  </TableRow>
                ))}
                {returnSaleResults.length === 0 && !returnSaleSearching && (
                  <TableRow>
                    <TableCell colSpan={4} align="center">
                      <Typography variant="body2" color="text.secondary">
                        No results yet — enter sale # and search.
                      </Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>

          {returnSaleDetailLoading && (
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
              <CircularProgress size={22} />
              <Typography variant="body2" color="text.secondary">
                Loading sale lines…
              </Typography>
            </Stack>
          )}

          {returnSaleDetail && !returnSaleDetailLoading && (
            <Stack spacing={2}>
              <Paper variant="outlined" sx={{ p: 2 }}>
                <Typography variant="subtitle2" fontWeight={700} gutterBottom>
                  Sale summary
                </Typography>
                <Typography variant="body2">
                  <strong>{returnSaleDetail.sale.or_number}</strong> · ₱{(Number(returnSaleDetail.sale.total_amount) || 0).toFixed(2)} ·{" "}
                  {returnSaleDetail.sale.payment_method ?? "—"}
                </Typography>
                <Typography variant="caption" color="text.secondary" display="block">
                  {returnSaleDetail.sale.sale_date}
                  {returnSaleDetail.sale.sale_time ? ` · ${returnSaleDetail.sale.sale_time}` : ""}
                </Typography>
              </Paper>
              <Typography variant="subtitle2" fontWeight={700}>
                Lines — enter return qty (leave 0 to skip)
              </Typography>
              <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 280 }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell>#</TableCell>
                      <TableCell>Product</TableCell>
                      <TableCell align="right">Sold</TableCell>
                      <TableCell align="right" sx={{ minWidth: 120 }}>
                        Return qty
                      </TableCell>
                      <TableCell align="right">Line</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {returnSaleDetail.lines.map((ln) => (
                      <TableRow key={ln.id}>
                        <TableCell>{ln.linenum}</TableCell>
                        <TableCell>
                          {ln.generic_name}
                          {ln.brand_name ? ` (${ln.brand_name})` : ""}
                        </TableCell>
                        <TableCell align="right">{ln.quantity}</TableCell>
                        <TableCell align="right">
                          <TextField
                            size="small"
                            value={returnQtyDraft[ln.id] ?? ""}
                            onChange={(e) => {
                              const v = e.target.value.replace(/\D/g, "").slice(0, 6);
                              setReturnQtyDraft((prev) => ({ ...prev, [ln.id]: v }));
                            }}
                            placeholder="0"
                            disabled={returnSaleBusy}
                            inputProps={{ inputMode: "numeric", "aria-label": `Return qty line ${ln.linenum}` }}
                            sx={{ width: 88, "& input": { textAlign: "right" } }}
                          />
                        </TableCell>
                        <TableCell align="right">₱{(Number(ln.line_total) || ln.quantity * ln.unit_price).toFixed(2)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
              <TextField
                fullWidth
                label="Reason (optional)"
                value={returnReason}
                onChange={(e) => setReturnReason(e.target.value)}
                disabled={returnSaleBusy}
                placeholder="e.g. Customer return, damaged goods"
              />
            </Stack>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => !returnSaleBusy && setReturnSaleOpen(false)}>Close</Button>
          <Button
            variant="contained"
            color="warning"
            disabled={!returnSaleDetail || returnSaleBusy || returnSaleDetailLoading}
            sx={{ color: "rgba(0,0,0,0.87)" }}
            onClick={() => void commitReturnRefund()}
          >
            {returnSaleBusy ? "Saving…" : "Save return / refund"}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog container={posDialogContainer} open={addLineOpen} onClose={closeAddLineModal} maxWidth="sm" fullWidth>
        <DialogTitle>Add to cart</DialogTitle>
        <DialogContent>
          {addLineProduct && (
            <Stack spacing={2.5} sx={{ mt: 0.5 }}>
              <Box>
                <Typography variant="body1" fontWeight={700}>
                  {addLineProduct.generic_name}
                  {addLineProduct.brand_name ? ` (${addLineProduct.brand_name})` : ""}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {[addLineProduct.strength, addLineProduct.dosage_form].filter(Boolean).join(" · ")} · ₱
                  {addLineProduct.unit_price.toFixed(2)}
                </Typography>
              </Box>
              <Paper variant="outlined" sx={{ px: 1.5, py: 1, bgcolor: "action.hover", borderRadius: 2 }}>
                <Stack direction="row" spacing={1} alignItems="center">
                  {!addLineExpiryReady ? (
                    <>
                      <CircularProgress size={22} />
                      <Typography variant="body2" color="text.secondary">
                        Loading expiry…
                      </Typography>
                    </>
                  ) : (
                    <Typography variant="body2" color="text.secondary">
                      {addLineExpiryInfo ?? "—"}
                    </Typography>
                  )}
                </Stack>
              </Paper>
              <TextField
                inputRef={addLineQtyInputRef}
                label="Quantity"
                value={addLineQty}
                onChange={(e) => {
                  setAddLineQtyErr(null);
                  addLineQtyFreshRef.current = false;
                  const raw = e.target.value.replace(/\D/g, "").slice(0, 6);
                  if (raw === "") {
                    setAddLineQty("");
                    return;
                  }
                  const n = Number.parseInt(raw, 10);
                  if (!Number.isFinite(n) || n < 1) {
                    setAddLineQty("");
                    return;
                  }
                  setAddLineQty(String(Math.min(n, 999_999)));
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void confirmAddLineFromModal();
                  }
                }}
                onClick={() => {
                  addLineQtyFreshRef.current = false;
                }}
                fullWidth
                autoFocus
                inputProps={{ inputMode: "numeric", min: 1, "aria-label": "Quantity to add" }}
                error={Boolean(addLineQtyErr)}
                helperText={addLineQtyErr ?? "Type a number or use the keypad — first key replaces the default."}
                InputLabelProps={{ shrink: true }}
                sx={{
                  maxWidth: 360,
                  alignSelf: "center",
                  width: "100%",
                  "& .MuiOutlinedInput-root": { borderRadius: 2 },
                  "& .MuiOutlinedInput-input": {
                    fontSize: "1.5rem",
                    fontWeight: 800,
                    textAlign: "center",
                    py: 1.25,
                  },
                }}
              />
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                  gap: 1,
                  maxWidth: 360,
                  width: "100%",
                  alignSelf: "center",
                }}
              >
                {(["7", "8", "9", "4", "5", "6", "1", "2", "3"] as const).map((d) => (
                  <Button
                    key={d}
                    variant="outlined"
                    size="large"
                    onClick={() => addLineNumpadDigit(d)}
                    sx={{
                      minHeight: 52,
                      fontSize: "1.35rem",
                      fontWeight: 800,
                      borderRadius: 2,
                      bgcolor: "background.paper",
                    }}
                  >
                    {d}
                  </Button>
                ))}
                <Button
                  variant="outlined"
                  color="warning"
                  size="large"
                  onClick={addLineNumpadClear}
                  sx={{ minHeight: 52, fontWeight: 800, borderRadius: 2, bgcolor: "background.paper" }}
                >
                  Clear
                </Button>
                <Button
                  variant="outlined"
                  size="large"
                  onClick={() => addLineNumpadDigit("0")}
                  sx={{
                    minHeight: 52,
                    fontSize: "1.35rem",
                    fontWeight: 800,
                    borderRadius: 2,
                    bgcolor: "background.paper",
                  }}
                >
                  0
                </Button>
                <Button
                  variant="outlined"
                  size="large"
                  aria-label="Backspace quantity"
                  onClick={addLineNumpadBackspace}
                  sx={{ minHeight: 52, borderRadius: 2, bgcolor: "background.paper" }}
                >
                  <BackspaceOutlinedIcon />
                </Button>
              </Box>
            </Stack>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, pt: 0 }}>
          <Button onClick={closeAddLineModal}>Cancel</Button>
          <Button variant="contained" size="large" onClick={() => void confirmAddLineFromModal()}>
            Add to cart
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog container={posDialogContainer} open={catalogOpen} onClose={() => setCatalogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Catalog</DialogTitle>
        <DialogContent>
          <Typography variant="subtitle2" sx={{ mt: 1 }}>
            New category
          </Typography>
          <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
            <TextField label="Code" size="small" value={catCode} onChange={(e) => setCatCode(e.target.value)} />
            <TextField label="Name" size="small" value={catName} onChange={(e) => setCatName(e.target.value)} />
            <Button variant="outlined" onClick={() => void saveCategory()}>
              Save
            </Button>
          </Stack>
          <Typography variant="subtitle2">New product</Typography>
          <Stack spacing={1} sx={{ mt: 1 }}>
            <TextField
              select
              label="Category"
              size="small"
              value={prodCategoryId}
              onChange={(e) => setProdCategoryId(Number(e.target.value))}
            >
              {categories.map((c) => (
                <MenuItem key={c.id} value={c.id}>
                  {c.name}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label="Generic name"
              size="small"
              value={prodGeneric}
              onChange={(e) => setProdGeneric(e.target.value)}
              fullWidth
            />
            <TextField
              label="Brand"
              size="small"
              value={prodBrand}
              onChange={(e) => setProdBrand(e.target.value)}
              fullWidth
            />
            <TextField
              label="Strength"
              size="small"
              value={prodStrength}
              onChange={(e) => setProdStrength(e.target.value)}
              fullWidth
            />
            <TextField label="UOM" size="small" value={prodUom} onChange={(e) => setProdUom(e.target.value)} />
            <TextField
              label="Unit price"
              size="small"
              value={prodPrice}
              onChange={(e) => setProdPrice(e.target.value)}
            />
            <TextField
              label="Barcode"
              size="small"
              value={prodBarcode}
              onChange={(e) => setProdBarcode(e.target.value)}
            />
            <FormControlLabel
              control={
                <Switch
                  checked={prodRequiresRx}
                  onChange={(_, c) => setProdRequiresRx(c)}
                  color="primary"
                />
              }
              label="Requires Rx (prescription)"
            />
            <Button variant="contained" onClick={() => void saveProduct()}>
              Add product
            </Button>
            {catalogMsg && (
              <Typography variant="caption" color={catalogMsg.includes("error") ? "error" : "text.secondary"}>
                {catalogMsg}
              </Typography>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCatalogOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      <Dialog
        container={posDialogContainer}
        open={editCartQtyLine != null}
        onClose={closeEditCartQty}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Edit quantity</DialogTitle>
        <DialogContent>
          {editCartQtyLine && (
            <Stack spacing={2.5} sx={{ mt: 0.5 }}>
              <Typography variant="body2" fontWeight={700}>
                {cartLineLabel(editCartQtyLine)}
              </Typography>
              <TextField
                inputRef={editCartQtyInputRef}
                label="Quantity"
                value={editCartQtyDraft}
                onChange={(e) => {
                  setEditCartQtyErr(null);
                  editCartQtyFreshRef.current = false;
                  const raw = e.target.value.replace(/\D/g, "").slice(0, 6);
                  if (raw === "") {
                    setEditCartQtyDraft("");
                    return;
                  }
                  const parsed = Number.parseInt(raw, 10);
                  if (!Number.isFinite(parsed) || parsed < 1) {
                    setEditCartQtyDraft("");
                    return;
                  }
                  setEditCartQtyDraft(String(Math.min(parsed, 999_999)));
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    confirmEditCartQty();
                  }
                }}
                onClick={() => {
                  editCartQtyFreshRef.current = false;
                }}
                fullWidth
                autoFocus
                inputProps={{ inputMode: "numeric", min: 1, "aria-label": "Cart line quantity" }}
                error={Boolean(editCartQtyErr)}
                helperText={editCartQtyErr ?? "Type a number or use the keypad — first key replaces the current qty."}
                InputLabelProps={{ shrink: true }}
                sx={{
                  maxWidth: 360,
                  alignSelf: "center",
                  width: "100%",
                  "& .MuiOutlinedInput-root": { borderRadius: 2 },
                  "& .MuiOutlinedInput-input": {
                    fontSize: "1.5rem",
                    fontWeight: 800,
                    textAlign: "center",
                    py: 1.25,
                  },
                }}
              />
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                  gap: 1,
                  maxWidth: 360,
                  width: "100%",
                  alignSelf: "center",
                }}
              >
                {(["7", "8", "9", "4", "5", "6", "1", "2", "3"] as const).map((d) => (
                  <Button
                    key={d}
                    variant="outlined"
                    size="large"
                    onClick={() => editCartQtyNumpadDigit(d)}
                    sx={{
                      minHeight: 52,
                      fontSize: "1.35rem",
                      fontWeight: 800,
                      borderRadius: 2,
                      bgcolor: "background.paper",
                    }}
                  >
                    {d}
                  </Button>
                ))}
                <Button
                  variant="outlined"
                  color="warning"
                  size="large"
                  onClick={editCartQtyNumpadClear}
                  sx={{ minHeight: 52, fontWeight: 800, borderRadius: 2, bgcolor: "background.paper" }}
                >
                  Clear
                </Button>
                <Button
                  variant="outlined"
                  size="large"
                  onClick={() => editCartQtyNumpadDigit("0")}
                  sx={{
                    minHeight: 52,
                    fontSize: "1.35rem",
                    fontWeight: 800,
                    borderRadius: 2,
                    bgcolor: "background.paper",
                  }}
                >
                  0
                </Button>
                <Button
                  variant="outlined"
                  size="large"
                  aria-label="Backspace quantity"
                  onClick={editCartQtyNumpadBackspace}
                  sx={{ minHeight: 52, borderRadius: 2, bgcolor: "background.paper" }}
                >
                  <BackspaceOutlinedIcon />
                </Button>
              </Box>
            </Stack>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, pt: 0 }}>
          <Button onClick={closeEditCartQty}>Cancel</Button>
          <Button variant="contained" size="large" onClick={confirmEditCartQty}>
            Apply
          </Button>
        </DialogActions>
      </Dialog>

      <SupervisorPasswordDialog
        open={supervisorDialog != null}
        action={supervisorDialog?.action ?? "delete"}
        targetQty={supervisorDialog?.targetQty}
        productLabel={supervisorDialog ? cartLineLabel(supervisorDialog.line) : ""}
        onClose={() => {
          setSupervisorDialog(null);
          setSupervisorRequestErr(null);
        }}
        onVerified={() => handleSupervisorVerified()}
        onRequestApproval={() => void handleSupervisorRequestApproval()}
        requestBusy={supervisorRequestBusy}
        requestError={supervisorRequestErr}
        container={posDialogContainer}
      />

      <LineAuthorizationRequestDialog
        open={lineAuthDialogLine != null}
        productLabel={lineAuthDialogLine ? cartLineLabel(lineAuthDialogLine) : ""}
        currentQty={lineAuthDialogLine?.qty ?? 1}
        busy={lineAuthBusy}
        error={lineAuthErr}
        onClose={() => {
          if (lineAuthBusy) return;
          setLineAuthDialogLine(null);
          setLineAuthErr(null);
        }}
        onSubmit={(action, note) => void handleLineAuthSubmit(action, note)}
        container={posDialogContainer}
      />

      <Dialog
        container={posDialogContainer}
        open={waitRequest != null}
        disableEscapeKeyDown
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Waiting for approval</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            Your line authorization request was sent. An approver will respond from their dashboard
            notifications. This screen will update automatically.
          </Typography>
          {waitRequest && (
            <Typography variant="body2" sx={{ mt: 2 }}>
              <strong>
                {waitRequest.line_snapshot.generic_name}
                {waitRequest.line_snapshot.brand_name
                  ? ` (${waitRequest.line_snapshot.brand_name})`
                  : ""}
              </strong>
              {" — "}
              {waitRequest.action === "delete" ? "remove line" : "change quantity"}
            </Typography>
          )}
        </DialogContent>
      </Dialog>

    </Box>
  );
}
