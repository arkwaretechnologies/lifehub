"use client";

import { useState } from "react";
import { Box, Button, Stack, Typography } from "@mui/material";
import PointOfSaleOutlinedIcon from "@mui/icons-material/PointOfSaleOutlined";
import Inventory2OutlinedIcon from "@mui/icons-material/Inventory2Outlined";
import TuneOutlinedIcon from "@mui/icons-material/TuneOutlined";
import LocalShippingOutlinedIcon from "@mui/icons-material/LocalShippingOutlined";
import { useAuth } from "@/components/AuthProvider";
import PharmacyDashboardCharts from "@/components/pharmacy/PharmacyDashboardCharts";
import PharmacyStocksModal from "@/components/pharmacy/PharmacyStocksModal";
import PharmacyProductManagementModal from "@/components/pharmacy/PharmacyProductManagementModal";
import PharmacySuppliersModal from "@/components/pharmacy/PharmacySuppliersModal";
import { hasPharmacyCapability } from "@/lib/navPermissionCatalog";

const SQUARE_ACTION_SX = {
  display: "flex",
  width: 120,
  height: 120,
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 1,
  borderRadius: 2,
  fontWeight: 800,
  whiteSpace: "normal",
  lineHeight: 1.15,
  fontSize: "0.8rem",
} as const;

export default function PharmacyPage() {
  const { menuAccess } = useAuth();
  const [stocksOpen, setStocksOpen] = useState(false);
  const [productMgmtOpen, setProductMgmtOpen] = useState(false);
  const [suppliersOpen, setSuppliersOpen] = useState(false);

  const keys = menuAccess.pageKeys;
  const rbac = menuAccess.rbac;
  const canPos = !rbac || hasPharmacyCapability(keys, "pharmacy/pos");
  const canStocks = !rbac || hasPharmacyCapability(keys, "pharmacy/stocks");
  const canProducts = !rbac || hasPharmacyCapability(keys, "pharmacy/products");
  const canSuppliers = !rbac || hasPharmacyCapability(keys, "pharmacy/suppliers");

  return (
    <Box sx={{ pb: 3 }}>
      <Typography variant="h5" sx={{ mb: 3 }} fontWeight={800}>
        Pharmacy
      </Typography>

      <Stack direction="row" spacing={2} sx={{ mb: 4, flexWrap: "wrap", alignItems: "stretch" }}>
        {canPos ? (
          <Button
            variant="contained"
            color="primary"
            sx={SQUARE_ACTION_SX}
            onClick={() => window.open("/pharmacy/pos", "_blank", "noopener,noreferrer")}
          >
            <PointOfSaleOutlinedIcon sx={{ fontSize: 40 }} />
            POS
          </Button>
        ) : null}
        {canStocks ? (
          <Button variant="contained" color="success" sx={SQUARE_ACTION_SX} onClick={() => setStocksOpen(true)}>
            <Inventory2OutlinedIcon sx={{ fontSize: 40 }} />
            Stocks
          </Button>
        ) : null}
        {canProducts ? (
          <Button
            variant="contained"
            color="secondary"
            sx={{ ...SQUARE_ACTION_SX, width: 128, height: 128, fontSize: "0.72rem" }}
            onClick={() => setProductMgmtOpen(true)}
          >
            <TuneOutlinedIcon sx={{ fontSize: 36 }} />
            Product
            <br />
            Management
          </Button>
        ) : null}
        {canSuppliers ? (
          <Button variant="contained" color="info" sx={SQUARE_ACTION_SX} onClick={() => setSuppliersOpen(true)}>
            <LocalShippingOutlinedIcon sx={{ fontSize: 40 }} />
            Suppliers
          </Button>
        ) : null}
      </Stack>

      <PharmacyStocksModal open={stocksOpen} onClose={() => setStocksOpen(false)} />
      <PharmacyProductManagementModal open={productMgmtOpen} onClose={() => setProductMgmtOpen(false)} />
      <PharmacySuppliersModal open={suppliersOpen} onClose={() => setSuppliersOpen(false)} />

      <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1.5 }}>
        Performance overview
      </Typography>
      <PharmacyDashboardCharts />
    </Box>
  );
}
