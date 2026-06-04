import { NextResponse } from "next/server";
import { buildAuthSessionPayload } from "@/lib/authSessionPayload";
import { userCanReceiveLabQueueNotifications } from "@/lib/labQueueNotificationServer";
import {
  NOTIFICATION_TYPE_PHARMACY_CART_LINE,
  userCanApprovePharmacyLineRequests,
  type CartLineRequestStatus,
} from "@/lib/pharmacyLineRequestServer";
import { getBearerSessionUserId } from "@/lib/requireSession";
import { supabaseAdminClient } from "@/lib/supabaseAdminClient";

export async function GET(req: Request) {
  const db = supabaseAdminClient();
  if (!db) {
    return NextResponse.json({ error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." }, { status: 500 });
  }

  const sessionUserId = await getBearerSessionUserId(req);
  if (sessionUserId == null) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const session = await buildAuthSessionPayload(db, sessionUserId);
  if (!session.ok) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  const canPharmacy = userCanApprovePharmacyLineRequests(session.menuAccess);
  const canLab = userCanReceiveLabQueueNotifications(session.profile.role);
  if (!canPharmacy && !canLab) {
    return NextResponse.json({ notifications: [], unreadCount: 0 });
  }

  const url = new URL(req.url);
  const limit = Math.min(50, Math.max(1, Number.parseInt(url.searchParams.get("limit") ?? "30", 10) || 30));

  const { data, error } = await db
    .from("notifications")
    .select("*")
    .eq("user_id", sessionUserId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = data ?? [];

  function parseNotificationPayload(raw: unknown): { requestId?: string } {
    if (raw == null) return {};
    if (typeof raw === "string") {
      try {
        return parseNotificationPayload(JSON.parse(raw) as unknown);
      } catch {
        return {};
      }
    }
    if (typeof raw !== "object") return {};
    const o = raw as Record<string, unknown>;
    const id = o.requestId ?? o.request_id;
    return typeof id === "string" && id.trim().length > 0 ? { requestId: id.trim() } : {};
  }

  const requestIds = [
    ...new Set(
      rows
        .filter((n) => (n as { type: string }).type === NOTIFICATION_TYPE_PHARMACY_CART_LINE)
        .map((n) => parseNotificationPayload((n as { payload?: unknown }).payload).requestId)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  ];

  const statusByRequestId: Record<string, CartLineRequestStatus> = {};
  if (canPharmacy && requestIds.length > 0) {
    const { data: reqs, error: reqErr } = await db
      .from("pharmacy_cart_line_requests")
      .select("id, status")
      .in("id", requestIds);
    if (!reqErr) {
      for (const r of reqs ?? []) {
        const row = r as { id: string; status: CartLineRequestStatus };
        statusByRequestId[row.id] = row.status;
      }
    }
  }

  const notifications = rows.map((n) => {
    const row = n as { type: string; payload?: unknown };
    const requestId =
      row.type === NOTIFICATION_TYPE_PHARMACY_CART_LINE
        ? parseNotificationPayload(row.payload).requestId
        : undefined;
    const status = requestId ? statusByRequestId[requestId] : undefined;
    return {
      ...n,
      cartLineRequestStatus: requestId ? (status ?? "pending") : null,
    };
  });
  const unreadCount = notifications.filter((n) => (n as { read_at: string | null }).read_at == null).length;

  return NextResponse.json({ notifications, unreadCount });
}
