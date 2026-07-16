import { NextResponse } from "next/server";
import { getBearerSessionUserId } from "@/lib/requireSession";
import {
  fetchClinicFollowUpSmsSettings,
  upsertClinicFollowUpSmsSettings,
} from "@/lib/clinicSettings";
import { supabaseAdminClient } from "@/lib/supabaseAdminClient";

function parseTime(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  if (!/^\d{1,2}:\d{2}(?::\d{2})?$/.test(s)) return null;
  const [h, m] = s.split(":").map((x) => Number(x));
  if (!Number.isFinite(h) || !Number.isFinite(m) || h < 0 || h > 23 || m < 0 || m > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function parseDays(raw: unknown): number | null {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return null;
  const t = Math.trunc(n);
  if (t < 0 || t > 30) return null;
  return t;
}

export async function GET(req: Request) {
  if ((await getBearerSessionUserId(req)) == null) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const admin = supabaseAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." }, { status: 500 });
  }
  const { settings, error } = await fetchClinicFollowUpSmsSettings(admin);
  if (error) return NextResponse.json({ error }, { status: 500 });
  return NextResponse.json({ settings });
}

export async function PATCH(req: Request) {
  if ((await getBearerSessionUserId(req)) == null) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const admin = supabaseAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." }, { status: 500 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    followUpSmsDaysPrior?: unknown;
    followUpSmsPriorTime?: unknown;
    followUpSmsDayofTime?: unknown;
  };

  const current = await fetchClinicFollowUpSmsSettings(admin);
  if (current.error) return NextResponse.json({ error: current.error }, { status: 500 });

  const days =
    body.followUpSmsDaysPrior === undefined
      ? current.settings.followUpSmsDaysPrior
      : parseDays(body.followUpSmsDaysPrior);
  const priorTime =
    body.followUpSmsPriorTime === undefined
      ? current.settings.followUpSmsPriorTime
      : parseTime(body.followUpSmsPriorTime);
  const dayofTime =
    body.followUpSmsDayofTime === undefined
      ? current.settings.followUpSmsDayofTime
      : parseTime(body.followUpSmsDayofTime);

  if (days == null) {
    return NextResponse.json({ error: "followUpSmsDaysPrior must be an integer from 0 to 30." }, { status: 400 });
  }
  if (priorTime == null) {
    return NextResponse.json({ error: "followUpSmsPriorTime must be HH:mm." }, { status: 400 });
  }
  if (dayofTime == null) {
    return NextResponse.json({ error: "followUpSmsDayofTime must be HH:mm." }, { status: 400 });
  }

  const { settings, error } = await upsertClinicFollowUpSmsSettings(
    {
      followUpSmsDaysPrior: days,
      followUpSmsPriorTime: priorTime,
      followUpSmsDayofTime: dayofTime,
    },
    admin
  );
  if (error) return NextResponse.json({ error }, { status: 500 });
  return NextResponse.json({ settings });
}
