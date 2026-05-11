"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Box, CircularProgress } from "@mui/material";
import { useAuth } from "@/components/AuthProvider";
import { firstAllowedHref, pageKeyForPath } from "@/lib/navPermissionCatalog";

/** Auth gate for fullscreen POS (no sidebar); mirrors dashboard shell RBAC. */
export default function PosProtectedShell({ children }: { children: React.ReactNode }) {
  const { user, loading, menuAccess } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [loading, user, router]);

  useEffect(() => {
    if (loading || !user) return;
    if (!menuAccess.rbac || menuAccess.pageKeys.length === 0) return;
    const key = pageKeyForPath(pathname);
    if (key == null) return;
    if (!menuAccess.pageKeys.includes(key)) {
      const href = firstAllowedHref(menuAccess.pageKeys) ?? "/login";
      router.replace(href);
    }
  }, [loading, user, menuAccess, pathname, router]);

  if (loading) {
    return (
      <Box
        sx={{
          height: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  if (!user) return null;

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "background.default" }}>
      {children}
    </Box>
  );
}
