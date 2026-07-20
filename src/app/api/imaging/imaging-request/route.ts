import { NextResponse } from "next/server";
import { userHasAdminRole } from "@/lib/adminRole";
import type { ImagingLineSelection } from "@/lib/imagingCatalog";
import {
  adminCreateImagingRequestWithItems,
  enrichImagingRequestItemsWithCatalogPrint,
  fetchImagingRequestItemsForRequestIds,
  imagingItemHasPrintableResult,
} from "@/lib/imagingRequests";
import { syncImagingQueueTicketsForRequest } from "@/lib/imagingQueueSync";
import { assertRadiologistMayEditItem, userIsRadiologist, userIsRadTech } from "@/lib/radiologyRole";
import { consumeApprovedImagingEdit, techHasApprovedEdit } from "@/lib/imagingEditRequestServer";
import { getBearerSessionUserId } from "@/lib/requireSession";
import { queueAdminClient } from "@/lib/receptionQueueServer";
import {
  ageYearsAt,
  parsePatientRowFields,
  resolveRequestingPhysicianLabel,
} from "@/lib/resultsPrintPatientFields";

type ImagingRequestHeader = {
  id: string;
  encounter_id: string | null;
  patient_id: number | null;
  request_date: string;
  request_time: string | null;
  priority: string;
  remarks: string | null;
  status: string;
  created_at: string;
  result_sms_sent_at: string | null;
};

/** Full header returned by GET (includes resolved patient label + queue ticket if any). */
export type ImagingRequestHeaderView = ImagingRequestHeader & {
  patient_name: string | null;
  queue_display: string | null;
  patient_date_of_birth: string | null;
  patient_sex: string | null;
  patient_age_years: number | null;
  patient_address: string | null;
  patient_contact_no: string | null;
  patient_philhealth_no: string | null;
  requesting_physician: string | null;
  /** True when at least one study has findings or impression. */
  any_result_saved: boolean;
};

export async function POST(req: Request) {
  const admin = queueAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." }, { status: 500 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    encounterId?: string | null;
    patientId?: number | null;
    priority?: string;
    remarks?: string | null;
    selection?: Record<string, ImagingLineSelection>;
    packageIds?: number[] | null;
  };

  const encounterId =
    body.encounterId == null ? null : typeof body.encounterId === "string" ? body.encounterId.trim() : "";
  const patientId =
    body.patientId != null && Number.isFinite(body.patientId) && body.patientId > 0 ? body.patientId : null;
  const selection = body.selection ?? {};
  const packageIds = Array.isArray(body.packageIds) ? body.packageIds : [];

  if (!encounterId && patientId == null) {
    return NextResponse.json({ error: "encounterId or patientId is required." }, { status: 400 });
  }

  const { imagingRequestId, error } = await adminCreateImagingRequestWithItems(admin, {
    encounterId: encounterId || null,
    patientId,
    priority: typeof body.priority === "string" ? body.priority : "Routine",
    remarks: typeof body.remarks === "string" ? body.remarks : null,
    selection,
    packageIds,
  });

  if (error) {
    return NextResponse.json({ error }, { status: 500 });
  }
  if (!imagingRequestId) {
    return NextResponse.json({ error: "Could not create imaging request." }, { status: 500 });
  }

  return NextResponse.json({ imagingRequestId });
}

export async function GET(req: Request) {
  const admin = queueAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." }, { status: 500 });
  }

  const url = new URL(req.url);
  const imagingRequestId = (url.searchParams.get("imagingRequestId") ?? "").trim();
  if (!imagingRequestId) {
    return NextResponse.json({ error: "imagingRequestId is required." }, { status: 400 });
  }

  const { data: header, error: hErr } = await admin
    .from("imaging_requests")
    .select("id, encounter_id, patient_id, request_date, request_time, priority, remarks, status, created_at, result_sms_sent_at")
    .eq("id", imagingRequestId)
    .maybeSingle();
  if (hErr) return NextResponse.json({ error: hErr.message }, { status: 500 });
  if (!header) return NextResponse.json({ error: "Imaging request not found." }, { status: 404 });

  const baseHeader = header as ImagingRequestHeader;

  const { rows: itemsRaw, error: iErr } = await fetchImagingRequestItemsForRequestIds(admin, [imagingRequestId]);
  if (iErr) return NextResponse.json({ error: iErr }, { status: 500 });
  const { items, error: enrichErr } = await enrichImagingRequestItemsWithCatalogPrint(admin, itemsRaw);
  if (enrichErr) return NextResponse.json({ error: enrichErr }, { status: 500 });

  let queue_display: string | null = null;
  const { data: qt } = await admin
    .from("queue_tickets")
    .select("queue_display")
    .eq("imaging_request_id", imagingRequestId)
    .order("issued_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  queue_display = (qt as { queue_display?: string } | null)?.queue_display ?? null;

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
    const parsed = parsePatientRowFields(
      pat as {
        name?: string | null;
        date_of_birth?: string | null;
        sex?: string | null;
        address?: string | null;
        contact_no?: string | null;
        philhealth_no?: number | null;
      } | null,
    );
    patient_name = parsed.patient_name;
    patient_date_of_birth = parsed.patient_date_of_birth;
    patient_sex = parsed.patient_sex;
    patient_address = parsed.patient_address;
    patient_contact_no = parsed.patient_contact_no;
    patient_philhealth_no = parsed.patient_philhealth_no;
  }

  const patient_age_years = ageYearsAt(patient_date_of_birth, baseHeader.request_date);

  let requesting_physician: string | null = null;
  const encounterId = (baseHeader.encounter_id ?? "").trim();
  if (encounterId) {
    const { data: enc, error: encErr } = await admin
      .from("encounters")
      .select("referring_physician, physician_id")
      .eq("trans_id", encounterId)
      .maybeSingle();
    if (encErr) return NextResponse.json({ error: encErr.message }, { status: 500 });
    requesting_physician = await resolveRequestingPhysicianLabel(
      admin,
      (enc as { referring_physician?: string | null } | null)?.referring_physician ?? null,
      (enc as { physician_id?: number | null } | null)?.physician_id ?? null,
    );
  }

  const any_result_saved = items.some((it) => imagingItemHasPrintableResult(it));
  const result_sms_sent_at = String(baseHeader.result_sms_sent_at ?? "").trim() || null;

  const headerOut: ImagingRequestHeaderView = {
    ...baseHeader,
    result_sms_sent_at,
    patient_name,
    queue_display,
    patient_date_of_birth,
    patient_sex,
    patient_age_years,
    patient_address,
    patient_contact_no,
    patient_philhealth_no,
    requesting_physician,
    any_result_saved,
  };

  return NextResponse.json({
    header: headerOut,
    items,
    request: headerOut,
    queue_display,
    patient_name,
  });
}

export async function PATCH(req: Request) {
  const admin = queueAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." }, { status: 500 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    imagingRequestItemId?: string;
    findings?: string | null;
    remarks?: string | null;
    status?: string | null;
    markReadingDone?: boolean;
  };

  const itemId = typeof body.imagingRequestItemId === "string" ? body.imagingRequestItemId.trim() : "";
  if (!itemId) {
    return NextResponse.json({ error: "imagingRequestItemId is required." }, { status: 400 });
  }

  const sessionUserId = await getBearerSessionUserId(req);
  if (sessionUserId == null) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { data: existingItem, error: existErr } = await admin
    .from("imaging_request_items")
    .select("id, imaging_request_id, status, findings, remarks")
    .eq("id", itemId)
    .maybeSingle();
  if (existErr) return NextResponse.json({ error: existErr.message }, { status: 500 });
  if (!existingItem) return NextResponse.json({ error: "Imaging request item not found." }, { status: 404 });

  const imagingRequestItemIdForAuth = String((existingItem as { id?: string }).id ?? "").trim();
  const isAdmin = await userHasAdminRole(admin, sessionUserId);
  const isRad = await userIsRadiologist(admin, sessionUserId);
  if (isRad && !isAdmin) {
    const auth = await assertRadiologistMayEditItem(admin, sessionUserId, imagingRequestItemIdForAuth);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error ?? "Forbidden." }, { status: 403 });
    }
  }

  const isTech = !isAdmin && !isRad ? await userIsRadTech(admin, sessionUserId) : false;
  if (isTech) {
    const approved = await techHasApprovedEdit(admin, imagingRequestItemIdForAuth, sessionUserId);
    if (!approved) {
      return NextResponse.json(
        { error: "Super-admin approval is required before editing this study's findings." },
        { status: 403 },
      );
    }
  }

  const existingStatus = String((existingItem as { status?: string }).status ?? "").trim();
  const markReadingDone = body.markReadingDone === true;

  const findings =
    body.findings == null ? undefined : String(body.findings).trim() === "" ? null : String(body.findings).trim();
  const remarks =
    body.remarks == null ? undefined : String(body.remarks).trim() === "" ? null : String(body.remarks).trim();
  const status =
    body.status == null ? undefined : String(body.status).trim() === "" ? "Pending" : String(body.status).trim();

  if (markReadingDone) {
    const allowedForDone = existingStatus === "Received" || existingStatus === "Interpreted" || existingStatus === "Completed";
    if (!allowedForDone) {
      return NextResponse.json(
        { error: "Study must be Received (result ready) before marking reading as done." },
        { status: 409 },
      );
    }
    const findingsText =
      findings !== undefined
        ? String(findings ?? "").trim()
        : String((existingItem as { findings?: string }).findings ?? "").trim();
    const remarksText =
      remarks !== undefined
        ? String(remarks ?? "").trim()
        : String((existingItem as { remarks?: string }).remarks ?? "").trim();
    if (!findingsText && !remarksText) {
      return NextResponse.json(
        { error: "Enter findings or impression before marking reading as done." },
        { status: 409 },
      );
    }
  } else {
    const hasFindingsInBody = body.findings != null && String(body.findings).trim() !== "";
    if (
      hasFindingsInBody &&
      existingStatus !== "Received" &&
      existingStatus !== "Completed" &&
      existingStatus !== "Interpreted"
    ) {
      return NextResponse.json(
        { error: "Mark the study as Captured, then Received (result ready), before entering findings." },
        { status: 409 },
      );
    }
  }

  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (findings !== undefined) payload.findings = findings;
  if (remarks !== undefined) payload.remarks = remarks;

  if (markReadingDone) {
    payload.status = "Interpreted";
    payload.performed_at = new Date().toISOString();
  } else if (status !== undefined) {
    payload.status = findings ? "Completed" : status;
    if (findings) payload.performed_at = new Date().toISOString();
  }

  const { data, error } = await admin
    .from("imaging_request_items")
    .update(payload)
    .eq("id", itemId)
    .select("id, imaging_request_id, study_name, view_text, status, findings, remarks")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (markReadingDone) {
    await consumeApprovedImagingEdit(admin, imagingRequestItemIdForAuth);
  }

  const imagingRequestId = (data as { imaging_request_id?: string }).imaging_request_id;
  if (imagingRequestId) {
    const sync = await syncImagingQueueTicketsForRequest(admin, imagingRequestId);
    if (sync.error) return NextResponse.json({ error: sync.error }, { status: 500 });
    if (sync.allCompleted) {
      await admin
        .from("imaging_requests")
        .update({ status: "Completed", updated_at: new Date().toISOString() })
        .eq("id", imagingRequestId);
    }
  }

  return NextResponse.json({ item: data });
}
