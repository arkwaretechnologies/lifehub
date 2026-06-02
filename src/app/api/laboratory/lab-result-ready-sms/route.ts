import { NextResponse } from "next/server";
import { getBearerSessionUserId } from "@/lib/requireSession";
import { queueAdminClient } from "@/lib/receptionQueueServer";
import { sendSemaphoreSms } from "@/lib/semaphoreSms";

type Body = {
  labRequestId?: unknown;
  forceResend?: unknown;
};

function buildReadyMessage(patientName: string | null, labRequestId: string): string {
  const recipient = (patientName ?? "").trim() || "Patient";
  return `Good day ${recipient}, your laboratory result is ready. Please proceed to the Lifehub clinic for claiming. Ref: ${labRequestId}`;
}

export async function POST(req: Request) {
  const sessionUserId = await getBearerSessionUserId(req);
  if (sessionUserId == null) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const admin = queueAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." }, { status: 500 });
  }

  const body = (await req.json().catch(() => ({}))) as Body;
  const labRequestId = typeof body.labRequestId === "string" ? body.labRequestId.trim() : "";
  const forceResend = body.forceResend === true;
  if (!labRequestId) {
    return NextResponse.json({ error: "labRequestId is required." }, { status: 400 });
  }

  const { data: requestRow, error: requestErr } = await admin
    .from("lab_requests")
    .select("id, patient_id, result_sms_sent_at")
    .eq("id", labRequestId)
    .maybeSingle();
  if (requestErr) return NextResponse.json({ error: requestErr.message }, { status: 500 });
  if (!requestRow) return NextResponse.json({ error: "Lab request not found." }, { status: 404 });

  const resultSmsSentAt = String((requestRow as { result_sms_sent_at?: string | null }).result_sms_sent_at ?? "").trim() || null;
  if (resultSmsSentAt && !forceResend) {
    return NextResponse.json(
      {
        error: "SMS already sent for this request. Confirm resend to continue.",
        code: "alreadySentNeedsConfirm",
        result_sms_sent_at: resultSmsSentAt,
      },
      { status: 409 },
    );
  }

  const { data: itemRows, error: itemErr } = await admin
    .from("lab_request_items")
    .select("id")
    .eq("lab_request_id", labRequestId);
  if (itemErr) return NextResponse.json({ error: itemErr.message }, { status: 500 });
  const itemIds = ((itemRows ?? []) as Array<{ id: string }>).map((r) => r.id).filter(Boolean);
  if (itemIds.length === 0) {
    return NextResponse.json({ error: "No lab request items found.", code: "notReady" }, { status: 400 });
  }

  const { count: resultCount, error: resultsErr } = await admin
    .from("lab_results")
    .select("lab_request_item_id", { count: "exact", head: true })
    .in("lab_request_item_id", itemIds);
  if (resultsErr) return NextResponse.json({ error: resultsErr.message }, { status: 500 });
  if (!resultCount || resultCount < 1) {
    return NextResponse.json(
      { error: "At least one result must be saved before sending SMS.", code: "notReady" },
      { status: 400 },
    );
  }

  const patientId = (requestRow as { patient_id?: number | null }).patient_id ?? null;
  if (patientId == null) {
    return NextResponse.json({ error: "Patient not found for this lab request.", code: "missingContact" }, { status: 400 });
  }

  const { data: patientRow, error: patientErr } = await admin
    .from("patients")
    .select("name, contact_no")
    .eq("id", patientId)
    .maybeSingle();
  if (patientErr) return NextResponse.json({ error: patientErr.message }, { status: 500 });

  const patientName = String((patientRow as { name?: string | null } | null)?.name ?? "").trim() || null;
  const contactNo = String((patientRow as { contact_no?: string | null } | null)?.contact_no ?? "").trim() || null;
  if (!contactNo) {
    return NextResponse.json({ error: "Patient contact number is missing.", code: "missingContact" }, { status: 400 });
  }

  const sms = await sendSemaphoreSms({
    number: contactNo,
    message: buildReadyMessage(patientName, labRequestId),
  });
  if (!sms.ok) {
    return NextResponse.json({ error: sms.error ?? "Failed to send SMS.", code: "providerFailed" }, { status: 502 });
  }

  const nowIso = new Date().toISOString();
  const { error: updErr } = await admin
    .from("lab_requests")
    .update({ result_sms_sent_at: nowIso })
    .eq("id", labRequestId);
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    sent: true,
    result_sms_sent_at: nowIso,
    messageId: sms.messageId,
    providerStatus: sms.status,
  });
}
