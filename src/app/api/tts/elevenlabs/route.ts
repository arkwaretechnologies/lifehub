import { NextRequest, NextResponse } from "next/server";

const ELEVEN_BASE = "https://api.elevenlabs.io/v1";
/** Prevent abuse / oversized payloads (middleware already requires login). */
const MAX_TEXT_CHARS = 8000;

/**
 * Server-only proxy: generates speech with ElevenLabs so the API key never reaches the browser.
 * POST body: `{ "text": "..." }` → `audio/mpeg` stream.
 */
export async function POST(req: NextRequest) {
  const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json(
      { error: "ELEVENLABS_API_KEY is not set" },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const text =
    typeof body === "object" && body !== null && "text" in body
      ? String((body as { text?: unknown }).text ?? "").trim()
      : "";

  if (!text) {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }

  if (text.length > MAX_TEXT_CHARS) {
    return NextResponse.json(
      { error: `text must be at most ${MAX_TEXT_CHARS} characters.` },
      { status: 400 },
    );
  }

  const voiceId =
    process.env.ELEVENLABS_VOICE_ID?.trim() || "21m00Tcm4TlvDq8ikWAM";
  const modelId =
    process.env.ELEVENLABS_MODEL_ID?.trim() || "eleven_multilingual_v2";

  const upstream = await fetch(
    `${ELEVEN_BASE}/text-to-speech/${encodeURIComponent(voiceId)}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        model_id: modelId,
      }),
    },
  );

  if (!upstream.ok) {
    const errText = await upstream.text().catch(() => upstream.statusText);
    const isDev = process.env.NODE_ENV === "development";
    return NextResponse.json(
      {
        error: "Speech synthesis failed.",
        ...(isDev ? { detail: errText || `HTTP ${upstream.status}` } : {}),
      },
      { status: 502 },
    );
  }

  const buf = await upstream.arrayBuffer();
  const contentType =
    upstream.headers.get("content-type") || "audio/mpeg";

  return new NextResponse(buf, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "no-store",
    },
  });
}
