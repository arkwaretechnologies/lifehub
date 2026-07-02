import { NextRequest, NextResponse } from "next/server";
import {
  encounterSummaryCacheKey,
  resolveEncounterSummaryRange,
  type EncounterSummaryDepartmentRow,
  type EncounterSummaryResponse,
  type EncounterSummaryStatusRow,
} from "@/lib/encounterSummaryReport";
import { PHARMACY_SALES_TABLE } from "@/lib/pharmacyPosDb";
import { supabaseAdminClient } from "@/lib/supabaseAdminClient";
import { readUpstashJson, writeUpstashJson } from "@/lib/upstashCache";
import { isReportCacheEnabled, reportCacheTtlSeconds } from "@/lib/redis/config";
import { fetchAllByInChunks, fetchAllPaged } from "@/lib/supabasePagedFetch";

const ENCOUNTER_SUMMARY_CACHE_TTL_SECONDS = reportCacheTtlSeconds();

type EncounterRow = {
  trans_id: string;
  patient_id: number | null;
  disposition: string | null;
};

function addCount(map: Map<string, number>, key: string): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}

export async function GET(req: NextRequest) {
  const admin = supabaseAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." }, { status: 500 });
  }

  const sp = req.nextUrl.searchParams;
  const parsed = resolveEncounterSummaryRange(sp.get("period"), sp.get("start"), sp.get("end"));
  if (parsed.error) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const { period, range } = parsed;
  const key = encounterSummaryCacheKey(period, range);

  if (isReportCacheEnabled()) {
    const cached = await readUpstashJson<EncounterSummaryResponse>(key);
    if (cached) return NextResponse.json({ ...cached, cacheHit: true });
  }

  const encRes = await fetchAllPaged<EncounterRow>((from, to) =>
    admin
      .from("encounters")
      .select("trans_id, patient_id, disposition")
      .gte("encounter_date", range.startDate)
      .lte("encounter_date", range.endDate)
      .range(from, to),
  );
  if (encRes.error) return NextResponse.json({ error: encRes.error }, { status: 500 });

  const rows = encRes.rows;
  const encounterIds = rows.map((r) => String(r.trans_id ?? "").trim()).filter(Boolean);
  const encounterSet = new Set(encounterIds);

  const [labRes, imagingRes, pharmacyRes] = await Promise.all([
    encounterIds.length > 0
      ? fetchAllByInChunks<{ encounter_id?: string | null }, string>(encounterIds, (chunk, from, to) =>
          admin
            .from("lab_requests")
            .select("encounter_id")
            .in("encounter_id", chunk)
            .gte("request_date", range.startDate)
            .lte("request_date", range.endDate)
            .range(from, to),
        )
      : Promise.resolve({ rows: [] as Array<{ encounter_id?: string | null }>, error: null }),
    encounterIds.length > 0
      ? fetchAllByInChunks<{ encounter_id?: string | null }, string>(encounterIds, (chunk, from, to) =>
          admin
            .from("imaging_requests")
            .select("encounter_id")
            .in("encounter_id", chunk)
            .gte("request_date", range.startDate)
            .lte("request_date", range.endDate)
            .range(from, to),
        )
      : Promise.resolve({ rows: [] as Array<{ encounter_id?: string | null }>, error: null }),
    fetchAllPaged<{ patient_id: number | null }>((from, to) =>
      admin
        .from(PHARMACY_SALES_TABLE)
        .select("patient_id")
        .eq("status", "Completed")
        .gte("sale_date", range.startDate)
        .lte("sale_date", range.endDate)
        .range(from, to),
    ),
  ]);

  if (labRes.error) return NextResponse.json({ error: labRes.error }, { status: 500 });
  if (imagingRes.error) return NextResponse.json({ error: imagingRes.error }, { status: 500 });
  if (pharmacyRes.error) return NextResponse.json({ error: pharmacyRes.error }, { status: 500 });

  const statusCounts = new Map<string, number>();
  for (const row of rows) {
    const label = (row.disposition ?? "").trim() === "" ? "In progress" : "Completed";
    addCount(statusCounts, label);
  }
  const statusBreakdown: EncounterSummaryStatusRow[] = [...statusCounts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);

  const labSet = new Set(
    labRes.rows
      .map((r) => String(r.encounter_id ?? "").trim())
      .filter((id) => id !== "" && encounterSet.has(id)),
  );
  const imagingSet = new Set(
    imagingRes.rows
      .map((r) => String(r.encounter_id ?? "").trim())
      .filter((id) => id !== "" && encounterSet.has(id)),
  );
  const encounterPatientSet = new Set(
    rows.map((r) => r.patient_id).filter((id): id is number => id != null),
  );
  const pharmacySet = new Set(
    pharmacyRes.rows
      .map((r) => r.patient_id)
      .filter((id): id is number => id != null && encounterPatientSet.has(id)),
  );

  const departmentBreakdown: EncounterSummaryDepartmentRow[] = [
    { label: "Consultation", count: rows.length },
    { label: "Laboratory", count: labSet.size },
    { label: "Imaging", count: imagingSet.size },
    { label: "Pharmacy", count: pharmacySet.size },
  ];

  const payload: EncounterSummaryResponse = {
    period,
    range,
    totalEncounters: rows.length,
    uniquePatients: new Set(rows.map((r) => r.patient_id).filter((id): id is number => id != null)).size,
    statusBreakdown,
    departmentBreakdown,
    error: null,
    cacheHit: false,
  };

  if (isReportCacheEnabled()) {
    await writeUpstashJson(key, payload, ENCOUNTER_SUMMARY_CACHE_TTL_SECONDS);
  }
  return NextResponse.json(payload);
}
