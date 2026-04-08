import { supabase } from "@/lib/supabaseClient";
import { LAB_REQUEST_ITEMS_TABLE, LAB_REQUESTS_TABLE } from "@/lib/labRequests";
import { ALLERGIES_TABLE } from "@/lib/allergies";
import { CURRENT_MEDICATIONS_TABLE } from "@/lib/currentMedications";
import { FAMILY_HISTORY_TABLE } from "@/lib/familyHistory";
import { OBSTETRIC_HISTORY_TABLE } from "@/lib/obstetricHistory";
import { PAST_MEDICAL_HISTORY_TABLE } from "@/lib/pastMedicalHistory";
import { PHYSICAL_EXAMINATION_TABLE } from "@/lib/physicalExamination";
import { PREVIOUS_HOSPITALIZATIONS_TABLE } from "@/lib/previousHospitalizations";
import { REVIEW_OF_SYSTEMS_TABLE } from "@/lib/reviewOfSystems";
import { SOCIAL_HISTORY_TABLE } from "@/lib/socialHistory";
import { SURGICAL_HISTORY_TABLE } from "@/lib/surgicalHistory";
import { VITAL_SIGNS_TABLE } from "@/lib/vitalSigns";

const ENCOUNTERS_TABLE = "encounters" as const;

async function deleteByTransId(table: string, transId: string): Promise<string | null> {
  const { error } = await supabase.from(table).delete().eq("trans_id", transId);
  return error ? error.message : null;
}

/**
 * Deletes an encounter and all consultation-linked rows.
 * If your DB has ON DELETE CASCADE, deleting from `encounters` may already remove most rows,
 * but we still delete explicitly to be safe.
 */
export async function deleteEncounterEverywhere(transIdRaw: string): Promise<{ error: string | null }> {
  const transId = transIdRaw.trim();
  if (!transId) return { error: "Invalid encounter." };

  // Lab requests: delete items then headers (encounter_id FK differs from trans_id).
  const { data: reqRows, error: reqErr } = await supabase
    .from(LAB_REQUESTS_TABLE)
    .select("id")
    .eq("encounter_id", transId);
  if (reqErr) return { error: reqErr.message };

  const reqIds = (reqRows ?? []).map((r) => (r as { id?: string } | null)?.id).filter(Boolean) as string[];
  if (reqIds.length > 0) {
    const delItems = await supabase.from(LAB_REQUEST_ITEMS_TABLE).delete().in("lab_request_id", reqIds);
    if (delItems.error) return { error: delItems.error.message };
  }
  const delReq = await supabase.from(LAB_REQUESTS_TABLE).delete().eq("encounter_id", transId);
  if (delReq.error) return { error: delReq.error.message };

  // Tables keyed by trans_id.
  const errs: string[] = [];
  for (const t of [
    VITAL_SIGNS_TABLE,
    REVIEW_OF_SYSTEMS_TABLE,
    PHYSICAL_EXAMINATION_TABLE,
    ALLERGIES_TABLE,
    CURRENT_MEDICATIONS_TABLE,
    SOCIAL_HISTORY_TABLE,
    FAMILY_HISTORY_TABLE,
    PAST_MEDICAL_HISTORY_TABLE,
    SURGICAL_HISTORY_TABLE,
    PREVIOUS_HOSPITALIZATIONS_TABLE,
    OBSTETRIC_HISTORY_TABLE,
  ]) {
    const e = await deleteByTransId(t, transId);
    if (e) errs.push(`${t}: ${e}`);
  }
  if (errs.length) return { error: errs.join(" · ") };

  // Finally delete the encounter record.
  const { error } = await supabase.from(ENCOUNTERS_TABLE).delete().eq("trans_id", transId);
  if (error) return { error: error.message };

  return { error: null };
}

