"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Box, CircularProgress } from "@mui/material";
import { useAuth } from "@/components/AuthProvider";
import { firstAllowedHref } from "@/lib/navPermissionCatalog";
import { POS_REPORTS } from "@/lib/reportsNavLeaves";

export default function ReportsPage() {
  const router = useRouter();
  const { menuAccess, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    const keys = menuAccess.rbac ? menuAccess.pageKeys : null;
    if (!keys) {
      router.replace(POS_REPORTS[0].href);
      return;
    }
    const allowed = new Set(keys);
    const firstPos = POS_REPORTS.find((r) => allowed.has(r.pageKey) || allowed.has("reports"));
    const href = firstPos?.href ?? firstAllowedHref(keys) ?? "/dashboard";
    router.replace(href);
  }, [loading, menuAccess, router]);

  return (
    <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
      <CircularProgress />
    </Box>
  );
}
