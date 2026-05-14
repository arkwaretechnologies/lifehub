import { NextResponse } from "next/server";
import { LAB_CATEGORIES_TABLE, LAB_TESTS_TABLE, type LabTestCatalogItem } from "@/lib/labTests";
import { LAB_SERVICE_PRICES_TABLE } from "@/lib/labServicePrices";
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

function parseCategoryIdFilter(raw: string | null): number | null {
  if (raw == null || raw.trim() === "") return null;
  const n = Number.parseInt(raw.trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function GET(req: Request) {
  const { db, res } = adminOr500();
  if (!db || res) return res!;

  const categoryId = parseCategoryIdFilter(new URL(req.url).searchParams.get("categoryId"));

  let q = db
    .from(LAB_TESTS_TABLE)
    .select(
      "id, category_id, code, name, description, specimen_type, unit, reference_range, results_template_code, turnaround_hours, price, requires_fasting, sort_order, is_active",
    )
    .order("sort_order", { ascending: true, nullsFirst: false })
    .order("name", { ascending: true });

  if (categoryId != null) q = q.eq("category_id", categoryId);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const rawTests = (data ?? []) as Record<string, unknown>[];
  const tests: LabTestCatalogItem[] = rawTests.map((raw) => ({
    id: String(raw.id ?? ""),
    category_id: raw.category_id as number | string,
    code: String(raw.code ?? ""),
    name: String(raw.name ?? ""),
    description: (raw.description as string | null) ?? null,
    specimen_type: (raw.specimen_type as string | null) ?? null,
    unit: (raw.unit as string | null) ?? null,
    reference_range: (raw.reference_range as string | null) ?? null,
    results_template_code: (raw.results_template_code as string | null) ?? null,
    turnaround_hours: (() => {
      if (raw.turnaround_hours == null || raw.turnaround_hours === "") return null;
      const n = Number(raw.turnaround_hours);
      return Number.isFinite(n) ? Math.trunc(n) : null;
    })(),
    price: (raw.price as string | number | null) ?? null,
    requires_fasting: (raw.requires_fasting as boolean | null) ?? null,
    sort_order:
      raw.sort_order == null || raw.sort_order === ""
        ? null
        : Number(raw.sort_order),
    is_active: (raw.is_active as boolean | null) ?? null,
  }));

  return NextResponse.json({ tests });
}

export async function POST(req: Request) {
  const { db, res } = adminOr500();
  if (!db || res) return res!;

  const body = (await req.json().catch(() => null)) as {
    category_id?: number | string;
    code?: string;
    name?: string;
    description?: string | null;
    specimen_type?: string | null;
    unit?: string | null;
    reference_range?: string | null;
    results_template_code?: string | null;
    turnaround_hours?: number | null;
    price?: number | string | null;
    requires_fasting?: boolean | null;
    sort_order?: number | null;
    is_active?: boolean;
  } | null;

  const catRaw = body?.category_id;
  const category_id =
    typeof catRaw === "number" ? Math.trunc(catRaw) : Number.parseInt(String(catRaw ?? ""), 10);
  if (!Number.isFinite(category_id) || category_id <= 0) {
    return NextResponse.json({ error: "category_id must be a positive integer." }, { status: 400 });
  }

  const code = body?.code?.trim();
  const name = body?.name?.trim();
  if (!code || !name) {
    return NextResponse.json({ error: "code and name are required." }, { status: 400 });
  }

  const { data: catRow, error: catErr } = await db
    .from(LAB_CATEGORIES_TABLE)
    .select("id")
    .eq("id", category_id)
    .maybeSingle();
  if (catErr) return NextResponse.json({ error: catErr.message }, { status: 400 });
  if (!catRow) return NextResponse.json({ error: "category_id does not exist." }, { status: 400 });

  const description =
    body?.description === undefined || body?.description === null
      ? null
      : String(body.description).trim() || null;
  const specimen_type =
    body?.specimen_type === undefined || body?.specimen_type === null
      ? null
      : String(body.specimen_type).trim() || null;
  const unit =
    body?.unit === undefined || body?.unit === null ? null : String(body.unit).trim() || null;
  const reference_range =
    body?.reference_range === undefined || body?.reference_range === null
      ? null
      : String(body.reference_range).trim() || null;
  const results_template_code =
    body?.results_template_code === undefined || body?.results_template_code === null
      ? null
      : String(body.results_template_code).trim() || null;

  let turnaround_hours: number | null = null;
  if (body?.turnaround_hours != null && body.turnaround_hours !== ("" as unknown)) {
    const th = Number(body.turnaround_hours);
    turnaround_hours = Number.isFinite(th) ? Math.trunc(th) : null;
  }

  let price: number | string | null = null;
  if (body?.price != null && body.price !== ("" as unknown)) {
    if (typeof body.price === "number" && Number.isFinite(body.price)) price = body.price;
    else {
      const p = Number(String(body.price));
      price = Number.isFinite(p) ? p : null;
    }
  }

  const requires_fasting = body?.requires_fasting === true;
  const sort_order =
    body?.sort_order == null || body.sort_order === ("" as unknown)
      ? null
      : Number(body.sort_order);
  const is_active = body?.is_active !== false;

  const insertRow: Record<string, unknown> = {
    category_id,
    code,
    name,
    description,
    specimen_type,
    unit,
    reference_range,
    results_template_code,
    turnaround_hours,
    price,
    requires_fasting,
    sort_order: Number.isFinite(sort_order as number) ? sort_order : null,
    is_active,
  };

  const { data, error } = await db
    .from(LAB_TESTS_TABLE)
    .insert(insertRow)
    .select(
      "id, category_id, code, name, description, specimen_type, unit, reference_range, results_template_code, turnaround_hours, price, requires_fasting, sort_order, is_active",
    )
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const raw = data as Record<string, unknown>;
  const test: LabTestCatalogItem = {
    id: String(raw.id ?? ""),
    category_id: raw.category_id as number | string,
    code: String(raw.code ?? ""),
    name: String(raw.name ?? ""),
    description: (raw.description as string | null) ?? null,
    specimen_type: (raw.specimen_type as string | null) ?? null,
    unit: (raw.unit as string | null) ?? null,
    reference_range: (raw.reference_range as string | null) ?? null,
    results_template_code: (raw.results_template_code as string | null) ?? null,
    turnaround_hours: (() => {
      if (raw.turnaround_hours == null || raw.turnaround_hours === "") return null;
      const n = Number(raw.turnaround_hours);
      return Number.isFinite(n) ? Math.trunc(n) : null;
    })(),
    price: (raw.price as string | number | null) ?? null,
    requires_fasting: (raw.requires_fasting as boolean | null) ?? null,
    sort_order:
      raw.sort_order == null || raw.sort_order === ""
        ? null
        : Number(raw.sort_order),
    is_active: (raw.is_active as boolean | null) ?? null,
  };

  return NextResponse.json({ test });
}
