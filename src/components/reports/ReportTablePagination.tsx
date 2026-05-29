"use client";

import { TablePagination } from "@mui/material";
import type { ReportPaginationMeta } from "@/lib/posReports";
import { REPORT_PAGE_SIZE_OPTIONS } from "@/lib/posReports";

type ReportTablePaginationProps = {
  pagination: ReportPaginationMeta | null | undefined;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
};

export default function ReportTablePagination({
  pagination,
  onPageChange,
  onPageSizeChange,
}: ReportTablePaginationProps) {
  if (!pagination) return null;

  return (
    <TablePagination
      component="div"
      count={pagination.totalCount}
      page={pagination.page}
      rowsPerPage={pagination.pageSize}
      rowsPerPageOptions={[...REPORT_PAGE_SIZE_OPTIONS]}
      onPageChange={(_, newPage) => onPageChange(newPage)}
      onRowsPerPageChange={(e) => {
        onPageSizeChange(Number.parseInt(e.target.value, 10));
        onPageChange(0);
      }}
      sx={{
        "& .MuiTablePagination-toolbar": { textTransform: "none" },
        "& .MuiTablePagination-select": { textTransform: "none" },
        "& .MuiTablePagination-selectLabel, & .MuiTablePagination-displayedRows": {
          textTransform: "none",
        },
      }}
    />
  );
}
