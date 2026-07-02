/**
 * Backfill encounters.encounter_date / encounter_time from created_at in clinic timezone.
 * Fixes rows created before explicit clinic-local dates were set (UTC CURRENT_DATE off-by-one).
 *
 * Usage: node scripts/backfill-encounter-dates.mjs [--dry-run]
 */
import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";

const root = process.cwd();
const dryRun = process.argv.includes("--dry-run");

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const text = fs.readFileSync(filePath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] == null || process.env[key] === "") {
      process.env[key] = val;
    }
  }
}

loadEnvFile(path.join(root, ".env.local"));
loadEnvFile(path.join(root, ".env"));

function clinicTimeZone() {
  return (
    process.env.NEXT_PUBLIC_QUEUE_TICKET_TIMEZONE?.trim() ||
    process.env.NEXT_PUBLIC_QUEUE_TICKET_DATE_TZ?.trim() ||
    "Asia/Manila"
  );
}

function clinicDateYmd(date, tz = clinicTimeZone()) {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date);
    const y = parts.find((p) => p.type === "year")?.value ?? "";
    const m = parts.find((p) => p.type === "month")?.value ?? "";
    const d = parts.find((p) => p.type === "day")?.value ?? "";
    if (y && m && d) return `${y}-${m}-${d}`;
  } catch {
    // fall through
  }
  return date.toISOString().slice(0, 10);
}

function clinicTimeHms(date, tz = clinicTimeZone()) {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: tz,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).formatToParts(date);
    const h = parts.find((p) => p.type === "hour")?.value ?? "00";
    const min = parts.find((p) => p.type === "minute")?.value ?? "00";
    const s = parts.find((p) => p.type === "second")?.value ?? "00";
    return `${h}:${min}:${s}`;
  } catch {
    const h = String(date.getHours()).padStart(2, "0");
    const min = String(date.getMinutes()).padStart(2, "0");
    const sec = String(date.getSeconds()).padStart(2, "0");
    return `${h}:${min}:${sec}`;
  }
}

function normalizeDateYmd(raw) {
  if (raw == null) return "";
  const s = String(raw).trim();
  return s.length >= 10 ? s.slice(0, 10) : s;
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const tz = clinicTimeZone();
const pageSize = 500;
let offset = 0;
let scanned = 0;
let updated = 0;
let skipped = 0;

console.log(`Clinic timezone: ${tz}`);
console.log(dryRun ? "DRY RUN — no rows will be updated." : "Live run — updating mismatched rows.");

while (true) {
  const { data, error } = await admin
    .from("encounters")
    .select("trans_id, encounter_date, encounter_time, created_at")
    .order("created_at", { ascending: true })
    .range(offset, offset + pageSize - 1);

  if (error) {
    console.error("Fetch error:", error.message);
    process.exit(1);
  }

  const rows = data ?? [];
  if (rows.length === 0) break;

  for (const row of rows) {
    scanned += 1;
    const createdAt = row.created_at ? new Date(String(row.created_at)) : null;
    if (!createdAt || Number.isNaN(createdAt.getTime())) {
      skipped += 1;
      continue;
    }

    const expectedDate = clinicDateYmd(createdAt, tz);
    const expectedTime = clinicTimeHms(createdAt, tz);
    const currentDate = normalizeDateYmd(row.encounter_date);
    const currentTime = row.encounter_time == null ? "" : String(row.encounter_time).trim();

    const dateMismatch = currentDate !== expectedDate;
    const timeMissing = currentTime === "";
    if (!dateMismatch && !timeMissing) {
      skipped += 1;
      continue;
    }

    const patch = {
      encounter_date: expectedDate,
      encounter_time: timeMissing ? expectedTime : currentTime,
    };

    if (dryRun) {
      console.log(
        `[dry-run] ${row.trans_id}: ${currentDate || "(null)"} ${currentTime || "(null)"} -> ${patch.encounter_date} ${patch.encounter_time}`,
      );
      updated += 1;
      continue;
    }

    const { error: upErr } = await admin.from("encounters").update(patch).eq("trans_id", row.trans_id);
    if (upErr) {
      console.error(`Update failed for ${row.trans_id}:`, upErr.message);
      process.exit(1);
    }
    console.log(
      `Updated ${row.trans_id}: ${currentDate || "(null)"} -> ${patch.encounter_date}, time ${currentTime || "(null)"} -> ${patch.encounter_time}`,
    );
    updated += 1;
  }

  if (rows.length < pageSize) break;
  offset += pageSize;
}

console.log(`Done. Scanned ${scanned}, updated ${updated}, unchanged ${skipped}.`);
