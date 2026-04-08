import { supabase } from "@/lib/supabaseClient";

export const PHYSICIAN_FEE_SALES_TABLE = "physician_fee_sales" as const;
const USERS_TABLE = "users" as const;

export type PhysicianFeeSaleRow = {
  id: string;
  patient_id: number | null;
  encounter_id: string | null;
  physician_id: number | null;
  subtotal: number | string;
  discount_type_id: number | null;
  discount_amount: number | string;
  total_amount: number | string;
  notes: string | null;
  created_at: string;
};

export async function fetchLatestPhysicianFeeSaleForEncounter(encounterId: string): Promise<{
  sale: PhysicianFeeSaleRow | null;
  error: string | null;
}> {
  const res = await supabase
    .from(PHYSICIAN_FEE_SALES_TABLE)
    .select(
      "id, patient_id, encounter_id, physician_id, subtotal, discount_type_id, discount_amount, total_amount, notes, created_at",
    )
    .eq("encounter_id", encounterId)
    .order("created_at", { ascending: false })
    .limit(1);

  if (res.error) return { sale: null, error: res.error.message };
  const rows = (res.data ?? []) as PhysicianFeeSaleRow[];
  return { sale: rows[0] ?? null, error: null };
}

export async function upsertPhysicianFeeSaleForEncounter(args: {
  existingId?: string | null;
  patientId: number | null;
  encounterId: string;
  physicianId: number | null;
  subtotal: number;
  discountAmount: number;
  totalAmount: number;
  discountTypeId: number | null;
  notes: string | null;
  servedBy?: string | null;
}): Promise<{ id: string | null; error: string | null }> {
  const payload = {
    patient_id: args.patientId,
    encounter_id: args.encounterId,
    physician_id: args.physicianId,
    subtotal: args.subtotal,
    discount_type_id: args.discountTypeId,
    discount_amount: args.discountAmount,
    vat_amount: 0,
    total_amount: args.totalAmount,
    status: "Completed",
    served_by: args.servedBy ?? null,
    notes: args.notes,
  } as const;

  if (args.existingId) {
    const res = await supabase
      .from(PHYSICIAN_FEE_SALES_TABLE)
      .update(payload)
      .eq("id", args.existingId)
      .select("id")
      .limit(1);
    if (res.error) return { id: null, error: res.error.message };
    const id = (res.data as Array<{ id: string }> | null)?.[0]?.id ?? args.existingId;
    return { id, error: null };
  }

  const res = await supabase.from(PHYSICIAN_FEE_SALES_TABLE).insert(payload).select("id").limit(1);
  if (res.error) return { id: null, error: res.error.message };
  const id = (res.data as Array<{ id: string }> | null)?.[0]?.id ?? null;
  return { id, error: null };
}

export async function resolveValidPhysicianId(candidate: number | null): Promise<{
  physicianId: number | null;
  error: string | null;
}> {
  if (candidate == null) return { physicianId: null, error: null };
  const res = await supabase.from(USERS_TABLE).select("user_id").eq("user_id", candidate).limit(1);
  if (res.error) return { physicianId: null, error: res.error.message };
  const rows = (res.data ?? []) as Array<{ user_id: number }>;
  return { physicianId: rows.length > 0 ? candidate : null, error: null };
}

