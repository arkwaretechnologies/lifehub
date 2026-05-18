import { NextResponse } from "next/server";
import { parseResultsPrintLayoutInput } from "@/lib/labResultsPrintLayout";
import {
  isAllowedLabResultsTemplateCode,
  LAB_CATEGORIES_TABLE,
  LAB_TEST_CATALOG_SELECT,
  LAB_TESTS_TABLE,
  mapLabTestCatalogItem,
  normalizeResultsTemplateCodeForStorage,
  validateLabTestOrderablePanel,
  type LabTestCatalogItem,
} from "@/lib/labTests";
import {
  applyServicePricesToCatalogItems,
  fetchLabServicePricesMapAdmin,
  parseLabTestPriceInput,
  syncLabTestServicePrice,
} from "@/lib/labServicePrices";
import { attachPanelLinksToCatalogItems, syncLabTestPanelLinks } from "@/lib/labTestPanelLinks";
import { supabaseAdminClient } from "@/lib/supabaseAdminClient";

async function loadPanelTargets(
  db: NonNullable<ReturnType<typeof supabaseAdminClient>>,
  panelIds: string[],
): Promise<{ targets: LabTestCatalogItem[]; error: string | null }> {
  const ids = [...new Set(panelIds.map((x) => String(x).trim()).filter(Boolean))];
  if (ids.length === 0) return { targets: [], error: null };
  const { data, error } = await db
    .from(LAB_TESTS_TABLE)
    .select(LAB_TEST_CATALOG_SELECT)
    .in("id", ids);
  if (error) return { targets: [], error: error.message };
  const targets = ((data ?? []) as Record<string, unknown>[]).map((raw) =>
    mapLabTestCatalogItem(raw),
  );
  return { targets, error: null };
}

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
    .select(LAB_TEST_CATALOG_SELECT)
    .order("sort_order", { ascending: true, nullsFirst: false })
    .order("name", { ascending: true });

  if (categoryId != null) q = q.eq("category_id", categoryId);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const rawTests = (data ?? []) as Record<string, unknown>[];
  let tests: LabTestCatalogItem[] = rawTests.map((raw) => mapLabTestCatalogItem(raw));

  const { pricesByTestId, error: priceErr } = await fetchLabServicePricesMapAdmin(
    db,
    tests.map((t) => t.id),
  );
  if (priceErr) return NextResponse.json({ error: priceErr }, { status: 400 });
  tests = applyServicePricesToCatalogItems(tests, pricesByTestId);

  const attached = await attachPanelLinksToCatalogItems(db, tests);
  if (attached.error) return NextResponse.json({ error: attached.error }, { status: 400 });
  tests = attached.tests;

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
    results_print_layout?: unknown | null;
    turnaround_hours?: number | null;
    price?: number | string | null;
    requires_fasting?: boolean | null;
    sort_order?: number | null;
    is_active?: boolean;
    is_orderable?: boolean;
    panel_lab_test_ids?: string[] | null;
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
  const results_template_code = normalizeResultsTemplateCodeForStorage(body?.results_template_code);
  if (results_template_code && !isAllowedLabResultsTemplateCode(results_template_code)) {
    return NextResponse.json({ error: "Unsupported results template code." }, { status: 400 });
  }

  const layoutParsed = parseResultsPrintLayoutInput(body?.results_print_layout ?? null);
  if (!layoutParsed.ok) {
    return NextResponse.json({ error: layoutParsed.error }, { status: 400 });
  }

  let turnaround_hours: number | null = null;
  if (body?.turnaround_hours != null && body.turnaround_hours !== ("" as unknown)) {
    const th = Number(body.turnaround_hours);
    turnaround_hours = Number.isFinite(th) ? Math.trunc(th) : null;
  }

  const priceParsed = parseLabTestPriceInput(body?.price);
  if (!priceParsed.ok) {
    return NextResponse.json({ error: priceParsed.error }, { status: 400 });
  }

  const requires_fasting = body?.requires_fasting === true;
  const sort_order =
    body?.sort_order == null || body.sort_order === ("" as unknown)
      ? null
      : Number(body.sort_order);
  const is_active = body?.is_active !== false;

  const panelIdsRaw = Array.isArray(body?.panel_lab_test_ids) ? body.panel_lab_test_ids : [];
  const { targets: panelTargets, error: panelLoadErr } = await loadPanelTargets(db, panelIdsRaw);
  if (panelLoadErr) return NextResponse.json({ error: panelLoadErr }, { status: 400 });

  const orderableCheck = validateLabTestOrderablePanel(
    {
      is_orderable: body?.is_orderable,
      panel_lab_test_ids: panelIdsRaw,
      category_id,
    },
    { panelTargets },
  );
  if (!orderableCheck.ok) {
    return NextResponse.json({ error: orderableCheck.error }, { status: 400 });
  }

  const insertRow: Record<string, unknown> = {
    category_id,
    code,
    name,
    description,
    specimen_type,
    unit,
    reference_range,
    results_template_code,
    results_print_layout: layoutParsed.value,
    turnaround_hours,
    requires_fasting,
    sort_order: Number.isFinite(sort_order as number) ? sort_order : null,
    is_active,
    is_orderable: orderableCheck.is_orderable,
  };

  const { data, error } = await db
    .from(LAB_TESTS_TABLE)
    .insert(insertRow)
    .select(LAB_TEST_CATALOG_SELECT)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const testId = String((data as Record<string, unknown>).id ?? "");
  const priceSync = await syncLabTestServicePrice(db, testId, priceParsed.value);
  if (priceSync.error) {
    return NextResponse.json({ error: priceSync.error }, { status: 400 });
  }

  const linkSync = await syncLabTestPanelLinks(db, testId, orderableCheck.panel_lab_test_ids);
  if (linkSync.error) {
    return NextResponse.json({ error: linkSync.error }, { status: 400 });
  }

  let test = mapLabTestCatalogItem(data as Record<string, unknown>);
  if (priceParsed.value != null) {
    test = { ...test, price: priceParsed.value };
  }
  test = {
    ...test,
    panel_lab_test_ids: orderableCheck.panel_lab_test_ids,
  };

  return NextResponse.json({ test });
}
