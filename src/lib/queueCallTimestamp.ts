/** Fresh ISO timestamp for queue handoff (call / recall). */
export function queueCallTimestamp(): string {
  return new Date().toISOString();
}

/**
 * Next `called_at` for TV recall: must differ from `previous` when parsed to the same millisecond.
 */
export function nextQueueCalledAtIso(previous: string | null | undefined): string {
  let next = queueCallTimestamp();
  if (!previous) return next;
  if (previous === next) {
    return new Date(Date.now() + 1).toISOString();
  }
  const p = Date.parse(previous);
  const n = Date.parse(next);
  if (!Number.isNaN(p) && !Number.isNaN(n) && p === n) {
    return new Date(n + 1).toISOString();
  }
  return next;
}