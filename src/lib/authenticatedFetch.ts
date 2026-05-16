import { readLifehubSessionToken } from "@/lib/lifehubSessionStorage";

/** Same-origin fetch with Bearer token from `lifehub_session` (required by API middleware). */
export async function authenticatedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const token = readLifehubSessionToken();
  const headers = new Headers(init?.headers ?? undefined);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return fetch(input, { ...init, headers });
}
