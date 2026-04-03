"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { useState, useEffect, useMemo, useCallback } from "react";
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

/** Tree + nested pills (mock-style); all sizes in `px` strings so MUI `sx` does not treat numbers as spacing. */
const TREE_LINE = "#E2E8F0";
const PILL_TRACK = "#F1F5F9";

/** Single nav link (icon + route). */
export interface MenuLinkItem {
  kind: "link";
  label: string;
  icon: React.ReactElement;
  href: string;
}

/** Collapsible group of links (e.g. Patient care). */
export interface MenuGroupItem {
  kind: "group";
  id: string;
  label: string;
  icon: React.ReactElement;
  children: Omit<MenuLinkItem, "kind">[];
}

export type NavItem = MenuLinkItem | MenuGroupItem;

export interface MenuSection {
  heading: string;
  items: NavItem[];
}

const menuSections: MenuSection[] = [
  {
    heading: "OVERVIEW",
    items: [
      {
        kind: "link",
        label: "dashboard",
        icon: <DashboardOutlinedIcon />,
        href: "/dashboard",
      },
      {
        kind: "group",
        id: "patient-care",
        label: "Patient care",
        icon: <PersonOutlinedIcon />,
        children: [
          { label: "patients", icon: <PersonOutlinedIcon />, href: "/patient" },
          { label: "appointments", icon: <CalendarMonthOutlinedIcon />, href: "/appointments" },
        ],
      },
    ],
  },
  {
    heading: "OPERATIONS",
    items: [
      { kind: "link", label: "reception", icon: <MeetingRoomOutlinedIcon />, href: "/reception" },
      { kind: "link", label: "consultation", icon: <LocalHospitalOutlinedIcon />, href: "/consultation" },
      { kind: "link", label: "laboratory", icon: <ScienceOutlinedIcon />, href: "/laboratory" },
      { kind: "link", label: "pharmacy", icon: <LocalPharmacyOutlinedIcon />, href: "/pharmacy" },
      { kind: "link", label: "cashier", icon: <PointOfSaleOutlinedIcon />, href: "/cashier" },
    ],
  },
  {
    heading: "MANAGEMENT",
    items: [
      { kind: "link", label: "reports", icon: <AssessmentOutlinedIcon />, href: "/reports" },
      { kind: "link", label: "branches", icon: <BusinessOutlinedIcon />, href: "/branches" },
      {
        kind: "link",
        label: "user management",
        icon: <AdminPanelSettingsOutlinedIcon />,
        href: "/user-management",
      },
      { kind: "link", label: "settings", icon: <SettingsOutlinedIcon />, href: "/settings" },
    ],
  },
];

function sectionContainsPath(section: MenuSection, path: string): boolean {
  for (const item of section.items) {
    if (item.kind === "link" && item.href === path) return true;
    if (item.kind === "group" && item.children.some((c) => c.href === path)) return true;
  }
  return false;
}

function findGroupIdForPath(path: string): string | null {
  for (const section of menuSections) {
    for (const item of section.items) {
      if (item.kind === "group" && item.children.some((c) => c.href === path)) {
        return item.id;
      }
    }
  }
  return null;
}

const defaultOpenSections = Object.fromEntries(
  menuSections.map((s) => [s.heading, true]),
) as Record<string, boolean>;

const defaultOpenGroups: Record<string, boolean> = { "patient-care": true };

interface SidebarProps {
  mobileOpen: boolean;
  onMobileClose: () => void;
}

function SidebarContent() {
  const pathname = usePathname();
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(defaultOpenSections);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(defaultOpenGroups);

  const activeSectionHeading = useMemo(() => {
    const section = menuSections.find((s) => sectionContainsPath(s, pathname));
    return section?.heading ?? null;
  }, [pathname]);

  const activeGroupId = useMemo(() => findGroupIdForPath(pathname), [pathname]);

  useEffect(() => {
    if (activeSectionHeading) {
      setOpenSections((prev) =>
        prev[activeSectionHeading] ? prev : { ...prev, [activeSectionHeading]: true },
      );
    }
  }, [activeSectionHeading]);

  useEffect(() => {
    if (activeGroupId) {
      setOpenGroups((prev) => (prev[activeGroupId] ? prev : { ...prev, [activeGroupId]: true }));
    }
  }, [activeGroupId]);

  const toggleSection = useCallback((heading: string) => {
    setOpenSections((prev) => ({ ...prev, [heading]: !prev[heading] }));
  }, []);

  const toggleGroup = useCallback((id: string) => {
    setOpenGroups((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const motion = "background-color 0.2 cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.2s cubic-bezier(0.4, 0, 0.2, 1), color 0.2s cubic-bezier(0.4, 0, 0.2, 1)";

  /** Top-level row: full pill, active = soft grey track + accent blue (screenshot dashboard). */
  const renderTopLevelLink = (item: MenuLinkItem) => {
    const active = pathname === item.href;
    return (
      <ListItemButton
        key={item.href}
        component={Link}
        href={item.href}
        sx={{
          minHeight: 44,
          mb: 0.75,
          px: 1.5,
          py: 1,
          borderRadius: 999,
          color: active ? "info.main" : "text.secondary",
          bgcolor: active ? PILL_TRACK : "transparent",
          boxShadow: active ? "0 1px 3px rgba(15, 23, 42, 0.08)" : "none",
          transition: motion,
          "& .MuiListItemIcon-root": {
            color: active ? "info.main" : "text.secondary",
            minWidth: 0,
            mr: 1.5,
          },
          "&:hover": {
            bgcolor: active ? "#E8EEF4" : "action.hover",
            color: active ? "info.main" : "text.primary",
            boxShadow: active ? "0 2px 6px rgba(15, 23, 42, 0.1)" : "none",
            "& .MuiListItemIcon-root": {
              color: active ? "info.main" : "text.primary",
            },
          },
        }}
      >
        <ListItemIcon sx={{ fontSize: 22 }}>{item.icon}</ListItemIcon>
        <ListItemText
          primary={item.label}
          primaryTypographyProps={{
            fontSize: "0.8125rem",
            fontWeight: active ? 700 : 500,
            textTransform: "capitalize",
          }}
        />
      </ListItemButton>
    );
  };

  /** Nested row under Patient care: tree connectors + pill active (screenshot). */
  const renderNestedTreeLink = (
    child: Omit<MenuLinkItem, "kind">,
    index: number,
    total: number,
  ) => {
    const active = pathname === child.href;
    const isLast = index === total - 1;
    return (
      <Box
        key={child.href}
        sx={{
          position: "relative",
          zIndex: 0,
          "&::before": {
            content: '""',
            position: "absolute",
            left: "-14px",
            top: "50%",
            width: "12px",
            height: "1px",
            bgcolor: TREE_LINE,
            transform: "translateY(-50%)",
            zIndex: 0,
            pointerEvents: "none",
          },
          ...(!isLast
            ? {
                "&::after": {
                  content: '""',
                  position: "absolute",
                  left: "-14px",
                  top: "50%",
                  bottom: "-4px",
                  width: "1px",
                  bgcolor: TREE_LINE,
                  zIndex: 0,
                  pointerEvents: "none",
                },
              }
            : {}),
        }}
      >
        <ListItemButton
          component={Link}
          href={child.href}
          sx={{
            position: "relative",
            zIndex: 1,
            minHeight: 40,
            pl: "10px",
            pr: 1,
            py: 0.75,
            mb: 0.35,
            borderRadius: 999,
            color: active ? "info.main" : "text.secondary",
            transition: motion,
            "& .MuiListItemIcon-root": {
              color: active ? "info.main" : "text.secondary",
              minWidth: 0,
              mr: 1.25,
            },
            "&:hover": {
              bgcolor: "action.hover",
              color: "text.primary",
              "& .MuiListItemIcon-root": { color: "text.primary" },
            },
            ...(active && {
              bgcolor: "#F8FAFC",
              fontWeight: 700,
              boxShadow:
                "0 1px 4px rgba(15, 23, 42, 0.08), 0 0 0 1px rgba(226, 232, 240, 0.95)",
              "&:hover": {
                bgcolor: "#F1F5F9",
                boxShadow: "0 2px 8px rgba(15, 23, 42, 0.1)",
              },
            }),
          }}
        >
          <ListItemIcon sx={{ fontSize: 20 }}>{child.icon}</ListItemIcon>
          <ListItemText
            primary={child.label}
            primaryTypographyProps={{
              fontSize: "0.8125rem",
              fontWeight: active ? 700 : 500,
              textTransform: "capitalize",
            }}
          />
        </ListItemButton>
      </Box>
    );
  };

  const renderGroup = (group: MenuGroupItem) => {
    const isOpen = openGroups[group.id] ?? true;
    const panelId = `sidebar-group-${group.id}`;
    const childActive = group.children.some((c) => c.href === pathname);

    return (
      <Box key={group.id} sx={{ mb: 0.75 }}>
        <ListItemButton
          onClick={() => toggleGroup(group.id)}
          aria-expanded={isOpen}
          aria-controls={panelId}
          sx={{
            minHeight: 44,
            borderRadius: 999,
            mb: 0.75,
            px: 1.5,
            py: 1,
            bgcolor: PILL_TRACK,
            color: childActive || isOpen ? "info.main" : "text.secondary",
            transition: motion,
            "& .MuiListItemIcon-root": { color: "inherit", minWidth: 0, mr: 1.5 },
            "&:hover": { bgcolor: "#E8EEF4" },
          }}
        >
          <ListItemIcon sx={{ fontSize: 22 }}>{group.icon}</ListItemIcon>
          <ListItemText
            primary={group.label}
            primaryTypographyProps={{
              fontSize: "0.8125rem",
              fontWeight: 600,
              textTransform: "capitalize",
            }}
          />
          {isOpen ? (
            <ExpandLess sx={{ fontSize: 20, color: "info.main", opacity: 0.75 }} />
          ) : (
            <ExpandMore sx={{ fontSize: 20, color: "text.secondary", opacity: 0.75 }} />
          )}
        </ListItemButton>
        <Collapse in={isOpen} timeout="auto" unmountOnExit id={panelId}>
          <Box
            sx={{
              ml: "10px",
              pl: "14px",
              mt: 0.25,
              mb: 0.5,
              borderLeft: `1px solid ${TREE_LINE}`,
              position: "relative",
            }}
          >
            {group.children.map((child, index) =>
              renderNestedTreeLink(child, index, group.children.length),
            )}
          </Box>
        </Collapse>
      </Box>
    );
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
                  {section.items.map((entry) =>
                    entry.kind === "link" ? renderTopLevelLink(entry) : renderGroup(entry),
                  )}
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
