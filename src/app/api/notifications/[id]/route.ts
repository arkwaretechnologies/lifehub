import { NextResponse } from "next/server";
import { getBearerSessionUserId } from "@/lib/requireSession";
import { supabaseAdminClient } from "@/lib/supabaseAdminClient";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, context: RouteContext) {
  const db = supabaseAdminClient();
  if (!db) {
    return NextResponse.json({ error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." }, { status: 500 });
  }

  const sessionUserId = await getBearerSessionUserId(req);
  if (sessionUserId == null) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { id } = await context.params;
  const notifId = id?.trim();
  if (!notifId) {
    return NextResponse.json({ error: "id is required." }, { status: 400 });
  }

  const now = new Date().toISOString();
  const { data, error } = await db
    .from("notifications")
    .update({ read_at: now })
    .eq("id", notifId)
    .eq("user_id", sessionUserId)
    .select("*")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Notification not found." }, { status: 404 });
  }

  return NextResponse.json({ notification: data });
}
