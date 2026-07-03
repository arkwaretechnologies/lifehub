import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchImagingRequestItemsForRequestIds } from "@/lib/imagingRequests";

export const IMAGING_RADIOLOGIST_ASSIGNMENTS_TABLE = "imaging_radiologist_assignments" as const;

export type ImagingRadiologistAssignmentRow = {
  id: string;
  imaging_request_id: string;
  imaging_request_item_id: string;
  radiologist_user_id: number;
  assigned_by_user_id: number | null;
  assigned_at: string;
  updated_at: string;
};

export type RadiologyAssignmentStudyRow = {
  imaging_request_item_id: string;
  imaging_request_id: string;
  study_name: string;
  view_text: string | null;
  item_status: string;
  request_date: string;
  request_time: string | null;
  request_status: string;
  radiologist_user_id: number | null;
  radiologist_name: string | null;
};

export type RadiologyAssignmentPatientRow = {
  patient_id: number;
  patient_name: string;
  study_count: number;
  latest_request_date: string;
  studies: RadiologyAssignmentStudyRow[];
};

export type RadiologyAssignmentListRow = {
  imaging_request_id: string;
  patient_id: number | null;
  patient_name: string | null;
  request_date: string;
  request_time: string | null;
  status: string;
  priority: string;
  study_count: number;
  radiologist_user_id: number | null;
  radiologist_name: string | null;
};

export type RadiologyPatientSummaryRow = {
  patient_id: number;
  patient_name: string;
  contact_no: string | null;
  assigned_request_count: number;
  latest_request_date: string;
  /** Populated when admin filter is "all". */
  radiologist_names?: string | null;
};

export type RadiologyPatientRequestRow = {
  imaging_request_id: string;
  request_date: string;
  request_time: string | null;
  status: string;
  priority: string;
  study_count: number;
  is_assigned_to_filter: boolean;
  radiologist_name?: string | null;
  encounter_id: string | null;
  chief_complaint: string | null;
  history_of_present_illness: string | null;
};

function localDateYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parsePositiveInt(raw: string | number | null | undefined, fallback: number): number {
  const n = typeof raw === "number" ? raw : Number.parseInt(String(raw ?? ""), 10);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return n;
}

function paginateSummaryRows(
  rows: RadiologyPatientSummaryRow[],
  opts?: { page?: number; pageSize?: number },
): { rows: RadiologyPatientSummaryRow[]; total: number } {
  const page = parsePositiveInt(opts?.page, 0);
  const pageSize = Math.min(100, Math.max(1, parsePositiveInt(opts?.pageSize, 20)));
  const total = rows.length;
  const from = page * pageSize;
  return { rows: rows.slice(from, from + pageSize), total };
}

export async function upsertRadiologistAssignment(
  admin: SupabaseClient,
  input: {
    imagingRequestItemId: string;
    radiologistUserId: number;
    assignedByUserId: number;
  },
): Promise<{ error: string | null }> {
  const imagingRequestItemId = input.imagingRequestItemId.trim();
  if (!imagingRequestItemId) return { error: "imagingRequestItemId is required." };

  const { data: item, error: itemErr } = await admin
    .from("imaging_request_items")
    .select("id, imaging_request_id")
    .eq("id", imagingRequestItemId)
    .maybeSingle();
  if (itemErr) return { error: itemErr.message };
  if (!item) return { error: "Imaging study not found." };

  const imagingRequestId = String((item as { imaging_request_id?: string }).imaging_request_id ?? "").trim();
  if (!imagingRequestId) return { error: "Invalid imaging study." };

  const now = new Date().toISOString();
  const { error } = await admin.from(IMAGING_RADIOLOGIST_ASSIGNMENTS_TABLE).upsert(
    {
      imaging_request_item_id: imagingRequestItemId,
      imaging_request_id: imagingRequestId,
      radiologist_user_id: input.radiologistUserId,
      assigned_by_user_id: input.assignedByUserId,
      assigned_at: now,
      updated_at: now,
    },
    { onConflict: "imaging_request_item_id" },
  );

  return { error: error?.message ?? null };
}

export async function clearRadiologistAssignment(
  admin: SupabaseClient,
  imagingRequestItemId: string,
): Promise<{ error: string | null }> {
  const id = imagingRequestItemId.trim();
  if (!id) return { error: "imagingRequestItemId is required." };

  const { error } = await admin
    .from(IMAGING_RADIOLOGIST_ASSIGNMENTS_TABLE)
    .delete()
    .eq("imaging_request_item_id", id);
  return { error: error?.message ?? null };
}

async function loadStudyCountsByRequestId(
  admin: SupabaseClient,
  requestIds: string[],
): Promise<Map<string, number>> {
  const ids = [...new Set(requestIds.map((x) => x.trim()).filter(Boolean))];
  const counts = new Map<string, number>();
  if (ids.length === 0) return counts;

  const { data, error } = await admin
    .from("imaging_request_items")
    .select("imaging_request_id")
    .in("imaging_request_id", ids);

  if (error) return counts;

  for (const row of (data ?? []) as Array<{ imaging_request_id: string }>) {
    const rid = String(row.imaging_request_id ?? "").trim();
    if (!rid) continue;
    counts.set(rid, (counts.get(rid) ?? 0) + 1);
  }
  return counts;
}

async function loadAssignmentsByItemIds(
  admin: SupabaseClient,
  itemIds: string[],
): Promise<Map<string, { radiologist_user_id: number; radiologist_name: string | null }>> {
  const ids = [...new Set(itemIds.map((x) => x.trim()).filter(Boolean))];
  const map = new Map<string, { radiologist_user_id: number; radiologist_name: string | null }>();
  if (ids.length === 0) return map;

  const { data, error } = await admin
    .from(IMAGING_RADIOLOGIST_ASSIGNMENTS_TABLE)
    .select("imaging_request_item_id, radiologist_user_id")
    .in("imaging_request_item_id", ids);

  if (error) return map;

  const userIds = [
    ...new Set(
      ((data ?? []) as Array<{ radiologist_user_id: number }>)
        .map((r) => r.radiologist_user_id)
        .filter((id) => Number.isFinite(id)),
    ),
  ];

  const nameByUserId = new Map<number, string>();
  if (userIds.length > 0) {
    const { data: users } = await admin.from("users").select("user_id, fullname").in("user_id", userIds);
    for (const u of (users ?? []) as Array<{ user_id: number; fullname: string }>) {
      nameByUserId.set(u.user_id, String(u.fullname ?? "").trim() || `User ${u.user_id}`);
    }
  }

  for (const row of (data ?? []) as Array<{ imaging_request_item_id: string; radiologist_user_id: number }>) {
    const itemId = String(row.imaging_request_item_id ?? "").trim();
    if (!itemId) continue;
    map.set(itemId, {
      radiologist_user_id: row.radiologist_user_id,
      radiologist_name: nameByUserId.get(row.radiologist_user_id) ?? null,
    });
  }
  return map;
}

export async function listAssignmentPatientsGrouped(
  admin: SupabaseClient,
  opts: {
    date?: string | null;
    scope?: "today" | "all";
    page?: number;
    pageSize?: number;
  },
): Promise<{ rows: RadiologyAssignmentPatientRow[]; total: number; error: string | null }> {
  const scope = opts.scope === "all" ? "all" : "today";
  const page = parsePositiveInt(opts.page, 0);
  const pageSize = Math.min(100, Math.max(1, parsePositiveInt(opts.pageSize, 20)));

  let query = admin
    .from("imaging_requests")
    .select("id, patient_id, request_date, request_time, status, priority")
    .order("request_date", { ascending: false })
    .order("request_time", { ascending: false });

  if (scope === "today") {
    const date = (opts.date ?? localDateYmd(new Date())).trim();
    query = query.eq("request_date", date);
  }

  const { data, error } = await query;
  if (error) return { rows: [], total: 0, error: error.message };

  const requests = (data ?? []) as Array<{
    id: string;
    patient_id: number | null;
    request_date: string;
    request_time: string | null;
    status: string;
    priority: string;
  }>;

  const requestById = new Map(requests.map((r) => [r.id, r]));
  const byPatient = new Map<
    number,
    { requestIds: Set<string>; latest_date: string }
  >();

  for (const r of requests) {
    const pid = r.patient_id;
    if (pid == null || !Number.isFinite(pid)) continue;
    const existing = byPatient.get(pid);
    if (!existing) {
      byPatient.set(pid, { requestIds: new Set([r.id]), latest_date: r.request_date });
    } else {
      existing.requestIds.add(r.id);
      if (r.request_date > existing.latest_date) existing.latest_date = r.request_date;
    }
  }

  const patientIds = [...byPatient.entries()]
    .sort((a, b) => b[1].latest_date.localeCompare(a[1].latest_date) || a[0] - b[0])
    .map(([pid]) => pid);

  const total = patientIds.length;
  const pagePatientIds = patientIds.slice(page * pageSize, page * pageSize + pageSize);
  if (pagePatientIds.length === 0) return { rows: [], total, error: null };

  const pageRequestIds = [
    ...new Set(
      pagePatientIds.flatMap((pid) => [...(byPatient.get(pid)?.requestIds ?? [])]),
    ),
  ];

  const { data: pats } = await admin.from("patients").select("id, name").in("id", pagePatientIds);
  const nameByPatientId = new Map<number, string>();
  for (const p of (pats ?? []) as Array<{ id: number; name: string }>) {
    nameByPatientId.set(p.id, String(p.name ?? "").trim());
  }

  const { rows: items, error: itemsErr } = await fetchImagingRequestItemsForRequestIds(admin, pageRequestIds);
  if (itemsErr) return { rows: [], total: 0, error: itemsErr };

  const assignments = await loadAssignmentsByItemIds(
    admin,
    items.map((it) => it.id),
  );

  const rows: RadiologyAssignmentPatientRow[] = pagePatientIds.map((pid) => {
    const meta = byPatient.get(pid)!;
    const patientStudies = items
      .filter((it) => meta.requestIds.has(it.imaging_request_id))
      .map((it) => {
        const req = requestById.get(it.imaging_request_id);
        const assign = assignments.get(it.id);
        return {
          imaging_request_item_id: it.id,
          imaging_request_id: it.imaging_request_id,
          study_name: it.study_name,
          view_text: it.view_text,
          item_status: it.status,
          request_date: req?.request_date ?? "",
          request_time: req?.request_time ?? null,
          request_status: req?.status ?? "",
          radiologist_user_id: assign?.radiologist_user_id ?? null,
          radiologist_name: assign?.radiologist_name ?? null,
        };
      })
      .sort(
        (a, b) =>
          b.request_date.localeCompare(a.request_date) ||
          String(b.request_time ?? "").localeCompare(String(a.request_time ?? "")) ||
          a.study_name.localeCompare(b.study_name),
      );

    return {
      patient_id: pid,
      patient_name: nameByPatientId.get(pid) ?? `Patient ${pid}`,
      study_count: patientStudies.length,
      latest_request_date: meta.latest_date,
      studies: patientStudies,
    };
  });

  return { rows, total, error: null };
}

async function loadAssignmentsByRequestIds(
  admin: SupabaseClient,
  requestIds: string[],
): Promise<Map<string, { radiologist_user_id: number; radiologist_name: string | null }>> {
  const ids = [...new Set(requestIds.map((x) => x.trim()).filter(Boolean))];
  const map = new Map<string, { radiologist_user_id: number; radiologist_name: string | null }>();
  if (ids.length === 0) return map;

  const { data, error } = await admin
    .from(IMAGING_RADIOLOGIST_ASSIGNMENTS_TABLE)
    .select("imaging_request_id, radiologist_user_id")
    .in("imaging_request_id", ids);

  if (error) return map;

  const userIds = [
    ...new Set(
      ((data ?? []) as Array<{ radiologist_user_id: number }>)
        .map((r) => r.radiologist_user_id)
        .filter((id) => Number.isFinite(id)),
    ),
  ];

  const nameByUserId = new Map<number, string>();
  if (userIds.length > 0) {
    const { data: users } = await admin.from("users").select("user_id, fullname").in("user_id", userIds);
    for (const u of (users ?? []) as Array<{ user_id: number; fullname: string }>) {
      nameByUserId.set(u.user_id, String(u.fullname ?? "").trim() || `User ${u.user_id}`);
    }
  }

  for (const row of (data ?? []) as Array<{ imaging_request_id: string; radiologist_user_id: number }>) {
    const rid = String(row.imaging_request_id ?? "").trim();
    if (!rid) continue;
    map.set(rid, {
      radiologist_user_id: row.radiologist_user_id,
      radiologist_name: nameByUserId.get(row.radiologist_user_id) ?? null,
    });
  }
  return map;
}

export async function listImagingRequestsForAssignment(
  admin: SupabaseClient,
  opts: {
    date?: string | null;
    scope?: "today" | "all";
    page?: number;
    pageSize?: number;
  },
): Promise<{ rows: RadiologyAssignmentListRow[]; total: number; error: string | null }> {
  const scope = opts.scope === "all" ? "all" : "today";
  const page = parsePositiveInt(opts.page, 0);
  const pageSize = Math.min(100, Math.max(1, parsePositiveInt(opts.pageSize, 20)));
  const from = page * pageSize;
  const to = from + pageSize - 1;

  let query = admin
    .from("imaging_requests")
    .select("id, patient_id, request_date, request_time, status, priority", { count: "exact" })
    .order("request_date", { ascending: false })
    .order("request_time", { ascending: false });

  if (scope === "today") {
    const date = (opts.date ?? localDateYmd(new Date())).trim();
    query = query.eq("request_date", date);
  }

  const { data, error, count } = await query.range(from, to);
  if (error) return { rows: [], total: 0, error: error.message };

  const requests = (data ?? []) as Array<{
    id: string;
    patient_id: number | null;
    request_date: string;
    request_time: string | null;
    status: string;
    priority: string;
  }>;

  const requestIds = requests.map((r) => r.id);
  const patientIds = [
    ...new Set(requests.map((r) => r.patient_id).filter((id): id is number => id != null && Number.isFinite(id))),
  ];

  const nameByPatientId = new Map<number, string>();
  if (patientIds.length > 0) {
    const { data: pats } = await admin.from("patients").select("id, name").in("id", patientIds);
    for (const p of (pats ?? []) as Array<{ id: number; name: string }>) {
      nameByPatientId.set(p.id, String(p.name ?? "").trim());
    }
  }

  const studyCounts = await loadStudyCountsByRequestId(admin, requestIds);
  const assignments = await loadAssignmentsByRequestIds(admin, requestIds);

  const rows: RadiologyAssignmentListRow[] = requests.map((r) => {
    const assign = assignments.get(r.id);
    return {
      imaging_request_id: r.id,
      patient_id: r.patient_id,
      patient_name: r.patient_id != null ? (nameByPatientId.get(r.patient_id) ?? null) : null,
      request_date: r.request_date,
      request_time: r.request_time,
      status: r.status,
      priority: r.priority,
      study_count: studyCounts.get(r.id) ?? 0,
      radiologist_user_id: assign?.radiologist_user_id ?? null,
      radiologist_name: assign?.radiologist_name ?? null,
    };
  });

  return { rows, total: count ?? rows.length, error: null };
}

export async function listRadiologyPatientsForRadiologist(
  admin: SupabaseClient,
  radiologistUserId: number,
  opts?: { date?: string | null; page?: number; pageSize?: number },
): Promise<{ rows: RadiologyPatientSummaryRow[]; total: number; totalStudies: number; error: string | null }> {
  const filterDate = (opts?.date ?? "").trim() || null;
  const { data: assignments, error: aErr } = await admin
    .from(IMAGING_RADIOLOGIST_ASSIGNMENTS_TABLE)
    .select("imaging_request_item_id, imaging_request_id")
    .eq("radiologist_user_id", radiologistUserId);

  if (aErr) return { rows: [], total: 0, totalStudies: 0, error: aErr.message };

  const assignmentRows = (assignments ?? []) as Array<{
    imaging_request_item_id: string;
    imaging_request_id: string;
  }>;
  if (assignmentRows.length === 0) return { rows: [], total: 0, totalStudies: 0, error: null };

  const requestIds = [...new Set(assignmentRows.map((a) => String(a.imaging_request_id ?? "").trim()).filter(Boolean))];

  const { data: requests, error: rErr } = await admin
    .from("imaging_requests")
    .select("id, patient_id, request_date")
    .in("id", requestIds);

  if (rErr) return { rows: [], total: 0, totalStudies: 0, error: rErr.message };

  const requestById = new Map<string, { patient_id: number | null; request_date: string }>();
  for (const req of (requests ?? []) as Array<{ id: string; patient_id: number | null; request_date: string }>) {
    requestById.set(req.id, { patient_id: req.patient_id, request_date: req.request_date });
  }

  const byPatient = new Map<number, { count: number; latest_date: string }>();

  for (const a of assignmentRows) {
    const req = requestById.get(String(a.imaging_request_id ?? "").trim());
    if (!req) continue;
    if (filterDate && req.request_date !== filterDate) continue;
    const pid = req.patient_id;
    if (pid == null || !Number.isFinite(pid)) continue;
    const existing = byPatient.get(pid);
    if (!existing) {
      byPatient.set(pid, { count: 1, latest_date: req.request_date });
    } else {
      existing.count += 1;
      if (req.request_date > existing.latest_date) existing.latest_date = req.request_date;
    }
  }

  const patientIds = [...byPatient.keys()];
  if (patientIds.length === 0) return { rows: [], total: 0, totalStudies: 0, error: null };

  const { data: pats, error: pErr } = await admin
    .from("patients")
    .select("id, name, contact_no")
    .in("id", patientIds);

  if (pErr) return { rows: [], total: 0, totalStudies: 0, error: pErr.message };

  const patById = new Map<number, { name: string; contact_no: string | null }>();
  for (const p of (pats ?? []) as Array<{ id: number; name: string; contact_no: string | null }>) {
    patById.set(p.id, { name: String(p.name ?? "").trim(), contact_no: p.contact_no });
  }

  const rows: RadiologyPatientSummaryRow[] = patientIds
    .map((pid) => {
      const agg = byPatient.get(pid)!;
      const pat = patById.get(pid);
      return {
        patient_id: pid,
        patient_name: pat?.name ?? `Patient ${pid}`,
        contact_no: pat?.contact_no ?? null,
        assigned_request_count: agg.count,
        latest_request_date: agg.latest_date,
      };
    })
    .sort((a, b) => b.latest_request_date.localeCompare(a.latest_request_date) || a.patient_name.localeCompare(b.patient_name));

  const totalStudies = rows.reduce((sum, r) => sum + (r.assigned_request_count ?? 0), 0);
  const paged = paginateSummaryRows(rows, opts);
  return { rows: paged.rows, total: paged.total, totalStudies, error: null };
}

export async function getAllAssignedRequestIds(
  admin: SupabaseClient,
): Promise<{ ids: Set<string>; error: string | null }> {
  const { data, error } = await admin.from(IMAGING_RADIOLOGIST_ASSIGNMENTS_TABLE).select("imaging_request_id");

  if (error) return { ids: new Set(), error: error.message };

  const ids = new Set(
    ((data ?? []) as Array<{ imaging_request_id: string }>)
      .map((r) => String(r.imaging_request_id ?? "").trim())
      .filter(Boolean),
  );
  return { ids, error: null };
}

export async function loadAssignmentRadNamesByRequestId(
  admin: SupabaseClient,
  radiologistUserId?: number,
): Promise<Map<string, string>> {
  let query = admin
    .from(IMAGING_RADIOLOGIST_ASSIGNMENTS_TABLE)
    .select("imaging_request_id, radiologist_user_id");
  if (radiologistUserId != null) {
    query = query.eq("radiologist_user_id", radiologistUserId);
  }

  const { data, error } = await query;
  const map = new Map<string, string>();
  if (error) return map;

  const userIds = [
    ...new Set(
      ((data ?? []) as Array<{ radiologist_user_id: number }>)
        .map((r) => r.radiologist_user_id)
        .filter((id) => Number.isFinite(id)),
    ),
  ];

  const nameByUserId = new Map<number, string>();
  if (userIds.length > 0) {
    const { data: users } = await admin.from("users").select("user_id, fullname").in("user_id", userIds);
    for (const u of (users ?? []) as Array<{ user_id: number; fullname: string }>) {
      nameByUserId.set(u.user_id, String(u.fullname ?? "").trim() || `User ${u.user_id}`);
    }
  }

  for (const row of (data ?? []) as Array<{ imaging_request_id: string; radiologist_user_id: number }>) {
    const rid = String(row.imaging_request_id ?? "").trim();
    if (!rid) continue;
    const name = nameByUserId.get(row.radiologist_user_id) ?? `User ${row.radiologist_user_id}`;
    const prev = map.get(rid);
    map.set(rid, prev && prev !== name ? `${prev}, ${name}` : name);
  }
  return map;
}

export async function listRadiologyPatientsForAllRadiologists(
  admin: SupabaseClient,
  opts?: { date?: string | null; page?: number; pageSize?: number },
): Promise<{ rows: RadiologyPatientSummaryRow[]; total: number; totalStudies: number; error: string | null }> {
  const filterDate = (opts?.date ?? "").trim() || null;
  const { data: assignments, error: aErr } = await admin
    .from(IMAGING_RADIOLOGIST_ASSIGNMENTS_TABLE)
    .select("imaging_request_id, radiologist_user_id");

  if (aErr) return { rows: [], total: 0, totalStudies: 0, error: aErr.message };

  const assignmentRows = (assignments ?? []) as Array<{
    imaging_request_id: string;
    radiologist_user_id: number;
  }>;
  if (assignmentRows.length === 0) return { rows: [], total: 0, totalStudies: 0, error: null };

  const requestIds = [...new Set(assignmentRows.map((a) => String(a.imaging_request_id ?? "").trim()).filter(Boolean))];

  const radNameByRequestId = await loadAssignmentRadNamesByRequestId(admin);

  const { data: requests, error: rErr } = await admin
    .from("imaging_requests")
    .select("id, patient_id, request_date")
    .in("id", requestIds);

  if (rErr) return { rows: [], total: 0, totalStudies: 0, error: rErr.message };

  const requestById = new Map<string, { patient_id: number | null; request_date: string }>();
  for (const req of (requests ?? []) as Array<{ id: string; patient_id: number | null; request_date: string }>) {
    requestById.set(req.id, { patient_id: req.patient_id, request_date: req.request_date });
  }

  const byPatient = new Map<
    number,
    { count: number; latest_date: string; radiologistNames: Set<string> }
  >();

  for (const a of assignmentRows) {
    const rid = String(a.imaging_request_id ?? "").trim();
    const req = requestById.get(rid);
    if (!req) continue;
    if (filterDate && req.request_date !== filterDate) continue;
    const pid = req.patient_id;
    if (pid == null || !Number.isFinite(pid)) continue;

    const radName = radNameByRequestId.get(rid) ?? "";
    const existing = byPatient.get(pid);
    if (!existing) {
      byPatient.set(pid, {
        count: 1,
        latest_date: req.request_date,
        radiologistNames: new Set(radName ? [radName] : []),
      });
    } else {
      existing.count += 1;
      if (req.request_date > existing.latest_date) existing.latest_date = req.request_date;
      if (radName) existing.radiologistNames.add(radName);
    }
  }

  const patientIds = [...byPatient.keys()];
  if (patientIds.length === 0) return { rows: [], total: 0, totalStudies: 0, error: null };

  const { data: pats, error: pErr } = await admin
    .from("patients")
    .select("id, name, contact_no")
    .in("id", patientIds);

  if (pErr) return { rows: [], total: 0, totalStudies: 0, error: pErr.message };

  const patById = new Map<number, { name: string; contact_no: string | null }>();
  for (const p of (pats ?? []) as Array<{ id: number; name: string; contact_no: string | null }>) {
    patById.set(p.id, { name: String(p.name ?? "").trim(), contact_no: p.contact_no });
  }

  const rows: RadiologyPatientSummaryRow[] = patientIds
    .map((pid) => {
      const agg = byPatient.get(pid)!;
      const pat = patById.get(pid);
      const names = [...agg.radiologistNames].sort((a, b) => a.localeCompare(b));
      return {
        patient_id: pid,
        patient_name: pat?.name ?? `Patient ${pid}`,
        contact_no: pat?.contact_no ?? null,
        assigned_request_count: agg.count,
        latest_request_date: agg.latest_date,
        radiologist_names: names.length > 0 ? names.join(", ") : null,
      };
    })
    .sort(
      (a, b) =>
        b.latest_request_date.localeCompare(a.latest_request_date) || a.patient_name.localeCompare(b.patient_name),
    );

  const totalStudies = rows.reduce((sum, r) => sum + (r.assigned_request_count ?? 0), 0);
  const paged = paginateSummaryRows(rows, opts);
  return { rows: paged.rows, total: paged.total, totalStudies, error: null };
}

async function loadAssignedItemCountsByRequestId(
  admin: SupabaseClient,
  requestIds: string[],
  assignedItemIds: Set<string>,
): Promise<Map<string, number>> {
  const ids = [...new Set(requestIds.map((x) => x.trim()).filter(Boolean))];
  const counts = new Map<string, number>();
  if (ids.length === 0 || assignedItemIds.size === 0) return counts;

  const { data, error } = await admin
    .from("imaging_request_items")
    .select("id, imaging_request_id")
    .in("imaging_request_id", ids);

  if (error) return counts;

  for (const row of (data ?? []) as Array<{ id: string; imaging_request_id: string }>) {
    const itemId = String(row.id ?? "").trim();
    const reqId = String(row.imaging_request_id ?? "").trim();
    if (!itemId || !reqId || !assignedItemIds.has(itemId)) continue;
    counts.set(reqId, (counts.get(reqId) ?? 0) + 1);
  }
  return counts;
}

export async function listAllImagingRequestsForPatient(
  admin: SupabaseClient,
  patientId: number,
  assignedItemIds: Set<string>,
  radNameByRequestId?: Map<string, string>,
  opts?: { date?: string | null },
): Promise<{ rows: RadiologyPatientRequestRow[]; error: string | null }> {
  const filterDate = (opts?.date ?? "").trim() || null;

  let query = admin
    .from("imaging_requests")
    .select("id, encounter_id, request_date, request_time, status, priority")
    .eq("patient_id", patientId)
    .order("request_date", { ascending: false })
    .order("request_time", { ascending: false });

  if (filterDate) {
    query = query.eq("request_date", filterDate);
  }

  const { data, error } = await query;

  if (error) return { rows: [], error: error.message };

  const requests = (data ?? []) as Array<{
    id: string;
    encounter_id: string | null;
    request_date: string;
    request_time: string | null;
    status: string;
    priority: string;
  }>;

  const encounterIds = [
    ...new Set(
      requests
        .map((r) => String(r.encounter_id ?? "").trim())
        .filter(Boolean),
    ),
  ];

  const encounterClinicalById = new Map<
    string,
    { chief_complaint: string | null; history_of_present_illness: string | null }
  >();

  if (encounterIds.length > 0) {
    const { data: encRows, error: encErr } = await admin
      .from("encounters")
      .select("trans_id, chief_complaint, history_of_present_illness")
      .in("trans_id", encounterIds);
    if (encErr) return { rows: [], error: encErr.message };

    for (const raw of encRows ?? []) {
      const row = raw as {
        trans_id?: string | null;
        chief_complaint?: string | null;
        history_of_present_illness?: string | null;
      };
      const transId = String(row.trans_id ?? "").trim();
      if (!transId) continue;
      const cc = row.chief_complaint != null ? String(row.chief_complaint).trim() : "";
      const hpi =
        row.history_of_present_illness != null ? String(row.history_of_present_illness).trim() : "";
      encounterClinicalById.set(transId, {
        chief_complaint: cc || null,
        history_of_present_illness: hpi || null,
      });
    }
  }

  const assignedCounts = await loadAssignedItemCountsByRequestId(
    admin,
    requests.map((r) => r.id),
    assignedItemIds,
  );

  const rows: RadiologyPatientRequestRow[] = requests
    .filter((r) => (assignedCounts.get(r.id) ?? 0) > 0)
    .map((r) => {
      const encounterId = String(r.encounter_id ?? "").trim() || null;
      const clinical = encounterId ? encounterClinicalById.get(encounterId) : undefined;
      return {
        imaging_request_id: r.id,
        request_date: r.request_date,
        request_time: r.request_time,
        status: r.status,
        priority: r.priority,
        study_count: assignedCounts.get(r.id) ?? 0,
        is_assigned_to_filter: true,
        radiologist_name: radNameByRequestId?.get(r.id) ?? null,
        encounter_id: encounterId,
        chief_complaint: clinical?.chief_complaint ?? null,
        history_of_present_illness: clinical?.history_of_present_illness ?? null,
      };
    });

  return { rows, error: null };
}

export async function getAssignedRequestIdsForRadiologist(
  admin: SupabaseClient,
  radiologistUserId: number,
): Promise<{ ids: Set<string>; error: string | null }> {
  const { data, error } = await admin
    .from(IMAGING_RADIOLOGIST_ASSIGNMENTS_TABLE)
    .select("imaging_request_id")
    .eq("radiologist_user_id", radiologistUserId);

  if (error) return { ids: new Set(), error: error.message };

  const ids = new Set(
    ((data ?? []) as Array<{ imaging_request_id: string }>)
      .map((r) => String(r.imaging_request_id ?? "").trim())
      .filter(Boolean),
  );
  return { ids, error: null };
}

export async function getAssignedItemIdsForRadiologist(
  admin: SupabaseClient,
  radiologistUserId: number,
): Promise<{ ids: Set<string>; error: string | null }> {
  const { data, error } = await admin
    .from(IMAGING_RADIOLOGIST_ASSIGNMENTS_TABLE)
    .select("imaging_request_item_id")
    .eq("radiologist_user_id", radiologistUserId);

  if (error) return { ids: new Set(), error: error.message };

  const ids = new Set(
    ((data ?? []) as Array<{ imaging_request_item_id: string }>)
      .map((r) => String(r.imaging_request_item_id ?? "").trim())
      .filter(Boolean),
  );
  return { ids, error: null };
}

export async function getAllAssignedItemIds(
  admin: SupabaseClient,
): Promise<{ ids: Set<string>; error: string | null }> {
  const { data, error } = await admin.from(IMAGING_RADIOLOGIST_ASSIGNMENTS_TABLE).select("imaging_request_item_id");

  if (error) return { ids: new Set(), error: error.message };

  const ids = new Set(
    ((data ?? []) as Array<{ imaging_request_item_id: string }>)
      .map((r) => String(r.imaging_request_item_id ?? "").trim())
      .filter(Boolean),
  );
  return { ids, error: null };
}

export async function fetchRadiologyPatientRequestDetail(
  admin: SupabaseClient,
  imagingRequestId: string,
): Promise<{
  request: {
    id: string;
    patient_id: number | null;
    request_date: string;
    request_time: string | null;
    status: string;
    priority: string;
  } | null;
  items: Awaited<ReturnType<typeof fetchImagingRequestItemsForRequestIds>>["rows"];
  patient_name: string | null;
  error: string | null;
}> {
  const id = imagingRequestId.trim();
  if (!id) return { request: null, items: [], patient_name: null, error: "imagingRequestId is required." };

  const { data: header, error: hErr } = await admin
    .from("imaging_requests")
    .select("id, patient_id, request_date, request_time, status, priority")
    .eq("id", id)
    .maybeSingle();

  if (hErr) return { request: null, items: [], patient_name: null, error: hErr.message };
  if (!header) return { request: null, items: [], patient_name: null, error: "Imaging request not found." };

  const { rows: items, error: iErr } = await fetchImagingRequestItemsForRequestIds(admin, [id]);
  if (iErr) return { request: null, items: [], patient_name: null, error: iErr };

  let patient_name: string | null = null;
  const pid = (header as { patient_id?: number | null }).patient_id;
  if (pid != null && Number.isFinite(pid)) {
    const { data: pat } = await admin.from("patients").select("name").eq("id", pid).maybeSingle();
    patient_name = (pat as { name?: string } | null)?.name ?? null;
  }

  return {
    request: header as {
      id: string;
      patient_id: number | null;
      request_date: string;
      request_time: string | null;
      status: string;
      priority: string;
    },
    items,
    patient_name,
    error: null,
  };
}
