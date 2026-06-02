const SEMAPHORE_SEND_URL = "https://api.semaphore.co/api/v4/messages";

export type SemaphoreSendInput = {
  number: string;
  message: string;
};

export type SemaphoreSendResult = {
  ok: boolean;
  error: string | null;
  messageId: string | null;
  status: string | null;
};

type SemaphoreMessageResponseRow = {
  message_id?: number | string | null;
  status?: string | null;
};

function senderNameFromEnv(): string {
  return (
    process.env.SEMPAHORE_SENDERNAME?.trim() ??
    process.env.SEMAPHORE_SENDERNAME?.trim() ??
    ""
  );
}

function normalizeRecipientNumber(raw: string): string | null {
  const digits = raw.replace(/\D+/g, "");
  if (!digits) return null;
  if (digits.startsWith("63") && digits.length === 12) return digits;
  if (digits.startsWith("09") && digits.length === 11) return `63${digits.slice(1)}`;
  if (digits.startsWith("9") && digits.length === 10) return `63${digits}`;
  return null;
}

export function semaphoreConfigured(): boolean {
  return Boolean(process.env.SEMAPHORE_API?.trim()) && Boolean(senderNameFromEnv());
}

export async function sendSemaphoreSms(input: SemaphoreSendInput): Promise<SemaphoreSendResult> {
  const apikey = process.env.SEMAPHORE_API?.trim() ?? "";
  const sendername = senderNameFromEnv();
  if (!apikey) {
    return { ok: false, error: "SEMAPHORE_API is not configured.", messageId: null, status: null };
  }
  if (!sendername) {
    return { ok: false, error: "SEMPAHORE_SENDERNAME is not configured.", messageId: null, status: null };
  }

  const number = normalizeRecipientNumber(input.number);
  if (!number) {
    return { ok: false, error: "Invalid patient contact number.", messageId: null, status: null };
  }

  const message = String(input.message ?? "").trim();
  if (!message) {
    return { ok: false, error: "SMS message is empty.", messageId: null, status: null };
  }

  const body = new URLSearchParams({
    apikey,
    number,
    message,
    sendername,
  });

  const upstream = await fetch(SEMAPHORE_SEND_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });

  const text = await upstream.text().catch(() => "");
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }

  if (!upstream.ok) {
    const detail =
      typeof parsed === "object" && parsed !== null && "message" in parsed
        ? String((parsed as { message?: unknown }).message ?? "")
        : text || `HTTP ${upstream.status}`;
    return {
      ok: false,
      error: `Semaphore send failed: ${detail}`.trim(),
      messageId: null,
      status: null,
    };
  }

  const first = Array.isArray(parsed) ? ((parsed[0] ?? null) as SemaphoreMessageResponseRow | null) : null;
  return {
    ok: true,
    error: null,
    messageId: first?.message_id != null ? String(first.message_id) : null,
    status: first?.status != null ? String(first.status) : null,
  };
}
