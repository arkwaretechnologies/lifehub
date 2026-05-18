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
import { LAB_PACKAGE_TESTS_TABLE } from "@/lib/labPackages";
import {
  fetchLabServicePricesMapAdmin,
  LAB_SERVICE_PRICES_TABLE,
  parseLabTestPriceInput,
  syncLabTestServicePrice,
} from "@/lib/labServicePrices";
import { LAB_REQUEST_ITEMS_TABLE } from "@/lib/labRequests";
import {
  attachPanelLinksToCatalogItems,
  countComponentsForPanel,
  syncLabTestPanelLinks,
} from "@/lib/labTestPanelLinks";
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

function mapTestRow(raw: Record<string, unknown>): LabTestCatalogItem {
  return mapLabTestCatalogItem(raw);
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
    results_print_layout?: unknown | null;
    turnaround_hours?: number | null;
    price?: number | string | null;
    requires_fasting?: boolean | null;
    sort_order?: number | null;
    is_active?: boolean;
    is_orderable?: boolean;
    panel_lab_test_ids?: string[] | null;
  } | null;

  if (!body || Object.keys(body).length === 0) {
    return NextResponse.json({ error: "Provide at least one field to update." }, { status: 400 });
  }

  const { data: existingRow, error: existingErr } = await db
    .from(LAB_TESTS_TABLE)
    .select(LAB_TEST_CATALOG_SELECT)
    .eq("id", testId)
    .maybeSingle();
  if (existingErr) return NextResponse.json({ error: existingErr.message }, { status: 400 });
  if (!existingRow) return NextResponse.json({ error: "Lab test not found." }, { status: 404 });
  const existing = mapLabTestCatalogItem(existingRow as Record<string, unknown>);

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
    const tpl = normalizeResultsTemplateCodeForStorage(body.results_template_code);
    if (tpl && !isAllowedLabResultsTemplateCode(tpl)) {
      return NextResponse.json({ error: "Unsupported results template code." }, { status: 400 });
    }
    patch.results_template_code = tpl;
  }
  if (body.results_print_layout !== undefined) {
    const layoutParsed = parseResultsPrintLayoutInput(body.results_print_layout);
    if (!layoutParsed.ok) {
      return NextResponse.json({ error: layoutParsed.error }, { status: 400 });
    }
    patch.results_print_layout = layoutParsed.value;
  }
  if (body.turnaround_hours !== undefined) {
    if (body.turnaround_hours === null) patch.turnaround_hours = null;
    else {
      const th = Number(body.turnaround_hours);
      patch.turnaround_hours = Number.isFinite(th) ? Math.trunc(th) : null;
    }
  }
  let nextServicePrice: number | null | undefined;
  if (body.price !== undefined) {
    const priceParsed = parseLabTestPriceInput(body.price);
    if (!priceParsed.ok) {
      return NextResponse.json({ error: priceParsed.error }, { status: 400 });
    }
    nextServicePrice = priceParsed.value;
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

  let nextPanelIds: string[] | undefined;
  let orderableCheckResult: ReturnType<typeof validateLabTestOrderablePanel> | null = null;

  if (body.is_orderable !== undefined || body.panel_lab_test_ids !== undefined) {
    const nextCategoryId: number | string =
      patch.category_id !== undefined
        ? (patch.category_id as number | string)
        : existing.category_id;
    const nextIsOrderable =
      body.is_orderable !== undefined ? body.is_orderable !== false : existing.is_orderable !== false;

    const existingAttached = await attachPanelLinksToCatalogItems(db, [existing]);
    const existingPanelIds = existingAttached.tests[0]?.panel_lab_test_ids ?? [];

    nextPanelIds =
      body.panel_lab_test_ids !== undefined
        ? (Array.isArray(body.panel_lab_test_ids) ? body.panel_lab_test_ids : [])
        : existingPanelIds;

    const { targets: panelTargets, error: panelLoadErr } = await loadPanelTargets(db, nextPanelIds);
    if (panelLoadErr) return NextResponse.json({ error: panelLoadErr }, { status: 400 });

    const { count: componentCount, error: compErr } = await countComponentsForPanel(db, testId);
    if (compErr) return NextResponse.json({ error: compErr }, { status: 400 });

    const orderableCheck = validateLabTestOrderablePanel(
      {
        is_orderable: nextIsOrderable,
        panel_lab_test_ids: nextPanelIds,
        category_id: nextCategoryId,
      },
      { testId, panelTargets, componentCount },
    );
    if (!orderableCheck.ok) {
      return NextResponse.json({ error: orderableCheck.error }, { status: 400 });
    }
    orderableCheckResult = orderableCheck;
    patch.is_orderable = orderableCheck.is_orderable;
    nextPanelIds = orderableCheck.panel_lab_test_ids;
  }

  const hasLabTestPatch = Object.keys(patch).length > 0;
  let data: Record<string, unknown> | null = null;

  if (hasLabTestPatch) {
    const res = await db
      .from(LAB_TESTS_TABLE)
      .update(patch)
      .eq("id", testId)
      .select(LAB_TEST_CATALOG_SELECT)
      .maybeSingle();
    if (res.error) return NextResponse.json({ error: res.error.message }, { status: 400 });
    if (!res.data) return NextResponse.json({ error: "Lab test not found." }, { status: 404 });
    data = res.data as Record<string, unknown>;
  } else if (nextServicePrice === undefined && orderableCheckResult === null) {
    return NextResponse.json({ error: "Provide at least one field to update." }, { status: 400 });
  } else {
    const res = await db
      .from(LAB_TESTS_TABLE)
      .select(LAB_TEST_CATALOG_SELECT)
      .eq("id", testId)
      .maybeSingle();
    if (res.error) return NextResponse.json({ error: res.error.message }, { status: 400 });
    if (!res.data) return NextResponse.json({ error: "Lab test not found." }, { status: 404 });
    data = res.data as Record<string, unknown>;
  }

  if (nextServicePrice !== undefined) {
    const priceSync = await syncLabTestServicePrice(db, testId, nextServicePrice);
    if (priceSync.error) {
      return NextResponse.json({ error: priceSync.error }, { status: 400 });
    }
  }

  if (orderableCheckResult !== null) {
    const linkSync = await syncLabTestPanelLinks(db, testId, orderableCheckResult.panel_lab_test_ids);
    if (linkSync.error) {
      return NextResponse.json({ error: linkSync.error }, { status: 400 });
    }
  }

  let test = mapTestRow(data);
  if (nextServicePrice !== undefined) {
    test = { ...test, price: nextServicePrice };
  } else {
    const { pricesByTestId, error: priceLoadErr } = await fetchLabServicePricesMapAdmin(db, [testId]);
    if (priceLoadErr) return NextResponse.json({ error: priceLoadErr }, { status: 400 });
    const svc = pricesByTestId.get(testId);
    if (svc != null) test = { ...test, price: svc };
  }

  const attached = await attachPanelLinksToCatalogItems(db, [test]);
  if (attached.error) return NextResponse.json({ error: attached.error }, { status: 400 });
  test = attached.tests[0] ?? test;

  return NextResponse.json({ test });
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
