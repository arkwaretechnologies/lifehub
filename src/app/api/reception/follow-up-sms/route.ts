import { NextResponse } from "next/server";
import { getBearerSessionUserId } from "@/lib/requireSession";
import { queueAdminClient } from "@/lib/receptionQueueServer";
import { buildManualFollowUpReminderMessage } from "@/lib/followUpReminderSms";
import { sendSemaphoreSms } from "@/lib/semaphoreSms";

type Body = {
  encounterId?: unknown;
};

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
  const encounterId = typeof body.encounterId === "string" ? body.encounterId.trim() : "";
  if (!encounterId) {
    return NextResponse.json({ error: "encounterId is required." }, { status: 400 });
  }

  const { data: encounter, error: encErr } = await admin
    .from("encounters")
    .select(
      "trans_id, follow_up_date, patient_id, patients!encounters_patient_id_fkey ( name, contact_no )"
    )
    .eq("trans_id", encounterId)
    .maybeSingle();

  if (encErr) return NextResponse.json({ error: encErr.message }, { status: 500 });
  if (!encounter) return NextResponse.json({ error: "Encounter not found." }, { status: 404 });

  const followUpDate = String(
    (encounter as { follow_up_date?: string | null }).follow_up_date ?? ""
  )
    .trim()
    .slice(0, 10);
  if (!followUpDate) {
    return NextResponse.json(
      { error: "This encounter has no follow-up date.", code: "noFollowUp" },
      { status: 400 }
    );
  }

  const patients = (encounter as {
    patients?:
      | { name?: string | null; contact_no?: string | null }
      | { name?: string | null; contact_no?: string | null }[]
      | null;
  }).patients;
  const patientRow = Array.isArray(patients) ? patients[0] ?? null : patients ?? null;
  const patientName = String(patientRow?.name ?? "").trim() || null;
  const contactNo = String(patientRow?.contact_no ?? "").trim() || null;
  if (!contactNo) {
    return NextResponse.json(
      { error: "Patient contact number is missing.", code: "missingContact" },
      { status: 400 }
    );
  }

  const sms = await sendSemaphoreSms({
    number: contactNo,
    message: buildManualFollowUpReminderMessage(patientName, followUpDate),
  });
  if (!sms.ok) {
    return NextResponse.json(
      { error: sms.error ?? "Failed to send SMS.", code: "providerFailed" },
      { status: 502 }
    );
  }

  return NextResponse.json({
    ok: true,
    sent: true,
    followUpDate,
    messageId: sms.messageId,
    providerStatus: sms.status,
  });
}
