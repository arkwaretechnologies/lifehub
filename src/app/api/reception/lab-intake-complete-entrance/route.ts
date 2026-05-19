import { NextResponse } from "next/server";
import { adminCompleteEntranceAfterLabIntake } from "@/lib/receptionQueueServer";

type Body = {
  entranceTicketId?: string;
  transId?: string;
  labRequestId?: string | null;
  imagingRequestId?: string | null;
  includesLab?: boolean;
  includesImaging?: boolean;
  patient?: { id?: number; name?: string; contact_no?: string | null };
};

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Body;
  const entranceTicketId = typeof body.entranceTicketId === "string" ? body.entranceTicketId.trim() : "";
  const transId = typeof body.transId === "string" ? body.transId.trim() : "";
  const labRequestId =
    typeof body.labRequestId === "string" && body.labRequestId.trim() ? body.labRequestId.trim() : null;
  const imagingRequestId =
    typeof body.imagingRequestId === "string" && body.imagingRequestId.trim()
      ? body.imagingRequestId.trim()
      : null;
  const includesLab = body.includesLab ?? Boolean(labRequestId);
  const includesImaging = body.includesImaging ?? Boolean(imagingRequestId);

  if (!entranceTicketId || !transId || (!includesLab && !includesImaging)) {
    return NextResponse.json(
      { error: "entranceTicketId, transId, and at least one service are required." },
      { status: 400 },
    );
  }

  const patientId = body.patient?.id;
  if (patientId == null || !Number.isFinite(Number(patientId))) {
    return NextResponse.json({ error: "patient.id is required." }, { status: 400 });
  }

  const { error, result } = await adminCompleteEntranceAfterLabIntake({
    entranceTicketId,
    transId,
    labRequestId,
    imagingRequestId,
    includesLab,
    includesImaging,
    patient: {
      id: Number(patientId),
      name: typeof body.patient?.name === "string" ? body.patient.name : "",
      contact_no:
        body.patient?.contact_no === null || typeof body.patient?.contact_no === "string"
          ? body.patient.contact_no
          : null,
    },
  });
  if (error) {
    return NextResponse.json({ error }, { status: 400 });
  }
  return NextResponse.json({
    ok: true,
    transId: result?.transId ?? transId,
    labQueueDisplay: result?.labQueueDisplay ?? "",
    labQueueTicketId: result?.labQueueTicketId ?? "",
  });
}
