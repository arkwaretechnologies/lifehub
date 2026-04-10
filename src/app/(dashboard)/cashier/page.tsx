"use client";

import { Suspense } from "react";
import { Box, CircularProgress } from "@mui/material";
import CashierHome from "@/components/cashier/CashierHome";

export default function CashierPage() {
  return (
    <Suspense
      fallback={
        <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
          <CircularProgress />
        </Box>
      }
    >
      <CashierHome />
    </Suspense>
  );
}
