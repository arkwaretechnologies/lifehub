import * as XLSX from "xlsx";
import type { PharmacyCategoryRow } from "@/lib/pharmacyPosDb";

/** Known units — same list as product management form. */
const PHARMACY_UNITS = [
  "tablet",
  "capsule",
  "softgel",
  "ampule",
  "vial",
  "bottle",
  "sachet",
  "tube",
  "patch",
  "drop",
  "spray",
  "inhaler",
  "suppository",
  "syringe",
  "mL",
  "L",
  "g",
  "mg",
  "mcg",
  "IU",
  "unit",
  "piece",
  "kit",
  "box",
  "pack",
] as const;

export type PharmacyProductImportRow = {
  /** 1-based spreadsheet row (includes header). */
  rowNumber: number;
  category: string;
  genericName: string;
  brandName: string;
  unit: string;
  price: number;
  errors: string[];
  categoryId?: number;
  unitOfMeasure?: string;
};

export const PHARMACY_PRODUCT_IMPORT_COLUMNS = [
  "Category",
  "Generic Name",
  "Brand Name",
  "Unit",
  "Price",
] as const;

function normalizeHeader(cell: unknown): string {
  return String(cell ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function cellText(cell: unknown): string {
  if (cell == null) return "";
  if (typeof cell === "number" && Number.isFinite(cell)) return String(cell);
  return String(cell).trim();
}

function parsePrice(cell: unknown): number | null {
  if (cell == null || cell === "") return null;
  if (typeof cell === "number" && Number.isFinite(cell)) return cell;
  const s = String(cell).trim().replace(/,/g, "");
  if (!s) return null;
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

function resolveUnit(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "tablet";
  const lower = trimmed.toLowerCase();
  const match = PHARMACY_UNITS.find((u) => u.toLowerCase() === lower);
  return match ?? trimmed;
}

function findCategoryId(
  name: string,
  categories: PharmacyCategoryRow[],
): number | undefined {
  const key = name.trim().toLowerCase();
  if (!key) return undefined;
  const hit = categories.find((c) => c.name.trim().toLowerCase() === key);
  return hit?.id;
}

type ColumnMap = {
  category: number;
  genericName: number;
  brandName: number;
  unit: number;
  price: number;
};

function mapColumns(headerRow: unknown[]): ColumnMap | string {
  const indices: Partial<Record<keyof ColumnMap, number>> = {};
  for (let i = 0; i < headerRow.length; i++) {
    const h = normalizeHeader(headerRow[i]);
    if (h === "category") indices.category = i;
    else if (h === "generic name" || h === "generic") indices.genericName = i;
    else if (h === "brand name" || h === "brand") indices.brandName = i;
    else if (h === "unit" || h === "uom" || h === "unit of measure") indices.unit = i;
    else if (h === "price" || h === "retail" || h === "retail price") indices.price = i;
  }
  const missing: string[] = [];
  if (indices.category == null) missing.push("Category");
  if (indices.genericName == null) missing.push("Generic Name");
  if (indices.brandName == null) missing.push("Brand Name");
  if (indices.unit == null) missing.push("Unit");
  if (indices.price == null) missing.push("Price");
  if (missing.length > 0) {
    return `Missing column(s): ${missing.join(", ")}. Expected: ${PHARMACY_PRODUCT_IMPORT_COLUMNS.join(", ")}.`;
  }
  return indices as ColumnMap;
}

function isRowEmpty(cells: unknown[]): boolean {
  return cells.every((c) => cellText(c) === "");
}

/**
 * Parse the first worksheet of an Excel workbook into validated import rows.
 */
export function parsePharmacyProductImportFile(
  buffer: ArrayBuffer,
  categories: PharmacyCategoryRow[],
): { rows: PharmacyProductImportRow[]; fileError: string | null } {
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: "array" });
  } catch {
    return { rows: [], fileError: "Could not read the Excel file." };
  }
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return { rows: [], fileError: "The workbook has no sheets." };
  }
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    return { rows: [], fileError: "Could not read the first worksheet." };
  }
  const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
    raw: true,
  }) as unknown[][];
  if (grid.length < 2) {
    return { rows: [], fileError: "The file has no data rows (header row only or empty)." };
  }

  const headerRow = grid[0] ?? [];
  const colMap = mapColumns(headerRow);
  if (typeof colMap === "string") {
    return { rows: [], fileError: colMap };
  }

  const rows: PharmacyProductImportRow[] = [];
  for (let i = 1; i < grid.length; i++) {
    const cells = grid[i] ?? [];
    if (isRowEmpty(cells)) continue;

    const rowNumber = i + 1;
    const category = cellText(cells[colMap.category]);
    const genericName = cellText(cells[colMap.genericName]);
    const brandName = cellText(cells[colMap.brandName]);
    const unitRaw = cellText(cells[colMap.unit]);
    const priceCell = cells[colMap.price];
    const price = parsePrice(priceCell);

    const errors: string[] = [];

    if (!category) errors.push("Category is required.");
    if (!genericName) errors.push("Generic name is required.");
    if (price == null) errors.push("Valid price is required.");
    else if (price < 0) errors.push("Price must be zero or greater.");

    let categoryId: number | undefined;
    if (category) {
      categoryId = findCategoryId(category, categories);
      if (categoryId == null) {
        errors.push(`Category “${category}” was not found. Add it on the Categories tab first.`);
      }
    }

    const unitOfMeasure = resolveUnit(unitRaw);

    rows.push({
      rowNumber,
      category,
      genericName,
      brandName,
      unit: unitRaw,
      price: price ?? 0,
      errors,
      categoryId,
      unitOfMeasure,
    });
  }

  if (rows.length === 0) {
    return { rows: [], fileError: "No product rows found below the header." };
  }

  return { rows, fileError: null };
}

export function countImportableRows(rows: PharmacyProductImportRow[]): number {
  return rows.filter((r) => r.errors.length === 0 && r.categoryId != null).length;
}
