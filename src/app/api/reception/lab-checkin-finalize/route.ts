import { NextResponse } from "next/server";
import { adminFinalizeLaboratoryCheckin } from "@/lib/receptionQueueServer";

type Body = {
  entranceTicketId?: string;
  transId?: string;
  labRequestId?: string;
  patient?: { id?: number; name?: string | null; contact_no?: string | null } | null;
};

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Body;
  const entranceTicketId = typeof body.entranceTicketId === "string" ? body.entranceTicketId.trim() : "";
  const transId = typeof body.transId === "string" ? body.transId.trim() : "";
  const labRequestId = typeof body.labRequestId === "string" ? body.labRequestId.trim() : "";
  const p = body.patient;
  if (!entranceTicketId || !transId || !labRequestId) {
    return NextResponse.json({ error: "entranceTicketId, transId, and labRequestId are required." }, { status: 400 });
  }
  if (!p || typeof p.id !== "number" || typeof p.name !== "string") {
    return NextResponse.json({ error: "patient id and name are required." }, { status: 400 });
  }

  const { error, result } = await adminFinalizeLaboratoryCheckin({
    entranceTicketId,
    transId,
    labRequestId,
    patient: {
      id: p.id,
      name: p.name,
      contact_no: typeof p.contact_no === "string" ? p.contact_no : null,
    },
  });

  if (error) {
    return NextResponse.json({ error }, { status: 500 });
  }
  return NextResponse.json({ ok: true, ...result });
}
