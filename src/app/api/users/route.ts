import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { assertAdminSession } from "@/lib/adminRole";
import { hashPasswordForUsersTable } from "@/lib/userPasswordHash";

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

/**
 * Create app user (service role).
 * Stores bcrypt in `users.password` using `$2a$…` prefix (matches Postgres `crypt` / your existing rows).
 * Best-effort second update for `password_hash` when that column exists.
 */
export async function POST(req: Request) {
  const supabase = adminClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Server missing SUPABASE_SERVICE_ROLE_KEY or Supabase URL." },
      { status: 500 },
    );
  }

  const forbidden = await assertAdminSession(req, supabase);
  if (forbidden) return forbidden;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body?.username || !body?.fullname || !body?.role) {
    return NextResponse.json(
      { error: "username, fullname, and role are required." },
      { status: 400 },
    );
  }

  const password = typeof body.password === "string" ? body.password.trim() : "";
  if (password.length < 6) {
    return NextResponse.json(
      {
        error: "Password is required and must be at least 6 characters.",
      },
      { status: 400 },
    );
  }

  const passwordHash = await hashPasswordForUsersTable(password);

  const insertRow: Record<string, unknown> = {
    username: String(body.username).trim(),
    fullname: String(body.fullname).trim(),
    role: String(body.role).trim(),
    email_address: body.email_address ? String(body.email_address).trim() || null : null,
    phone_no: body.phone_no ? String(body.phone_no).trim() || null : null,
    branch_code: body.branch_code ? String(body.branch_code).trim() || null : null,
    address: body.address ? String(body.address).trim() || null : null,
    specialty: body.specialty ? String(body.specialty).trim() || null : null,
    license_no: body.license_no ? String(body.license_no).trim() || null : null,
    s2_no: body.s2_no ? String(body.s2_no).trim() || null : null,
    ptr_no: body.ptr_no ? String(body.ptr_no).trim() || null : null,
    password: passwordHash,
  };

  const { data: created, error: insertError } = await supabase
    .from("users")
    .insert(insertRow)
    .select()
    .single();

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 400 });
  }

  if (!created?.user_id) {
    return NextResponse.json({ error: "Insert succeeded but no user_id returned." }, { status: 500 });
  }

  const userId = created.user_id as number | string;

  const { error: hashUpdateError } = await supabase
    .from("users")
    .update({ password_hash: passwordHash })
    .eq("user_id", userId);

  if (hashUpdateError) {
    // `password` already holds bcrypt; optional mirror column only
    return NextResponse.json({
      user: created,
      warning: `User was created with a hashed password. Optional password_hash column was not updated: ${hashUpdateError.message}`,
    });
  }

  const { data: full, error: fetchError } = await supabase
    .from("users")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (fetchError || !full) {
    return NextResponse.json({
      user: { ...created, password_hash: passwordHash },
    });
  }

  return NextResponse.json({ user: full });
}
