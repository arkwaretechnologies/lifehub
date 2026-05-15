import { NextResponse } from "next/server";
import { adminCompleteEntranceAfterLabIntake } from "@/lib/receptionQueueServer";

type Body = {
  entranceTicketId?: string;
  transId?: string;
  labRequestId?: string;
  patient?: { id?: number; name?: string; contact_no?: string | null };
};

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Body;
  const entranceTicketId = typeof body.entranceTicketId === "string" ? body.entranceTicketId.trim() : "";
  const transId = typeof body.transId === "string" ? body.transId.trim() : "";
  const labRequestId = typeof body.labRequestId === "string" ? body.labRequestId.trim() : "";
  if (!entranceTicketId || !transId || !labRequestId) {
    return NextResponse.json({ error: "entranceTicketId, transId, and labRequestId are required." }, { status: 400 });
  }

  const patientId = body.patient?.id;
  if (patientId == null || !Number.isFinite(Number(patientId))) {
    return NextResponse.json({ error: "patient.id is required." }, { status: 400 });
  }

  const { error, result } = await adminCompleteEntranceAfterLabIntake({
    entranceTicketId,
    transId,
    labRequestId,
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
