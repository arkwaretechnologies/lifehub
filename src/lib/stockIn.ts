import { supabase } from "@/lib/supabaseClient";

export const STOCK_IN_HEADERS_TABLE = "stock_in_headers" as const;
export const STOCK_IN_LINES_TABLE = "stock_in_lines" as const;

const HEADER_SELECT =
  "id, stocked_at, receipt_no, reference_no, supplier_name, notes, created_by, created_at, updated_at" as const;

const LINE_SELECT =
  "id, stock_in_header_id, product_id, quantity, unit_cost, lot_no, expiry_date, line_no, notes, created_at" as const;

/** Row shape for `public.stock_in_headers`. */
export type StockInHeaderRow = {
  id: string;
  stocked_at: string;
  receipt_no: string | null;
  reference_no: string | null;
  supplier_name: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

/** Row shape for `public.stock_in_lines`. */
export type StockInLineRow = {
  id: string;
  stock_in_header_id: string;
  product_id: string;
  quantity: string;
  unit_cost: string | null;
  lot_no: string | null;
  expiry_date: string | null;
  line_no: number | null;
  notes: string | null;
  created_at: string;
};

export type StockInHeaderInsert = {
  stocked_at?: string | null;
  receipt_no?: string | null;
  reference_no?: string | null;
  supplier_name?: string | null;
  notes?: string | null;
  created_by?: string | null;
};

export type StockInLineInsert = {
  product_id: string;
  quantity: number;
  unit_cost?: number | null;
  lot_no?: string | null;
  expiry_date?: string | null;
  line_no?: number | null;
  notes?: string | null;
};

export type StockInHeaderWithLines = StockInHeaderRow & {
  stock_in_lines: StockInLineRow[];
};

export async function fetchStockInHeaderById(
  id: string,
): Promise<{ row: StockInHeaderWithLines | null; error: string | null }> {
  const { data, error } = await supabase
    .from(STOCK_IN_HEADERS_TABLE)
    .select(`${HEADER_SELECT}, ${STOCK_IN_LINES_TABLE} (${LINE_SELECT})`)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return { row: null, error: error.message };
  }
  return { row: (data as StockInHeaderWithLines) ?? null, error: null };
}

export async function listStockInHeaders(limit = 50): Promise<{
  rows: StockInHeaderRow[];
  error: string | null;
}> {
  const capped = Math.min(Math.max(limit, 1), 500);
  const { data, error } = await supabase
    .from(STOCK_IN_HEADERS_TABLE)
    .select(HEADER_SELECT)
    .order("stocked_at", { ascending: false })
    .limit(capped);

  if (error) {
    return { rows: [], error: error.message };
  }
  return { rows: (data ?? []) as StockInHeaderRow[], error: null };
}

/**
 * Inserts header then line items (same transaction pattern as other LifeHub callers: two awaits).
 */
export async function insertStockInReceipt(header: StockInHeaderInsert, lines: StockInLineInsert[]): Promise<{
  headerRow: StockInHeaderRow | null;
  lines: StockInLineRow[];
  error: string | null;
}> {
  if (lines.length === 0) {
    return {
      headerRow: null,
      lines: [],
      error: "At least one stock-in line is required.",
    };
  }

  const { data: hdr, error: hErr } = await supabase
    .from(STOCK_IN_HEADERS_TABLE)
    .insert({
      ...(header.stocked_at != null && header.stocked_at !== ""
        ? { stocked_at: header.stocked_at }
        : {}),
      receipt_no: header.receipt_no ?? null,
      reference_no: header.reference_no ?? null,
      supplier_name: header.supplier_name ?? null,
      notes: header.notes ?? null,
      created_by: header.created_by ?? null,
    })
    .select(HEADER_SELECT)
    .single();

  if (hErr || !hdr) {
    return { headerRow: null, lines: [], error: hErr?.message ?? "Insert header failed." };
  }

  const headerRow = hdr as StockInHeaderRow;
  const linePayload = lines.map((row) => ({
    stock_in_header_id: headerRow.id,
    product_id: row.product_id,
    quantity: row.quantity,
    unit_cost: row.unit_cost ?? null,
    lot_no: row.lot_no ?? null,
    expiry_date: row.expiry_date ?? null,
    line_no: row.line_no ?? null,
    notes: row.notes ?? null,
  }));

  const { data: insLines, error: lErr } = await supabase
    .from(STOCK_IN_LINES_TABLE)
    .insert(linePayload)
    .select(LINE_SELECT);

  if (lErr) {
    return { headerRow, lines: [], error: lErr.message };
  }

  return {
    headerRow,
    lines: (insLines ?? []) as StockInLineRow[],
    error: null,
  };
}
