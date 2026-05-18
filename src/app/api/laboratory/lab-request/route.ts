import { NextResponse } from "next/server";
import type { LabPackageDetail } from "@/lib/labPackages";
import {
  attachLabRequestSummariesPackagesForDb,
  fetchLabRequestItemsForRequestIds,
  loadLabTestCatalogForTestIds,
  type EncounterLabRequestSummary,
} from "@/lib/labRequests";
import type { LabResultPrintPosition } from "@/lib/labResultsPrintLayout";
import { parseResultsPrintLayouts } from "@/lib/labResultsPrintLayout";
import {
  filterLabRequestItemsForResultEntry,
  isAllowedLabResultsTemplateCode,
  labResultsTemplateCodeFromCatalogTestCode,
} from "@/lib/labTests";
import { queueAdminClient } from "@/lib/receptionQueueServer";

type LabRequestHeader = {
  id: string;
  encounter_id: string | null;
  patient_id: number | null;
  request_date: string;
  request_time: string | null;
  priority: string;
  clinical_diagnosis: string | null;
  remarks: string | null;
  created_at: string;
  referring_physician: string | null;
  physician_id: number | null;
};

function parseYmdParts(s: string): { y: number; m: number; d: number } | null {
  const t = s.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return null;
  const [ys, ms, ds] = t.split("-");
  const y = Number(ys);
  const m = Number(ms);
  const d = Number(ds);
  if (!Number.isFinite(y) || m < 1 || m > 12 || d < 1 || d > 31) return null;
  return { y, m, d };
}

/** Whole years from DOB to reference date (lab request date), both yyyy-mm-dd. */
function ageYearsAt(dobYmd: string | null | undefined, refYmd: string): number | null {
  const db = parseYmdParts(String(dobYmd ?? ""));
  const rb = parseYmdParts(refYmd);
  if (!db || !rb) return null;
  let age = rb.y - db.y;
  if (rb.m < db.m || (rb.m === db.m && rb.d < db.d)) age -= 1;
  return age >= 0 && age < 150 ? age : null;
}

async function resolveRequestingPhysicianLabel(
  admin: ReturnType<typeof queueAdminClient>,
  referring: string | null,
  physicianId: number | null,
): Promise<string | null> {
  if (!admin) return null;
  const ref = (referring ?? "").trim();
  if (ref && !/^\d+$/.test(ref)) return ref;

  const uid =
    physicianId != null && Number.isFinite(physicianId)
      ? Math.trunc(physicianId)
      : ref !== "" && /^\d+$/.test(ref)
        ? Number(ref)
        : null;
  if (uid != null && uid > 0) {
    const { data: uRow, error: uErr } = await admin.from("users").select("fullname").eq("user_id", uid).maybeSingle();
    if (!uErr) {
      const fn = String((uRow as { fullname?: string | null } | null)?.fullname ?? "").trim();
      if (fn) return fn;
    }
  }
  return ref || null;
}

/** Zip DB template CSV + layout json; filter allowlisted codes; catalog fallback when DB yields none. */
function resolvePrintTemplatesForTest(
  fromDb: string | null | undefined,
  catalogTestCode: string | null | undefined,
  rawLayout: unknown | null,
): { results_template_code: string | null; results_print_layouts: (LabResultPrintPosition | null)[] } {
  const rawParts = String(fromDb ?? "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter((s) => s !== "");
  const slots = parseResultsPrintLayouts(rawLayout ?? null);
  const pairs = rawParts.map((code, i) => ({
    code,
    layout: i < slots.length ? slots[i] : null,
  }));
  const filtered = pairs.filter((p) => isAllowedLabResultsTemplateCode(p.code));
  if (filtered.length > 0) {
    return {
      results_template_code: filtered.map((p) => p.code).join(","),
      results_print_layouts: filtered.map((p) => p.layout),
    };
  }
  const cat = labResultsTemplateCodeFromCatalogTestCode(catalogTestCode);
  const c = (cat ?? "").trim().toUpperCase();
  if (c && isAllowedLabResultsTemplateCode(c)) {
    const first = slots.length > 0 ? slots[0] : null;
    return {
      results_template_code: c,
      results_print_layouts: [first],
    };
  }
  return { results_template_code: null, results_print_layouts: [] };
}

/** Full header returned by GET (includes resolved patient label + LAB queue ticket if any). */
export type LabRequestHeaderView = LabRequestHeader & {
  patient_name: string | null;
  queue_display: string | null;
  lab_packages: LabPackageDetail[];
  package_covered_test_ids: string[];
  /** yyyy-mm-dd from `patients.date_of_birth`. */
  patient_date_of_birth: string | null;
  patient_sex: string | null;
  patient_age_years: number | null;
  patient_address: string | null;
  patient_contact_no: string | null;
  patient_philhealth_no: string | null;
  /** Resolved display name for the requesting / attending physician. */
  requesting_physician: string | null;
  /** Latest `lab_results.updated_at` for any item on this request (ISO). */
  results_released_at: string | null;
};

export type LabRequestItemView = {
  id: string;
  lab_test_id: string;
  /** Stable catalog code from `lab_tests.code` (e.g. HEMA_HGB, CHEM_FBS). */
  test_code?: string | null;
  /** Comma-separated allowlisted stems: `LIFEHUB-MEDICAL-Results-<code>.pdf` under `templates/Lab Results/`. */
  results_template_code?: string | null;
  /** Parallel to comma-separated `results_template_code` (index = template slot). */
  results_print_layouts?: (LabResultPrintPosition | null)[] | null;
  test_name: string | null;
  category_id: string | null;
  category_name: string | null;
  category_sort_order: number | null;
  specimen_type: string | null;
  priority: string | null;
  notes: string | null;
  collected_item?: string | null;
  // lab_results (optional; present when available)
  result_value?: string | null;
  result_unit?: string | null;
  reference_range?: string | null;
  flag?: string | null;
  remarks?: string | null;
  result_status?: string | null;
};

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("labRequestId")?.trim() ?? "";
  if (!id) {
    return NextResponse.json({ error: "labRequestId is required." }, { status: 400 });
  }

  const admin = queueAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." }, { status: 500 });
  }

  const { data: header, error: hErr } = await admin
    .from("lab_requests")
    .select(
      "id, encounter_id, patient_id, request_date, request_time, priority, clinical_diagnosis, remarks, created_at, referring_physician, physician_id",
    )
    .eq("id", id)
    .maybeSingle();

  if (hErr) return NextResponse.json({ error: hErr.message }, { status: 500 });
  if (!header) return NextResponse.json({ error: "Lab request not found." }, { status: 404 });

  const baseHeader = header as LabRequestHeader;

  const pkgSeed: EncounterLabRequestSummary = {
    id: baseHeader.id,
    request_date: baseHeader.request_date,
    request_time: baseHeader.request_time,
    priority: baseHeader.priority,
    clinical_diagnosis: baseHeader.clinical_diagnosis,
    remarks: baseHeader.remarks,
    created_at: baseHeader.created_at,
    labTestIds: [],
    lab_packages: [],
    package_covered_test_ids: [],
  };
  const [pkgRow] = await attachLabRequestSummariesPackagesForDb(admin, [pkgSeed]);
  const lab_packages = pkgRow?.lab_packages ?? [];
  const package_covered_test_ids = pkgRow?.package_covered_test_ids ?? [];
  let patient_name: string | null = null;
  let patient_date_of_birth: string | null = null;
  let patient_sex: string | null = null;
  let patient_address: string | null = null;
  let patient_contact_no: string | null = null;
  let patient_philhealth_no: string | null = null;
  if (baseHeader.patient_id != null) {
    const { data: pat, error: pErr } = await admin
      .from("patients")
      .select("name, date_of_birth, sex, address, contact_no, philhealth_no")
      .eq("id", baseHeader.patient_id)
      .maybeSingle();
    if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });
    const prow = pat as {
      name?: string | null;
      date_of_birth?: string | null;
      sex?: string | null;
      address?: string | null;
      contact_no?: string | null;
      philhealth_no?: number | null;
    } | null;
    const rawName = prow?.name ?? null;
    patient_name =
      rawName != null && String(rawName).trim() !== ""
        ? String(rawName).trim()
        : null;
    patient_date_of_birth =
      prow?.date_of_birth != null && String(prow.date_of_birth).trim() !== ""
        ? String(prow.date_of_birth).trim().slice(0, 10)
        : null;
    patient_sex =
      prow?.sex != null && String(prow.sex).trim() !== "" ? String(prow.sex).trim().toUpperCase() : null;
    patient_address =
      prow?.address != null && String(prow.address).trim() !== "" ? String(prow.address).trim() : null;
    patient_contact_no =
      prow?.contact_no != null && String(prow.contact_no).trim() !== ""
        ? String(prow.contact_no).trim()
        : null;
    patient_philhealth_no =
      prow?.philhealth_no != null && Number.isFinite(Number(prow.philhealth_no))
        ? String(prow.philhealth_no)
        : null;
  }

  const patient_age_years = ageYearsAt(patient_date_of_birth, baseHeader.request_date);

  const requesting_physician = await resolveRequestingPhysicianLabel(
    admin,
    baseHeader.referring_physician,
    baseHeader.physician_id,
  );

  const { data: qtRow, error: qtErr } = await admin
    .from("queue_tickets")
    .select("queue_display")
    .eq("lab_request_id", id)
    .order("issued_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (qtErr) return NextResponse.json({ error: qtErr.message }, { status: 500 });
  const queue_display = ((qtRow as { queue_display?: string | null } | null)?.queue_display ?? null)?.trim() || null;

  const storedItems = await fetchLabRequestItemsForRequestIds(admin, [id]);
  if (storedItems.error) return NextResponse.json({ error: storedItems.error }, { status: 500 });

  const allItems = storedItems.items;

  const allTestIds = [...new Set(allItems.map((r) => r.lab_test_id).filter(Boolean))];
  const catRes = await loadLabTestCatalogForTestIds(admin, allTestIds);
  if (catRes.error) return NextResponse.json({ error: catRes.error }, { status: 500 });
  const itemRows = filterLabRequestItemsForResultEntry(allItems, catRes.catalog);

  // Load existing lab results keyed by item id (1 row per item).
  const itemIds = itemRows.map((r) => r.id).filter(Boolean);
  const resultsByItemId = new Map<
    string,
    {
      result_value: string | null;
      result_unit: string | null;
      reference_range: string | null;
      flag: string | null;
      remarks: string | null;
      status: string | null;
    }
  >();
  let results_released_at: string | null = null;
  if (itemIds.length > 0) {
    const { data: rRows, error: rErr } = await admin
      .from("lab_results")
      .select("lab_request_item_id, result_value, result_unit, reference_range, flag, remarks, status, updated_at")
      .in("lab_request_item_id", itemIds);
    if (rErr) return NextResponse.json({ error: rErr.message }, { status: 500 });
    for (const r of (rRows ?? []) as Array<{
      lab_request_item_id: string;
      result_value: string | null;
      result_unit: string | null;
      reference_range: string | null;
      flag: string | null;
      remarks: string | null;
      status: string | null;
      updated_at: string | null;
    }>) {
      resultsByItemId.set(r.lab_request_item_id, {
        result_value: r.result_value,
        result_unit: r.result_unit,
        reference_range: r.reference_range,
        flag: r.flag,
        remarks: r.remarks,
        status: r.status,
      });
      const u = r.updated_at != null ? String(r.updated_at).trim() : "";
      if (u) {
        if (!results_released_at || u > results_released_at) results_released_at = u;
      }
    }
  }

  const testIds = [...new Set(itemRows.map((r) => r.lab_test_id).filter(Boolean))];
  const testsById = new Map<
    string,
    {
      code: string | null;
      results_template_code: string | null;
      results_print_layout: unknown | null;
      name: string | null;
      category_id: string | null;
      specimen_type: string | null;
      unit: string | null;
      reference_range: string | null;
    }
  >();
  const categoriesById = new Map<string, { name: string; sort_order: number | null }>();
  if (testIds.length > 0) {
    const { data: tests, error: tErr } = await admin
      .from("lab_tests")
      .select("id, code, category_id, results_template_code, results_print_layout, name, specimen_type, unit, reference_range")
      .in("id", testIds);
    if (tErr) return NextResponse.json({ error: tErr.message }, { status: 500 });
    const catIds = new Set<string>();
    for (const t of (tests ?? []) as Array<{
      id: string;
      code: string | null;
      category_id: string | number | null;
      results_template_code: string | null;
      results_print_layout: unknown | null;
      name: string | null;
      specimen_type: string | null;
      unit: string | null;
      reference_range: string | null;
    }>) {
      const category_id = t.category_id == null ? null : String(t.category_id);
      if (category_id) catIds.add(category_id);
      testsById.set(t.id, {
        code: t.code,
        results_template_code: t.results_template_code,
        results_print_layout: t.results_print_layout,
        name: t.name,
        category_id,
        specimen_type: t.specimen_type,
        unit: t.unit,
        reference_range: t.reference_range,
      });
    }
    if (catIds.size > 0) {
      const { data: cats, error: cErr } = await admin
        .from("lab_categories")
        .select("id, name, sort_order")
        .in("id", [...catIds]);
      if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 });
      for (const c of (cats ?? []) as Array<{ id: string | number; name: string; sort_order: number | null }>) {
        categoriesById.set(String(c.id), {
          name: String(c.name ?? ""),
          sort_order: c.sort_order == null ? null : Number(c.sort_order),
        });
      }
    }
  }

  const outItems: LabRequestItemView[] = itemRows.map((r) => {
    const t = testsById.get(r.lab_test_id);
    const rr = resultsByItemId.get(r.id) ?? null;
    const { results_template_code, results_print_layouts } = resolvePrintTemplatesForTest(
      t?.results_template_code,
      t?.code ?? null,
      t?.results_print_layout ?? null,
    );
    return {
      id: r.id,
      lab_test_id: r.lab_test_id,
      test_code: t?.code ?? null,
      results_template_code,
      results_print_layouts,
      test_name: t?.name ?? null,
      category_id: t?.category_id ?? null,
      category_name: (() => {
        const cid = t?.category_id ?? null;
        if (!cid) return null;
        return categoriesById.get(cid)?.name ?? null;
      })(),
      category_sort_order: (() => {
        const cid = t?.category_id ?? null;
        if (!cid) return null;
        return categoriesById.get(cid)?.sort_order ?? null;
      })(),
      specimen_type: t?.specimen_type ?? null,
      priority: r.priority,
      notes: r.notes,
      collected_item: r.collected_item ?? null,
      result_value: rr?.result_value ?? null,
      result_unit: rr?.result_unit ?? t?.unit ?? null,
      reference_range: rr?.reference_range ?? t?.reference_range ?? null,
      flag: rr?.flag ?? null,
      remarks: rr?.remarks ?? null,
      result_status: rr?.status ?? null,
    };
  });

  outItems.sort((a, b) => {
    const sa = a.category_sort_order ?? 9999;
    const sb = b.category_sort_order ?? 9999;
    if (sa !== sb) return sa - sb;
    const ca = (a.category_name ?? "").localeCompare(b.category_name ?? "", undefined, { sensitivity: "base" });
    if (ca !== 0) return ca;
    return (a.test_name ?? a.lab_test_id).localeCompare(b.test_name ?? b.lab_test_id, undefined, {
      sensitivity: "base",
    });
  });

  const headerOut: LabRequestHeaderView = {
    ...baseHeader,
    patient_name,
    queue_display,
    lab_packages,
    package_covered_test_ids,
    patient_date_of_birth,
    patient_sex,
    patient_age_years,
    patient_address,
    patient_contact_no,
    patient_philhealth_no,
    requesting_physician,
    results_released_at,
  };

  return NextResponse.json({
    header: headerOut,
    items: outItems,
  });
}

