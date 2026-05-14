import { NextResponse } from "next/server";
import { LAB_CATEGORIES_TABLE, LAB_TESTS_TABLE, type LabCategoryRow } from "@/lib/labTests";
import { supabaseAdminClient } from "@/lib/supabaseAdminClient";

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

function parseCategoryId(raw: string): number | null {
  const n = Number.parseInt(String(raw), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function PATCH(
  req: Request,
  context: { params: Promise<{ categoryId: string }> },
) {
  const { db, res } = adminOr500();
  if (!db || res) return res!;

  const { categoryId: param } = await context.params;
  const categoryId = parseCategoryId(param);
  if (categoryId === null) {
    return NextResponse.json({ error: "Invalid category id." }, { status: 400 });
  }

  const body = (await req.json().catch(() => null)) as {
    code?: string;
    name?: string;
    description?: string | null;
    sort_order?: number | null;
    is_active?: boolean;
  } | null;

  if (!body || Object.keys(body).length === 0) {
    return NextResponse.json({ error: "Provide at least one field to update." }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if (body.code !== undefined) {
    const c = String(body.code).trim();
    if (!c) return NextResponse.json({ error: "code cannot be empty." }, { status: 400 });
    patch.code = c;
  }
  if (body.name !== undefined) {
    const n = String(body.name).trim();
    if (!n) return NextResponse.json({ error: "name cannot be empty." }, { status: 400 });
    patch.name = n;
  }
  if (body.description !== undefined) {
    patch.description =
      body.description === null ? null : String(body.description).trim() || null;
  }
  if (body.sort_order !== undefined) {
    const s = body.sort_order == null ? null : Number(body.sort_order);
    patch.sort_order = s == null || !Number.isFinite(s) ? null : Math.trunc(s);
  }
  if (body.is_active !== undefined) patch.is_active = body.is_active !== false;

  const { data, error } = await db
    .from(LAB_CATEGORIES_TABLE)
    .update(patch)
    .eq("id", categoryId)
    .select("id, code, name, description, sort_order, is_active")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!data) return NextResponse.json({ error: "Category not found." }, { status: 404 });

  return NextResponse.json({ category: data as LabCategoryRow });
}

export async function DELETE(
  _req: Request,
  context: { params: Promise<{ categoryId: string }> },
) {
  const { db, res } = adminOr500();
  if (!db || res) return res!;

  const { categoryId: param } = await context.params;
  const categoryId = parseCategoryId(param);
  if (categoryId === null) {
    return NextResponse.json({ error: "Invalid category id." }, { status: 400 });
  }

  const { count, error: cErr } = await db
    .from(LAB_TESTS_TABLE)
    .select("id", { count: "exact", head: true })
    .eq("category_id", categoryId);

  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 400 });
  if ((count ?? 0) > 0) {
    return NextResponse.json(
      { error: "Cannot delete a category that still has lab tests. Reassign or delete those tests first." },
      { status: 409 },
    );
  }

  const { error } = await db.from(LAB_CATEGORIES_TABLE).delete().eq("id", categoryId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
