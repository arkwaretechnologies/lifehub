import type { SupabaseClient } from "@supabase/supabase-js";
import { ALLERGIES_TABLE } from "@/lib/allergies";
import { FAMILY_HISTORY_TABLE } from "@/lib/familyHistory";
import { OBSTETRIC_HISTORY_TABLE } from "@/lib/obstetricHistory";
import { PAST_MEDICAL_HISTORY_TABLE } from "@/lib/pastMedicalHistory";
import { PREVIOUS_HOSPITALIZATIONS_TABLE } from "@/lib/previousHospitalizations";
import { REVIEW_OF_SYSTEMS_TABLE } from "@/lib/reviewOfSystems";
import { SOCIAL_HISTORY_TABLE } from "@/lib/socialHistory";
import { SURGICAL_HISTORY_TABLE } from "@/lib/surgicalHistory";
import type { SeedNewConsultationResult } from "@/lib/consultationEncounterSeed";

const ENCOUNTERS_TABLE = "encounters" as const;

/** 1:1 clinical tables copied on new consultation (excludes vital_signs / medications). */
const CLINICAL_COPY_TABLES_ONE_TO_ONE = [
  PAST_MEDICAL_HISTORY_TABLE,
  FAMILY_HISTORY_TABLE,
  ALLERGIES_TABLE,
  SOCIAL_HISTORY_TABLE,
  OBSTETRIC_HISTORY_TABLE,
  REVIEW_OF_SYSTEMS_TABLE,
] as const;

const CLINICAL_COPY_TABLES = [
  ...CLINICAL_COPY_TABLES_ONE_TO_ONE,
  SURGICAL_HISTORY_TABLE,
  PREVIOUS_HOSPITALIZATIONS_TABLE,
] as const;

const ROW_META_KEYS = new Set(["id", "trans_id", "created_at", "updated_at"]);

async function encounterPatientId(
  admin: SupabaseClient,
  transId: string,
): Promise<{ patientId: number | null; error: string | null }> {
  const id = transId.trim();
  if (!id) return { patientId: null, error: "Invalid encounter." };

  const { data, error } = await admin
    .from(ENCOUNTERS_TABLE)
    .select("patient_id")
    .eq("trans_id", id)
    .maybeSingle();

  if (error) return { patientId: null, error: error.message };
  const patientId = Number((data as { patient_id?: number } | null)?.patient_id);
  if (!Number.isFinite(patientId) || patientId <= 0) {
    return { patientId: null, error: "Encounter not found." };
  }
  return { patientId, error: null };
}

function rowHasUserData(row: Record<string, unknown>): boolean {
  for (const [key, val] of Object.entries(row)) {
    if (ROW_META_KEYS.has(key)) continue;
    if (val === null || val === undefined) continue;
    if (typeof val === "boolean") {
      if (val) return true;
      continue;
    }
    if (typeof val === "string" && val.trim()) return true;
    if (typeof val === "number" && Number.isFinite(val) && val !== 0) return true;
  }
  return false;
}

async function encounterHasClinicalHistory(
  admin: SupabaseClient,
  transId: string,
): Promise<boolean> {
  for (const table of CLINICAL_COPY_TABLES) {
    if (table === PREVIOUS_HOSPITALIZATIONS_TABLE || table === SURGICAL_HISTORY_TABLE) {
      const { data, error } = await admin.from(table).select("*").eq("trans_id", transId);
      if (error) continue;
      for (const row of data ?? []) {
        if (rowHasUserData(row as Record<string, unknown>)) return true;
      }
      continue;
    }
    const { data, error } = await admin.from(table).select("*").eq("trans_id", transId).maybeSingle();
    if (error) continue;
    if (data && rowHasUserData(data as Record<string, unknown>)) return true;
  }
  return false;
}

async function encounterHasAnyClinicalRow(admin: SupabaseClient, transId: string): Promise<boolean> {
  for (const table of CLINICAL_COPY_TABLES) {
    const { data, error } = await admin.from(table).select("id").eq("trans_id", transId).limit(1).maybeSingle();
    if (!error && data) return true;
  }
  return false;
}

/** Most recent prior visit with saved ROS / Medical History (excludes the new encounter). */
export async function fetchPreviousEncounterTransIdAdmin(
  admin: SupabaseClient,
  patientId: number,
  excludeTransId: string,
): Promise<{ transId: string | null; error: string | null }> {
  if (!Number.isFinite(patientId) || patientId <= 0) {
    return { transId: null, error: "Invalid patient." };
  }
  const exclude = excludeTransId.trim();
  if (!exclude) return { transId: null, error: "Invalid encounter." };

  const { data, error } = await admin
    .from(ENCOUNTERS_TABLE)
    .select("trans_id")
    .eq("patient_id", patientId)
    .neq("trans_id", exclude)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) return { transId: null, error: error.message };
  const rows = (data ?? []) as { trans_id?: string }[];

  for (const row of rows) {
    const transId = row.trans_id ? String(row.trans_id).trim() : "";
    if (!transId) continue;
    if (await encounterHasClinicalHistory(admin, transId)) {
      return { transId, error: null };
    }
  }

  for (const row of rows) {
    const transId = row.trans_id ? String(row.trans_id).trim() : "";
    if (!transId) continue;
    if (await encounterHasAnyClinicalRow(admin, transId)) {
      return { transId, error: null };
    }
  }

  const fallback = rows[0]?.trans_id ? String(rows[0].trans_id).trim() : null;
  return { transId: fallback || null, error: null };
}

/**
 * Copy Review of Systems and Medical History (except vital signs, anthropometrics, and medications)
 * from the patient's latest prior visit into a new encounter. Uses service role (bypasses RLS).
 */
export async function seedNewConsultationFromPreviousVisitAdmin(
  admin: SupabaseClient,
  newTransId: string,
): Promise<SeedNewConsultationResult> {
  const target = newTransId.trim();
  if (!target) return { seeded: false, sourceTransId: null, error: "Invalid encounter." };

  const { patientId: targetPatientId, error: targetPatientErr } = await encounterPatientId(admin, target);
  if (targetPatientErr || targetPatientId == null) {
    return { seeded: false, sourceTransId: null, error: targetPatientErr ?? "Encounter not found." };
  }

  if (await encounterHasAnyClinicalRow(admin, target)) {
    return { seeded: false, sourceTransId: null, error: null };
  }

  const { transId: sourceTransId, error: prevErr } = await fetchPreviousEncounterTransIdAdmin(
    admin,
    targetPatientId,
    target,
  );
  if (prevErr) return { seeded: false, sourceTransId: null, error: prevErr };
  if (!sourceTransId) return { seeded: false, sourceTransId: null, error: null };

  const { patientId: sourcePatientId, error: sourcePatientErr } = await encounterPatientId(admin, sourceTransId);
  if (sourcePatientErr || sourcePatientId == null) {
    return { seeded: false, sourceTransId: null, error: sourcePatientErr ?? "Prior encounter not found." };
  }
  if (sourcePatientId !== targetPatientId) {
    return {
      seeded: false,
      sourceTransId: null,
      error: "Prior visit belongs to a different patient.",
    };
  }

  const errors: string[] = [];
  let copiedTables = 0;

  for (const table of CLINICAL_COPY_TABLES_ONE_TO_ONE) {
    const { data, error } = await admin.from(table).select("*").eq("trans_id", sourceTransId).maybeSingle();
    if (error) {
      errors.push(error.message);
      continue;
    }
    if (!data) continue;

    const source = data as Record<string, unknown>;
    const payload: Record<string, unknown> = { trans_id: target };
    for (const [key, val] of Object.entries(source)) {
      if (ROW_META_KEYS.has(key)) continue;
      payload[key] = val;
    }

    const { error: insertError } = await admin.from(table).insert(payload);
    if (insertError) errors.push(insertError.message);
    else copiedTables += 1;
  }

  const { data: prevHospRows, error: prevHospErr } = await admin
    .from(PREVIOUS_HOSPITALIZATIONS_TABLE)
    .select("*")
    .eq("trans_id", sourceTransId)
    .order("id");
  if (prevHospErr) {
    errors.push(prevHospErr.message);
  } else if (prevHospRows?.length) {
    const payloads = (prevHospRows as Record<string, unknown>[]).map((source) => {
      const payload: Record<string, unknown> = { trans_id: target };
      for (const [key, val] of Object.entries(source)) {
        if (ROW_META_KEYS.has(key)) continue;
        payload[key] = val;
      }
      return payload;
    });
    const { error: insertError } = await admin.from(PREVIOUS_HOSPITALIZATIONS_TABLE).insert(payloads);
    if (insertError) errors.push(insertError.message);
    else copiedTables += 1;
  }

  const { data: surgicalRows, error: surgicalErr } = await admin
    .from(SURGICAL_HISTORY_TABLE)
    .select("*")
    .eq("trans_id", sourceTransId)
    .order("id");
  if (surgicalErr) {
    errors.push(surgicalErr.message);
  } else if (surgicalRows?.length) {
    const payloads = (surgicalRows as Record<string, unknown>[]).map((source) => {
      const payload: Record<string, unknown> = { trans_id: target };
      for (const [key, val] of Object.entries(source)) {
        if (ROW_META_KEYS.has(key)) continue;
        payload[key] = val;
      }
      return payload;
    });
    const { error: insertError } = await admin.from(SURGICAL_HISTORY_TABLE).insert(payloads);
    if (insertError) errors.push(insertError.message);
    else copiedTables += 1;
  }

  return {
    seeded: copiedTables > 0,
    sourceTransId,
    error: errors.length > 0 ? errors[0]! : null,
  };
}
