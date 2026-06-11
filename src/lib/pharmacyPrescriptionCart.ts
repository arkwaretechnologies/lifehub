import { authenticatedFetch } from "@/lib/authenticatedFetch";
import type { PrescriptionCartByEncounterResult } from "@/lib/pharmacyPosDb";

/** Load prescription cart with dispensed flags via authenticated API (bypasses RLS on pharmacy sales). */
export async function fetchPrescriptionCartByEncounterAuth(
  transId: string,
): Promise<PrescriptionCartByEncounterResult> {
  const tid = transId.trim();
  if (!tid) {
    return { prescriptionId: null, patientId: null, patientName: null, lines: [], error: null };
  }

  const res = await authenticatedFetch(
    `/api/pharmacy/prescription-by-encounter?trans_id=${encodeURIComponent(tid)}`,
  );
  const payload = (await res.json().catch(() => ({}))) as PrescriptionCartByEncounterResult & { error?: string };
  if (!res.ok) {
    return {
      prescriptionId: null,
      patientId: null,
      patientName: null,
      lines: [],
      error: payload.error ?? "Failed to load prescription.",
    };
  }
  return {
    prescriptionId: payload.prescriptionId ?? null,
    patientId: payload.patientId ?? null,
    patientName: payload.patientName ?? null,
    lines: Array.isArray(payload.lines) ? payload.lines : [],
    error: null,
  };
}
