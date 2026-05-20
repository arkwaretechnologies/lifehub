import { NextResponse } from "next/server";
import { getBearerSessionUserId } from "@/lib/requireSession";
import { supabaseAdminClient } from "@/lib/supabaseAdminClient";
import {
  listUserIdsWithLineApprovalPermission,
  NOTIFICATION_TYPE_PHARMACY_CART_LINE,
  type CartLineRequestAction,
  type CartLineSnapshot,
} from "@/lib/pharmacyLineRequestServer";
import { fetchUserProfileById } from "@/lib/authSessionPayload";

type CreateBody = {
  action?: string;
  cart_line_key?: string;
  line_snapshot?: CartLineSnapshot;
  note?: string;
};

function isValidAction(a: string): a is CartLineRequestAction {
  return a === "delete" || a === "quantity_change";
}

function isValidSnapshot(s: unknown): s is CartLineSnapshot {
  if (s == null || typeof s !== "object") return false;
  const o = s as Record<string, unknown>;
  return (
    typeof o.product_id === "string" &&
    o.product_id.trim().length > 0 &&
    typeof o.generic_name === "string" &&
    typeof o.unit_price === "number" &&
    Number.isFinite(o.unit_price) &&
    typeof o.qty === "number" &&
    Number.isFinite(o.qty) &&
    o.qty >= 1
  );
}

export async function GET(req: Request) {
  const db = supabaseAdminClient();
  if (!db) {
    return NextResponse.json({ error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." }, { status: 500 });
  }

  const sessionUserId = await getBearerSessionUserId(req);
  if (sessionUserId == null) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const url = new URL(req.url);
  const status = url.searchParams.get("status")?.trim() || "pending";

  const { data, error } = await db
    .from("pharmacy_cart_line_requests")
    .select("*")
    .eq("requested_by_user_id", sessionUserId)
    .eq("status", status)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ requests: data ?? [] });
}

export async function POST(req: Request) {
  const db = supabaseAdminClient();
  if (!db) {
    return NextResponse.json({ error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." }, { status: 500 });
  }

  const sessionUserId = await getBearerSessionUserId(req);
  if (sessionUserId == null) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body: CreateBody;
  try {
    body = (await req.json()) as CreateBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const action = typeof body.action === "string" ? body.action.trim() : "";
  const cartLineKey = typeof body.cart_line_key === "string" ? body.cart_line_key.trim() : "";
  if (!isValidAction(action) || !cartLineKey) {
    return NextResponse.json({ error: "action and cart_line_key are required." }, { status: 400 });
  }
  if (!isValidSnapshot(body.line_snapshot)) {
    return NextResponse.json({ error: "Valid line_snapshot is required." }, { status: 400 });
  }

  const note = typeof body.note === "string" ? body.note.trim().slice(0, 500) || null : null;

  const { data: existing } = await db
    .from("pharmacy_cart_line_requests")
    .select("id")
    .eq("requested_by_user_id", sessionUserId)
    .eq("cart_line_key", cartLineKey)
    .eq("status", "pending")
    .maybeSingle();

  if (existing) {
    return NextResponse.json(
      { error: "A pending line authorization request already exists for this cart line." },
      { status: 409 },
    );
  }

  const { data: inserted, error: insErr } = await db
    .from("pharmacy_cart_line_requests")
    .insert({
      requested_by_user_id: sessionUserId,
      status: "pending",
      action,
      cart_line_key: cartLineKey,
      line_snapshot: body.line_snapshot,
      note,
    })
    .select("*")
    .single();

  if (insErr || !inserted) {
    return NextResponse.json({ error: insErr?.message ?? "Failed to create request." }, { status: 500 });
  }

  const { profile } = await fetchUserProfileById(db, sessionUserId);
  const cashierName =
    (profile?.fullname && String(profile.fullname).trim()) ||
    (profile?.username && String(profile.username).trim()) ||
    `User #${sessionUserId}`;

  const productLabel = body.line_snapshot.generic_name;
  const actionLabel = action === "delete" ? "remove line" : "change quantity";
  const title = "Line authorization requested";
  const notifBody = `${cashierName} requests to ${actionLabel}: ${productLabel}`;

  const approverIds = await listUserIdsWithLineApprovalPermission(db);
  if (approverIds.length > 0) {
    const rows = approverIds.map((userId) => ({
      user_id: userId,
      type: NOTIFICATION_TYPE_PHARMACY_CART_LINE,
      title,
      body: notifBody,
      payload: { requestId: (inserted as { id: string }).id },
    }));
    const { error: nErr } = await db.from("notifications").insert(rows);
    if (nErr) {
      console.error("notifications insert:", nErr.message);
    }
  }

  return NextResponse.json({ request: inserted });
}
