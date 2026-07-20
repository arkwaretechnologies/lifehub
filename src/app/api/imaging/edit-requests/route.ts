import { NextResponse } from "next/server";
import { fetchUserProfileById } from "@/lib/authSessionPayload";
import { parseAdminRoleNames } from "@/lib/adminRole";
import {
  IMAGING_EDIT_REQUESTS_TABLE,
  listUserIdsWhoCanApproveImagingEdits,
  NOTIFICATION_TYPE_IMAGING_EDIT,
  type ImagingEditRequestRow,
  type ImagingItemEditState,
} from "@/lib/imagingEditRequestServer";
import { userIsRadTech } from "@/lib/radiologyRole";
import { getBearerSessionUserId } from "@/lib/requireSession";
import { supabaseAdminClient } from "@/lib/supabaseAdminClient";

/** Item statuses at which a RAD TECH may request approval to edit findings. */
const REQUESTABLE_STATUSES = new Set(["Received", "Completed", "Interpreted"]);

type CreateBody = {
  imagingRequestItemId?: string;
  imagingRequestId?: string | null;
  note?: string | null;
  study_snapshot?: {
    study_name?: string;
    view_text?: string | null;
    patient_name?: string | null;
    imaging_request_id?: string | null;
  } | null;
};

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
  const imagingRequestId = (url.searchParams.get("imagingRequestId") ?? "").trim();
  if (!imagingRequestId) {
    return NextResponse.json({ error: "imagingRequestId is required." }, { status: 400 });
  }

  const { data: itemRows, error: itemErr } = await db
    .from("imaging_request_items")
    .select("id, status")
    .eq("imaging_request_id", imagingRequestId);
  if (itemErr) {
    return NextResponse.json({ error: itemErr.message }, { status: 500 });
  }
  const items = (itemRows ?? []) as Array<{ id: string; status: string | null }>;

  const states: Record<string, ImagingItemEditState> = {};
  const isTech = await userIsRadTech(db, sessionUserId);

  // Only RAD TECH may unlock Findings on Imaging Results via approval.
  // Admin / radiologist / others stay read-only here (edit via Reading Queue).
  if (!isTech) {
    for (const it of items) states[it.id] = "none";
    return NextResponse.json({ states });
  }

  // RAD TECH: derive per-item state from their own edit requests.
  const itemIds = items.map((it) => it.id);
  const { data: reqRows } = await db
    .from(IMAGING_EDIT_REQUESTS_TABLE)
    .select("imaging_request_item_id, status, consumed_at")
    .eq("requested_by_user_id", sessionUserId)
    .in("imaging_request_item_id", itemIds.length > 0 ? itemIds : ["__none__"]);

  const approvedItems = new Set<string>();
  const pendingItems = new Set<string>();
  for (const r of (reqRows ?? []) as Array<{
    imaging_request_item_id: string;
    status: string;
    consumed_at: string | null;
  }>) {
    if (r.status === "approved" && r.consumed_at == null) approvedItems.add(r.imaging_request_item_id);
    else if (r.status === "pending") pendingItems.add(r.imaging_request_item_id);
  }

  for (const it of items) {
    if (approvedItems.has(it.id)) states[it.id] = "approved";
    else if (pendingItems.has(it.id)) states[it.id] = "pending";
    else if (REQUESTABLE_STATUSES.has(String(it.status ?? "").trim())) states[it.id] = "can_request";
    else states[it.id] = "none";
  }

  return NextResponse.json({ states });
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

  const isTech = await userIsRadTech(db, sessionUserId);
  if (!isTech) {
    return NextResponse.json(
      { error: "Only the RAD TECH role may request approval to edit findings." },
      { status: 403 },
    );
  }

  let body: CreateBody;
  try {
    body = (await req.json()) as CreateBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const itemId = typeof body.imagingRequestItemId === "string" ? body.imagingRequestItemId.trim() : "";
  if (!itemId) {
    return NextResponse.json({ error: "imagingRequestItemId is required." }, { status: 400 });
  }

  const { data: item, error: itemErr } = await db
    .from("imaging_request_items")
    .select("id, imaging_request_id, study_name, view_text, status")
    .eq("id", itemId)
    .maybeSingle();
  if (itemErr) return NextResponse.json({ error: itemErr.message }, { status: 500 });
  if (!item) return NextResponse.json({ error: "Imaging study not found." }, { status: 404 });

  const itemRow = item as {
    id: string;
    imaging_request_id: string | null;
    study_name: string | null;
    view_text: string | null;
    status: string | null;
  };
  if (!REQUESTABLE_STATUSES.has(String(itemRow.status ?? "").trim())) {
    return NextResponse.json(
      { error: "This study is not ready for findings entry yet." },
      { status: 409 },
    );
  }

  // Already approved and unconsumed → nothing to request.
  const { data: activeApproved } = await db
    .from(IMAGING_EDIT_REQUESTS_TABLE)
    .select("id")
    .eq("requested_by_user_id", sessionUserId)
    .eq("imaging_request_item_id", itemId)
    .eq("status", "approved")
    .is("consumed_at", null)
    .maybeSingle();
  if (activeApproved) {
    return NextResponse.json({ error: "You already have approval to edit this study." }, { status: 409 });
  }

  const { data: existingPending } = await db
    .from(IMAGING_EDIT_REQUESTS_TABLE)
    .select("id")
    .eq("requested_by_user_id", sessionUserId)
    .eq("imaging_request_item_id", itemId)
    .eq("status", "pending")
    .maybeSingle();
  if (existingPending) {
    return NextResponse.json(
      { error: "A pending edit request already exists for this study." },
      { status: 409 },
    );
  }

  const note = typeof body.note === "string" ? body.note.trim().slice(0, 500) || null : null;
  const snapshot = {
    study_name: String(body.study_snapshot?.study_name ?? itemRow.study_name ?? "").trim() || "Imaging study",
    view_text: body.study_snapshot?.view_text ?? itemRow.view_text ?? null,
    patient_name: body.study_snapshot?.patient_name ?? null,
    imaging_request_id: itemRow.imaging_request_id,
  };

  const { data: inserted, error: insErr } = await db
    .from(IMAGING_EDIT_REQUESTS_TABLE)
    .insert({
      requested_by_user_id: sessionUserId,
      imaging_request_item_id: itemId,
      imaging_request_id: itemRow.imaging_request_id,
      status: "pending",
      study_snapshot: snapshot,
      note,
    })
    .select("*")
    .single();

  if (insErr || !inserted) {
    return NextResponse.json({ error: insErr?.message ?? "Failed to create request." }, { status: 500 });
  }

  const request = inserted as ImagingEditRequestRow;

  const { profile } = await fetchUserProfileById(db, sessionUserId);
  const techName =
    (profile?.fullname && String(profile.fullname).trim()) ||
    (profile?.username && String(profile.username).trim()) ||
    `User #${sessionUserId}`;

  const studyLabel = snapshot.study_name + (snapshot.view_text ? ` (${snapshot.view_text})` : "");
  const title = "ENABLE FINDINGS requested";
  const notifBody = `${techName} requests ENABLE FINDINGS for: ${studyLabel}`;
  const href = itemRow.imaging_request_id
    ? `/imaging/results?imagingRequestId=${itemRow.imaging_request_id}`
    : "/imaging/results";

  const approverIds = await listUserIdsWhoCanApproveImagingEdits(db);
  let notifyUserIds = approverIds;
  if (notifyUserIds.length === 0) {
    // Fallback: notify ADMIN-role users so requests never silently have zero recipients.
    const adminNames = new Set(parseAdminRoleNames().map((n) => n.toLowerCase()));
    const { data: users } = await db.from("users").select("user_id, role");
    notifyUserIds = [
      ...new Set(
        ((users ?? []) as Array<{ user_id: number; role: string | null }>)
          .filter((u) => adminNames.has(String(u.role ?? "").trim().toLowerCase()))
          .map((u) => u.user_id),
      ),
    ];
    if (notifyUserIds.length > 0) {
      console.warn(
        "imaging edit-requests: no role_pages for radiology/approve-tech-findings; falling back to ADMIN users",
      );
    }
  }

  if (notifyUserIds.length > 0) {
    const rows = notifyUserIds.map((userId) => ({
      user_id: userId,
      type: NOTIFICATION_TYPE_IMAGING_EDIT,
      title,
      body: notifBody,
      payload: { requestId: request.id, href },
    }));
    const { error: nErr } = await db.from("notifications").insert(rows);
    if (nErr) {
      console.error("imaging edit notifications insert:", nErr.message);
    }
  } else {
    console.error(
      "imaging edit-requests: no approvers found (grant radiology/approve-tech-findings or configure ADMIN_ROLE_NAMES)",
    );
  }

  return NextResponse.json({
    request,
    notifiedCount: notifyUserIds.length,
    warning:
      notifyUserIds.length === 0
        ? "Request saved, but no admin was notified. Grant “Approve imaging findings requests” to the ADMIN role."
        : null,
  });
}
