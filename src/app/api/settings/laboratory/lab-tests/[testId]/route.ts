import { NextResponse } from "next/server";
import { LAB_CATEGORIES_TABLE, LAB_TESTS_TABLE, type LabTestCatalogItem } from "@/lib/labTests";
import { LAB_PACKAGE_TESTS_TABLE } from "@/lib/labPackages";
import { LAB_SERVICE_PRICES_TABLE } from "@/lib/labServicePrices";
import { LAB_REQUEST_ITEMS_TABLE } from "@/lib/labRequests";
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

function mapTestRow(raw: Record<string, unknown>): LabTestCatalogItem {
  return {
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
}

export async function PATCH(
  req: Request,
  context: { params: Promise<{ testId: string }> },
) {
  const { db, res } = adminOr500();
  if (!db || res) return res!;

  const { testId: testIdParam } = await context.params;
  const testId = testIdParam?.trim() ?? "";
  if (!testId) {
    return NextResponse.json({ error: "Invalid test id." }, { status: 400 });
  }

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

  if (!body || Object.keys(body).length === 0) {
    return NextResponse.json({ error: "Provide at least one field to update." }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};

  if (body.category_id !== undefined) {
    const catRaw = body.category_id;
    const category_id =
      typeof catRaw === "number" ? Math.trunc(catRaw) : Number.parseInt(String(catRaw ?? ""), 10);
    if (!Number.isFinite(category_id) || category_id <= 0) {
      return NextResponse.json({ error: "category_id must be a positive integer." }, { status: 400 });
    }
    const { data: catRow, error: catErr } = await db
      .from(LAB_CATEGORIES_TABLE)
      .select("id")
      .eq("id", category_id)
      .maybeSingle();
    if (catErr) return NextResponse.json({ error: catErr.message }, { status: 400 });
    if (!catRow) return NextResponse.json({ error: "category_id does not exist." }, { status: 400 });
    patch.category_id = category_id;
  }

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
  if (body.specimen_type !== undefined) {
    patch.specimen_type =
      body.specimen_type === null ? null : String(body.specimen_type).trim() || null;
  }
  if (body.unit !== undefined) {
    patch.unit = body.unit === null ? null : String(body.unit).trim() || null;
  }
  if (body.reference_range !== undefined) {
    patch.reference_range =
      body.reference_range === null ? null : String(body.reference_range).trim() || null;
  }
  if (body.results_template_code !== undefined) {
    patch.results_template_code =
      body.results_template_code === null
        ? null
        : String(body.results_template_code).trim() || null;
  }
  if (body.turnaround_hours !== undefined) {
    if (body.turnaround_hours === null) patch.turnaround_hours = null;
    else {
      const th = Number(body.turnaround_hours);
      patch.turnaround_hours = Number.isFinite(th) ? Math.trunc(th) : null;
    }
  }
  if (body.price !== undefined) {
    if (body.price === null || body.price === ("" as unknown)) patch.price = null;
    else if (typeof body.price === "number" && Number.isFinite(body.price)) patch.price = body.price;
    else {
      const p = Number(String(body.price));
      patch.price = Number.isFinite(p) ? p : null;
    }
  }
  if (body.requires_fasting !== undefined) {
    patch.requires_fasting = body.requires_fasting === true;
  }
  if (body.sort_order !== undefined) {
    if (body.sort_order === null) patch.sort_order = null;
    else {
      const s = Number(body.sort_order);
      patch.sort_order = Number.isFinite(s) ? s : null;
    }
  }
  if (body.is_active !== undefined) patch.is_active = body.is_active !== false;

  const { data, error } = await db
    .from(LAB_TESTS_TABLE)
    .update(patch)
    .eq("id", testId)
    .select(
      "id, category_id, code, name, description, specimen_type, unit, reference_range, results_template_code, turnaround_hours, price, requires_fasting, sort_order, is_active",
    )
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!data) return NextResponse.json({ error: "Lab test not found." }, { status: 404 });

  return NextResponse.json({ test: mapTestRow(data as Record<string, unknown>) });
}

export async function DELETE(
  _req: Request,
  context: { params: Promise<{ testId: string }> },
) {
  const { db, res } = adminOr500();
  if (!db || res) return res!;

  const { testId: testIdParam } = await context.params;
  const testId = testIdParam?.trim() ?? "";
  if (!testId) {
    return NextResponse.json({ error: "Invalid test id." }, { status: 400 });
  }

  const { count: itemCount, error: iErr } = await db
    .from(LAB_REQUEST_ITEMS_TABLE)
    .select("id", { count: "exact", head: true })
    .eq("lab_test_id", testId);

  if (iErr) return NextResponse.json({ error: iErr.message }, { status: 400 });
  if ((itemCount ?? 0) > 0) {
    return NextResponse.json(
      {
        error:
          "Cannot delete a lab test that appears on existing lab requests. Deactivate it instead or archive data first.",
      },
      { status: 409 },
    );
  }

  const { error: pkgLinkErr } = await db.from(LAB_PACKAGE_TESTS_TABLE).delete().eq("lab_test_id", testId);
  if (pkgLinkErr) return NextResponse.json({ error: pkgLinkErr.message }, { status: 400 });

  const { error: priceErr } = await db.from(LAB_SERVICE_PRICES_TABLE).delete().eq("lab_test_id", testId);
  if (priceErr) return NextResponse.json({ error: priceErr.message }, { status: 400 });

  const { error } = await db.from(LAB_TESTS_TABLE).delete().eq("id", testId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
