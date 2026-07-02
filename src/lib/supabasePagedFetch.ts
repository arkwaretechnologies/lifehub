import type { SupabaseClient } from "@supabase/supabase-js";
import { PAYMENT_METHODS_TABLE } from "@/lib/paymentMethods";

/** PostgREST returns at most this many rows per request unless paginated. */
export const SUPABASE_PAGE_SIZE = 1000;
export const IN_CLAUSE_CHUNK = 200;

type PageResult<T> = { rows: T[]; error: string | null };

export async function fetchAllPaged<T>(
  fetchPage: (from: number, to: number) => PromiseLike<{
    data: T[] | null;
    error: { message: string } | null;
  }>,
): Promise<PageResult<T>> {
  const rows: T[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await fetchPage(from, from + SUPABASE_PAGE_SIZE - 1);
    if (error) return { rows: [], error: error.message };
    const page = data ?? [];
    rows.push(...page);
    if (page.length < SUPABASE_PAGE_SIZE) break;
    from += SUPABASE_PAGE_SIZE;
  }
  return { rows, error: null };
}

/** Chunk `.in()` filters and page through each chunk when results may exceed 1,000 rows. */
export async function fetchAllByInChunks<T, Id>(
  ids: Id[],
  fetchChunk: (
    chunk: Id[],
    from: number,
    to: number,
  ) => PromiseLike<{
    data: T[] | null;
    error: { message: string } | null;
  }>,
): Promise<PageResult<T>> {
  const rows: T[] = [];
  for (let i = 0; i < ids.length; i += IN_CLAUSE_CHUNK) {
    const chunk = ids.slice(i, i + IN_CLAUSE_CHUNK);
    let from = 0;
    for (;;) {
      const { data, error } = await fetchChunk(chunk, from, from + SUPABASE_PAGE_SIZE - 1);
      if (error) return { rows: [], error: error.message };
      const page = data ?? [];
      rows.push(...page);
      if (page.length < SUPABASE_PAGE_SIZE) break;
      from += SUPABASE_PAGE_SIZE;
    }
  }
  return { rows, error: null };
}

/** Chunk `.in()` filters when each chunk returns fewer than 1,000 rows. */
export async function fetchAllByInChunksOnce<T, Id>(
  ids: Id[],
  fetchChunk: (chunk: Id[]) => PromiseLike<{
    data: T[] | null;
    error: { message: string } | null;
  }>,
): Promise<PageResult<T>> {
  const rows: T[] = [];
  for (let i = 0; i < ids.length; i += IN_CLAUSE_CHUNK) {
    const chunk = ids.slice(i, i + IN_CLAUSE_CHUNK);
    const { data, error } = await fetchChunk(chunk);
    if (error) return { rows: [], error: error.message };
    rows.push(...((data ?? []) as T[]));
  }
  return { rows, error: null };
}

export async function fetchUsersByIds(
  db: SupabaseClient,
  userIds: number[],
): Promise<PageResult<{ user_id: number; fullname: string | null }>> {
  return fetchAllByInChunksOnce(userIds, (chunk) =>
    db.from("users").select("user_id, fullname").in("user_id", chunk),
  );
}

export async function fetchPatientsByIds(
  db: SupabaseClient,
  patientIds: number[],
): Promise<PageResult<{ id: number; name: string | null }>> {
  return fetchAllByInChunksOnce(patientIds, (chunk) =>
    db.from("patients").select("id, name").in("id", chunk),
  );
}

export async function fetchPaymentMethodsByIds(
  db: SupabaseClient,
  paymentIds: number[],
): Promise<PageResult<{ id: number; name: string | null }>> {
  return fetchAllByInChunksOnce(paymentIds, (chunk) =>
    db.from(PAYMENT_METHODS_TABLE).select("id, name").in("id", chunk),
  );
}
