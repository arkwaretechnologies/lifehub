import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { hashPasswordForUsersTable } from "@/lib/userPasswordHash";

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

/** Set password for an existing user (service role). */
export async function PATCH(
  req: Request,
  context: { params: Promise<{ userId: string }> },
) {
  const supabase = adminClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Server missing SUPABASE_SERVICE_ROLE_KEY or Supabase URL." },
      { status: 500 },
    );
  }

  const { userId } = await context.params;
  const id = Number.parseInt(userId, 10);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "Invalid user id." }, { status: 400 });
  }

  const body = (await req.json().catch(() => null)) as { password?: string } | null;
  const password = body?.password;
  if (!password || password.length < 6) {
    return NextResponse.json({ error: "password must be at least 6 characters." }, { status: 400 });
  }

  const hash = await hashPasswordForUsersTable(password);
  /** `users.password` holds bcrypt for this project (see existing rows). Never store plain text here. */
  const { error } = await supabase.from("users").update({ password: hash }).eq("user_id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  await supabase.from("users").update({ password_hash: hash }).eq("user_id", id);

  return NextResponse.json({ ok: true });
}
