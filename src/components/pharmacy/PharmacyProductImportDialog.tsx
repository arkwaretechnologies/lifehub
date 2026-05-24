"use client";

import { useCallback, useRef, useState } from "react";
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
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  Paper,
} from "@mui/material";
import UploadFileOutlinedIcon from "@mui/icons-material/UploadFileOutlined";
import type { PharmacyCategoryRow } from "@/lib/pharmacyPosDb";
import { insertProductForPos } from "@/lib/pharmacyPosDb";
import {
  PHARMACY_PRODUCT_IMPORT_COLUMNS,
  countImportableRows,
  parsePharmacyProductImportFile,
  type PharmacyProductImportRow,
} from "@/lib/pharmacyProductImport";

type Props = {
  open: boolean;
  onClose: () => void;
  categories: PharmacyCategoryRow[];
  onImported: () => void;
};

function formatPhp(n: number): string {
  return n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function PharmacyProductImportDialog({
  open,
  onClose,
  categories,
  onImported,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<PharmacyProductImportRow[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    success: number;
    failed: number;
    errors: string[];
  } | null>(null);

  const reset = useCallback(() => {
    setRows([]);
    setFileError(null);
    setFileName(null);
    setParsing(false);
    setImporting(false);
    setImportResult(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleFile = async (file: File) => {
    setFileError(null);
    setImportResult(null);
    setFileName(file.name);
    setParsing(true);
    try {
      const buffer = await file.arrayBuffer();
      const { rows: parsed, fileError: err } = parsePharmacyProductImportFile(buffer, categories);
      if (err) {
        setRows([]);
        setFileError(err);
        return;
      }
      setRows(parsed);
    } catch {
      setRows([]);
      setFileError("Failed to read the file.");
    } finally {
      setParsing(false);
    }
  };

  const runImport = async () => {
    const valid = rows.filter((r) => r.errors.length === 0 && r.categoryId != null);
    if (valid.length === 0) return;

    setImporting(true);
    setImportResult(null);
    let success = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const r of valid) {
      const retail = r.price;
      const cost = retail * 0.7;
      const result = await insertProductForPos({
        categoryId: r.categoryId!,
        genericName: r.genericName,
        brandName: r.brandName || null,
        unitOfMeasure: r.unitOfMeasure!,
        unitPrice: retail,
        unitCost: cost,
        isActive: true,
      });
      if (result.error) {
        failed += 1;
        errors.push(`Row ${r.rowNumber}: ${result.error}`);
      } else {
        success += 1;
      }
    }

    setImportResult({ success, failed, errors: errors.slice(0, 20) });
    setImporting(false);
    if (success > 0) onImported();
  };

  const importableCount = countImportableRows(rows);
  const invalidCount = rows.length - importableCount;

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
      <DialogTitle>Import products from Excel</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          <Typography variant="body2" color="text.secondary">
            Upload an Excel file (.xlsx or .xls) with a header row and these columns (order may vary):
          </Typography>
          <Box
            component="ul"
            sx={{
              m: 0,
              pl: 2.5,
              typography: "body2",
              color: "text.secondary",
              "& li": { mb: 0.25 },
            }}
          >
            {PHARMACY_PRODUCT_IMPORT_COLUMNS.map((col) => (
              <li key={col}>
                <strong>{col}</strong>
              </li>
            ))}
          </Box>
          <Typography variant="caption" color="text.secondary">
            Category names must match an existing category (Categories tab). Cost defaults to 70% of
            price. Brand name may be left blank.
          </Typography>

          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFile(f);
            }}
          />
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
            <Button
              variant="outlined"
              startIcon={parsing ? <CircularProgress size={18} /> : <UploadFileOutlinedIcon />}
              disabled={parsing || importing}
              onClick={() => fileInputRef.current?.click()}
            >
              Choose Excel file
            </Button>
            {fileName && (
              <Typography variant="body2" color="text.secondary">
                {fileName}
              </Typography>
            )}
          </Stack>

          {fileError && (
            <Alert severity="error" onClose={() => setFileError(null)}>
              {fileError}
            </Alert>
          )}

          {rows.length > 0 && !fileError && (
            <>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                <Chip size="small" label={`${rows.length} row(s) in file`} />
                <Chip size="small" color="success" label={`${importableCount} ready to import`} />
                {invalidCount > 0 && (
                  <Chip size="small" color="warning" label={`${invalidCount} with errors`} />
                )}
              </Stack>
              <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 360 }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell>Row</TableCell>
                      <TableCell>Category</TableCell>
                      <TableCell>Generic</TableCell>
                      <TableCell>Brand</TableCell>
                      <TableCell>Unit</TableCell>
                      <TableCell align="right">Price</TableCell>
                      <TableCell>Status</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {rows.map((r) => (
                      <TableRow key={r.rowNumber}>
                        <TableCell>{r.rowNumber}</TableCell>
                        <TableCell>{r.category || "—"}</TableCell>
                        <TableCell>{r.genericName || "—"}</TableCell>
                        <TableCell>{r.brandName || "—"}</TableCell>
                        <TableCell>{r.unitOfMeasure ?? (r.unit || "—")}</TableCell>
                        <TableCell align="right">{formatPhp(r.price)}</TableCell>
                        <TableCell>
                          {r.errors.length === 0 ? (
                            <Chip size="small" color="success" label="OK" />
                          ) : (
                            <Typography variant="caption" color="error.main" component="div">
                              {r.errors.join(" ")}
                            </Typography>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </>
          )}

          {importResult && (
            <Alert
              severity={importResult.failed > 0 && importResult.success === 0 ? "error" : "info"}
            >
              Imported {importResult.success} product(s).
              {importResult.failed > 0 && ` ${importResult.failed} failed.`}
              {importResult.errors.length > 0 && (
                <Box component="ul" sx={{ m: 0, mt: 1, pl: 2 }}>
                  {importResult.errors.map((e) => (
                    <li key={e}>
                      <Typography variant="caption">{e}</Typography>
                    </li>
                  ))}
                </Box>
              )}
            </Alert>
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={handleClose} disabled={importing}>
          {importResult?.success ? "Done" : "Cancel"}
        </Button>
        <Button
          variant="contained"
          disabled={importableCount === 0 || importing || parsing}
          onClick={() => void runImport()}
        >
          {importing ? (
            <>
              <CircularProgress size={20} sx={{ mr: 1 }} color="inherit" />
              Importing…
            </>
          ) : (
            `Import ${importableCount} product(s)`
          )}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
