import { NextResponse } from "next/server";
import { getBearerSessionUserId } from "@/lib/requireSession";
import { queueAdminClient } from "@/lib/receptionQueueServer";
import {
  fetchRadiologyPatientRequestDetail,
  getAllAssignedItemIds,
  getAssignedItemIdsForRadiologist,
  listAllImagingRequestsForPatient,
  listRadiologyPatientsForAllRadiologists,
  listRadiologyPatientsForRadiologist,
  loadAssignmentRadNamesByRequestId,
} from "@/lib/radiologyAssignments";
import {
  resolveRadiologistFilterUserId,
  userCanViewRadiologyPatients,
} from "@/lib/radiologyRole";

function parsePositiveInt(raw: string | null): number | null {
  const n = Number.parseInt(String(raw ?? ""), 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function parseNonNegativeInt(raw: string | null, fallback: number): number {
  const n = Number.parseInt(String(raw ?? ""), 10);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return n;
}

function localDateYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export async function GET(req: Request) {
  const admin = queueAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." }, { status: 500 });
  }

  const sessionUserId = await getBearerSessionUserId(req);
  if (sessionUserId == null) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (!(await userCanViewRadiologyPatients(admin, sessionUserId))) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const url = new URL(req.url);
  const radParam = (url.searchParams.get("radiologistUserId") ?? "").trim();
  const filterAll = radParam.toLowerCase() === "all";
  const requestedRadId = filterAll ? null : parsePositiveInt(radParam || null);
  const patientId = parsePositiveInt(url.searchParams.get("patientId"));
  const imagingRequestId = (url.searchParams.get("imagingRequestId") ?? "").trim();
  const scopeRaw = (url.searchParams.get("scope") ?? "today").trim().toLowerCase();
  const scopeAll = scopeRaw === "all";
  const queueDate = scopeAll ? null : (url.searchParams.get("date") ?? "").trim() || localDateYmd(new Date());
  const page = parseNonNegativeInt(url.searchParams.get("page"), 0);
  const pageSize = Math.min(100, Math.max(1, parseNonNegativeInt(url.searchParams.get("pageSize"), 20)));

  const filter = await resolveRadiologistFilterUserId(admin, sessionUserId, requestedRadId);
  if (filter.error) return NextResponse.json({ error: filter.error }, { status: 403 });

  const useAllFilter = filter.canFilterRadiologists && filterAll;
  const radiologistUserId = filter.canFilterRadiologists
    ? filter.radiologistUserId
    : (filter.radiologistUserId ?? sessionUserId);

  if (filter.canFilterRadiologists && radiologistUserId == null && !useAllFilter && !imagingRequestId && patientId == null) {
    return NextResponse.json({
      rows: [],
      canFilterRadiologists: true,
      radiologistUserId: null,
      filterAll: false,
    });
  }

  const effectiveRadiologistUserId = useAllFilter ? null : (radiologistUserId ?? sessionUserId);

  if (imagingRequestId) {
    const assignedItems = useAllFilter
      ? await getAllAssignedItemIds(admin)
      : await getAssignedItemIdsForRadiologist(admin, effectiveRadiologistUserId!);
    if (assignedItems.error) return NextResponse.json({ error: assignedItems.error }, { status: 500 });

    const detail = await fetchRadiologyPatientRequestDetail(admin, imagingRequestId);
    if (detail.error) return NextResponse.json({ error: detail.error }, { status: 500 });
    if (!detail.request) return NextResponse.json({ error: "Imaging request not found." }, { status: 404 });

    const assignedItemIds = [...assignedItems.ids];
    const visibleItems = detail.items.filter((it) => assignedItems.ids.has(it.id));
    const isAssigned = visibleItems.length > 0;

    return NextResponse.json({
      canFilterRadiologists: filter.canFilterRadiologists,
      filterAll: useAllFilter,
      request: detail.request,
      items: visibleItems,
      patient_name: detail.patient_name,
      is_assigned: isAssigned,
      assigned_item_ids: assignedItemIds,
    });
  }

  if (patientId != null) {
    const assignedItems = useAllFilter
      ? await getAllAssignedItemIds(admin)
      : await getAssignedItemIdsForRadiologist(admin, effectiveRadiologistUserId!);
    if (assignedItems.error) return NextResponse.json({ error: assignedItems.error }, { status: 500 });

    const radNameByRequestId = useAllFilter
      ? await loadAssignmentRadNamesByRequestId(admin)
      : await loadAssignmentRadNamesByRequestId(admin, effectiveRadiologistUserId!);

    const { rows: requests, error: reqErr } = await listAllImagingRequestsForPatient(
      admin,
      patientId,
      assignedItems.ids,
      radNameByRequestId,
      { date: queueDate },
    );
    if (reqErr) return NextResponse.json({ error: reqErr }, { status: 500 });

    const { data: pat } = await admin.from("patients").select("id, name, contact_no").eq("id", patientId).maybeSingle();

    return NextResponse.json({
      canFilterRadiologists: filter.canFilterRadiologists,
      filterAll: useAllFilter,
      patient: pat
        ? {
            patient_id: (pat as { id: number }).id,
            patient_name: String((pat as { name?: string }).name ?? ""),
            contact_no: (pat as { contact_no?: string | null }).contact_no ?? null,
          }
        : null,
      requests,
    });
  }

  const { rows, total, totalStudies, error } = useAllFilter
    ? await listRadiologyPatientsForAllRadiologists(admin, { date: queueDate, page, pageSize })
    : await listRadiologyPatientsForRadiologist(admin, effectiveRadiologistUserId!, {
        date: queueDate,
        page,
        pageSize,
      });
  if (error) return NextResponse.json({ error }, { status: 500 });

  return NextResponse.json({
    rows,
    total,
    totalStudies,
    page,
    pageSize,
    canFilterRadiologists: filter.canFilterRadiologists,
    filterAll: useAllFilter,
    radiologistUserId: effectiveRadiologistUserId,
    queueDate,
    scopeAll,
  });
}
