import { NextResponse } from "next/server";
import { upsertPrescriptionForEncounterWithClient, type UpsertRxLineInput } from "@/lib/pharmacyPosDb";
import { queueAdminClient } from "@/lib/receptionQueueServer";

type Body = {
  transId?: string;
  patientId?: number;
  physicianUserId?: number | null;
  rxLines?: UpsertRxLineInput[];
};

export async function POST(req: Request) {
  const admin = queueAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." }, { status: 500 });
  }

  const body = (await req.json().catch(() => ({}))) as Body;
  const transId = typeof body.transId === "string" ? body.transId.trim() : "";
  const patientId = body.patientId;
  const rxLines = Array.isArray(body.rxLines) ? body.rxLines : [];

  if (!transId || patientId == null || !Number.isFinite(patientId)) {
    return NextResponse.json({ error: "transId and patientId are required." }, { status: 400 });
  }

  const physicianUserId =
    body.physicianUserId != null && Number.isFinite(body.physicianUserId) ? body.physicianUserId : null;

  const normalizedLines = rxLines
    .filter((l) => l && typeof l.productId === "string" && l.productId.trim() !== "")
    .map((l) => ({
      productId: l.productId.trim(),
      quantityPrescribed: Math.max(1, Math.round(Number(l.quantityPrescribed) || 0)),
      sig: typeof l.sig === "string" && l.sig.trim() ? l.sig.trim() : null,
    }));

  const { prescriptionId, error } = await upsertPrescriptionForEncounterWithClient(admin, {
    transId,
    patientId,
    physicianUserId,
    rxLines: normalizedLines,
  });

  if (error) {
    return NextResponse.json({ error }, { status: 500 });
  }

  return NextResponse.json({ ok: true, prescriptionId });
}
