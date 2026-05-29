"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { Fragment, useState, useEffect, useMemo, useCallback } from "react";
import {
  Drawer,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Box,
  Collapse,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import ExpandLess from "@mui/icons-material/ExpandLess";
import ExpandMore from "@mui/icons-material/ExpandMore";
import DashboardOutlinedIcon from "@mui/icons-material/DashboardOutlined";
import PersonOutlinedIcon from "@mui/icons-material/PersonOutlined";
import ScienceOutlinedIcon from "@mui/icons-material/ScienceOutlined";
import CameraAltOutlinedIcon from "@mui/icons-material/CameraAltOutlined";
import CategoryOutlinedIcon from "@mui/icons-material/CategoryOutlined";
import AssignmentOutlinedIcon from "@mui/icons-material/AssignmentOutlined";
import Inventory2OutlinedIcon from "@mui/icons-material/Inventory2Outlined";
import PointOfSaleOutlinedIcon from "@mui/icons-material/PointOfSaleOutlined";
import MeetingRoomOutlinedIcon from "@mui/icons-material/MeetingRoomOutlined";
import LocalPharmacyOutlinedIcon from "@mui/icons-material/LocalPharmacyOutlined";
import LocalHospitalOutlinedIcon from "@mui/icons-material/LocalHospitalOutlined";
import CalendarMonthOutlinedIcon from "@mui/icons-material/CalendarMonthOutlined";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import AssessmentOutlinedIcon from "@mui/icons-material/AssessmentOutlined";
import TrendingUpOutlinedIcon from "@mui/icons-material/TrendingUpOutlined";
import ReceiptLongOutlinedIcon from "@mui/icons-material/ReceiptLongOutlined";
import PaymentsOutlinedIcon from "@mui/icons-material/PaymentsOutlined";
import BlockOutlinedIcon from "@mui/icons-material/BlockOutlined";
import HistoryOutlinedIcon from "@mui/icons-material/HistoryOutlined";
import WarningAmberOutlinedIcon from "@mui/icons-material/WarningAmberOutlined";
import InventoryOutlinedIcon from "@mui/icons-material/InventoryOutlined";
import BusinessOutlinedIcon from "@mui/icons-material/BusinessOutlined";
import { CONSULTATION_LAB_REPORTS, POS_REPORTS } from "@/lib/reportsNavLeaves";
import AdminPanelSettingsOutlinedIcon from "@mui/icons-material/AdminPanelSettingsOutlined";
import PeopleOutlinedIcon from "@mui/icons-material/PeopleOutlined";
import RuleOutlinedIcon from "@mui/icons-material/RuleOutlined";
import Image from "next/image";
import { LIFEHUB_LOGO_SRC } from "@/lib/lifehubLogo";
import { useAuth } from "@/components/AuthProvider";
import type { MenuAccessState } from "@/lib/menuAccess";
import { canAccessPharmacyHub } from "@/lib/navPermissionCatalog";

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
  /** Matches `role_pages.page_key` for RBAC filtering. */
  pageKey: string;
}

/** Leaf row under a nav group (no `kind`; same shape as `MenuLinkItem` minus kind). */
export type MenuGroupChildLeaf = Omit<MenuLinkItem, "kind">;

/** Second-level collapsible under Settings (e.g. Laboratory). */
export interface MenuNestedGroupItem {
  kind: "subgroup";
  id: string;
  label: string;
  icon: React.ReactElement;
  children: MenuGroupChildLeaf[];
}

function isMenuNestedGroup(c: MenuGroupChildLeaf | MenuNestedGroupItem): c is MenuNestedGroupItem {
  return "kind" in c && (c as MenuNestedGroupItem).kind === "subgroup";
}

/** Collapsible group of links (e.g. Patient care); Settings adds optional nested groups. */
export interface MenuGroupItem {
  kind: "group";
  id: string;
  label: string;
  icon: React.ReactElement;
  children: (MenuGroupChildLeaf | MenuNestedGroupItem)[];
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
        pageKey: "dashboard",
      },
      {
        kind: "group",
        id: "patient-care",
        label: "Patient care",
        icon: <PersonOutlinedIcon />,
        children: [
          {
            label: "patients",
            icon: <PersonOutlinedIcon />,
            href: "/patient",
            pageKey: "patient",
          },
          {
            label: "appointments",
            icon: <CalendarMonthOutlinedIcon />,
            href: "/appointments",
            pageKey: "appointments",
          },
        ],
      },
    ],
  },
  {
    heading: "OPERATIONS",
    items: [
      {
        kind: "link",
        label: "reception",
        icon: <MeetingRoomOutlinedIcon />,
        href: "/reception",
        pageKey: "reception",
      },
      {
        kind: "link",
        label: "consultation",
        icon: <LocalHospitalOutlinedIcon />,
        href: "/consultation",
        pageKey: "consultation",
      },
      {
        kind: "group",
        id: "laboratory",
        label: "Laboratory",
        icon: <ScienceOutlinedIcon />,
        children: [
          {
            label: "Lab Appointments",
            icon: <CalendarMonthOutlinedIcon />,
            href: "/laboratory",
            pageKey: "laboratory",
          },
          {
            label: "Lab Results",
            icon: <AssessmentOutlinedIcon />,
            href: "/laboratory/results",
            pageKey: "laboratory/results",
          },
        ],
      },
      {
        kind: "group",
        id: "imaging",
        label: "Imaging",
        icon: <CameraAltOutlinedIcon />,
        children: [
          {
            label: "Imaging Appointments",
            icon: <CalendarMonthOutlinedIcon />,
            href: "/imaging",
            pageKey: "imaging",
          },
          {
            label: "Imaging Results",
            icon: <AssessmentOutlinedIcon />,
            href: "/imaging/results",
            pageKey: "imaging/results",
          },
        ],
      },
      {
        kind: "link",
        label: "pharmacy",
        icon: <LocalPharmacyOutlinedIcon />,
        href: "/pharmacy",
        pageKey: "pharmacy",
      },
      {
        kind: "link",
        label: "cashier",
        icon: <PointOfSaleOutlinedIcon />,
        href: "/cashier",
        pageKey: "cashier",
      },
    ],
  },
  {
    heading: "MANAGEMENT",
    items: [
      {
        kind: "group",
        id: "reports",
        label: "Reports",
        icon: <AssessmentOutlinedIcon />,
        children: [
          {
            kind: "subgroup",
            id: "reports-consultation-lab",
            label: "Consultation and Lab Reports",
            icon: <LocalHospitalOutlinedIcon />,
            children: CONSULTATION_LAB_REPORTS.map((leaf) => ({
              label: leaf.label,
              icon: <AssessmentOutlinedIcon />,
              href: leaf.href,
              pageKey: leaf.pageKey,
            })),
          },
          {
            kind: "subgroup",
            id: "reports-pos",
            label: "POS Reports",
            icon: <PointOfSaleOutlinedIcon />,
            children: [
              {
                label: POS_REPORTS[0].label,
                icon: <TrendingUpOutlinedIcon />,
                href: POS_REPORTS[0].href,
                pageKey: POS_REPORTS[0].pageKey,
              },
              {
                label: POS_REPORTS[1].label,
                icon: <Inventory2OutlinedIcon />,
                href: POS_REPORTS[1].href,
                pageKey: POS_REPORTS[1].pageKey,
              },
              {
                label: POS_REPORTS[2].label,
                icon: <AssignmentOutlinedIcon />,
                href: POS_REPORTS[2].href,
                pageKey: POS_REPORTS[2].pageKey,
              },
              {
                label: POS_REPORTS[3].label,
                icon: <PaymentsOutlinedIcon />,
                href: POS_REPORTS[3].href,
                pageKey: POS_REPORTS[3].pageKey,
              },
              {
                label: POS_REPORTS[4].label,
                icon: <BlockOutlinedIcon />,
                href: POS_REPORTS[4].href,
                pageKey: POS_REPORTS[4].pageKey,
              },
              {
                label: POS_REPORTS[5].label,
                icon: <HistoryOutlinedIcon />,
                href: POS_REPORTS[5].href,
                pageKey: POS_REPORTS[5].pageKey,
              },
              {
                label: POS_REPORTS[6].label,
                icon: <WarningAmberOutlinedIcon />,
                href: POS_REPORTS[6].href,
                pageKey: POS_REPORTS[6].pageKey,
              },
              {
                label: POS_REPORTS[7].label,
                icon: <InventoryOutlinedIcon />,
                href: POS_REPORTS[7].href,
                pageKey: POS_REPORTS[7].pageKey,
              },
            ],
          },
        ],
      },
      {
        kind: "link",
        label: "branches",
        icon: <BusinessOutlinedIcon />,
        href: "/branches",
        pageKey: "branches",
      },
      {
        kind: "group",
        id: "user-management",
        label: "User management",
        icon: <AdminPanelSettingsOutlinedIcon />,
        children: [
          {
            label: "users",
            icon: <PeopleOutlinedIcon />,
            href: "/user-management/users",
            pageKey: "user-management/users",
          },
          {
            label: "roles",
            icon: <RuleOutlinedIcon />,
            href: "/user-management/roles",
            pageKey: "user-management/roles",
          },
        ],
      },
      {
        kind: "group",
        id: "settings",
        label: "Settings",
        icon: <SettingsOutlinedIcon />,
        children: [
          {
            kind: "subgroup",
            id: "settings-laboratory",
            label: "Laboratory",
            icon: <ScienceOutlinedIcon />,
            children: [
              {
                label: "Lab Categories",
                icon: <CategoryOutlinedIcon />,
                href: "/settings/laboratory/categories",
                pageKey: "settings/laboratory/categories",
              },
              {
                label: "Lab Tests",
                icon: <AssignmentOutlinedIcon />,
                href: "/settings/laboratory/lab-tests",
                pageKey: "settings/laboratory/lab-tests",
              },
              {
                label: "Result templates",
                icon: <AssignmentOutlinedIcon />,
                href: "/settings/laboratory/result-templates",
                pageKey: "settings/laboratory/result-templates",
              },
              {
                label: "Lab signatories",
                icon: <AssignmentOutlinedIcon />,
                href: "/settings/laboratory/signatories",
                pageKey: "settings/laboratory/signatories",
              },
              {
                label: "Imaging",
                icon: <CameraAltOutlinedIcon />,
                href: "/settings/laboratory/imaging",
                pageKey: "settings/laboratory/imaging",
              },
              {
                label: "Lab Packages",
                icon: <Inventory2OutlinedIcon />,
                href: "/settings/laboratory/packages",
                pageKey: "settings/laboratory/packages",
              },
            ],
          },
        ],
      },
    ],
  },
];

function filterMenuSectionsByRbac(
  sections: MenuSection[],
  menuAccess: MenuAccessState,
): MenuSection[] {
  if (!menuAccess.rbac) return sections;
  const allowed = new Set(menuAccess.pageKeys);
  const out: MenuSection[] = [];
  for (const section of sections) {
    const items: NavItem[] = [];
    for (const item of section.items) {
      if (item.kind === "link") {
        if (item.href === "/pharmacy") {
          if (canAccessPharmacyHub(allowed)) items.push(item);
        } else if (allowed.has(item.pageKey)) {
          items.push(item);
        }
      } else {
        const g = item;
        if (g.id === "settings" || g.id === "reports") {
          const umbrellaKey = g.id === "settings" ? "settings" : "reports";
          if (allowed.has(umbrellaKey)) {
            items.push({ ...g, children: [...g.children] });
          } else {
            const nextChildren: (MenuGroupChildLeaf | MenuNestedGroupItem)[] = [];
            for (const c of g.children) {
              if (isMenuNestedGroup(c)) {
                const leaves = c.children.filter((leaf) => allowed.has(leaf.pageKey));
                if (leaves.length > 0) nextChildren.push({ ...c, children: leaves });
              } else if (allowed.has(c.pageKey)) {
                nextChildren.push(c);
              }
            }
            if (nextChildren.length > 0) items.push({ ...g, children: nextChildren });
          }
        } else {
          const kids = g.children.filter((c): c is MenuGroupChildLeaf => !isMenuNestedGroup(c)).filter((c) => allowed.has(c.pageKey));
          if (kids.length > 0) items.push({ ...g, children: kids });
        }
      }
    }
    if (items.length > 0) {
      out.push({ ...section, items });
    }
  }
  return out;
}

function groupContainsPath(group: MenuGroupItem, path: string): boolean {
  for (const c of group.children) {
    if (isMenuNestedGroup(c)) {
      if (c.children.some((leaf) => navLeafMatchesHref(leaf.href, path))) return true;
    } else if (navLeafMatchesHref(c.href, path)) return true;
  }
  return false;
}

function sectionContainsPath(section: MenuSection, path: string): boolean {
  for (const item of section.items) {
    if (item.kind === "link" && navLeafMatchesHref(item.href, path)) return true;
    if (item.kind === "group" && groupContainsPath(item, path)) return true;
  }
  return false;
}

/** Exact match, or sub-routes under a leaf (e.g. /pharmacy/pos when nav href is /pharmacy). */
function navLeafMatchesHref(href: string, pathname: string): boolean {
  if (pathname === href) return true;
  if (href === "/pharmacy" && pathname.startsWith("/pharmacy/")) return true;
  return false;
}

function findGroupIdForPath(sections: MenuSection[], path: string): string | null {
  for (const section of sections) {
    for (const item of section.items) {
      if (item.kind === "group" && groupContainsPath(item, path)) {
        return item.id;
      }
    }
  }
  return null;
}

function findNestedGroupIdsForPath(sections: MenuSection[], path: string): string[] {
  const out: string[] = [];
  for (const section of sections) {
    for (const item of section.items) {
      if (item.kind !== "group") continue;
      for (const c of item.children) {
        if (isMenuNestedGroup(c) && c.children.some((leaf) => leaf.href === path)) {
          out.push(c.id);
        }
      }
    }
  }
  return out;
}

const defaultOpenSections = Object.fromEntries(
  menuSections.map((s) => [s.heading, true]),
) as Record<string, boolean>;

const emptyNavMessage =
  "No menu access is assigned to your role. Ask an administrator to set permissions under User management → Roles.";

const defaultOpenGroups: Record<string, boolean> = {
  "patient-care": true,
  "user-management": true,
  reports: false,
  "reports-consultation-lab": false,
  "reports-pos": false,
  settings: false,
  "settings-laboratory": false,
};

interface SidebarProps {
  mobileOpen: boolean;
  onMobileClose: () => void;
}

function SidebarContent() {
  const pathname = usePathname();
  const { menuAccess } = useAuth();
  const visibleSections = useMemo(
    () => filterMenuSectionsByRbac(menuSections, menuAccess),
    [menuAccess],
  );

  const [openSections, setOpenSections] = useState<Record<string, boolean>>(defaultOpenSections);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(defaultOpenGroups);

  const activeSectionHeading = useMemo(() => {
    const section = visibleSections.find((s) => sectionContainsPath(s, pathname));
    return section?.heading ?? null;
  }, [pathname, visibleSections]);

  const activeGroupId = useMemo(
    () => findGroupIdForPath(visibleSections, pathname),
    [pathname, visibleSections],
  );

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

  useEffect(() => {
    const ids = findNestedGroupIdsForPath(visibleSections, pathname);
    if (ids.length === 0) return;
    setOpenGroups((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const id of ids) {
        if (!next[id]) {
          next[id] = true;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [pathname, visibleSections]);

  const toggleSection = useCallback((heading: string) => {
    setOpenSections((prev) => ({ ...prev, [heading]: !prev[heading] }));
  }, []);

  const toggleGroup = useCallback((id: string) => {
    setOpenGroups((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const motion = "background-color 0.2 cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.2s cubic-bezier(0.4, 0, 0.2, 1), color 0.2s cubic-bezier(0.4, 0, 0.2, 1)";

  /** Top-level row: full pill, active = soft grey track + accent blue (screenshot dashboard). */
  const renderTopLevelLink = (item: MenuLinkItem) => {
    const active = navLeafMatchesHref(item.href, pathname);
    return (
      <ListItemButton
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
    child: MenuGroupChildLeaf,
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
    const childActive = group.children.some((c) => {
      if (isMenuNestedGroup(c)) return c.children.some((leaf) => leaf.href === pathname);
      return c.href === pathname;
    });

    return (
      <Box sx={{ mb: 0.75 }}>
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
            {group.children.map((child, index) => {
              if (isMenuNestedGroup(child)) {
                const nOpen = openGroups[child.id] ?? true;
                const nPanelId = `sidebar-nested-${child.id}`;
                const nestedActive = child.children.some((leaf) => leaf.href === pathname);
                const isLast = index === group.children.length - 1;
                return (
                  <Box
                    key={child.id}
                    sx={{
                      position: "relative",
                      zIndex: 0,
                      mb: 0.35,
                      "&::before": {
                        content: '""',
                        position: "absolute",
                        left: "-14px",
                        top: "22px",
                        width: "12px",
                        height: "1px",
                        bgcolor: TREE_LINE,
                        zIndex: 0,
                        pointerEvents: "none",
                      },
                      ...(!isLast
                        ? {
                            "&::after": {
                              content: '""',
                              position: "absolute",
                              left: "-14px",
                              top: "22px",
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
                      onClick={() => toggleGroup(child.id)}
                      aria-expanded={nOpen}
                      aria-controls={nPanelId}
                      sx={{
                        minHeight: 40,
                        pl: "10px",
                        pr: 1,
                        py: 0.75,
                        mb: 0.35,
                        borderRadius: 999,
                        color: nestedActive || nOpen ? "info.main" : "text.secondary",
                        transition: motion,
                        "& .MuiListItemIcon-root": { color: "inherit", minWidth: 0, mr: 1.25 },
                        "&:hover": { bgcolor: "action.hover" },
                      }}
                    >
                      <ListItemIcon sx={{ fontSize: 20 }}>{child.icon}</ListItemIcon>
                      <ListItemText
                        primary={child.label}
                        primaryTypographyProps={{
                          fontSize: "0.8125rem",
                          fontWeight: 600,
                          textTransform: "capitalize",
                        }}
                      />
                      {nOpen ? (
                        <ExpandLess sx={{ fontSize: 18, color: "info.main", opacity: 0.75 }} />
                      ) : (
                        <ExpandMore sx={{ fontSize: 18, color: "text.secondary", opacity: 0.75 }} />
                      )}
                    </ListItemButton>
                    <Collapse in={nOpen} timeout="auto" unmountOnExit id={nPanelId}>
                      <Box
                        sx={{
                          ml: "10px",
                          pl: "14px",
                          mt: 0.15,
                          mb: 0.35,
                          borderLeft: `1px solid ${TREE_LINE}`,
                          position: "relative",
                        }}
                      >
                        {child.children.map((leaf, i) =>
                          renderNestedTreeLink(leaf, i, child.children.length),
                        )}
                      </Box>
                    </Collapse>
                  </Box>
                );
              }
              return renderNestedTreeLink(child, index, group.children.length);
            })}
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
          src={LIFEHUB_LOGO_SRC}
          alt="LifeHub logo"
          width={160}
          height={160}
          style={{ width: 160, height: 160, objectFit: "contain" }}
          priority
        />
      </Box>

      <Box sx={{ flex: 1, overflowY: "auto", px: 2 }} component="nav" aria-label="Main navigation">
        {visibleSections.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ px: 0.5, py: 2, lineHeight: 1.5 }}>
            {emptyNavMessage}
          </Typography>
        ) : null}
        {visibleSections.map((section) => {
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
                    entry.kind === "link" ? (
                      <Fragment key={entry.href}>{renderTopLevelLink(entry)}</Fragment>
                    ) : (
                      <Fragment key={entry.id}>{renderGroup(entry)}</Fragment>
                    ),
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
