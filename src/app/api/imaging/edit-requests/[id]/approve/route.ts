import { NextResponse } from "next/server";
import { buildAuthSessionPayload } from "@/lib/authSessionPayload";
import { userHasAdminRole } from "@/lib/adminRole";
import {
  IMAGING_EDIT_REQUESTS_TABLE,
  NOTIFICATION_TYPE_IMAGING_EDIT,
  userCanApproveImagingEditRequests,
} from "@/lib/imagingEditRequestServer";
import { getBearerSessionUserId } from "@/lib/requireSession";
import { supabaseAdminClient } from "@/lib/supabaseAdminClient";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(req: Request, context: RouteContext) {
  const db = supabaseAdminClient();
  if (!db) {
    return NextResponse.json({ error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." }, { status: 500 });
  }

  const sessionUserId = await getBearerSessionUserId(req);
  if (sessionUserId == null) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const session = await buildAuthSessionPayload(db, sessionUserId);
  const canApprove =
    (session.ok && userCanApproveImagingEditRequests(session.menuAccess)) ||
    (await userHasAdminRole(db, sessionUserId));
  if (!canApprove) {
    return NextResponse.json(
      { error: "You do not have permission to approve imaging edit requests." },
      { status: 403 },
    );
  }

  const { id } = await context.params;
  const requestId = id?.trim();
  if (!requestId) {
    return NextResponse.json({ error: "id is required." }, { status: 400 });
  }

  const { data: row, error: fetchErr } = await db
    .from(IMAGING_EDIT_REQUESTS_TABLE)
    .select("status")
    .eq("id", requestId)
    .maybeSingle();

  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }
  if (!row) {
    return NextResponse.json({ error: "Request not found." }, { status: 404 });
  }
  if ((row as { status: string }).status !== "pending") {
    return NextResponse.json({ error: `Request is already ${(row as { status: string }).status}.` }, { status: 409 });
  }

  const now = new Date().toISOString();
  const { data: updated, error: updErr } = await db
    .from(IMAGING_EDIT_REQUESTS_TABLE)
    .update({
      status: "approved",
      resolved_by_user_id: sessionUserId,
      resolved_at: now,
    })
    .eq("id", requestId)
    .eq("status", "pending")
    .select("*")
    .single();

  if (updErr || !updated) {
    return NextResponse.json({ error: updErr?.message ?? "Failed to approve." }, { status: 500 });
  }

  await db
    .from("notifications")
    .update({ read_at: now })
    .eq("type", NOTIFICATION_TYPE_IMAGING_EDIT)
    .contains("payload", { requestId });

  return NextResponse.json({ request: updated });
}
