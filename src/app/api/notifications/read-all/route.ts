import { NextResponse } from "next/server";
import { getBearerSessionUserId } from "@/lib/requireSession";
import { supabaseAdminClient } from "@/lib/supabaseAdminClient";

export async function PATCH(req: Request) {
  const db = supabaseAdminClient();
  if (!db) {
    return NextResponse.json({ error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." }, { status: 500 });
  }

  const sessionUserId = await getBearerSessionUserId(req);
  if (sessionUserId == null) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const now = new Date().toISOString();
  const { data, error } = await db
    .from("notifications")
    .update({ read_at: now })
    .eq("user_id", sessionUserId)
    .is("read_at", null)
    .select("id");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, markedCount: data?.length ?? 0 });
}
