import { supabase } from "@/lib/supabaseClient";
import { authenticatedFetch } from "@/lib/authenticatedFetch";
import type {
  ImagingEditRequestRow,
  ImagingEditStudySnapshot,
  ImagingItemEditState,
} from "@/lib/imagingEditRequestServer";

export type { ImagingEditRequestRow, ImagingEditStudySnapshot, ImagingItemEditState };

export async function createImagingEditRequestApi(args: {
  imagingRequestItemId: string;
  imagingRequestId?: string | null;
  study_snapshot?: Partial<ImagingEditStudySnapshot>;
  note?: string;
}): Promise<{ request: ImagingEditRequestRow | null; error: string | null; warning?: string | null }> {
  const res = await authenticatedFetch("/api/imaging/edit-requests", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  const json = (await res.json().catch(() => null)) as
    | { request?: ImagingEditRequestRow; error?: string; warning?: string | null }
    | null;
  if (!res.ok || !json?.request) {
    return { request: null, error: json?.error ?? "Failed to submit request." };
  }
  return { request: json.request, error: null, warning: json.warning ?? null };
}

export async function fetchImagingEditRequestApi(
  id: string,
): Promise<{ request: ImagingEditRequestRow | null; error: string | null }> {
  const res = await authenticatedFetch(`/api/imaging/edit-requests/${encodeURIComponent(id)}`, {
    cache: "no-store",
  });
  const json = (await res.json().catch(() => null)) as
    | { request?: ImagingEditRequestRow; error?: string }
    | null;
  if (!res.ok || !json?.request) {
    return { request: null, error: json?.error ?? "Failed to load request." };
  }
  return { request: json.request, error: null };
}

export async function fetchImagingItemEditStatesApi(
  imagingRequestId: string,
): Promise<{ states: Record<string, ImagingItemEditState>; error: string | null }> {
  const res = await authenticatedFetch(
    `/api/imaging/edit-requests?imagingRequestId=${encodeURIComponent(imagingRequestId)}`,
    { cache: "no-store" },
  );
  const json = (await res.json().catch(() => null)) as
    | { states?: Record<string, ImagingItemEditState>; error?: string }
    | null;
  if (!res.ok || !json?.states) {
    return { states: {}, error: json?.error ?? "Failed to load edit states." };
  }
  return { states: json.states, error: null };
}

export async function approveImagingEditRequestApi(
  id: string,
): Promise<{ request: ImagingEditRequestRow | null; error: string | null }> {
  const res = await authenticatedFetch(
    `/api/imaging/edit-requests/${encodeURIComponent(id)}/approve`,
    { method: "POST" },
  );
  const json = (await res.json().catch(() => null)) as
    | { request?: ImagingEditRequestRow; error?: string }
    | null;
  if (!res.ok || !json?.request) {
    return { request: null, error: json?.error ?? "Failed to approve." };
  }
  return { request: json.request, error: null };
}

export async function rejectImagingEditRequestApi(
  id: string,
): Promise<{ request: ImagingEditRequestRow | null; error: string | null }> {
  const res = await authenticatedFetch(
    `/api/imaging/edit-requests/${encodeURIComponent(id)}/reject`,
    { method: "POST" },
  );
  const json = (await res.json().catch(() => null)) as
    | { request?: ImagingEditRequestRow; error?: string }
    | null;
  if (!res.ok || !json?.request) {
    return { request: null, error: json?.error ?? "Failed to reject." };
  }
  return { request: json.request, error: null };
}

/** Realtime updates for a tech's own imaging edit requests (best-effort; page also polls). */
export function subscribeImagingEditRequestsForUser(
  userId: number,
  onEvent: (row: ImagingEditRequestRow) => void,
): () => void {
  const channel = supabase
    .channel(`imaging_edit_requests_user_${userId}`)
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "imaging_edit_requests" },
      (payload) => {
        const row = payload.new as ImagingEditRequestRow | null;
        if (!row?.id || row.requested_by_user_id !== userId) return;
        onEvent(row);
      },
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}
