"use client";

import { usePathname, useRouter } from "next/navigation";
import {
  AppBar,
  Toolbar,
  Typography,
  IconButton,
  Box,
  Avatar,
  InputBase,
  Badge,
  Tooltip,
  alpha,
} from "@mui/material";
import MenuIcon from "@mui/icons-material/Menu";
import SearchIcon from "@mui/icons-material/Search";
import NotificationsNoneIcon from "@mui/icons-material/NotificationsNone";
import LogoutIcon from "@mui/icons-material/Logout";
import { useAuth } from "@/components/AuthProvider";
import { DRAWER_WIDTH } from "@/components/Sidebar";

interface TopBarProps {
  onMenuToggle: () => void;
}

export default function TopBar({ onMenuToggle }: TopBarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, profile, signOut } = useAuth();

  const pageTitle = pathname.split("/").pop() || "dashboard";

  const handleLogout = () => {
    signOut();
    router.push("/login");
  };

  const initials = profile?.fullname
    ? profile.fullname
        .split(" ")
        .map((n: string) => n[0])
        .join("")
        .substring(0, 2)
        .toUpperCase()
    : "U";

  return (
    <AppBar
      position="fixed"
      elevation={0}
      sx={{
        width: { md: `calc(100% - ${DRAWER_WIDTH}px)` },
        ml: { md: `${DRAWER_WIDTH}px` },
        bgcolor: (theme) => alpha(theme.palette.background.default, 0.8),
        backdropFilter: "blur(6px)",
        borderBottom: "1px dashed",
        borderColor: "divider",
      }}
    >
      <Toolbar sx={{ px: { xs: 2, md: 3 } }}>
        <IconButton
          edge="start"
          onClick={onMenuToggle}
          sx={{ mr: 1, display: { md: "none" }, color: "text.primary" }}
        >
          <MenuIcon />
        </IconButton>

        {/* Search bar */}
        <Box
          sx={{
            display: { xs: "none", sm: "flex" },
            alignItems: "center",
            bgcolor: (theme) => alpha(theme.palette.grey[500], 0.08),
            borderRadius: 1,
            px: 1.5,
            py: 0.5,
            mr: 2,
            minWidth: 200,
          }}
        >
          <SearchIcon sx={{ color: "text.secondary", fontSize: 20, mr: 1 }} />
          <InputBase
            placeholder="Search..."
            sx={{ fontSize: "0.875rem", color: "text.primary", flex: 1 }}
          />
        </Box>

        <Box sx={{ flexGrow: 1 }} />

        {/* Right section */}
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          <Tooltip title="Notifications">
            <IconButton sx={{ color: "text.secondary" }}>
              <Badge
                badgeContent={3}
                color="error"
                sx={{
                  "& .MuiBadge-badge": {
                    fontSize: 10,
                    height: 18,
                    minWidth: 18,
                  },
                }}
              >
                <NotificationsNoneIcon />
              </Badge>
            </IconButton>
          </Tooltip>

          <Tooltip title="Logout">
            <IconButton onClick={handleLogout} sx={{ color: "text.secondary" }}>
              <LogoutIcon fontSize="small" />
            </IconButton>
          </Tooltip>

          <Avatar
            sx={{
              ml: 1,
              width: 36,
              height: 36,
              bgcolor: "primary.main",
              fontSize: 14,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            {initials}
          </Avatar>
        </Box>
      </Toolbar>
    </AppBar>
  );
}
