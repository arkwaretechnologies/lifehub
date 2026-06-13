import { authenticatedFetch } from "@/lib/authenticatedFetch";
import type { LabSignatureRole } from "@/lib/labResultSignatures";

export type SignatureBytesResult = {
  bytes: Uint8Array | null;
  contentType: string | null;
};

async function fetchSignatureBytesFromUrl(url: string): Promise<SignatureBytesResult> {
  const res = await authenticatedFetch(url, { cache: "no-store" });
  if (res.status === 404) return { bytes: null, contentType: null };
  if (!res.ok) return { bytes: null, contentType: null };
  const contentType = res.headers.get("content-type");
  const buf = await res.arrayBuffer();
  if (!buf.byteLength) return { bytes: null, contentType: null };
  return { bytes: new Uint8Array(buf), contentType };
}

export async function fetchLabSignatorySignatureBytes(
  role: LabSignatureRole,
): Promise<SignatureBytesResult> {
  return fetchSignatureBytesFromUrl(
    `/api/laboratory/lab-result-signatories/signature-bytes?role=${encodeURIComponent(role)}`,
  );
}

export async function fetchPhysicianSignatureBytes(userId: number): Promise<SignatureBytesResult> {
  if (!Number.isFinite(userId) || userId <= 0) return { bytes: null, contentType: null };
  return fetchSignatureBytesFromUrl(
    `/api/users/${encodeURIComponent(String(userId))}/signature/bytes`,
  );
}
