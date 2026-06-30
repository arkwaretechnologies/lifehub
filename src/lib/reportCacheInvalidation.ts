import "server-only";

import {
  encounterSummaryCacheKey,
  resolveEncounterSummaryRange,
  type EncounterSummaryPeriod,
} from "@/lib/encounterSummaryReport";
import { isReportCacheEnabled } from "@/lib/redis/config";
import { redisDel } from "@/lib/redis/operations";

const ROLLING_PERIODS: EncounterSummaryPeriod[] = ["today", "week", "month"];

/** Clear encounter-summary report keys for today / week / month (custom ranges expire by TTL). */
export async function invalidateEncounterSummaryReportCache(): Promise<void> {
  if (!isReportCacheEnabled()) return;

  const keys: string[] = [];
  for (const period of ROLLING_PERIODS) {
    const { range, error } = resolveEncounterSummaryRange(period, null, null);
    if (!error) {
      keys.push(encounterSummaryCacheKey(period, range));
    }
  }

  await Promise.all(keys.map((key) => redisDel(key)));
}
