"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Badge,
  Box,
  Button,
  CircularProgress,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Popover,
  Stack,
  Typography,
} from "@mui/material";
import NotificationsNoneIcon from "@mui/icons-material/NotificationsNone";
import { useAuth } from "@/components/AuthProvider";
import { authenticatedFetch } from "@/lib/authenticatedFetch";
import {
  NOTIFICATION_TYPE_LAB_QUEUE_NEW,
  userCanReceiveLabQueueNotifications,
} from "@/lib/labQueueNotificationServer";
import {
  canApproveImagingEditRequests,
  canApprovePharmacyLineRequests,
} from "@/lib/navPermissionCatalog";
import {
  playNotificationChime,
  primeNotificationSound,
  resumeNotificationAudio,
} from "@/lib/notificationSound";
import {
  approveCartLineRequestApi,
  rejectCartLineRequestApi,
  subscribeNotificationsForUser,
} from "@/lib/pharmacyCartLineRequests";
import {
  approveImagingEditRequestApi,
  rejectImagingEditRequestApi,
} from "@/lib/imagingEditRequests";
import { NOTIFICATION_TYPE_IMAGING_EDIT } from "@/lib/imagingEditRequestServer";
import { NOTIFICATION_TYPE_PHARMACY_CART_LINE, type NotificationRow } from "@/lib/pharmacyLineRequestServer";

const POLL_MS = 5000;

export default function NotificationBell() {
  const router = useRouter();
  const { profile, menuAccess } = useAuth();
  const userId =
    profile != null && typeof profile.user_id === "number" ? profile.user_id : null;

  const canPharmacy =
    menuAccess.rbac && canApprovePharmacyLineRequests(menuAccess.pageKeys);
  const canImaging =
    menuAccess.rbac && canApproveImagingEditRequests(menuAccess.pageKeys);
  const canLab = userCanReceiveLabQueueNotifications(profile?.role);
  const canView = canPharmacy || canImaging || canLab;

  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);
  /** null = first fetch (no chime); then tracks unread ids we've already announced. */
  const seenUnreadIdsRef = useRef<Set<string> | null>(null);

  const markNotificationsSeen = useCallback(async () => {
    if (!canView || userId == null) return;
    await authenticatedFetch("/api/notifications/read-all", { method: "PATCH" });
  }, [canView, userId]);

  const load = useCallback(async () => {
    if (!canView || userId == null) return;
    setLoading(true);
    try {
      const res = await authenticatedFetch("/api/notifications?limit=30", { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as
        | { notifications?: NotificationRow[]; unreadCount?: number; error?: string }
        | null;
      if (!res.ok || !json) return;
      const list = json.notifications ?? [];
      const unread = json.unreadCount ?? list.filter((n) => !n.read_at).length;
      const unreadIds = new Set(list.filter((n) => !n.read_at).map((n) => n.id));

      if (seenUnreadIdsRef.current === null) {
        seenUnreadIdsRef.current = unreadIds;
      } else {
        let hasNew = false;
        for (const id of unreadIds) {
          if (!seenUnreadIdsRef.current.has(id)) {
            hasNew = true;
            break;
          }
        }
        seenUnreadIdsRef.current = unreadIds;
        if (hasNew) {
          void playNotificationChime();
        }
      }

      setNotifications(list);
      setUnreadCount(unread);
    } finally {
      setLoading(false);
    }
  }, [canView, userId]);

  useEffect(() => {
    if (!canView) return;
    primeNotificationSound();
  }, [canView]);

  useEffect(() => {
    if (!canView || userId == null) return;
    seenUnreadIdsRef.current = null;
    void load();
    const poll = setInterval(() => void load(), POLL_MS);
    const unsub = subscribeNotificationsForUser(userId, () => void load());
    return () => {
      clearInterval(poll);
      unsub();
    };
  }, [canView, userId, load]);

  if (!canView) {
    return (
      <IconButton sx={{ color: "text.secondary" }} disabled aria-label="Notifications unavailable">
        <NotificationsNoneIcon />
      </IconButton>
    );
  }

  const handleApprove = async (requestId: string, notifId: string) => {
    setActionBusyId(notifId);
    const { error } = await approveCartLineRequestApi(requestId);
    setActionBusyId(null);
    if (!error) {
      await authenticatedFetch(`/api/notifications/${encodeURIComponent(notifId)}`, {
        method: "PATCH",
      });
      void load();
    }
  };

  const handleReject = async (requestId: string, notifId: string) => {
    setActionBusyId(notifId);
    const { error } = await rejectCartLineRequestApi(requestId);
    setActionBusyId(null);
    if (!error) {
      await authenticatedFetch(`/api/notifications/${encodeURIComponent(notifId)}`, {
        method: "PATCH",
      });
      void load();
    }
  };

  const handleApproveImaging = async (requestId: string, notifId: string) => {
    setActionBusyId(notifId);
    const { error } = await approveImagingEditRequestApi(requestId);
    setActionBusyId(null);
    if (!error) {
      await authenticatedFetch(`/api/notifications/${encodeURIComponent(notifId)}`, {
        method: "PATCH",
      });
      void load();
    }
  };

  const handleRejectImaging = async (requestId: string, notifId: string) => {
    setActionBusyId(notifId);
    const { error } = await rejectImagingEditRequestApi(requestId);
    setActionBusyId(null);
    if (!error) {
      await authenticatedFetch(`/api/notifications/${encodeURIComponent(notifId)}`, {
        method: "PATCH",
      });
      void load();
    }
  };

  const handleOpenLabQueue = async (notifId: string, href: string) => {
    setActionBusyId(notifId);
    await authenticatedFetch(`/api/notifications/${encodeURIComponent(notifId)}`, {
      method: "PATCH",
    });
    setActionBusyId(null);
    setAnchorEl(null);
    void load();
    router.push(href);
  };

  return (
    <>
      <IconButton
        sx={{ color: "text.secondary" }}
        aria-label="Notifications"
        onClick={(e) => {
          primeNotificationSound();
          void resumeNotificationAudio();
          setAnchorEl(e.currentTarget);
          void (async () => {
            await markNotificationsSeen();
            await load();
          })();
        }}
      >
        <Badge
          badgeContent={unreadCount > 0 ? unreadCount : undefined}
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
      <Popover
        open={Boolean(anchorEl)}
        anchorEl={anchorEl}
        onClose={() => {
          setAnchorEl(null);
          void load();
        }}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        slotProps={{ paper: { sx: { width: 360, maxHeight: 480 } } }}
      >
        <Box sx={{ px: 2, py: 1.5, borderBottom: 1, borderColor: "divider" }}>
          <Typography variant="subtitle2" fontWeight={700}>
            Notifications
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Click anywhere on the page once to enable alert sounds.
          </Typography>
        </Box>
        {loading && notifications.length === 0 ? (
          <Box sx={{ p: 3, display: "flex", justifyContent: "center" }}>
            <CircularProgress size={28} />
          </Box>
        ) : notifications.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
            No notifications.
          </Typography>
        ) : (
          <List dense disablePadding sx={{ overflow: "auto", maxHeight: 400 }}>
            {notifications.map((n) => {
              const pharmacyPayload =
                n.type === NOTIFICATION_TYPE_PHARMACY_CART_LINE ? n.payload : undefined;
              const pharmacyRequestIdRaw =
                pharmacyPayload != null && typeof pharmacyPayload === "object"
                  ? (pharmacyPayload as { requestId?: string; request_id?: string }).requestId ??
                    (pharmacyPayload as { request_id?: string }).request_id
                  : undefined;
              const pharmacyRequestId =
                typeof pharmacyRequestIdRaw === "string" && pharmacyRequestIdRaw.trim().length > 0
                  ? pharmacyRequestIdRaw.trim()
                  : null;
              const imagingPayload =
                n.type === NOTIFICATION_TYPE_IMAGING_EDIT ? n.payload : undefined;
              const imagingRequestIdRaw =
                imagingPayload != null && typeof imagingPayload === "object"
                  ? (imagingPayload as { requestId?: string; request_id?: string }).requestId ??
                    (imagingPayload as { request_id?: string }).request_id
                  : undefined;
              const imagingRequestId =
                typeof imagingRequestIdRaw === "string" && imagingRequestIdRaw.trim().length > 0
                  ? imagingRequestIdRaw.trim()
                  : null;
              const labHref =
                n.type === NOTIFICATION_TYPE_LAB_QUEUE_NEW
                  ? String((n.payload as { href?: string } | undefined)?.href ?? "/laboratory").trim() ||
                    "/laboratory"
                  : null;
              const busy = actionBusyId === n.id;
              const pharmacyPending =
                pharmacyRequestId != null &&
                n.type === NOTIFICATION_TYPE_PHARMACY_CART_LINE &&
                n.cartLineRequestStatus !== "approved" &&
                n.cartLineRequestStatus !== "rejected";
              const imagingPending =
                imagingRequestId != null &&
                n.type === NOTIFICATION_TYPE_IMAGING_EDIT &&
                n.imagingEditRequestStatus !== "approved" &&
                n.imagingEditRequestStatus !== "rejected";
              return (
                <ListItem
                  key={n.id}
                  sx={{
                    flexDirection: "column",
                    alignItems: "stretch",
                    bgcolor: n.read_at ? undefined : "action.hover",
                    borderBottom: 1,
                    borderColor: "divider",
                  }}
                >
                  <ListItemText
                    primary={n.title}
                    secondary={n.body}
                    primaryTypographyProps={{ variant: "body2", fontWeight: 600 }}
                    secondaryTypographyProps={{ variant: "caption" }}
                  />
                  {pharmacyRequestId != null && pharmacyPending && canPharmacy && (
                    <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                      <Button
                        size="small"
                        variant="contained"
                        color="success"
                        disabled={busy}
                        onClick={() => void handleApprove(pharmacyRequestId, n.id)}
                      >
                        Approve
                      </Button>
                      <Button
                        size="small"
                        variant="outlined"
                        color="error"
                        disabled={busy}
                        onClick={() => void handleReject(pharmacyRequestId, n.id)}
                      >
                        Reject
                      </Button>
                    </Stack>
                  )}
                  {imagingRequestId != null && imagingPending && (
                    <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                      <Button
                        size="small"
                        variant="contained"
                        color="success"
                        disabled={busy}
                        onClick={() => void handleApproveImaging(imagingRequestId, n.id)}
                      >
                        Approve
                      </Button>
                      <Button
                        size="small"
                        variant="outlined"
                        color="error"
                        disabled={busy}
                        onClick={() => void handleRejectImaging(imagingRequestId, n.id)}
                      >
                        Reject
                      </Button>
                    </Stack>
                  )}
                  {labHref && n.type === NOTIFICATION_TYPE_LAB_QUEUE_NEW && !n.read_at && canLab && (
                    <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                      <Button
                        size="small"
                        variant="contained"
                        color="primary"
                        disabled={busy}
                        onClick={() => void handleOpenLabQueue(n.id, labHref)}
                      >
                        Open lab queue
                      </Button>
                    </Stack>
                  )}
                </ListItem>
              );
            })}
          </List>
        )}
      </Popover>
    </>
  );
}
