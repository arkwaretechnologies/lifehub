import { NextResponse } from "next/server";
import {
  adminCompleteConsultationCheckin,
  adminPrepareLaboratoryCheckin,
  adminUpdateTicketStatus,
  type ReceptionTriageRoute,
} from "@/lib/receptionQueueServer";
import { normalizeLabRequestPackageIdList } from "@/lib/labRequests";
import type { QueueTicketStatus } from "@/lib/queueReception";

type Body = {
  ticketId?: string;
  action?: "call" | "start" | "complete" | "start_with_triage" | "prepare_lab_checkin";
  complaint?: string | null;
  triageNotes?: string | null;
  route?: ReceptionTriageRoute;
  priorNotes?: string | null;
  doctorCounterCode?: string | null;
  patient?: { id?: number; name?: string | null; contact_no?: string | null } | null;
  vitals?: {
    bp?: string;
    hr?: string;
    rr?: string;
    temp?: string;
    o2?: string;
    weight_kg?: string;
    height_cm?: string;
    bmi?: string;
  } | null;
  labTestIds?: string[] | null;
  labPackageIds?: number[] | null;
};

export async function PATCH(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Body;
  const ticketId = typeof body.ticketId === "string" ? body.ticketId.trim() : "";
  const action = body.action;

  if (!ticketId || !action) {
    return NextResponse.json({ error: "ticketId and action are required." }, { status: 400 });
  }

  if (action === "start_with_triage") {
    const route = body.route;
    if (route !== "consultation") {
      return NextResponse.json(
        { error: "Use prepare_lab_checkin for laboratory route." },
        { status: 400 },
      );
    }
    const patient =
      body.patient && typeof body.patient.id === "number" && typeof body.patient.name === "string"
        ? {
            id: body.patient.id,
            name: body.patient.name,
            contact_no: typeof body.patient.contact_no === "string" ? body.patient.contact_no : null,
          }
        : null;
    if (!patient) {
      return NextResponse.json({ error: "patient id and name are required." }, { status: 400 });
    }
    const doctorCounterCode = typeof body.doctorCounterCode === "string" ? body.doctorCounterCode.trim() : "";
    const { error, result } = await adminCompleteConsultationCheckin(ticketId, {
      complaint: typeof body.complaint === "string" ? body.complaint : null,
      triageNotes: typeof body.triageNotes === "string" ? body.triageNotes : null,
      priorNotes: typeof body.priorNotes === "string" ? body.priorNotes : null,
      patient,
      vitals:
        body.vitals && typeof body.vitals === "object"
          ? {
              bp: typeof body.vitals.bp === "string" ? body.vitals.bp : "",
              hr: typeof body.vitals.hr === "string" ? body.vitals.hr : "",
              rr: typeof body.vitals.rr === "string" ? body.vitals.rr : "",
              temp: typeof body.vitals.temp === "string" ? body.vitals.temp : "",
              o2: typeof body.vitals.o2 === "string" ? body.vitals.o2 : "",
              weight_kg: typeof body.vitals.weight_kg === "string" ? body.vitals.weight_kg : "",
              height_cm: typeof body.vitals.height_cm === "string" ? body.vitals.height_cm : "",
              bmi: typeof body.vitals.bmi === "string" ? body.vitals.bmi : "",
            }
          : null,
      doctorCounterCode,
    });
    if (error) {
      return NextResponse.json({ error }, { status: 500 });
    }
    return NextResponse.json({ ok: true, ...result });
  }

  if (action === "prepare_lab_checkin") {
    const patient =
      body.patient && typeof body.patient.id === "number" && typeof body.patient.name === "string"
        ? {
            id: body.patient.id,
            name: body.patient.name,
            contact_no: typeof body.patient.contact_no === "string" ? body.patient.contact_no : null,
          }
        : null;
    if (!patient) {
      return NextResponse.json({ error: "patient id and name are required." }, { status: 400 });
    }
    const labTestIds = Array.isArray(body.labTestIds) ? body.labTestIds.filter((x): x is string => typeof x === "string") : [];
    const packageIds = normalizeLabRequestPackageIdList(
      Array.isArray(body.labPackageIds) ? body.labPackageIds : [],
    );
    const { error, result } = await adminPrepareLaboratoryCheckin(ticketId, {
      triageNotes: typeof body.triageNotes === "string" ? body.triageNotes : null,
      priorNotes: typeof body.priorNotes === "string" ? body.priorNotes : null,
      patient,
      labTestIds,
      packageIds,
    });
    if (error) {
      return NextResponse.json({ error }, { status: 500 });
    }
    return NextResponse.json({ ok: true, ...result });
  }

  const now = new Date().toISOString();
  let status: QueueTicketStatus;
  let timestamps: { called_at?: string | null; serving_at?: string | null };

  switch (action) {
    case "call":
      status = "Called";
      timestamps = { called_at: now, serving_at: null };
      break;
    case "start":
      status = "Serving";
      timestamps = { serving_at: now };
      break;
    case "complete":
      status = "Completed";
      timestamps = {};
      break;
    default:
      return NextResponse.json(
        { error: "action must be call, start, complete, start_with_triage, or prepare_lab_checkin." },
        { status: 400 },
      );
  }

  const { error } = await adminUpdateTicketStatus(ticketId, status, timestamps);
  if (error) {
    return NextResponse.json({ error }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
