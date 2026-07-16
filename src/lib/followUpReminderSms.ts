import type { SupabaseClient } from "@supabase/supabase-js";
import { formatDateMMDDYYYY } from "@/lib/dateDisplay";
import { fetchClinicFollowUpSmsSettings } from "@/lib/clinicSettings";
import { clinicAddDays, clinicDateYmd } from "@/lib/queueTicketDate";
import { queueAdminClient } from "@/lib/receptionQueueServer";
import { sendSemaphoreSms } from "@/lib/semaphoreSms";

/** `prior` / legacy `two-days` = advance reminder; `day-of` = on follow-up date. */
export type FollowUpReminderKind = "prior" | "two-days" | "day-of";

export type FollowUpReminderRunResult = {
  ok: boolean;
  kind: FollowUpReminderKind;
  targetDate: string;
  daysPrior: number;
  sent: number;
  skippedNoPhone: number;
  failed: number;
  error?: string;
};

type EncounterFollowUpRow = {
  trans_id: string;
  follow_up_date: string | null;
  patients:
    | { name?: string | null; contact_no?: string | null }
    | { name?: string | null; contact_no?: string | null }[]
    | null;
};

function unwrapPatient(
  embed: EncounterFollowUpRow["patients"]
): { name: string | null; contact_no: string | null } {
  const row = Array.isArray(embed) ? embed[0] ?? null : embed;
  return {
    name: String(row?.name ?? "").trim() || null,
    contact_no: String(row?.contact_no ?? "").trim() || null,
  };
}

function isPriorKind(kind: FollowUpReminderKind): boolean {
  return kind === "prior" || kind === "two-days";
}

function stampColumn(kind: FollowUpReminderKind): "follow_up_sms_2d_sent_at" | "follow_up_sms_dayof_sent_at" {
  return isPriorKind(kind) ? "follow_up_sms_2d_sent_at" : "follow_up_sms_dayof_sent_at";
}

export function buildFollowUpReminderMessage(
  kind: FollowUpReminderKind,
  patientName: string | null,
  followUpDateYmd: string,
  daysPrior = 2
): string {
  const recipient = (patientName ?? "").trim() || "Patient";
  const displayDate = formatDateMMDDYYYY(followUpDateYmd) || followUpDateYmd;

  if (isPriorKind(kind)) {
    const n = Math.max(0, Math.trunc(daysPrior));
    const dayLabel = n === 1 ? "1 day" : `${n} days`;
    return `Good day Mr./Ms. ${recipient},

This is a reminder that you have a follow-up appointment at LifeHub MDC in ${dayLabel} (${displayDate}).

Thank you for choosing LifeHub MDC!`;
  }

  return `Good day Mr./Ms. ${recipient},

This is a reminder that you have a follow-up appointment at LifeHub MDC today (${displayDate}).

Thank you for choosing LifeHub MDC!`;
}

/** Manual reception send — date-neutral wording (works for any follow-up day). */
export function buildManualFollowUpReminderMessage(
  patientName: string | null,
  followUpDateYmd: string
): string {
  const recipient = (patientName ?? "").trim() || "Patient";
  const displayDate = formatDateMMDDYYYY(followUpDateYmd) || followUpDateYmd;
  const today = clinicDateYmd();
  if (ymdSlice(followUpDateYmd) === today) {
    return buildFollowUpReminderMessage("day-of", patientName, followUpDateYmd);
  }
  return `Good day Mr./Ms. ${recipient},

This is a reminder that you have a follow-up appointment at LifeHub MDC on ${displayDate}.

Thank you for choosing LifeHub MDC!`;
}

function ymdSlice(raw: string): string {
  return String(raw ?? "").trim().slice(0, 10);
}

export function authorizeCronRequest(req: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim() ?? "";
  if (!secret) return false;
  const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization") ?? "";
  const m = authHeader.match(/^Bearer\s+(.+)$/i);
  const token = m?.[1]?.trim() ?? "";
  return token.length > 0 && token === secret;
}

export async function runFollowUpReminderJob(
  kind: FollowUpReminderKind,
  adminClient?: SupabaseClient | null
): Promise<FollowUpReminderRunResult> {
  const admin = adminClient === undefined ? queueAdminClient() : adminClient;
  const { settings } = await fetchClinicFollowUpSmsSettings(admin);
  const daysPrior = settings.followUpSmsDaysPrior;
  const targetDate = isPriorKind(kind) ? clinicAddDays(daysPrior) : clinicDateYmd();

  if (!admin) {
    return {
      ok: false,
      kind,
      targetDate,
      daysPrior,
      sent: 0,
      skippedNoPhone: 0,
      failed: 0,
      error: "Server is missing SUPABASE_SERVICE_ROLE_KEY.",
    };
  }

  if (isPriorKind(kind) && daysPrior === 0) {
    return {
      ok: true,
      kind,
      targetDate,
      daysPrior,
      sent: 0,
      skippedNoPhone: 0,
      failed: 0,
    };
  }

  const stamp = stampColumn(kind);
  const { data, error } = await admin
    .from("encounters")
    .select("trans_id, follow_up_date, patients!encounters_patient_id_fkey ( name, contact_no )")
    .eq("follow_up_date", targetDate)
    .is(stamp, null);

  if (error) {
    return {
      ok: false,
      kind,
      targetDate,
      daysPrior,
      sent: 0,
      skippedNoPhone: 0,
      failed: 0,
      error: error.message,
    };
  }

  const rows = (data ?? []) as EncounterFollowUpRow[];
  let sent = 0;
  let skippedNoPhone = 0;
  let failed = 0;

  for (const row of rows) {
    const patient = unwrapPatient(row.patients);
    if (!patient.contact_no) {
      skippedNoPhone += 1;
      continue;
    }

    const followUpYmd = String(row.follow_up_date ?? targetDate).slice(0, 10);
    const sms = await sendSemaphoreSms({
      number: patient.contact_no,
      message: buildFollowUpReminderMessage(kind, patient.name, followUpYmd, daysPrior),
    });

    if (!sms.ok) {
      failed += 1;
      continue;
    }

    const nowIso = new Date().toISOString();
    const { error: updErr } = await admin
      .from("encounters")
      .update({ [stamp]: nowIso })
      .eq("trans_id", row.trans_id)
      .is(stamp, null);

    if (updErr) {
      failed += 1;
      continue;
    }

    sent += 1;
  }

  return {
    ok: true,
    kind,
    targetDate,
    daysPrior,
    sent,
    skippedNoPhone,
    failed,
  };
}
