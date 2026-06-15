import type { SupabaseClient } from "@supabase/supabase-js";
import { isImagingItemInterpreted } from "@/lib/imagingQueueSync";
import { IMAGING_RADIOLOGIST_ASSIGNMENTS_TABLE } from "@/lib/radiologyAssignments";
import { parseDateRange, type DateRange } from "@/lib/posReports";

export type RadiologistInterpretationSummaryRow = {
  radiologistUserId: number;
  radiologistName: string;
  interpretedCount: number;
  notDoneCount: number;
  totalAssigned: number;
};

export type RadiologistInterpretationDetailRow = {
  patientName: string;
  patientId: number | null;
  studyName: string;
  viewText: string | null;
  requestDate: string;
  readingStatus: "Interpreted" | "Not done";
  interpretedAt: string | null;
};

type AssignmentRow = {
  imaging_request_item_id: string;
  radiologist_user_id: number;
};

type ItemRow = {
  id: string;
  imaging_request_id: string;
  study_name: string;
  view_text: string | null;
  status: string;
  performed_at: string | null;
  updated_at: string | null;
};

type RequestRow = {
  id: string;
  request_date: string;
  patient_id: number | null;
};

type EnrichedStudy = {
  itemId: string;
  radiologistUserId: number;
  studyName: string;
  viewText: string | null;
  status: string;
  requestDate: string;
  patientId: number | null;
  patientName: string;
  interpretedAt: string | null;
  interpretedDateYmd: string | null;
};

function dateYmdFromIso(iso: string | null | undefined): string | null {
  const raw = String(iso ?? "").trim();
  if (!raw) return null;
  const d = raw.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
}

function inDateRange(ymd: string | null, range: DateRange): boolean {
  if (!ymd) return false;
  return ymd >= range.startDate && ymd <= range.endDate;
}

export function parseRadiologyReportDateRange(
  startRaw: string | null | undefined,
  endRaw: string | null | undefined,
): DateRange {
  return parseDateRange(startRaw, endRaw, 1);
}

async function loadEnrichedStudies(
  admin: SupabaseClient,
): Promise<{ studies: EnrichedStudy[]; error: string | null }> {
  const { data: assignments, error: assignErr } = await admin
    .from(IMAGING_RADIOLOGIST_ASSIGNMENTS_TABLE)
    .select("imaging_request_item_id, radiologist_user_id");

  if (assignErr) return { studies: [], error: assignErr.message };

  const assignRows = (assignments ?? []) as AssignmentRow[];
  if (assignRows.length === 0) return { studies: [], error: null };

  const itemIds = [...new Set(assignRows.map((a) => String(a.imaging_request_item_id ?? "").trim()).filter(Boolean))];
  if (itemIds.length === 0) return { studies: [], error: null };

  const { data: items, error: itemErr } = await admin
    .from("imaging_request_items")
    .select("id, imaging_request_id, study_name, view_text, status, performed_at, updated_at")
    .in("id", itemIds);

  if (itemErr) return { studies: [], error: itemErr.message };

  const itemRows = (items ?? []) as ItemRow[];
  const itemById = new Map(itemRows.map((it) => [it.id, it]));

  const requestIds = [...new Set(itemRows.map((it) => String(it.imaging_request_id ?? "").trim()).filter(Boolean))];
  const requestById = new Map<string, RequestRow>();

  if (requestIds.length > 0) {
    const { data: requests, error: reqErr } = await admin
      .from("imaging_requests")
      .select("id, request_date, patient_id")
      .in("id", requestIds);
    if (reqErr) return { studies: [], error: reqErr.message };
    for (const r of (requests ?? []) as RequestRow[]) {
      requestById.set(r.id, r);
    }
  }

  const patientIds = [
    ...new Set(
      [...requestById.values()]
        .map((r) => r.patient_id)
        .filter((id): id is number => id != null && Number.isFinite(id)),
    ),
  ];
  const patientNameById = new Map<number, string>();

  if (patientIds.length > 0) {
    const { data: patients, error: patErr } = await admin.from("patients").select("id, name").in("id", patientIds);
    if (patErr) return { studies: [], error: patErr.message };
    for (const p of (patients ?? []) as Array<{ id: number; name: string }>) {
      patientNameById.set(p.id, String(p.name ?? "").trim() || `Patient ${p.id}`);
    }
  }

  const studies: EnrichedStudy[] = [];

  for (const assign of assignRows) {
    const itemId = String(assign.imaging_request_item_id ?? "").trim();
    const item = itemById.get(itemId);
    if (!item) continue;

    const req = requestById.get(String(item.imaging_request_id ?? "").trim());
    if (!req) continue;

    const interpreted = isImagingItemInterpreted(item.status);
    const interpretedAt = interpreted ? item.performed_at ?? item.updated_at : null;
    const interpretedDateYmd = interpreted ? dateYmdFromIso(interpretedAt) : null;
    const patientId = req.patient_id ?? null;

    studies.push({
      itemId,
      radiologistUserId: assign.radiologist_user_id,
      studyName: String(item.study_name ?? "").trim() || "—",
      viewText: item.view_text ?? null,
      status: String(item.status ?? "").trim(),
      requestDate: String(req.request_date ?? "").slice(0, 10),
      patientId,
      patientName: patientId != null ? (patientNameById.get(patientId) ?? `Patient ${patientId}`) : "—",
      interpretedAt,
      interpretedDateYmd,
    });
  }

  return { studies, error: null };
}

async function loadRadiologistNames(
  admin: SupabaseClient,
  userIds: number[],
): Promise<Map<number, string>> {
  const map = new Map<number, string>();
  if (userIds.length === 0) return map;

  const { data, error } = await admin.from("users").select("user_id, fullname").in("user_id", userIds);
  if (error) return map;

  for (const u of (data ?? []) as Array<{ user_id: number; fullname: string }>) {
    map.set(u.user_id, String(u.fullname ?? "").trim() || `User ${u.user_id}`);
  }
  return map;
}

function studyMatchesInterpreted(study: EnrichedStudy, range: DateRange): boolean {
  if (!isImagingItemInterpreted(study.status)) return false;
  return inDateRange(study.interpretedDateYmd, range);
}

function studyMatchesNotDone(study: EnrichedStudy, range: DateRange): boolean {
  if (isImagingItemInterpreted(study.status)) return false;
  return inDateRange(study.requestDate, range);
}

function studyInDetail(study: EnrichedStudy, range: DateRange): boolean {
  return studyMatchesInterpreted(study, range) || studyMatchesNotDone(study, range);
}

export async function fetchRadiologistInterpretationSummary(
  admin: SupabaseClient,
  range: DateRange,
): Promise<{ rows: RadiologistInterpretationSummaryRow[]; range: DateRange; error: string | null }> {
  const { studies, error } = await loadEnrichedStudies(admin);
  if (error) return { rows: [], range, error };

  const byRad = new Map<
    number,
    { interpretedCount: number; notDoneCount: number; itemIds: Set<string> }
  >();

  for (const study of studies) {
    let agg = byRad.get(study.radiologistUserId);
    if (!agg) {
      agg = { interpretedCount: 0, notDoneCount: 0, itemIds: new Set() };
      byRad.set(study.radiologistUserId, agg);
    }

    if (studyMatchesInterpreted(study, range)) {
      agg.interpretedCount += 1;
      agg.itemIds.add(study.itemId);
    }
    if (studyMatchesNotDone(study, range)) {
      agg.notDoneCount += 1;
      agg.itemIds.add(study.itemId);
    }
  }

  const radIds = [...byRad.keys()].filter((id) => {
    const agg = byRad.get(id)!;
    return agg.interpretedCount > 0 || agg.notDoneCount > 0;
  });

  const nameById = await loadRadiologistNames(admin, radIds);

  const rows: RadiologistInterpretationSummaryRow[] = radIds
    .map((radiologistUserId) => {
      const agg = byRad.get(radiologistUserId)!;
      return {
        radiologistUserId,
        radiologistName: nameById.get(radiologistUserId) ?? `User ${radiologistUserId}`,
        interpretedCount: agg.interpretedCount,
        notDoneCount: agg.notDoneCount,
        totalAssigned: agg.itemIds.size,
      };
    })
    .sort((a, b) => a.radiologistName.localeCompare(b.radiologistName));

  return { rows, range, error: null };
}

export async function fetchRadiologistInterpretationDetail(
  admin: SupabaseClient,
  range: DateRange,
  radiologistUserId: number,
): Promise<{
  rows: RadiologistInterpretationDetailRow[];
  radiologistName: string;
  range: DateRange;
  error: string | null;
}> {
  if (!Number.isFinite(radiologistUserId) || radiologistUserId <= 0) {
    return { rows: [], radiologistName: "", range, error: "Invalid radiologist." };
  }

  const { studies, error } = await loadEnrichedStudies(admin);
  if (error) return { rows: [], radiologistName: "", range, error };

  const nameById = await loadRadiologistNames(admin, [radiologistUserId]);
  const radiologistName = nameById.get(radiologistUserId) ?? `User ${radiologistUserId}`;

  const rows: RadiologistInterpretationDetailRow[] = studies
    .filter((s) => s.radiologistUserId === radiologistUserId && studyInDetail(s, range))
    .map((s): RadiologistInterpretationDetailRow => {
      const interpreted = studyMatchesInterpreted(s, range);
      return {
        patientName: s.patientName,
        patientId: s.patientId,
        studyName: s.studyName,
        viewText: s.viewText,
        requestDate: s.requestDate,
        readingStatus: interpreted ? "Interpreted" : "Not done",
        interpretedAt: interpreted ? s.interpretedAt : null,
      };
    })
    .sort((a, b) => {
      const dateCmp = a.requestDate.localeCompare(b.requestDate);
      if (dateCmp !== 0) return dateCmp;
      return a.patientName.localeCompare(b.patientName);
    });

  return { rows, radiologistName, range, error: null };
}
