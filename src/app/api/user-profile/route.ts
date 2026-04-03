import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    return NextResponse.json(
      { error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." },
      { status: 500 },
    );
  }

  const body = (await req.json().catch(() => null)) as { userId?: number } | null;
  const userId = body?.userId;

  if (!userId || typeof userId !== "number") {
    return NextResponse.json({ error: "Missing userId." }, { status: 400 });
  }

  const supabaseAdmin = createClient(url, serviceRoleKey, {
    auth: { persistSession: false },
  });

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

