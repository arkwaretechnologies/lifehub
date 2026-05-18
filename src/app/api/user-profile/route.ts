import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { userCanManageUsers } from "@/lib/adminRole";
import { getBearerSessionUserId } from "@/lib/requireSession";

export async function POST(req: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    return NextResponse.json(
      { error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." },
      { status: 500 },
    );
  }

  const body = (await req.json().catch(() => null)) as { userId?: unknown } | null;
  const rawUserId = body?.userId;
  const userId =
    typeof rawUserId === "number" && Number.isFinite(rawUserId)
      ? Math.trunc(rawUserId)
      : typeof rawUserId === "string"
        ? Number.parseInt(rawUserId.trim(), 10)
        : NaN;

  if (!Number.isFinite(userId) || userId <= 0) {
    return NextResponse.json({ error: "Missing userId." }, { status: 400 });
  }

  const supabaseAdmin = createClient(url, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const sessionUserId = await getBearerSessionUserId(req);
  if (sessionUserId == null) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const adminOk =
    sessionUserId === userId || (await userCanManageUsers(supabaseAdmin, sessionUserId));
  if (!adminOk) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const { data, error } = await supabaseAdmin
    .from("users")
    .select(
      [
        "user_id",
        "username",
        "fullname",
        "address",
        "email_address",
        "phone_no",
        "role",
        "branch_code",
        "specialty",
        "license_no",
        "s2_no",
        "ptr_no",
        "created_at",
        "updated_at",
      ].join(","),
    )
    .eq("user_id", userId)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ profile: data });
}

