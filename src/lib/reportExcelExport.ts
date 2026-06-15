import * as XLSX from "xlsx";

export type ExcelColumnDef<T extends Record<string, unknown>> = {
  key: keyof T & string;
  header: string;
};

export type ExportRowsToExcelOptions<T extends Record<string, unknown>> = {
  filename: string;
  sheetName?: string;
  columns: ExcelColumnDef<T>[];
  rows: T[];
};

export function exportRowsToExcel<T extends Record<string, unknown>>({
  filename,
  sheetName = "Report",
  columns,
  rows,
}: ExportRowsToExcelOptions<T>): void {
  const sheetRows = rows.map((row) => {
    const out: Record<string, unknown> = {};
    for (const col of columns) {
      out[col.header] = row[col.key] ?? "";
    }
    return out;
  });

  const ws = XLSX.utils.json_to_sheet(sheetRows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
  XLSX.writeFile(wb, filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`);
}
