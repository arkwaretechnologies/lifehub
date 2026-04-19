import { NextResponse } from "next/server";
import { adminIssueCashierLaboratoryQueueTicket } from "@/lib/receptionQueueServer";

type Body = {
  encounterTransId?: string;
  labRequestIds?: string[] | null;
  cashierPriorityId?: number | null;
  patient?: { id?: number; name?: string | null; contact_no?: string | null } | null;
};

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Body;
  const encounterTransId = typeof body.encounterTransId === "string" ? body.encounterTransId.trim() : "";
  const labRequestIds = Array.isArray(body.labRequestIds)
    ? body.labRequestIds.filter((x): x is string => typeof x === "string" && x.trim() !== "")
    : [];
  const p = body.patient;
  if (!encounterTransId || labRequestIds.length === 0) {
    return NextResponse.json({ error: "encounterTransId and labRequestIds are required." }, { status: 400 });
  }
  if (!p || typeof p.id !== "number" || typeof p.name !== "string") {
    return NextResponse.json({ error: "patient id and name are required." }, { status: 400 });
  }

  const cashierPriorityId =
    typeof body.cashierPriorityId === "number" && Number.isFinite(body.cashierPriorityId) ? body.cashierPriorityId : null;

  const { error, result } = await adminIssueCashierLaboratoryQueueTicket({
    encounterTransId,
    labRequestIds,
    cashierPriorityId,
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
