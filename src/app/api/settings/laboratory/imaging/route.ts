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

export async function GET() {
  const { db, res } = adminOr500();
  if (!db || res) return res!;

  const { data, error } = await db
    .from(IMAGING_CATALOG_TABLE)
    .select("id, code, name, default_price, requires_view_field, view_field_label, sort_order, is_active")
    .order("sort_order", { ascending: true, nullsFirst: false })
    .order("name", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const rows = ((data ?? []) as Record<string, unknown>[]).map((r) => mapRow(r));
  return NextResponse.json({ imaging: rows });
}

export async function POST(req: Request) {
  const { db, res } = adminOr500();
  if (!db || res) return res!;

  const body = (await req.json().catch(() => null)) as {
    code?: string;
    name?: string;
    default_price?: number | string | null;
    requires_view_field?: boolean;
    view_field_label?: string | null;
    sort_order?: number | null;
    is_active?: boolean;
  } | null;

  const code = body?.code?.trim();
  const name = body?.name?.trim();
  if (!code || !name) {
    return NextResponse.json({ error: "code and name are required." }, { status: 400 });
  }

  let default_price = 0;
  if (body?.default_price != null && body.default_price !== ("" as unknown)) {
    const p = typeof body.default_price === "number" ? body.default_price : Number(String(body.default_price));
    default_price = Number.isFinite(p) && p >= 0 ? p : 0;
  }

  const requires_view_field = body?.requires_view_field === true;
  const view_field_label =
    body?.view_field_label === undefined || body?.view_field_label === null
      ? null
      : String(body.view_field_label).trim() || null;

  const sort_order =
    body?.sort_order == null || body.sort_order === ("" as unknown)
      ? null
      : Number(body.sort_order);
  const is_active = body?.is_active !== false;

  const insertRow: Record<string, unknown> = {
    code,
    name,
    default_price,
    requires_view_field,
    view_field_label: requires_view_field ? view_field_label : null,
    sort_order: sort_order != null && Number.isFinite(sort_order) ? Math.trunc(sort_order) : null,
    is_active,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await db
    .from(IMAGING_CATALOG_TABLE)
    .insert(insertRow)
    .select("id, code, name, default_price, requires_view_field, view_field_label, sort_order, is_active")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ row: mapRow(data as Record<string, unknown>) });
}
