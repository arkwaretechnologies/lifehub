import { NextResponse } from "next/server";
import { computeLabRequestQueueCollectionState } from "@/lib/labQueueTicketSync";
import { canLabCallPatient, isSpecimenCollectedOnTicket } from "@/lib/labQueueUi";
import { computeImagingRequestQueueState } from "@/lib/imagingQueueSync";
import {
  applyActiveDeptToNotes,
  parseActiveDeptFromNotes,
} from "@/lib/queueActiveDept";
import {
  adminCompleteConsultationCheckin,
  adminPrepareLaboratoryCheckin,
  adminUpdateTicketStatus,
  queueAdminClient,
  type ReceptionTriageRoute,
} from "@/lib/receptionQueueServer";
import { normalizeLabRequestPackageIdList } from "@/lib/labRequests";
import { canRecallQueueTicket } from "@/lib/queueRecall";
import type { QueueTicketStatus } from "@/lib/queueReception";

type Body = {
  ticketId?: string;
  action?: "call" | "start" | "complete" | "start_with_triage" | "prepare_lab_checkin" | "recall";
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
  imagingSelection?: Record<string, { checked?: boolean; view?: string }> | null;
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
    const imagingSelection =
      body.imagingSelection && typeof body.imagingSelection === "object" && !Array.isArray(body.imagingSelection)
        ? (body.imagingSelection as Record<string, { checked?: boolean; view?: string }>)
        : {};
    const normalizedImaging: Record<string, { checked: boolean; view: string }> = {};
    for (const [code, row] of Object.entries(imagingSelection)) {
      normalizedImaging[code] = {
        checked: row?.checked === true,
        view: typeof row?.view === "string" ? row.view : "",
      };
    }

    const { error, result } = await adminPrepareLaboratoryCheckin(ticketId, {
      triageNotes: typeof body.triageNotes === "string" ? body.triageNotes : null,
      priorNotes: typeof body.priorNotes === "string" ? body.priorNotes : null,
      patient,
      labTestIds,
      packageIds,
      imagingSelection: normalizedImaging,
    });
    if (error) {
      return NextResponse.json({ error }, { status: 500 });
    }
    return NextResponse.json({ ok: true, ...result });
  }

  if (action === "recall") {
    const admin = queueAdminClient();
    if (!admin) {
      return NextResponse.json({ error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." }, { status: 500 });
    }
    const { data: row, error: selErr } = await admin
      .from("queue_tickets")
      .select("id, status, queue_display, patient_name, counter_id")
      .eq("id", ticketId)
      .maybeSingle();
    if (selErr) {
      return NextResponse.json({ error: selErr.message }, { status: 500 });
    }
    if (!row) {
      return NextResponse.json({ error: "Queue ticket not found." }, { status: 404 });
    }
    const ticket = row as {
      status?: QueueTicketStatus;
      queue_display?: string | null;
      patient_name?: string | null;
      counter_id?: string | number | null;
    };
    const st = (ticket.status ?? "").trim() as QueueTicketStatus;
    if (!canRecallQueueTicket(st)) {
      return NextResponse.json(
        { error: "Recall is only available for tickets that have already been called." },
        { status: 409 },
      );
    }
    const queueDisplay = (ticket.queue_display ?? "").trim() || "—";
    const patientName = ticket.patient_name?.trim() ? ticket.patient_name.trim() : null;
    let counterName: string | null = null;
    const counterId = ticket.counter_id;
    if (counterId != null && counterId !== "") {
      const { data: ctr } = await admin
        .from("queue_counters")
        .select("name, code")
        .eq("id", counterId)
        .maybeSingle();
      const cn = ctr as { name?: string | null; code?: string | null } | null;
      counterName = (cn?.name ?? cn?.code ?? "").trim() || null;
    }
    return NextResponse.json({ ok: true, queueDisplay, patientName, counterName });
  }

  const now = new Date().toISOString();
  let status: QueueTicketStatus;
  let timestamps: { called_at?: string | null; serving_at?: string | null };

  switch (action) {
    case "call": {
      const admin = queueAdminClient();
      if (admin) {
        const { data: row, error: selErr } = await admin
          .from("queue_tickets")
          .select("status, includes_imaging, imaging_request_id, lab_request_id, notes")
          .eq("id", ticketId)
          .maybeSingle();
        if (selErr) {
          return NextResponse.json({ error: selErr.message }, { status: 500 });
        }
        const current = row as
          | {
              status?: QueueTicketStatus;
              includes_imaging?: boolean | null;
              imaging_request_id?: string | null;
              lab_request_id?: string | null;
              notes?: string | null;
            }
          | null;
        if (current?.status) {
          const specimenCollected = isSpecimenCollectedOnTicket(current.notes);
          const labId = String(current.lab_request_id ?? "").trim();
          let labAnyCollected = specimenCollected;
          let labAllCollected = specimenCollected;
          if (labId) {
            const labState = await computeLabRequestQueueCollectionState(admin, labId);
            if (labState.error) {
              return NextResponse.json({ error: labState.error }, { status: 500 });
            }
            labAnyCollected = labAnyCollected || labState.anyCollected;
            labAllCollected = labAllCollected || labState.allCollected;
          }
          const imgId = String(current.imaging_request_id ?? "").trim();
          const includesImaging = current.includes_imaging === true || Boolean(imgId);
          let imagingAllCaptured = true;
          if (includesImaging && imgId) {
            const imgState = await computeImagingRequestQueueState(admin, imgId);
            if (imgState.error) {
              return NextResponse.json({ error: imgState.error }, { status: 500 });
            }
            imagingAllCaptured = imgState.allCaptured;
          }
          const activeDept = parseActiveDeptFromNotes(current.notes);
          if (activeDept === "IMAG") {
            return NextResponse.json(
              {
                error: imagingAllCaptured
                  ? "Patient is at imaging — finish capturing before calling to laboratory."
                  : "Mark all imaging studies as Captured before calling the patient to laboratory.",
              },
              { status: 409 },
            );
          }
          if (
            !canLabCallPatient(current.status, {
              includesImaging,
              specimenCollected,
              labAnyCollected,
              labAllCollected,
              imagingAllCaptured,
            })
          ) {
            return NextResponse.json(
              {
                error: labAllCollected
                  ? "Specimen already collected — enter results instead of calling again."
                  : labAnyCollected
                    ? "Partial collection in progress — open Request to continue."
                    : "This ticket cannot be called in its current status.",
              },
              { status: 409 },
            );
          }
          const nextNotes = applyActiveDeptToNotes(current.notes ?? "", "LAB");
          const { error: notesErr } = await admin
            .from("queue_tickets")
            .update({ notes: nextNotes })
            .eq("id", ticketId);
          if (notesErr) {
            return NextResponse.json({ error: notesErr.message }, { status: 500 });
          }
        }
      }
      status = "Called";
      timestamps = { called_at: now, serving_at: null };
      break;
    }
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
        { error: "action must be call, start, complete, start_with_triage, prepare_lab_checkin, or recall." },
        { status: 400 },
      );
  }

  const { error } = await adminUpdateTicketStatus(ticketId, status, timestamps);
  if (error) {
    return NextResponse.json({ error }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
