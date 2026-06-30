import { NextResponse } from "next/server";
import { LAB_CATEGORIES_TABLE, type LabCategoryRow } from "@/lib/labTests";
import { supabaseAdminClient } from "@/lib/supabaseAdminClient";
import { afterLaboratoryCatalogSettingsMutation } from "@/lib/cacheInvalidation";

function adminOr500() {
  const db = supabaseAdminClient();
  if (!db) {
    return {
      db: null as null,
      res: NextResponse.json(
        { error: "Server missing SUPABASE_SERVICE_ROLE_KEY or Supabase URL." },
        { status: 500 },
      ),
    };
  }
  return { db, res: null as null };
}

export async function GET() {
  const { db, res } = adminOr500();
  if (!db || res) return res!;

  const { data, error } = await db
    .from(LAB_CATEGORIES_TABLE)
    .select("id, code, name, description, sort_order, is_active")
    .order("sort_order", { ascending: true, nullsFirst: false })
    .order("name", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ categories: (data ?? []) as LabCategoryRow[] });
}

export async function POST(req: Request) {
  const { db, res } = adminOr500();
  if (!db || res) return res!;

  const body = (await req.json().catch(() => null)) as {
    code?: string;
    name?: string;
    description?: string | null;
    sort_order?: number | null;
    is_active?: boolean;
  } | null;

  const code = body?.code?.trim();
  const name = body?.name?.trim();
  if (!code || !name) {
    return NextResponse.json({ error: "code and name are required." }, { status: 400 });
  }

  const description =
    body?.description === undefined || body?.description === null
      ? null
      : String(body.description).trim() || null;
  const sort_order =
    body?.sort_order == null || body.sort_order === ("" as unknown)
      ? null
      : Number(body.sort_order);
  const is_active = body?.is_active !== false;

  const { data, error } = await db
    .from(LAB_CATEGORIES_TABLE)
    .insert({
      code,
      name,
      description,
      sort_order: Number.isFinite(sort_order as number) ? sort_order : null,
      is_active,
    })
    .select("id, code, name, description, sort_order, is_active")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await afterLaboratoryCatalogSettingsMutation();
  return NextResponse.json({ category: data as LabCategoryRow });
}
