import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function GET() {
  const supabase = adminClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Server missing SUPABASE_SERVICE_ROLE_KEY or Supabase URL." },
      { status: 500 },
    );
  }

  const { data, error } = await supabase
    .from("roles")
    .select("role_id, name, description, created_at, updated_at")
    .order("role_id", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ roles: data ?? [] });
}

export async function POST(req: Request) {
  const supabase = adminClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Server missing SUPABASE_SERVICE_ROLE_KEY or Supabase URL." },
      { status: 500 },
    );
  }

  const body = (await req.json().catch(() => null)) as {
    name?: string;
    description?: string | null;
  } | null;

  const name = body?.name?.trim();
  if (!name) {
    return NextResponse.json({ error: "name is required." }, { status: 400 });
  }
  if (name.length > 50) {
    return NextResponse.json({ error: "name must be at most 50 characters." }, { status: 400 });
  }

  const description =
    body?.description === undefined || body?.description === null
      ? null
      : String(body.description).trim() || null;

  const { data, error } = await supabase
    .from("roles")
    .insert({ name, description })
    .select("role_id, name, description, created_at, updated_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ role: data });
}
