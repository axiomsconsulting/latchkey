import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useServerFn } from "@tanstack/react-start";
import { Mic, Volume2, VolumeX } from "lucide-react";

import { guest as copy } from "@/content/copy";
import {
  guideScript,
  guidanceFor,
  intentFor,
  scriptFor,
  shouldSay,
  type GuidanceInput,
  type Intent,
  type PhraseKey,
  type VoiceGender,
} from "@/lib/voice-concierge";
import { VoiceEngine, voiceSupported } from "@/lib/voice-engine";
import { voiceIntent, voiceTranscribe } from "@/lib/voice.functions";
import { cn } from "@/lib/utils";

/** The colourful, gently waving orb: blue, green, yellow and red turning inside a soft blob. */
function Orb({ className, beat }: { className?: string; beat: "idle" | "speaking" | "listening" }) {
  return (
    <span
      aria-hidden
      data-voice-orb={beat}
      className={cn("voice-orb relative block overflow-hidden", className)}
    >
      <span className="voice-orb-spin absolute inset-[-25%]" />
      <span className="voice-orb-shine absolute inset-0" />
    </span>
  );
}

/**
 * Whether this tablet can speak. Known only in the browser: read after the first paint, so the
 * very first welcome gets it too (the server's copy of the page can't tell).
 */
export function useCanSpeak(): boolean {
  const [can, setCan] = useState(false);
  useEffect(() => setCan(voiceSupported().speak), []);
  return can;
}

/** The tablet's top bar slot for the concierge's controls (#kiosk-voice-slot), as it's drawn. */
function useVoiceSlot(): HTMLElement | null {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const find = () => setSlot(document.getElementById("kiosk-voice-slot"));
    find();
    // The bar is drawn again when the screen changes way up or look.
    const mo = new MutationObserver(find);
    mo.observe(document.body, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, []);
  return slot;
}

/**
 * Check in with the concierge: the orb's colours turning in a thick, glowing ring round the
 * button (`children`), its corners following the button's own.
 */
export function VoiceRing({ children }: { children: ReactNode }) {
  const box = useRef<HTMLSpanElement>(null);
  const [radius, setRadius] = useState<number | null>(null);
  useEffect(() => {
    const b = box.current?.querySelector<HTMLElement>("[data-slot=button], button");
    if (b) setRadius(parseFloat(getComputedStyle(b).borderTopLeftRadius) || 0);
  }, []);
  return (
    <span
      ref={box}
      data-voice-cta
      className="voice-ring relative flex w-full max-w-md"
      style={radius === null ? undefined : { borderRadius: radius + 7 }}
    >
      <span className="relative flex w-full">{children}</span>
    </span>
  );
}

/**
 * Before a check-in: the concierge's mute in the top bar, so the host (or a guest) can choose
 * quiet before anyone starts. Each check-in starts, and ends, the way this is set.
 */
export function VoiceMuteDefault({ muted, onToggle }: { muted: boolean; onToggle: () => void }) {
  const slot = useVoiceSlot();
  const can = useCanSpeak();
  if (!slot || !can) return null;
  return createPortal(<MuteButton muted={muted} onClick={onToggle} />, slot);
}

function MuteButton({ muted, onClick }: { muted: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      data-no-sound
      onClick={onClick}
      aria-pressed={muted}
      aria-label={muted ? copy.voiceUnmute : copy.voiceMute}
      title={muted ? copy.voiceUnmute : copy.voiceMute}
      className={cn(
        "grid size-[2.25em] shrink-0 place-items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        muted
          ? "bg-foreground text-background"
          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
      )}
    >
      {muted ? (
        <VolumeX className="size-[1.25em]" aria-hidden />
      ) : (
        <Volume2 className="size-[1.25em]" aria-hidden />
      )}
    </button>
  );
}

/**
 * The concierge at work: speaks each screen's script with the tablet's own voice, listens for
 * the answers that screen expects and presses the matching button (data-voice), guides the
 * ID and face into place from what the camera sees, and asks AI only when it can't tell what
 * was said. Its orb sits in the corner and beats while it speaks; a tap ends it.
 */
export function VoiceConcierge({
  code,
  gender,
  clips,
  cloudEar = false,
  listens = true,
  startMuted = false,
  stepKey,
  onEnd,
}: {
  /** The tablet's choice before the check-in began: start quiet (VoiceMuteDefault). */
  startMuted?: boolean;
  /**
   * The host lets this tablet listen (kiosk_devices.voice_listen). Off: guide only. It talks the
   * guest through each screen they tap and never opens the microphone.
   */
  listens?: boolean;
  /** Cloud listening is available, for tablets that can't listen themselves. */
  cloudEar?: boolean;
  code: string;
  gender: VoiceGender;
  /** Studio recordings by phrase, when Latchkey admin has made them. */
  clips?: Record<string, string> | undefined;
  stepKey: string;
  onEnd: () => void;
}) {
  const [beat, setBeat] = useState<"idle" | "speaking" | "listening">("idle");
  // The microphone's level, as a ring round the orb (set directly, many times a second).
  const ring = useRef<HTMLSpanElement>(null);
  const [holding, setHolding] = useState(false);
  const [muted, setMuted] = useState(startMuted);
  // What it just heard, shown by the orb for a moment, so the guest sees it understood them.
  const [heardText, setHeardText] = useState<string | null>(null);
  useEffect(() => {
    if (!heardText) return;
    const t = window.setTimeout(() => setHeardText(null), 3500);
    return () => window.clearTimeout(t);
  }, [heardText]);
  const engine = useRef<VoiceEngine | null>(null);
  const listen = useRef<Intent[]>([]);
  const script = useRef<PhraseKey[]>([]);
  const currentScript = useRef<ReturnType<typeof scriptFor> | null>(null);
  const lastGuide = useRef<{ key: PhraseKey | null; at: number }>({ key: null, at: 0 });
  const intentFn = useServerFn(voiceIntent);
  const transcribeFn = useServerFn(voiceTranscribe);
  const end = useRef(onEnd);
  end.current = onEnd;

  // Any button on screen for that answer: some sit in the Jumbo bars, outside the step's card.
  const press = (intent: Intent): boolean => {
    const el = [
      ...document.querySelectorAll<HTMLButtonElement>(
        `[data-kiosk-root] [data-voice="${intent}"]:not([disabled])`,
      ),
    ].find((b) => b.offsetParent !== null || b.getClientRects().length > 0);
    if (!el) return false;
    el.click();
    return true;
  };

  const greeted = useRef(false);
  // One engine while the concierge is on.
  useEffect(() => {
    const android = /android/i.test(navigator.userAgent);
    const e = new VoiceEngine(
      gender,
      {
        onSpeaking: (on) => setBeat(on ? "speaking" : listens ? "listening" : "idle"),
        onListening: (on) => setBeat((b) => (b === "speaking" ? b : on ? "listening" : "idle")),
        onHeard: (text) => void heard(text),
        onNoMic: () => setHeardText(copy.voiceNoMic),
        onTrouble: (why) =>
          setHeardText(why === "silent" ? copy.voiceHoldHint : copy.voiceTrouble(why, cloudEar)),
        // Cloud listening: one short recording at a time, turned into words on the server.
        transcribe: cloudEar
          ? async (audio) => {
              const b64 = await blobBase64(audio);
              if (!b64) return null;
              const mime = (audio.type || "audio/webm").slice(0, 60);
              const res = await transcribeFn({ data: { code, audio: b64, mime } }).catch(
                () => null,
              );
              const text = res?.text?.trim() ?? "";
              if (!text) setHeardText(copy.voiceHoldHint);
              return text || null;
            }
          : null,
        // The ring round the orb follows the microphone, so the guest sees it hears them.
        onLevel: (level) => {
          const el = ring.current;
          if (el) el.style.transform = `scale(${1 + Math.min(level * 6, 0.35)})`;
        },
        preferCloud: android && cloudEar,
      },
      clips ?? {},
    );
    engine.current = e;
    if (listens) e.listen();
    // Muted (before the check-in, or by tapping mute since): it stays quiet until unmuted.
    if (startMuted || muted) e.mute();
    // Check in itself opened the first step (the same tap that started this): the greeting
    // comes with that step's words, below, so nothing waits for it.
    return () => {
      e.stop();
      engine.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gender, listens]);

  async function heard(text: string) {
    const e = engine.current;
    if (!e) return;
    setHeardText(`“${text.trim()}”`);
    // Speaking to the tablet is using it: the kiosk's idle timer (useKioskIdle) counts key presses.
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Unidentified" }));
    const allowed = listen.current;
    let intent = intentFor(text, allowed);
    if (!intent && allowed.some((i) => !["repeat", "help", "stop"].includes(i))) {
      // The awkward moment: the rules didn't recognise it. AI picks among what this screen expects.
      const res = await intentFn({
        data: { code, transcript: text, expected: [...allowed] },
      }).catch(() => null);
      intent = (res?.intent as Intent | null) ?? null;
    }
    if (!intent) return void e.say(["notUnderstood"]);
    if (intent === "stop") {
      await e.say(["goodbye"]);
      return end.current();
    }
    if (intent === "repeat") return void e.say(script.current);
    if (intent === "help") return void e.say(["tapInstead", ...script.current]);
    const s = currentScript.current;
    const target = s?.alias?.[intent] ?? intent;
    const first = s?.before?.[intent];
    if (first) await e.say([first]);
    if (!press(target)) return void e.say(["tapInstead"]);
    // Going home fills the answer; saying it should also move on.
    if (intent === "home") window.setTimeout(() => press("yes"), 700);
  }

  // Each screen: its script, said once, and the answers it listens for.
  const registerPage = useRegisterPage();
  useEffect(() => {
    const e = engine.current;
    if (!e) return;
    const full = scriptFor(stepKey, { registerPage });
    const s = listens ? full : guideScript(full);
    currentScript.current = s;
    listen.current = s.listen;
    script.current = s.say;
    const name = stepKey.split(":")[0];
    if (name === "welcome") return;
    // The first screen after Check in: hello, then what to do here, straight away (once: the
    // host switching listening on or off mid check-in only changes how it carries on).
    const hello: PhraseKey[] = greeted.current ? [] : [listens ? "hello" : "helloGuide"];
    greeted.current = true;
    e.hush();
    void e.say([...hello, ...s.say]);
  }, [stepKey, registerPage, listens]);

  // Back at the welcome after a check-in (done, or reset): the concierge's work is over.
  const started = useRef(false);
  useEffect(() => {
    if (!stepKey.startsWith("welcome")) started.current = true;
    else if (started.current) end.current();
  }, [stepKey]);

  // The camera: say what to do when it opens, guide the ID or face in, and note the shot.
  useEffect(() => {
    const onCamera = (ev: Event) => {
      const kind = (ev as CustomEvent<{ kind: "id" | "face" }>).detail.kind;
      script.current = [kind === "id" ? "idShow" : "faceShow"];
      engine.current?.hush();
      void engine.current?.say(script.current);
      lastGuide.current = { key: null, at: Date.now() + 2500 };
    };
    const onSnap = (ev: Event) => {
      const g = guidanceFor((ev as CustomEvent<GuidanceInput>).detail);
      const now = Date.now();
      if (!g || !shouldSay(g, lastGuide.current, now)) return;
      lastGuide.current = { key: g, at: now };
      void engine.current?.say([g]);
    };
    const onShot = () => {
      engine.current?.hush();
      void engine.current?.say(["checking"]);
      lastGuide.current = { key: null, at: Date.now() + 4000 };
    };
    window.addEventListener("lk-camera", onCamera);
    window.addEventListener("lk-snap", onSnap);
    window.addEventListener("lk-shot", onShot);
    return () => {
      window.removeEventListener("lk-camera", onCamera);
      window.removeEventListener("lk-snap", onSnap);
      window.removeEventListener("lk-shot", onShot);
    };
  }, []);

  // The orb and its × sit in the tablet's own top bar (#kiosk-voice-slot, beside the phone
  // QR icon), so they never cover anything on the screen, a QR code included.
  const slot = useVoiceSlot();

  const controls = (
    <>
      {/* Mute: the concierge goes quiet (and stops listening) but stays; unmute carries on from this screen. */}
      <MuteButton
        muted={muted}
        onClick={() => {
          const e = engine.current;
          if (!e) return;
          if (e.isMuted) {
            e.unmute();
            setMuted(false);
            void e.say(script.current);
          } else {
            e.mute();
            setMuted(true);
          }
        }}
      />
      {listens ? (
        // Hold the orb to talk (it records exactly while held).
        <button
          type="button"
          data-voice-corner
          data-no-sound
          aria-label={copy.voiceHold}
          title={copy.voiceHold}
          onPointerDown={(e) => {
            e.preventDefault();
            (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
            setHolding(true);
            void engine.current?.holdStart();
          }}
          onPointerUp={() => {
            setHolding(false);
            engine.current?.holdEnd();
          }}
          onPointerCancel={() => {
            setHolding(false);
            engine.current?.holdEnd();
          }}
          onContextMenu={(e) => e.preventDefault()}
          className="relative grid size-[3em] shrink-0 touch-none select-none place-items-center rounded-full focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring"
        >
          <span
            ref={ring}
            aria-hidden
            className="absolute inset-0 rounded-full border-[0.2em] border-white transition-transform duration-75"
          />
          <Orb
            className={cn("absolute inset-0", muted && "opacity-40 grayscale")}
            beat={muted ? "idle" : holding ? "listening" : beat}
          />
          <Mic className="relative size-[1.3em] text-white drop-shadow" aria-hidden />
          <span className="sr-only" aria-live="polite">
            {beat === "listening" || holding ? copy.voiceListening : ""}
          </span>
        </button>
      ) : (
        // Guide only: the orb beats while it talks; a tap says the instruction again.
        <button
          type="button"
          data-voice-corner
          aria-label={copy.voiceAgain}
          title={copy.voiceAgain}
          onClick={() => {
            if (muted) return;
            engine.current?.hush();
            void engine.current?.say(script.current);
          }}
          className="relative grid size-[3em] shrink-0 place-items-center rounded-full focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring"
        >
          <Orb
            className={cn("absolute inset-0", muted && "opacity-40 grayscale")}
            beat={muted ? "idle" : beat}
          />
        </button>
      )}
    </>
  );

  return (
    <>
      {heardText ? (
        <p
          role="status"
          className="pointer-events-none fixed right-4 top-[7rem] z-[60] max-w-[min(22rem,80vw)] rounded-2xl bg-black px-4 py-2 text-base text-white shadow-lg"
        >
          {heardText}
        </p>
      ) : null}
      {holding ? (
        <p className="pointer-events-none fixed right-4 top-[7rem] z-[60] rounded-full bg-black px-4 py-2 text-base text-white">
          {copy.voiceHolding}
        </p>
      ) : null}
      {slot ? createPortal(controls, slot) : null}
    </>
  );
}

/** A recording as base64, for the server (voiceTranscribe). */
function blobBase64(b: Blob): Promise<string | null> {
  return new Promise((resolve) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result ?? "").split(",")[1] ?? null);
    r.onerror = () => resolve(null);
    r.readAsDataURL(b);
  });
}

/** The register's page on Jumbo (RegisterPager's data-register-page), as it changes. */
function useRegisterPage(): string | null {
  const [page, setPage] = useState<string | null>(null);
  useEffect(() => {
    const read = () =>
      setPage(
        document.querySelector("[data-register-page]")?.getAttribute("data-register-page") ?? null,
      );
    read();
    const mo = new MutationObserver(read);
    mo.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["data-register-page"],
    });
    return () => mo.disconnect();
  }, []);
  return page;
}
