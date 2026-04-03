"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { useState, useEffect, useMemo } from "react";
import {
  Drawer,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Box,
  Collapse,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import ExpandLess from "@mui/icons-material/ExpandLess";
import ExpandMore from "@mui/icons-material/ExpandMore";
import DashboardOutlinedIcon from "@mui/icons-material/DashboardOutlined";
import PersonOutlinedIcon from "@mui/icons-material/PersonOutlined";
import ScienceOutlinedIcon from "@mui/icons-material/ScienceOutlined";
import PointOfSaleOutlinedIcon from "@mui/icons-material/PointOfSaleOutlined";
import MeetingRoomOutlinedIcon from "@mui/icons-material/MeetingRoomOutlined";
import LocalPharmacyOutlinedIcon from "@mui/icons-material/LocalPharmacyOutlined";
import LocalHospitalOutlinedIcon from "@mui/icons-material/LocalHospitalOutlined";
import CalendarMonthOutlinedIcon from "@mui/icons-material/CalendarMonthOutlined";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import AssessmentOutlinedIcon from "@mui/icons-material/AssessmentOutlined";
import BusinessOutlinedIcon from "@mui/icons-material/BusinessOutlined";
import AdminPanelSettingsOutlinedIcon from "@mui/icons-material/AdminPanelSettingsOutlined";
import Image from "next/image";

export const DRAWER_WIDTH = 280;

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
      { label: "consultation", icon: <LocalHospitalOutlinedIcon />, href: "/consultation" },
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
      { label: "user management", icon: <AdminPanelSettingsOutlinedIcon />, href: "/user-management" },
      { label: "settings", icon: <SettingsOutlinedIcon />, href: "/settings" },
    ],
  },
];

const defaultOpenSections = Object.fromEntries(
  menuSections.map((s) => [s.heading, true]),
) as Record<string, boolean>;

interface SidebarProps {
  mobileOpen: boolean;
  onMobileClose: () => void;
}

function SidebarContent() {
  const pathname = usePathname();
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(defaultOpenSections);

  const activeSectionHeading = useMemo(() => {
    const section = menuSections.find((s) => s.items.some((i) => i.href === pathname));
    return section?.heading ?? null;
  }, [pathname]);

  useEffect(() => {
    if (activeSectionHeading) {
      setOpenSections((prev) =>
        prev[activeSectionHeading] ? prev : { ...prev, [activeSectionHeading]: true },
      );
    }
  }, [activeSectionHeading]);

  const toggleSection = (heading: string) => {
    setOpenSections((prev) => ({ ...prev, [heading]: !prev[heading] }));
  };

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        bgcolor: "background.paper",
        color: "text.primary",
      }}
    >
      {/* Logo */}
      <Box sx={{ px: 2.5, pt: 2, pb: 1.25, display: "flex", justifyContent: "center" }}>
        <Image
          src="/lifehub logo/lifehub_logo_transparent.png"
          alt="LifeHub logo"
          width={160}
          height={160}
          style={{ width: 160, height: 160, objectFit: "contain" }}
          priority
        />
      </Box>

      {/* Menu sections */}
      <Box sx={{ flex: 1, overflowY: "auto", px: 2 }} component="nav" aria-label="Main navigation">
        {menuSections.map((section) => {
          const isOpen = openSections[section.heading] ?? true;
          const panelId = `sidebar-section-${section.heading.replace(/\s+/g, "-").toLowerCase()}`;
          return (
            <List key={section.heading} disablePadding sx={{ pb: 0.5 }}>
              <ListItemButton
                onClick={() => toggleSection(section.heading)}
                aria-expanded={isOpen}
                aria-controls={panelId}
                sx={{
                  borderRadius: 1,
                  py: 1,
                  px: 1,
                  minHeight: 40,
                  color: "text.secondary",
                  transition: "background-color 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
                  "&:hover": { bgcolor: "action.hover" },
                }}
              >
                <ListItemText
                  primary={section.heading}
                  slotProps={{
                    primary: {
                      fontSize: "0.6875rem",
                      fontWeight: 700,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      lineHeight: 1.5,
                    },
                  }}
                />
                {isOpen ? (
                  <ExpandLess sx={{ fontSize: 20, color: "text.secondary", opacity: 0.8 }} />
                ) : (
                  <ExpandMore sx={{ fontSize: 20, color: "text.secondary", opacity: 0.8 }} />
                )}
              </ListItemButton>
              <Collapse in={isOpen} timeout="auto" unmountOnExit id={panelId}>
                <List component="div" disablePadding>
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
                          color: "text.secondary",
                          "& .MuiListItemIcon-root": {
                            color: "text.secondary",
                            minWidth: 0,
                            mr: 1.5,
                          },
                          "&:hover": {
                            bgcolor: "action.hover",
                            color: "text.primary",
                            "& .MuiListItemIcon-root": {
                              color: "text.primary",
                            },
                          },
                          ...(active && {
                            bgcolor: "rgba(47, 191, 113, 0.12)",
                            color: "text.primary",
                            transform: "translateX(4px)",
                            boxShadow: "inset 3px 0 0 0 #2FBF71",
                            "& .MuiListItemIcon-root": {
                              color: "secondary.main",
                              minWidth: 0,
                              mr: 1.5,
                            },
                            "&:hover": {
                              bgcolor: "rgba(47, 191, 113, 0.16)",
                              transform: "translateX(4px)",
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
              </Collapse>
            </List>
          );
        })}
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
            bgcolor: "background.paper",
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
          borderRight: "1px solid",
          borderColor: "divider",
          bgcolor: "background.paper",
        },
      }}
    >
      <SidebarContent />
    </Drawer>
  );
}
