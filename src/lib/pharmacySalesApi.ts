import { authenticatedFetch } from "@/lib/authenticatedFetch";
import type { PharmacySaleSearchRow, PharmacySaleVoidDetail } from "@/lib/pharmacyPosDb";

export async function searchPharmacySalesByOrApi(
  orQuery: string,
  limit = 30,
): Promise<{ sales: PharmacySaleSearchRow[]; error: string | null }> {
  const q = orQuery.trim();
  if (!q) return { sales: [], error: null };

  const res = await authenticatedFetch(
    `/api/pharmacy/sales/search?q=${encodeURIComponent(q)}&limit=${limit}`,
  );
  const payload = (await res.json().catch(() => ({}))) as {
    sales?: PharmacySaleSearchRow[];
    error?: string;
  };
  if (!res.ok) {
    return { sales: [], error: payload.error ?? "Search failed." };
  }
  return { sales: payload.sales ?? [], error: null };
}

export async function fetchPharmacySaleDetailApi(
  saleId: string,
): Promise<{ detail: PharmacySaleVoidDetail | null; error: string | null }> {
  const id = saleId.trim();
  if (!id) return { detail: null, error: "Sale id required." };

  const res = await authenticatedFetch(`/api/pharmacy/sales/${encodeURIComponent(id)}`);
  const payload = (await res.json().catch(() => ({}))) as {
    detail?: PharmacySaleVoidDetail;
    error?: string;
  };
  if (!res.ok) {
    return { detail: null, error: payload.error ?? "Could not load sale." };
  }
  return { detail: payload.detail ?? null, error: null };
}

export async function voidPharmacySaleApi(
  saleId: string,
  reason?: string,
): Promise<{ error: string | null }> {
  const id = saleId.trim();
  if (!id) return { error: "Sale id required." };

  const res = await authenticatedFetch(`/api/pharmacy/sales/${encodeURIComponent(id)}/void`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reason: reason?.trim() || undefined }),
  });
  const payload = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) {
    return { error: payload.error ?? "Void failed." };
  }
  return { error: null };
}
