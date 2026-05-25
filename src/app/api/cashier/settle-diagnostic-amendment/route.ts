import { NextResponse } from "next/server";
import {
  buildAmendmentSaleItemsFromSummary,
  fetchAmendmentById,
  markAmendmentSettled,
  type AmendmentSummaryJson,
} from "@/lib/diagnosticAmendments";
import {
  createLabAmendmentRefundSale,
  createLabAmendmentSupplementalSale,
  generateNextDailyOrNumber,
} from "@/lib/cashierPayments";
import { adminRepairQueueTicketModalityFlags } from "@/lib/diagnosticQueueServer";
import { adminReactivateDiagnosticQueueAfterAmendment, queueAdminClient } from "@/lib/receptionQueueServer";
import { queueTicketTodayIsoDate } from "@/lib/queueTicketDate";

type Body = {
  amendmentId?: string;
  paymentMethodId?: number;
  amountTendered?: number | null;
  changeAmount?: number | null;
  orNumber?: string | null;
  patient?: { id?: number; name?: string; contact_no?: string | null };
  cashierPriorityId?: number | null;
};

export async function POST(req: Request) {
  const admin = queueAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." }, { status: 500 });
  }

  const body = (await req.json().catch(() => ({}))) as Body;
  const amendmentId = typeof body.amendmentId === "string" ? body.amendmentId.trim() : "";
  if (!amendmentId) {
    return NextResponse.json({ error: "amendmentId is required." }, { status: 400 });
  }

  const { row, error: aErr } = await fetchAmendmentById(admin, amendmentId);
  if (aErr) return NextResponse.json({ error: aErr }, { status: 500 });
  if (!row) return NextResponse.json({ error: "Amendment not found." }, { status: 404 });
  if (row.status !== "pending") {
    return NextResponse.json({ error: "This amendment has already been settled." }, { status: 409 });
  }

  const delta = Number(row.amount_delta);
  const summary = (row.summary_json ?? { added: [], removed: [] }) as AmendmentSummaryJson;
  const patientId =
    body.patient?.id != null && Number.isFinite(body.patient.id) ? Math.trunc(body.patient.id) : null;

  let settledLabSaleId: string | null = null;

  if (delta > 0) {
    const paymentMethodId =
      typeof body.paymentMethodId === "number" && Number.isFinite(body.paymentMethodId)
        ? body.paymentMethodId
        : null;
    if (paymentMethodId == null) {
      return NextResponse.json({ error: "paymentMethodId is required for collection." }, { status: 400 });
    }

    let orNumber = typeof body.orNumber === "string" ? body.orNumber.trim() : "";
    if (!orNumber) {
      const gen = await generateNextDailyOrNumber();
      if (gen.error || !gen.orNumber) {
        return NextResponse.json({ error: gen.error ?? "Could not generate OR number." }, { status: 500 });
      }
      orNumber = gen.orNumber;
    }

    const items = buildAmendmentSaleItemsFromSummary(summary, "added");
    const sale = await createLabAmendmentSupplementalSale({
      amendmentId,
      labRequestId: row.lab_request_id,
      imagingRequestId: row.imaging_request_id,
      patientId,
      orNumber,
      paymentMethodId,
      amountTendered: body.amountTendered ?? null,
      changeAmount: body.changeAmount ?? null,
      amountDelta: delta,
      items,
    });
    if (sale.error) return NextResponse.json({ error: sale.error }, { status: 500 });
    settledLabSaleId = sale.labSaleId;
  } else if (delta < 0) {
    const paymentMethodId =
      typeof body.paymentMethodId === "number" && Number.isFinite(body.paymentMethodId)
        ? body.paymentMethodId
        : null;
    if (paymentMethodId == null) {
      return NextResponse.json({ error: "paymentMethodId is required for refund." }, { status: 400 });
    }

    let orNumber = typeof body.orNumber === "string" ? body.orNumber.trim() : "";
    if (!orNumber) {
      const gen = await generateNextDailyOrNumber();
      if (gen.error || !gen.orNumber) {
        return NextResponse.json({ error: gen.error ?? "Could not generate OR number." }, { status: 500 });
      }
      orNumber = `${gen.orNumber}-R`;
    }

    const items = buildAmendmentSaleItemsFromSummary(summary, "removed");
    const sale = await createLabAmendmentRefundSale({
      amendmentId,
      labRequestId: row.lab_request_id,
      imagingRequestId: row.imaging_request_id,
      patientId,
      orNumber,
      paymentMethodId,
      refundAmount: Math.abs(delta),
      items,
    });
    if (sale.error) return NextResponse.json({ error: sale.error }, { status: 500 });
    settledLabSaleId = sale.labSaleId;
  }

  const mark = await markAmendmentSettled(admin, amendmentId, settledLabSaleId);
  if (mark.error) return NextResponse.json({ error: mark.error }, { status: 500 });

  let queueDisplay: string | undefined;
  if (body.patient?.id != null && typeof body.patient.name === "string") {
    const q = await adminReactivateDiagnosticQueueAfterAmendment({
      encounterTransId: row.encounter_id,
      labRequestId: row.lab_request_id,
      imagingRequestId: row.imaging_request_id,
      includesLab: Boolean(row.lab_request_id),
      includesImaging: Boolean(row.imaging_request_id),
      patient: {
        id: body.patient.id,
        name: body.patient.name,
        contact_no: typeof body.patient.contact_no === "string" ? body.patient.contact_no : null,
      },
      cashierPriorityId:
        typeof body.cashierPriorityId === "number" && Number.isFinite(body.cashierPriorityId)
          ? body.cashierPriorityId
          : null,
    });
    if (q.error) return NextResponse.json({ error: q.error }, { status: 500 });
    queueDisplay = q.queueDisplay;
    const repair = await adminRepairQueueTicketModalityFlags(admin, queueTicketTodayIsoDate());
    if (repair.error) return NextResponse.json({ error: repair.error }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    settledLabSaleId,
    amountDelta: delta,
    queueDisplay,
  });
}
