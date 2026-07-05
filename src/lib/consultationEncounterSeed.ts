import { authenticatedFetch } from "@/lib/authenticatedFetch";

export type SeedNewConsultationResult = {
  seeded: boolean;
  sourceTransId: string | null;
  error: string | null;
};

/** Seed ROS + Medical History from the same patient's latest prior visit (server-side, service role). */
export async function seedNewConsultationFromPreviousVisit(
  newTransId: string,
): Promise<SeedNewConsultationResult> {
  const transId = newTransId.trim();
  if (!transId) return { seeded: false, sourceTransId: null, error: "Invalid encounter." };

  try {
    const res = await authenticatedFetch("/api/consultation/seed-from-previous-visit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transId }),
    });
    const json = (await res.json().catch(() => ({}))) as SeedNewConsultationResult & { error?: string };
    if (!res.ok) {
      return {
        seeded: false,
        sourceTransId: json.sourceTransId ?? null,
        error: json.error ?? "Could not copy prior medical history.",
      };
    }
    return {
      seeded: Boolean(json.seeded),
      sourceTransId: json.sourceTransId ?? null,
      error: null,
    };
  } catch {
    return {
      seeded: false,
      sourceTransId: null,
      error: "Could not copy prior medical history.",
    };
  }
}
