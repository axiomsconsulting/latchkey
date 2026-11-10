import { useEffect, useRef, useState } from "react";
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
import { VoiceEngine, unlockAudio, voiceSupported } from "@/lib/voice-engine";
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

/** Beside Check in on the welcome: starts the voice concierge. */
export function VoiceStartBubble({ onStart }: { onStart: () => void }) {
  // Known only in the browser: drawn after the first paint, so the very first welcome has it
  // too (the server's copy of the page can't tell whether the tablet can speak).
  const [can, setCan] = useState(false);
  useEffect(() => setCan(voiceSupported().speak), []);
  if (!can) return null;
  return (
    <button
      type="button"
      onClick={() => {
        // This tap is what lets an Android tablet measure and record sound later.
        unlockAudio();
        onStart();
      }}
      aria-label={copy.voiceStart}
      title={copy.voiceStart}
      className="group relative grid size-[4.5rem] shrink-0 place-items-center rounded-full focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring"
    >
      <Orb className="absolute inset-0" beat="idle" />
      <Mic className="relative size-7 text-white drop-shadow" aria-hidden />
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
  stepKey,
  onEnd,
}: {
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
  const [muted, setMuted] = useState(false);
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
    // The guest pressed the bubble on the welcome: greet them and start (once: the host
    // switching listening on or off mid check-in only changes how it carries on).
    if (!greeted.current) {
      greeted.current = true;
      void e.say([listens ? "hello" : "helloGuide"]).then(() => press("yes"));
    }
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
    // The welcome's hello is said on start; the camera screens speak when the camera opens.
    if (name === "welcome") return;
    e.hush();
    void e.say(s.say);
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
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const find = () => setSlot(document.getElementById("kiosk-voice-slot"));
    find();
    // The bar is drawn again when the screen changes way up or look.
    const mo = new MutationObserver(find);
    mo.observe(document.body, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, []);

  const controls = (
    <>
      {/* Mute: the concierge goes quiet (and stops listening) but stays; unmute carries on from this screen. */}
      <button
        type="button"
        data-no-sound
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
