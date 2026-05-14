import { NextResponse } from "next/server";
import { IMAGING_CATALOG_TABLE, type ImagingCatalogRow } from "@/lib/imagingCatalog";
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

function parseId(raw: string): bigint | null {
  const t = raw?.trim() ?? "";
  if (!/^\d+$/.test(t)) return null;
  try {
    return BigInt(t);
  } catch {
    return null;
  }
}

function numPrice(v: unknown): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : Number(String(v));
  return Number.isFinite(n) ? n : 0;
}

function mapRow(raw: Record<string, unknown>): ImagingCatalogRow {
  return {
    id: String(raw.id ?? ""),
    code: String(raw.code ?? "").trim(),
    name: String(raw.name ?? "").trim(),
    default_price: numPrice(raw.default_price),
    requires_view_field: raw.requires_view_field === true,
    view_field_label:
      raw.view_field_label == null || String(raw.view_field_label).trim() === ""
        ? null
        : String(raw.view_field_label).trim(),
    sort_order:
      raw.sort_order == null || raw.sort_order === "" ? null : Number(raw.sort_order),
    is_active: raw.is_active !== false,
  };
}

export async function PATCH(
  req: Request,
  context: { params: Promise<{ imagingId: string }> },
) {
  const { db, res } = adminOr500();
  if (!db || res) return res!;

  const { imagingId: param } = await context.params;
  const id = parseId(param ?? "");
  if (id === null) {
    return NextResponse.json({ error: "Invalid imaging id." }, { status: 400 });
  }

  const body = (await req.json().catch(() => null)) as {
    code?: string;
    name?: string;
    default_price?: number | string | null;
    requires_view_field?: boolean;
    view_field_label?: string | null;
    sort_order?: number | null;
    is_active?: boolean;
  } | null;

  if (!body || Object.keys(body).length === 0) {
    return NextResponse.json({ error: "Provide at least one field to update." }, { status: 400 });
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

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
  if (body.default_price !== undefined) {
    if (body.default_price === null || body.default_price === ("" as unknown)) {
      patch.default_price = 0;
    } else {
      const p = typeof body.default_price === "number" ? body.default_price : Number(String(body.default_price));
      if (!Number.isFinite(p) || p < 0) {
        return NextResponse.json({ error: "default_price must be a non-negative number." }, { status: 400 });
      }
      patch.default_price = p;
    }
  }
  if (body.requires_view_field !== undefined) {
    patch.requires_view_field = body.requires_view_field === true;
    if (!patch.requires_view_field) patch.view_field_label = null;
  }
  if (body.view_field_label !== undefined) {
    patch.view_field_label =
      body.view_field_label === null ? null : String(body.view_field_label).trim() || null;
  }
  if (body.sort_order !== undefined) {
    const s = body.sort_order == null ? null : Number(body.sort_order);
    patch.sort_order = s == null || !Number.isFinite(s) ? null : Math.trunc(s);
  }
  if (body.is_active !== undefined) patch.is_active = body.is_active !== false;

  const { data, error } = await db
    .from(IMAGING_CATALOG_TABLE)
    .update(patch)
    .eq("id", id.toString())
    .select("id, code, name, default_price, requires_view_field, view_field_label, sort_order, is_active")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!data) return NextResponse.json({ error: "Imaging row not found." }, { status: 404 });

  return NextResponse.json({ row: mapRow(data as Record<string, unknown>) });
}

export async function DELETE(
  _req: Request,
  context: { params: Promise<{ imagingId: string }> },
) {
  const { db, res } = adminOr500();
  if (!db || res) return res!;

  const { imagingId: param } = await context.params;
  const id = parseId(param ?? "");
  if (id === null) {
    return NextResponse.json({ error: "Invalid imaging id." }, { status: 400 });
  }

  const { error } = await db.from(IMAGING_CATALOG_TABLE).delete().eq("id", id.toString());
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
