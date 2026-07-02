import type { SupabaseClient } from "@supabase/supabase-js";
import { LAB_SALES_TABLE } from "@/lib/cashierPayments";
import { LAB_REQUEST_ITEMS_TABLE } from "@/lib/labRequests";
import { PHYSICIAN_FEE_SALES_TABLE, PHYSICIAN_FEE_STATUS_PAID } from "@/lib/physicianFeeSales";
import { DEFAULT_REPORT_PAGE_SIZE, parseDateRange, parseReportPagination } from "@/lib/posReports";
import {
  fetchAllByInChunks,
  fetchAllByInChunksOnce,
  fetchAllPaged,
  fetchPatientsByIds,
  fetchPaymentMethodsByIds,
  fetchUsersByIds,
} from "@/lib/supabasePagedFetch";

type LabRequestItemRow = { lab_test_id: string; lab_request_id: string };
type LabRequestItemWithIdRow = { id: string; lab_request_id: string };
type LabRequestRow = { id: string; request_date: string; request_time: string | null };
type LabRequestDetailRow = {
  id: string;
  request_date: string;
  patient_id: number | null;
  priority: string | null;
};

async function fetchLabRequestIdsInDateRange(
  db: SupabaseClient,
  range: ConsultationLabDateRange,
): Promise<{ ids: string[]; error: string | null }> {
  const res = await fetchAllPaged<{ id: string }>((from, to) =>
    db
      .from("lab_requests")
      .select("id")
      .gte("request_date", range.startDate)
      .lte("request_date", range.endDate)
      .range(from, to),
  );
  if (res.error) return { ids: [], error: res.error };
  return { ids: res.rows.map((r) => r.id), error: null };
}

async function fetchLabRequestsInDateRange(
  db: SupabaseClient,
  range: ConsultationLabDateRange,
): Promise<{ rows: LabRequestRow[]; error: string | null }> {
  return fetchAllPaged<LabRequestRow>((from, to) =>
    db
      .from("lab_requests")
      .select("id, request_date, request_time")
      .gte("request_date", range.startDate)
      .lte("request_date", range.endDate)
      .range(from, to),
  );
}

async function fetchLabRequestDetailsInDateRange(
  db: SupabaseClient,
  range: ConsultationLabDateRange,
): Promise<{ rows: LabRequestDetailRow[]; error: string | null }> {
  return fetchAllPaged<LabRequestDetailRow>((from, to) =>
    db
      .from("lab_requests")
      .select("id, request_date, patient_id, priority")
      .gte("request_date", range.startDate)
      .lte("request_date", range.endDate)
      .range(from, to),
  );
}

async function fetchLabRequestItemsForRequestIds(
  db: SupabaseClient,
  requestIds: string[],
): Promise<{ items: LabRequestItemRow[]; error: string | null }> {
  const res = await fetchAllByInChunks<LabRequestItemRow, string>(requestIds, (chunk, from, to) =>
    db
      .from(LAB_REQUEST_ITEMS_TABLE)
      .select("lab_test_id, lab_request_id")
      .in("lab_request_id", chunk)
      .range(from, to),
  );
  return { items: res.rows, error: res.error };
}

async function fetchLabRequestItemsWithIdsForRequestIds(
  db: SupabaseClient,
  requestIds: string[],
): Promise<{ items: LabRequestItemWithIdRow[]; error: string | null }> {
  const res = await fetchAllByInChunks<LabRequestItemWithIdRow, string>(requestIds, (chunk, from, to) =>
    db
      .from(LAB_REQUEST_ITEMS_TABLE)
      .select("id, lab_request_id")
      .in("lab_request_id", chunk)
      .range(from, to),
  );
  return { items: res.rows, error: res.error };
}

async function fetchLabResultsForItemIds(
  db: SupabaseClient,
  itemIds: string[],
): Promise<{
  rows: Array<{ lab_request_item_id: string; updated_at: string | null }>;
  error: string | null;
}> {
  return fetchAllByInChunks(itemIds, (chunk, from, to) =>
    db.from("lab_results").select("lab_request_item_id, updated_at").in("lab_request_item_id", chunk).range(from, to),
  );
}

async function fetchLabSalesLabRequestIds(
  db: SupabaseClient,
  requestIds: string[],
): Promise<{ rows: Array<{ lab_request_id: string | null }>; error: string | null }> {
  return fetchAllByInChunks(requestIds, (chunk, from, to) =>
    db.from(LAB_SALES_TABLE).select("lab_request_id").in("lab_request_id", chunk).range(from, to),
  );
}

async function fetchLabTestsByIds(
  db: SupabaseClient,
  testIds: string[],
): Promise<{
  rows: Array<{ id: string; name: string | null; category_id: string | number | null }>;
  error: string | null;
}> {
  return fetchAllByInChunksOnce(testIds, (chunk) =>
    db.from("lab_tests").select("id, name, category_id").in("id", chunk),
  );
}

async function fetchLabCategoriesByIds(
  db: SupabaseClient,
  categoryIds: string[],
): Promise<{ rows: Array<{ id: string | number; name: string | null }>; error: string | null }> {
  return fetchAllByInChunksOnce(categoryIds, (chunk) =>
    db.from("lab_categories").select("id, name").in("id", chunk),
  );
}

export type ConsultationLabDateRange = { startDate: string; endDate: string };

export type ConsultationLabPagination = {
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
};

export type PhysicianWorkloadRow = {
  physicianName: string;
  totalEncounters: number;
  completedEncounters: number;
  inProgressEncounters: number;
};

export type LabOrderVolumeTestRow = {
  testName: string;
  count: number;
};

export type LabOrderVolumeCategoryRow = {
  categoryName: string;
  count: number;
};

export type LabTurnaroundRow = {
  requestId: string;
  requestDate: string;
  releasedAt: string | null;
  turnaroundHours: number | null;
  status: "Released" | "Pending";
};

export type LabRevenuePaymentRow = {
  paymentMethod: string;
  amount: number;
  count: number;
};

export type OutstandingLabOrderRow = {
  requestId: string;
  requestDate: string;
  patientName: string;
  priority: string;
  status: "Unpaid" | "Paid";
};

export type OrRegisterRow = {
  date: string;
  orNumber: string;
  source: "Laboratory" | "Physician Fee";
  amount: number;
  status: string;
};

export type ConsultationLabReportPayload = Record<string, unknown> & {
  error: string | null;
  range: ConsultationLabDateRange;
  pagination: ConsultationLabPagination | null;
};

export function parseConsultationLabDateRange(
  startRaw: string | null | undefined,
  endRaw: string | null | undefined,
): ConsultationLabDateRange {
  return parseDateRange(startRaw, endRaw, 14);
}

function paginate<T>(
  rows: T[],
  pageRaw: string | null | undefined,
  pageSizeRaw: string | null | undefined,
): { rows: T[]; pagination: ConsultationLabPagination } {
  const { page, pageSize } = parseReportPagination(pageRaw, pageSizeRaw);
  const totalCount = rows.length;
  const totalPages = totalCount === 0 ? 0 : Math.ceil(totalCount / pageSize);
  const safePage = totalPages === 0 ? 0 : Math.min(page, totalPages - 1);
  const start = safePage * pageSize;
  return {
    rows: rows.slice(start, start + pageSize),
    pagination: {
      page: safePage,
      pageSize,
      totalCount,
      totalPages,
    },
  };
}

function toMoney(raw: unknown): number {
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

export async function fetchPhysicianWorkloadReport(
  range: ConsultationLabDateRange,
  db: SupabaseClient,
  pageRaw: string | null | undefined,
  pageSizeRaw: string | null | undefined,
): Promise<ConsultationLabReportPayload> {
  const encRes = await fetchAllPaged<{ physician_id: number | null; disposition: string | null }>((from, to) =>
    db
      .from("encounters")
      .select("physician_id, disposition")
      .gte("encounter_date", range.startDate)
      .lte("encounter_date", range.endDate)
      .range(from, to),
  );
  if (encRes.error) return { error: encRes.error, range, pagination: null, rows: [] };

  const rows = encRes.rows;
  const byPhys = new Map<number, { total: number; completed: number; inProgress: number }>();
  for (const row of rows) {
    if (row.physician_id == null) continue;
    const cur = byPhys.get(row.physician_id) ?? { total: 0, completed: 0, inProgress: 0 };
    cur.total += 1;
    if ((row.disposition ?? "").trim() === "") cur.inProgress += 1;
    else cur.completed += 1;
    byPhys.set(row.physician_id, cur);
  }

  const physIds = [...byPhys.keys()];
  let namesById = new Map<number, string>();
  if (physIds.length > 0) {
    const uRes = await fetchUsersByIds(db, physIds);
    if (!uRes.error) {
      namesById = new Map(
        uRes.rows.map((u) => [u.user_id, (u.fullname ?? "").trim() || `USER ${u.user_id}`]),
      );
    }
  }

  const ordered: PhysicianWorkloadRow[] = [...byPhys.entries()]
    .map(([uid, v]) => ({
      physicianName: namesById.get(uid) ?? `USER ${uid}`,
      totalEncounters: v.total,
      completedEncounters: v.completed,
      inProgressEncounters: v.inProgress,
    }))
    .sort((a, b) => b.totalEncounters - a.totalEncounters);

  const paged = paginate(ordered, pageRaw, pageSizeRaw);
  return {
    error: null,
    range,
    rows: paged.rows,
    totalEncounters: ordered.reduce((s, r) => s + r.totalEncounters, 0),
    pagination: paged.pagination,
  };
}

export async function fetchLabOrderVolumeReport(
  range: ConsultationLabDateRange,
  db: SupabaseClient,
): Promise<ConsultationLabReportPayload> {
  const reqRes = await fetchLabRequestIdsInDateRange(db, range);
  if (reqRes.error) return { error: reqRes.error, range, pagination: null };

  const reqIds = reqRes.ids;
  if (reqIds.length === 0) {
    return {
      error: null,
      range,
      totalRequests: 0,
      totalItems: 0,
      tests: [],
      categories: [],
      pagination: null,
    };
  }

  const itemsRes = await fetchLabRequestItemsForRequestIds(db, reqIds);
  if (itemsRes.error) return { error: itemsRes.error, range, pagination: null };

  const items = itemsRes.items;
  const testIds = [...new Set(items.map((i) => i.lab_test_id).filter(Boolean))];
  const testsRes = testIds.length > 0 ? await fetchLabTestsByIds(db, testIds) : { rows: [], error: null };
  if (testsRes.error) return { error: testsRes.error, range, pagination: null };

  const testRows = testsRes.rows;
  const categoryIds = [
    ...new Set(
      testRows
        .map((t) => (t.category_id != null ? String(t.category_id) : ""))
        .filter(Boolean),
    ),
  ];
  const catsRes =
    categoryIds.length > 0 ? await fetchLabCategoriesByIds(db, categoryIds) : { rows: [], error: null };
  if (catsRes.error) return { error: catsRes.error, range, pagination: null };

  const testById = new Map(testRows.map((t) => [t.id, t]));
  const catNameById = new Map(
    catsRes.rows.map((c) => [String(c.id), (c.name ?? "").trim() || "Uncategorized"]),
  );

  const testCount = new Map<string, number>();
  const categoryCount = new Map<string, number>();
  for (const it of items) {
    const t = testById.get(it.lab_test_id);
    const testName = (t?.name ?? "").trim() || it.lab_test_id;
    testCount.set(testName, (testCount.get(testName) ?? 0) + 1);
    const catId = t?.category_id != null ? String(t.category_id) : "";
    const catName = catNameById.get(catId) ?? "Uncategorized";
    categoryCount.set(catName, (categoryCount.get(catName) ?? 0) + 1);
  }

  const tests: LabOrderVolumeTestRow[] = [...testCount.entries()]
    .map(([testName, count]) => ({ testName, count }))
    .sort((a, b) => b.count - a.count);
  const categories: LabOrderVolumeCategoryRow[] = [...categoryCount.entries()]
    .map(([categoryName, count]) => ({ categoryName, count }))
    .sort((a, b) => b.count - a.count);

  return {
    error: null,
    range,
    totalRequests: reqIds.length,
    totalItems: items.length,
    tests,
    categories,
    pagination: null,
  };
}

export async function fetchLabTurnaroundTimeReport(
  range: ConsultationLabDateRange,
  db: SupabaseClient,
  pageRaw: string | null | undefined,
  pageSizeRaw: string | null | undefined,
): Promise<ConsultationLabReportPayload> {
  const reqRes = await fetchLabRequestsInDateRange(db, range);
  if (reqRes.error) return { error: reqRes.error, range, pagination: null, rows: [] };

  const requests = reqRes.rows;
  const requestIds = requests.map((r) => r.id);
  if (requestIds.length === 0) {
    return { error: null, range, rows: [], avgTurnaroundHours: null, releasedCount: 0, pendingCount: 0, pagination: null };
  }

  const itemsRes = await fetchLabRequestItemsWithIdsForRequestIds(db, requestIds);
  if (itemsRes.error) return { error: itemsRes.error, range, rows: [], pagination: null };
  const items = itemsRes.items;
  const itemIds = items.map((i) => i.id);

  const resultsRes = itemIds.length > 0 ? await fetchLabResultsForItemIds(db, itemIds) : { rows: [], error: null };
  if (resultsRes.error) return { error: resultsRes.error, range, rows: [], pagination: null };

  const requestIdByItemId = new Map(items.map((i) => [i.id, i.lab_request_id]));
  const releasedAtByRequestId = new Map<string, string>();
  for (const r of resultsRes.rows) {
    const reqId = requestIdByItemId.get(r.lab_request_item_id);
    const updated = (r.updated_at ?? "").trim();
    if (!reqId || !updated) continue;
    const prev = releasedAtByRequestId.get(reqId);
    if (!prev || updated > prev) releasedAtByRequestId.set(reqId, updated);
  }

  const rows: LabTurnaroundRow[] = requests
    .map((r) => {
      const reqIso = `${r.request_date}T${(r.request_time ?? "00:00:00").slice(0, 8)}`;
      const released = releasedAtByRequestId.get(r.id) ?? null;
      let turnaroundHours: number | null = null;
      if (released) {
        const ms = new Date(released).getTime() - new Date(reqIso).getTime();
        if (Number.isFinite(ms) && ms >= 0) turnaroundHours = Math.round((ms / 36e5) * 100) / 100;
      }
      return {
        requestId: r.id,
        requestDate: r.request_date,
        releasedAt: released,
        turnaroundHours,
        status: released ? ("Released" as const) : ("Pending" as const),
      };
    })
    .sort((a, b) => b.requestDate.localeCompare(a.requestDate));

  const releasedRows = rows.filter((r) => r.turnaroundHours != null);
  const avgTurnaroundHours =
    releasedRows.length > 0
      ? Math.round(
          (releasedRows.reduce((s, r) => s + (r.turnaroundHours ?? 0), 0) / releasedRows.length) * 100,
        ) / 100
      : null;

  const paged = paginate(rows, pageRaw, pageSizeRaw);
  return {
    error: null,
    range,
    rows: paged.rows,
    avgTurnaroundHours,
    releasedCount: releasedRows.length,
    pendingCount: rows.length - releasedRows.length,
    pagination: paged.pagination,
  };
}

export async function fetchLabRevenueReport(
  range: ConsultationLabDateRange,
  db: SupabaseClient,
): Promise<ConsultationLabReportPayload> {
  const salesRes = await fetchAllPaged<{ id: string; total_amount: unknown; payment_method_id: number | null }>(
    (from, to) =>
      db
        .from(LAB_SALES_TABLE)
        .select("id, total_amount, payment_method_id")
        .eq("status", "Completed")
        .gte("sale_date", range.startDate)
        .lte("sale_date", range.endDate)
        .range(from, to),
  );
  if (salesRes.error) return { error: salesRes.error, range, pagination: null };

  const sales = salesRes.rows;
  const paymentIds = [...new Set(sales.map((s) => s.payment_method_id).filter((id): id is number => id != null))];
  const methodsRes = paymentIds.length > 0 ? await fetchPaymentMethodsByIds(db, paymentIds) : { rows: [], error: null };
  if (methodsRes.error) return { error: methodsRes.error, range, pagination: null };

  const methodNameById = new Map(
    methodsRes.rows.map((m) => [m.id, (m.name ?? "").trim() || `Method ${m.id}`]),
  );

  let totalRevenue = 0;
  const byMethod = new Map<string, { amount: number; count: number }>();
  for (const s of sales) {
    const amount = toMoney(s.total_amount);
    totalRevenue += amount;
    const label = s.payment_method_id != null ? methodNameById.get(s.payment_method_id) ?? "Unknown" : "Unknown";
    const cur = byMethod.get(label) ?? { amount: 0, count: 0 };
    cur.amount += amount;
    cur.count += 1;
    byMethod.set(label, cur);
  }

  const paymentBreakdown: LabRevenuePaymentRow[] = [...byMethod.entries()]
    .map(([paymentMethod, v]) => ({
      paymentMethod,
      amount: Math.round(v.amount * 100) / 100,
      count: v.count,
    }))
    .sort((a, b) => b.amount - a.amount);

  return {
    error: null,
    range,
    totalRevenue: Math.round(totalRevenue * 100) / 100,
    saleCount: sales.length,
    paymentBreakdown,
    pagination: null,
  };
}

export async function fetchOutstandingLabOrdersReport(
  range: ConsultationLabDateRange,
  db: SupabaseClient,
  pageRaw: string | null | undefined,
  pageSizeRaw: string | null | undefined,
): Promise<ConsultationLabReportPayload> {
  const reqRes = await fetchLabRequestDetailsInDateRange(db, range);
  if (reqRes.error) return { error: reqRes.error, range, rows: [], pagination: null };

  const reqs = reqRes.rows;
  const reqIds = reqs.map((r) => r.id);
  const salesRes = reqIds.length > 0 ? await fetchLabSalesLabRequestIds(db, reqIds) : { rows: [], error: null };
  if (salesRes.error) return { error: salesRes.error, range, rows: [], pagination: null };
  const paidReqIdSet = new Set(
    salesRes.rows.map((r) => String(r.lab_request_id ?? "").trim()).filter(Boolean),
  );

  const patientIds = [...new Set(reqs.map((r) => r.patient_id).filter((id): id is number => id != null))];
  const patRes = patientIds.length > 0 ? await fetchPatientsByIds(db, patientIds) : { rows: [], error: null };
  if (patRes.error) return { error: patRes.error, range, rows: [], pagination: null };
  const patientNameById = new Map(
    patRes.rows.map((p) => [p.id, (p.name ?? "").trim() || `PATIENT ${p.id}`]),
  );

  const allRows: OutstandingLabOrderRow[] = reqs
    .map((r) => ({
      requestId: r.id,
      requestDate: r.request_date,
      patientName: r.patient_id != null ? patientNameById.get(r.patient_id) ?? `PATIENT ${r.patient_id}` : "—",
      priority: (r.priority ?? "").trim() || "Routine",
      status: paidReqIdSet.has(r.id) ? ("Paid" as const) : ("Unpaid" as const),
    }))
    .sort((a, b) => b.requestDate.localeCompare(a.requestDate));

  const paged = paginate(allRows, pageRaw, pageSizeRaw);
  return {
    error: null,
    range,
    rows: paged.rows,
    unpaidCount: allRows.filter((r) => r.status === "Unpaid").length,
    paidCount: allRows.filter((r) => r.status === "Paid").length,
    pagination: paged.pagination,
  };
}

export async function fetchOrRegisterReport(
  range: ConsultationLabDateRange,
  db: SupabaseClient,
  pageRaw: string | null | undefined,
  pageSizeRaw: string | null | undefined,
): Promise<ConsultationLabReportPayload> {
  const [labRes, phyRes] = await Promise.all([
    fetchAllPaged<{
      or_number: string | null;
      sale_date: string | null;
      total_amount: unknown;
      status: string | null;
    }>((from, to) =>
      db
        .from(LAB_SALES_TABLE)
        .select("or_number, sale_date, total_amount, status")
        .gte("sale_date", range.startDate)
        .lte("sale_date", range.endDate)
        .range(from, to),
    ),
    fetchAllPaged<{
      or_number: string | null;
      created_at: string | null;
      total_amount: unknown;
      status: string | null;
    }>((from, to) =>
      db
        .from(PHYSICIAN_FEE_SALES_TABLE)
        .select("or_number, created_at, total_amount, status")
        .gte("created_at", `${range.startDate}T00:00:00`)
        .lte("created_at", `${range.endDate}T23:59:59`)
        .range(from, to),
    ),
  ]);
  if (labRes.error) return { error: labRes.error, range, rows: [], pagination: null };
  if (phyRes.error) return { error: phyRes.error, range, rows: [], pagination: null };

  const rows: OrRegisterRow[] = [
    ...labRes.rows.map((r) => ({
      date: (r.sale_date ?? "").slice(0, 10),
      orNumber: (r.or_number ?? "").trim() || "—",
      source: "Laboratory" as const,
      amount: toMoney(r.total_amount),
      status: (r.status ?? "").trim() || "—",
    })),
    ...phyRes.rows.map((r) => ({
      date: (r.created_at ?? "").slice(0, 10),
      orNumber: (r.or_number ?? "").trim() || "—",
      source: "Physician Fee" as const,
      amount: toMoney(r.total_amount),
      status: (r.status ?? "").trim() || "—",
    })),
  ].sort((a, b) => {
    const dCmp = b.date.localeCompare(a.date);
    if (dCmp !== 0) return dCmp;
    return a.orNumber.localeCompare(b.orNumber);
  });

  const paged = paginate(rows, pageRaw, pageSizeRaw);
  return {
    error: null,
    range,
    rows: paged.rows,
    totalAmount: Math.round(rows.reduce((s, r) => s + r.amount, 0) * 100) / 100,
    paidCount: rows.filter((r) => r.status.trim().toLowerCase() === PHYSICIAN_FEE_STATUS_PAID.toLowerCase() || r.status.trim().toLowerCase() === "completed").length,
    pagination: paged.pagination,
  };
}

export { DEFAULT_REPORT_PAGE_SIZE };
