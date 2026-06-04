import { supabase } from "@/lib/supabaseClient";
import { authenticatedFetch } from "@/lib/authenticatedFetch";
import type {
  CartLineRequestAction,
  CartLineSnapshot,
  PharmacyCartLineRequestRow,
} from "@/lib/pharmacyLineRequestServer";

export type { CartLineRequestAction, CartLineSnapshot, PharmacyCartLineRequestRow };

export async function verifySupervisorApi(
  identifier: string,
  input_password: string,
): Promise<{ ok: boolean; displayName?: string; error?: string }> {
  const res = await authenticatedFetch("/api/auth/verify-supervisor", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier, input_password }),
  });
  const json = (await res.json().catch(() => null)) as
    | { ok?: boolean; displayName?: string; error?: string }
    | null;
  if (!res.ok || !json?.ok) {
    return { ok: false, error: json?.error ?? "Verification failed." };
  }
  return { ok: true, displayName: json.displayName };
}

export async function createCartLineRequestApi(args: {
  action: CartLineRequestAction;
  cart_line_key: string;
  line_snapshot: CartLineSnapshot;
  note?: string;
}): Promise<{ request: PharmacyCartLineRequestRow | null; error: string | null }> {
  const res = await authenticatedFetch("/api/pharmacy/cart-line-requests", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  const json = (await res.json().catch(() => null)) as
    | { request?: PharmacyCartLineRequestRow; error?: string }
    | null;
  if (!res.ok || !json?.request) {
    return { request: null, error: json?.error ?? "Failed to submit request." };
  }
  return { request: json.request, error: null };
}

export async function fetchCartLineRequestApi(
  id: string,
): Promise<{ request: PharmacyCartLineRequestRow | null; error: string | null }> {
  const res = await authenticatedFetch(`/api/pharmacy/cart-line-requests/${encodeURIComponent(id)}`, {
    cache: "no-store",
  });
  const json = (await res.json().catch(() => null)) as
    | { request?: PharmacyCartLineRequestRow; error?: string }
    | null;
  if (!res.ok || !json?.request) {
    return { request: null, error: json?.error ?? "Failed to load request." };
  }
  return { request: json.request, error: null };
}

export async function approveCartLineRequestApi(
  id: string,
): Promise<{ request: PharmacyCartLineRequestRow | null; error: string | null }> {
  const res = await authenticatedFetch(
    `/api/pharmacy/cart-line-requests/${encodeURIComponent(id)}/approve`,
    { method: "POST" },
  );
  const json = (await res.json().catch(() => null)) as
    | { request?: PharmacyCartLineRequestRow; error?: string }
    | null;
  if (!res.ok || !json?.request) {
    return { request: null, error: json?.error ?? "Failed to approve." };
  }
  return { request: json.request, error: null };
}

export async function rejectCartLineRequestApi(
  id: string,
): Promise<{ request: PharmacyCartLineRequestRow | null; error: string | null }> {
  const res = await authenticatedFetch(
    `/api/pharmacy/cart-line-requests/${encodeURIComponent(id)}/reject`,
    { method: "POST" },
  );
  const json = (await res.json().catch(() => null)) as
    | { request?: PharmacyCartLineRequestRow; error?: string }
    | null;
  if (!res.ok || !json?.request) {
    return { request: null, error: json?.error ?? "Failed to reject." };
  }
  return { request: json.request, error: null };
}

export function cartLineToSnapshot(
  line: {
    product: { id: string; generic_name: string; brand_name?: string | null; unit_price: number };
    qty: number;
    prescriptionItemId?: string | null;
  },
  requestedQty?: number,
): CartLineSnapshot {
  const requested_qty =
    requestedQty != null && Number.isFinite(requestedQty) && requestedQty >= 1
      ? Math.round(requestedQty)
      : undefined;
  return {
    product_id: line.product.id,
    generic_name: line.product.generic_name,
    brand_name: line.product.brand_name ?? null,
    unit_price: line.product.unit_price,
    qty: line.qty,
    requested_qty,
    prescription_item_id: line.prescriptionItemId ?? null,
  };
}

/** Realtime updates for cashier's own cart line requests (best-effort; POS also polls). */
export function subscribeCartLineRequestsForUser(
  userId: number,
  onEvent: (row: PharmacyCartLineRequestRow) => void,
): () => void {
  const channel = supabase
    .channel(`pharmacy_cart_line_requests_user_${userId}`)
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "pharmacy_cart_line_requests" },
      (payload) => {
        const row = payload.new as PharmacyCartLineRequestRow | null;
        if (!row?.id || row.requested_by_user_id !== userId) return;
        onEvent(row);
      },
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}

/** Realtime for approver notifications. */
export function subscribeNotificationsForUser(
  userId: number,
  onEvent: () => void,
): () => void {
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  const notify = () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      onEvent();
    }, 300);
  };

  const channel = supabase
    .channel(`notifications_user_${userId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "notifications",
        filter: `user_id=eq.${userId}`,
      },
      () => notify(),
    )
    .subscribe();

  return () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    void supabase.removeChannel(channel);
  };
}
