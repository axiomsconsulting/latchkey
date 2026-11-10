/**
 * Door tablet sounds (theme.kioskSounds, on by default): a soft click for a
 * button, a keyboard tap for letters, dates and number keys, a scroll-wheel
 * tick for sliders and a shutter for each photo. Made on the tablet with Web
 * Audio, so there are no files to load and nothing is sent anywhere. Only the
 * shared kiosk turns them on (setKioskSounds); guests' own phones stay quiet.
 */

export type SoundKind = "button" | "key" | "tick" | "shutter";

/** What a tapped element should sound like, from the attributes it carries (pure; tested). */
export function soundFor(el: {
  tag: string;
  type?: string | null;
  role?: string | null;
  disabled?: boolean;
  /** Inside a grid of choices: letters, dates, check-out days, number keys. */
  keyLike?: boolean;
}): SoundKind | null {
  if (el.disabled) return null;
  const tag = el.tag.toLowerCase();
  if (tag === "input" && el.type === "range") return null; // ticks come from its "input" events
  if (el.role === "slider") return null;
  if (el.keyLike || el.role === "gridcell" || el.role === "option") return "key";
  if (tag === "button" || el.role === "button" || el.role === "radio" || el.role === "checkbox")
    return "button";
  if (tag === "a") return "button";
  return null;
}

let enabled = false;
let flashOn = false;

/** The shared kiosk's flash setting (theme.kioskFlash): IdCamera reads it as it takes a photo. */
export function setKioskFlash(on: boolean) {
  flashOn = on;
}
export function kioskFlash(): boolean {
  return flashOn;
}
let ctx: AudioContext | null = null;
let lastTick = 0;

/** Turned on by the shared kiosk when the host's setting allows. */
export function setKioskSounds(on: boolean) {
  enabled = on;
}

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx ??= new Ctor();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function noise(a: AudioContext, seconds: number): AudioBuffer {
  const buf = a.createBuffer(1, Math.max(1, Math.round(a.sampleRate * seconds)), a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

function burst(
  a: AudioContext,
  at: number,
  length: number,
  filter: BiquadFilterType,
  freq: number,
  level: number,
) {
  const src = a.createBufferSource();
  src.buffer = noise(a, length);
  const f = a.createBiquadFilter();
  f.type = filter;
  f.frequency.value = freq;
  const g = a.createGain();
  g.gain.setValueAtTime(level, at);
  g.gain.exponentialRampToValueAtTime(0.0001, at + length);
  src.connect(f).connect(g).connect(a.destination);
  src.start(at);
  src.stop(at + length);
}

function tone(
  a: AudioContext,
  at: number,
  from: number,
  to: number,
  length: number,
  level: number,
) {
  const o = a.createOscillator();
  o.type = "sine";
  o.frequency.setValueAtTime(from, at);
  o.frequency.exponentialRampToValueAtTime(to, at + length);
  const g = a.createGain();
  g.gain.setValueAtTime(level, at);
  g.gain.exponentialRampToValueAtTime(0.0001, at + length);
  o.connect(g).connect(a.destination);
  o.start(at);
  o.stop(at + length);
}

/** Plays one sound if the kiosk has sounds on. Never throws. */
export function kioskSound(kind: SoundKind) {
  if (!enabled) return;
  const a = audio();
  if (!a) return;
  const t = a.currentTime + 0.005;
  try {
    if (kind === "button") tone(a, t, 900, 450, 0.06, 0.18);
    else if (kind === "key") burst(a, t, 0.03, "bandpass", 3200, 0.5);
    else if (kind === "tick") {
      const now = Date.now();
      if (now - lastTick < 45) return;
      lastTick = now;
      burst(a, t, 0.012, "highpass", 2500, 0.35);
    } else {
      // Shutter: the blades open, then close, over a soft thunk.
      burst(a, t, 0.045, "bandpass", 1800, 0.7);
      tone(a, t, 160, 80, 0.08, 0.25);
      burst(a, t + 0.075, 0.05, "bandpass", 2400, 0.6);
    }
  } catch {
    // Sound is a nicety: never get in the way of a check-in.
  }
}

/** Listens on the whole page while the kiosk has sounds on: taps and sliders. */
export function listenForKioskSounds(): () => void {
  const onDown = (e: PointerEvent) => {
    const target = e.target as Element | null;
    const el = target?.closest?.(
      'button, a[href], [role="button"], [role="radio"], [role="checkbox"], [role="option"], [role="gridcell"]',
    ) as HTMLElement | null;
    // The voice orb records while held: a click would land in the recording.
    if (!el || el.closest("[data-no-sound]")) return;
    const kind = soundFor({
      tag: el.tagName,
      type: el.getAttribute("type"),
      role: el.getAttribute("role"),
      disabled: (el as HTMLButtonElement).disabled || el.getAttribute("aria-disabled") === "true",
      keyLike: !!el.closest('[data-kx="grid"], [data-letter-keys], [data-sound="key"]'),
    });
    if (kind) kioskSound(kind);
  };
  const onInput = (e: Event) => {
    const el = e.target as HTMLInputElement | null;
    if (el?.tagName === "INPUT" && el.type === "range") kioskSound("tick");
  };
  window.addEventListener("pointerdown", onDown, true);
  window.addEventListener("input", onInput, true);
  return () => {
    window.removeEventListener("pointerdown", onDown, true);
    window.removeEventListener("input", onInput, true);
  };
}
