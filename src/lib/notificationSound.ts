/** Shared Web Audio chime for in-app notifications (dashboard bell). */

let audioCtx: AudioContext | null = null;
let primeListenersAttached = false;

function getContext(): AudioContext {
  if (!audioCtx) {
    audioCtx = new AudioContext();
  }
  return audioCtx;
}

export async function resumeNotificationAudio(): Promise<void> {
  try {
    const ctx = getContext();
    if (ctx.state === "suspended") {
      await ctx.resume();
    }
  } catch {
    /* ignore */
  }
}

/** Call once so the first user click/keypress can unlock audio (browser autoplay policy). */
export function primeNotificationSound(): void {
  if (typeof document === "undefined" || primeListenersAttached) return;
  primeListenersAttached = true;

  const unlock = () => {
    const ctx = getContext();
    if (ctx.state === "suspended") {
      void ctx.resume();
    }
  };

  document.addEventListener("pointerdown", unlock, { capture: true });
  document.addEventListener("keydown", unlock, { capture: true });
}

function playTone(
  ctx: AudioContext,
  frequency: number,
  startAt: number,
  durationSec: number,
  volume: number,
) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = frequency;
  osc.connect(gain);
  gain.connect(ctx.destination);
  gain.gain.setValueAtTime(0, startAt);
  gain.gain.linearRampToValueAtTime(volume, startAt + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, startAt + durationSec);
  osc.start(startAt);
  osc.stop(startAt + durationSec + 0.05);
}

/** Two-tone chime; no-op if autoplay is still blocked. */
export async function playNotificationChime(): Promise<void> {
  if (typeof window === "undefined") return;

  try {
    const ctx = getContext();
    if (ctx.state === "suspended") {
      await ctx.resume();
    }
    if (ctx.state !== "running") return;

    const t = ctx.currentTime;
    playTone(ctx, 880, t, 0.12, 0.22);
    playTone(ctx, 1174.66, t + 0.14, 0.18, 0.2);
  } catch {
    /* ignore — e.g. autoplay blocked until user interacts with the page */
  }
}
