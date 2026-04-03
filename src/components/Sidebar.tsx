"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  Drawer,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  ListSubheader,
  Box,
  Typography,
  Avatar,
  alpha,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import DashboardOutlinedIcon from "@mui/icons-material/DashboardOutlined";
import PersonOutlinedIcon from "@mui/icons-material/PersonOutlined";
import ScienceOutlinedIcon from "@mui/icons-material/ScienceOutlined";
import PointOfSaleOutlinedIcon from "@mui/icons-material/PointOfSaleOutlined";
import MeetingRoomOutlinedIcon from "@mui/icons-material/MeetingRoomOutlined";
import LocalPharmacyOutlinedIcon from "@mui/icons-material/LocalPharmacyOutlined";
import CalendarMonthOutlinedIcon from "@mui/icons-material/CalendarMonthOutlined";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import AssessmentOutlinedIcon from "@mui/icons-material/AssessmentOutlined";
import BusinessOutlinedIcon from "@mui/icons-material/BusinessOutlined";
import { useAuth } from "@/components/AuthProvider";

export const DRAWER_WIDTH = 280;

const NAV_BG = "#1C252E";
const NAV_TEXT = "#FFFFFF";
const NAV_TEXT_SECONDARY = "#919EAB";
const NAV_ACTIVE_BG = "rgba(0, 167, 111, 0.16)";
const NAV_ACTIVE_COLOR = "#5BE49B";
const NAV_HOVER_BG = "rgba(145, 158, 171, 0.08)";

interface MenuItem {
  label: string;
  icon: React.ReactElement;
  href: string;
}

interface MenuSection {
  heading: string;
  items: MenuItem[];
}

const menuSections: MenuSection[] = [
  {
    heading: "OVERVIEW",
    items: [
      { label: "dashboard", icon: <DashboardOutlinedIcon />, href: "/dashboard" },
      { label: "patients", icon: <PersonOutlinedIcon />, href: "/patient" },
      { label: "appointments", icon: <CalendarMonthOutlinedIcon />, href: "/appointments" },
    ],
  },
  {
    heading: "OPERATIONS",
    items: [
      { label: "reception", icon: <MeetingRoomOutlinedIcon />, href: "/reception" },
      { label: "laboratory", icon: <ScienceOutlinedIcon />, href: "/laboratory" },
      { label: "pharmacy", icon: <LocalPharmacyOutlinedIcon />, href: "/pharmacy" },
      { label: "cashier", icon: <PointOfSaleOutlinedIcon />, href: "/cashier" },
    ],
  },
  {
    heading: "MANAGEMENT",
    items: [
      { label: "reports", icon: <AssessmentOutlinedIcon />, href: "/reports" },
      { label: "branches", icon: <BusinessOutlinedIcon />, href: "/branches" },
      { label: "settings", icon: <SettingsOutlinedIcon />, href: "/settings" },
    ],
  },
];

interface SidebarProps {
  mobileOpen: boolean;
  onMobileClose: () => void;
}

function SidebarContent() {
  const pathname = usePathname();
  const { user, profile } = useAuth();

  const initials = profile?.fullname
    ? profile.fullname
        .split(" ")
        .map((n: string) => n[0])
        .join("")
        .substring(0, 2)
        .toUpperCase()
    : "U";

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        bgcolor: NAV_BG,
        color: NAV_TEXT,
      }}
    >
      {/* Logo */}
      <Box sx={{ px: 2.5, py: 3, display: "flex", alignItems: "center", gap: 1 }}>
        <Box
          sx={{
            width: 40,
            height: 40,
            borderRadius: "12px",
            background: "linear-gradient(135deg, #5BE49B 0%, #00A76F 100%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 800,
            fontSize: 18,
            color: "#fff",
          }}
        >
          CF
        </Box>
        <Typography variant="h6" fontWeight={800} letterSpacing={-0.5}>
          ClinicFlow
        </Typography>
      </Box>

      {/* User card */}
      <Box
        sx={{
          mx: 2.5,
          mb: 2,
          p: 2,
          borderRadius: 2,
          bgcolor: alpha("#919EAB", 0.08),
          display: "flex",
          alignItems: "center",
          gap: 1.5,
        }}
      >
        <Avatar
          sx={{
            width: 36,
            height: 36,
            bgcolor: "#00A76F",
            fontSize: 14,
            fontWeight: 700,
          }}
        >
          {initials}
        </Avatar>
        <Box sx={{ minWidth: 0 }}>
          <Typography
            variant="subtitle2"
            noWrap
            sx={{ color: NAV_TEXT, lineHeight: 1.2 }}
          >
            {profile?.fullname || user?.username || "User"}
          </Typography>
          <Typography variant="caption" sx={{ color: NAV_TEXT_SECONDARY }}>
            {profile?.role || "Staff"}
          </Typography>
        </Box>
      </Box>

      {/* Menu sections */}
      <Box sx={{ flex: 1, overflowY: "auto", px: 2 }}>
        {menuSections.map((section) => (
          <List
            key={section.heading}
            disablePadding
            subheader={
              <ListSubheader
                disableSticky
                sx={{
                  bgcolor: "transparent",
                  color: NAV_TEXT_SECONDARY,
                  fontSize: "0.6875rem",
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  lineHeight: 1.5,
                  px: 1,
                  pt: 2.5,
                  pb: 1,
                }}
              >
                {section.heading}
              </ListSubheader>
            }
          >
            {section.items.map((item) => {
              const active = pathname === item.href;
              return (
                <ListItemButton
                  key={item.label}
                  component={Link}
                  href={item.href}
                  sx={{
                    minHeight: 44,
                    borderRadius: 1,
                    mb: 0.5,
                    px: 1.5,
                    color: NAV_TEXT_SECONDARY,
                    "& .MuiListItemIcon-root": {
                      color: NAV_TEXT_SECONDARY,
                      minWidth: 0,
                      mr: 1.5,
                    },
                    "&:hover": {
                      bgcolor: NAV_HOVER_BG,
                    },
                    ...(active && {
                      bgcolor: NAV_ACTIVE_BG,
                      color: NAV_ACTIVE_COLOR,
                      "& .MuiListItemIcon-root": {
                        color: NAV_ACTIVE_COLOR,
                        minWidth: 0,
                        mr: 1.5,
                      },
                      "&:hover": {
                        bgcolor: NAV_ACTIVE_BG,
                      },
                    }),
                  }}
                >
                  <ListItemIcon sx={{ fontSize: 22 }}>
                    {item.icon}
                  </ListItemIcon>
                  <ListItemText
                    primary={item.label}
                    primaryTypographyProps={{
                      fontSize: "0.8125rem",
                      fontWeight: active ? 600 : 400,
                      textTransform: "capitalize",
                    }}
                  />
                </ListItemButton>
              );
            })}
          </List>
        ))}
      </Box>
    </Box>
  );
}

export default function Sidebar({ mobileOpen, onMobileClose }: SidebarProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));

  if (isMobile) {
    return (
      <Drawer
        variant="temporary"
        open={mobileOpen}
        onClose={onMobileClose}
        ModalProps={{ keepMounted: true }}
        sx={{
          "& .MuiDrawer-paper": {
            width: DRAWER_WIDTH,
            border: "none",
          },
        }}
      >
        <SidebarContent />
      </Drawer>
    );
  }

  return (
    <Drawer
      variant="permanent"
      sx={{
        width: DRAWER_WIDTH,
        flexShrink: 0,
        "& .MuiDrawer-paper": {
          width: DRAWER_WIDTH,
          border: "none",
        },
      }}
    >
      <SidebarContent />
    </Drawer>
  );
}
