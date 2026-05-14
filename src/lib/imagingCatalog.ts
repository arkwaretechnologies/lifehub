import { supabase } from "@/lib/supabaseClient";

export const IMAGING_CATALOG_TABLE = "imaging_catalog" as const;

export const IMAGING_NOTES_START = "[IMAGING_REQUEST]";
export const IMAGING_NOTES_END = "[/IMAGING_REQUEST]";

export type ImagingCatalogRow = {
  id: string;
  code: string;
  name: string;
  default_price: number;
  requires_view_field: boolean;
  view_field_label: string | null;
  sort_order: number | null;
  is_active: boolean | null;
};

export type ImagingLineSelection = { checked: boolean; view: string };

/** Ordered active rows for consultation / charges. */
export async function fetchActiveImagingCatalog(): Promise<{
  rows: ImagingCatalogRow[];
  error: string | null;
}> {
  const { data, error } = await supabase
    .from(IMAGING_CATALOG_TABLE)
    .select("id, code, name, default_price, requires_view_field, view_field_label, sort_order, is_active")
    .eq("is_active", true)
    .order("sort_order", { ascending: true, nullsFirst: false })
    .order("name", { ascending: true });

  if (error) return { rows: [], error: error.message };

  const rows: ImagingCatalogRow[] = (data ?? []).map((raw: Record<string, unknown>) => ({
    id: String(raw.id ?? ""),
    code: String(raw.code ?? "").trim(),
    name: String(raw.name ?? "").trim(),
    default_price: numPrice(raw.default_price),
    requires_view_field: raw.requires_view_field === true,
    view_field_label:
      raw.view_field_label == null || String(raw.view_field_label).trim() === ""
        ? null
        : String(raw.view_field_label).trim(),
    sort_order:
      raw.sort_order == null || raw.sort_order === "" ? null : Number(raw.sort_order),
    is_active: raw.is_active !== false,
  }));

  return { rows, error: null };
}

function numPrice(v: unknown): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : Number(String(v));
  return Number.isFinite(n) ? n : 0;
}

export function emptyImagingSelection(catalog: ImagingCatalogRow[]): Record<string, ImagingLineSelection> {
  const out: Record<string, ImagingLineSelection> = {};
  for (const c of catalog) {
    if (!c.code) continue;
    out[c.code] = { checked: false, view: "" };
  }
  return out;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Parse saved plan_notes imaging block into per-code selection.
 * Matches catalog rows by study name (longest first) for legacy `- Study` / `- Study (View: x)` lines.
 */
export function parseImagingBlockToSelection(
  notes: string,
  catalog: ImagingCatalogRow[],
): Record<string, ImagingLineSelection> {
  const next = emptyImagingSelection(catalog);
  const start = notes.indexOf(IMAGING_NOTES_START);
  const end = notes.indexOf(IMAGING_NOTES_END);
  if (start === -1 || end === -1 || end < start) return next;

  const inner = notes.slice(start + IMAGING_NOTES_START.length, end);
  const sorted = [...catalog].sort((a, b) => b.name.length - a.name.length);

  for (const raw of inner.split("\n")) {
    const line = raw.trim();
    if (!line || line === "IMAGING REQUEST:") continue;
    if (!line.startsWith("-")) continue;
    const body = line.replace(/^-+\s*/, "").trim();
    if (!body) continue;

    for (const c of sorted) {
      if (!c.code) continue;
      const name = c.name.trim();
      if (!name) continue;
      const reView = new RegExp(
        `^${escapeRe(name)}\\s*\\(View:\\s*(.+)\\)\\s*$`,
        "i",
      );
      const vm = body.match(reView);
      if (vm) {
        next[c.code] = { checked: true, view: (vm[1] ?? "").trim() };
        break;
      }
      if (body.toLowerCase() === name.toLowerCase()) {
        next[c.code] = { checked: true, view: "" };
        break;
      }
    }
  }

  return next;
}

export function buildImagingRequestLinesFromCatalog(
  catalog: ImagingCatalogRow[],
  sel: Record<string, ImagingLineSelection>,
): string[] {
  const ordered = [...catalog].sort((a, b) => {
    const sa = a.sort_order;
    const sb = b.sort_order;
    if (sa != null && sb != null && sa !== sb) return sa - sb;
    if (sa != null && sb == null) return -1;
    if (sa == null && sb != null) return 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });

  const lines: string[] = [];
  for (const c of ordered) {
    const row = sel[c.code];
    if (!row?.checked) continue;
    if (c.requires_view_field) {
      const v = row.view?.trim() ?? "";
      lines.push(v ? `- ${c.name} (View: ${v})` : `- ${c.name}`);
    } else {
      lines.push(`- ${c.name}`);
    }
  }
  return lines;
}

export function upsertImagingBlock(existingNotes: string, imagingLines: string[]): string {
  const block =
    imagingLines.length === 0
      ? ""
      : [IMAGING_NOTES_START, "IMAGING REQUEST:", ...imagingLines, IMAGING_NOTES_END].join("\n");

  const notes = existingNotes ?? "";
  const start = notes.indexOf(IMAGING_NOTES_START);
  const end = notes.indexOf(IMAGING_NOTES_END);

  if (start === -1 || end === -1 || end < start) {
    if (!block) return notes;
    const sep = notes.trim().length ? "\n\n" : "";
    return `${notes.trimEnd()}${sep}${block}\n`;
  }

  const before = notes.slice(0, start).trimEnd();
  const after = notes.slice(end + IMAGING_NOTES_END.length).trimStart();
  if (!block) {
    const merged = [before, after].filter(Boolean).join("\n\n");
    return merged ? `${merged}\n` : "";
  }
  const merged = [before, block, after].filter(Boolean).join("\n\n");
  return `${merged}\n`;
}

export function imagingSelectionEqual(
  a: Record<string, ImagingLineSelection>,
  b: Record<string, ImagingLineSelection>,
): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    const ra = a[k] ?? { checked: false, view: "" };
    const rb = b[k] ?? { checked: false, view: "" };
    if (ra.checked !== rb.checked || ra.view.trim() !== rb.view.trim()) return false;
  }
  return true;
}

/** Resolve display label (with optional View suffix) to catalog default_price. */
export function priceForImagingLineLabel(label: string, catalog: ImagingCatalogRow[]): number {
  const body = label.replace(/^-+\s*/, "").trim();
  const base = body.replace(/\s*\(View:.*\)\s*$/i, "").trim();
  const sorted = [...catalog].filter((c) => c.is_active !== false).sort((a, b) => b.name.length - a.name.length);
  for (const c of sorted) {
    if (base.toLowerCase() === c.name.trim().toLowerCase()) return numPrice(c.default_price);
  }
  return 0;
}
