import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdminClient } from "@/lib/supabaseAdminClient";

export const CLINIC_SETTINGS_TABLE = "clinic_settings" as const;

export type ClinicFollowUpSmsSettings = {
  followUpSmsDaysPrior: number;
  followUpSmsPriorTime: string;
  followUpSmsDayofTime: string;
  updatedAt: string | null;
};

export const DEFAULT_CLINIC_FOLLOW_UP_SMS_SETTINGS: ClinicFollowUpSmsSettings = {
  followUpSmsDaysPrior: 2,
  followUpSmsPriorTime: "17:00",
  followUpSmsDayofTime: "07:00",
  updatedAt: null,
};

type ClinicSettingsRow = {
  id?: number;
  follow_up_sms_days_prior?: number | null;
  follow_up_sms_prior_time?: string | null;
  follow_up_sms_dayof_time?: string | null;
  updated_at?: string | null;
};

function normalizeTimeHHmm(raw: string | null | undefined, fallback: string): string {
  const s = String(raw ?? "").trim();
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(s);
  if (!m) return fallback;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min) || h < 0 || h > 23 || min < 0 || min > 59) {
    return fallback;
  }
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

function normalizeDaysPrior(raw: unknown, fallback: number): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(30, Math.trunc(n)));
}

export function clinicSettingsFromRow(row: ClinicSettingsRow | null | undefined): ClinicFollowUpSmsSettings {
  return {
    followUpSmsDaysPrior: normalizeDaysPrior(
      row?.follow_up_sms_days_prior,
      DEFAULT_CLINIC_FOLLOW_UP_SMS_SETTINGS.followUpSmsDaysPrior
    ),
    followUpSmsPriorTime: normalizeTimeHHmm(
      row?.follow_up_sms_prior_time,
      DEFAULT_CLINIC_FOLLOW_UP_SMS_SETTINGS.followUpSmsPriorTime
    ),
    followUpSmsDayofTime: normalizeTimeHHmm(
      row?.follow_up_sms_dayof_time,
      DEFAULT_CLINIC_FOLLOW_UP_SMS_SETTINGS.followUpSmsDayofTime
    ),
    updatedAt: row?.updated_at != null ? String(row.updated_at) : null,
  };
}

export async function fetchClinicFollowUpSmsSettings(
  adminClient?: SupabaseClient | null
): Promise<{ settings: ClinicFollowUpSmsSettings; error: string | null }> {
  const admin = adminClient === undefined ? supabaseAdminClient() : adminClient;
  if (!admin) {
    return {
      settings: { ...DEFAULT_CLINIC_FOLLOW_UP_SMS_SETTINGS },
      error: "Server is missing SUPABASE_SERVICE_ROLE_KEY.",
    };
  }

  const { data, error } = await admin
    .from(CLINIC_SETTINGS_TABLE)
    .select(
      "id, follow_up_sms_days_prior, follow_up_sms_prior_time, follow_up_sms_dayof_time, updated_at"
    )
    .eq("id", 1)
    .maybeSingle();

  if (error) {
    return {
      settings: { ...DEFAULT_CLINIC_FOLLOW_UP_SMS_SETTINGS },
      error: error.message,
    };
  }

  return {
    settings: clinicSettingsFromRow(data as ClinicSettingsRow | null),
    error: null,
  };
}

export async function upsertClinicFollowUpSmsSettings(
  input: {
    followUpSmsDaysPrior: number;
    followUpSmsPriorTime: string;
    followUpSmsDayofTime: string;
  },
  adminClient?: SupabaseClient | null
): Promise<{ settings: ClinicFollowUpSmsSettings; error: string | null }> {
  const admin = adminClient === undefined ? supabaseAdminClient() : adminClient;
  if (!admin) {
    return {
      settings: { ...DEFAULT_CLINIC_FOLLOW_UP_SMS_SETTINGS },
      error: "Server is missing SUPABASE_SERVICE_ROLE_KEY.",
    };
  }

  const days = normalizeDaysPrior(
    input.followUpSmsDaysPrior,
    DEFAULT_CLINIC_FOLLOW_UP_SMS_SETTINGS.followUpSmsDaysPrior
  );
  const priorTime = normalizeTimeHHmm(
    input.followUpSmsPriorTime,
    DEFAULT_CLINIC_FOLLOW_UP_SMS_SETTINGS.followUpSmsPriorTime
  );
  const dayofTime = normalizeTimeHHmm(
    input.followUpSmsDayofTime,
    DEFAULT_CLINIC_FOLLOW_UP_SMS_SETTINGS.followUpSmsDayofTime
  );

  const nowIso = new Date().toISOString();
  const { data, error } = await admin
    .from(CLINIC_SETTINGS_TABLE)
    .upsert(
      {
        id: 1,
        follow_up_sms_days_prior: days,
        follow_up_sms_prior_time: priorTime,
        follow_up_sms_dayof_time: dayofTime,
        updated_at: nowIso,
      },
      { onConflict: "id" }
    )
    .select(
      "id, follow_up_sms_days_prior, follow_up_sms_prior_time, follow_up_sms_dayof_time, updated_at"
    )
    .maybeSingle();

  if (error) {
    return {
      settings: { ...DEFAULT_CLINIC_FOLLOW_UP_SMS_SETTINGS },
      error: error.message,
    };
  }

  return {
    settings: clinicSettingsFromRow(data as ClinicSettingsRow | null),
    error: null,
  };
}
