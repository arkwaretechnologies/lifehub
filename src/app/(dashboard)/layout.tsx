"use client";

import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Box, CircularProgress } from "@mui/material";
import { useAuth } from "@/components/AuthProvider";
import Sidebar, { DRAWER_WIDTH } from "@/components/Sidebar";
import TopBar from "@/components/TopBar";
import { firstAllowedHref, userMayAccessPath } from "@/lib/navPermissionCatalog";

function ProtectedShell({ children }: { children: React.ReactNode }) {
  const { user, loading, menuAccess } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [loading, user, router]);

  useEffect(() => {
    if (loading || !user) return;
    if (!menuAccess.rbac || menuAccess.pageKeys.length === 0) return;
    if (userMayAccessPath(pathname, menuAccess.pageKeys)) return;
    const href = firstAllowedHref(menuAccess.pageKeys) ?? "/login";
    router.replace(href);
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
    <Box sx={{ display: "flex", minHeight: "100vh", bgcolor: "background.default" }}>
      <Sidebar
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />
      <TopBar onMenuToggle={() => setMobileOpen((o) => !o)} />
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          width: { md: `calc(100% - ${DRAWER_WIDTH}px)` },
          pt: { xs: 9, md: 10 },
          px: { xs: 2, md: 3 },
          pb: 3,
        }}
      >
        {children}
      </Box>
    </Box>
  );
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ProtectedShell>{children}</ProtectedShell>;
}
