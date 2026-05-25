import { NextResponse } from "next/server";
import { buildAuthSessionPayload } from "@/lib/authSessionPayload";
import { userCanReceiveLabQueueNotifications } from "@/lib/labQueueNotificationServer";
import { userCanApprovePharmacyLineRequests } from "@/lib/pharmacyLineRequestServer";
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
  const canLab = userCanReceiveLabQueueNotifications(session.menuAccess);
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

  const notifications = data ?? [];
  const unreadCount = notifications.filter((n) => (n as { read_at: string | null }).read_at == null).length;

  return NextResponse.json({ notifications, unreadCount });
}
