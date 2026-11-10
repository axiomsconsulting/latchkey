import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Mic } from "lucide-react";

import { guest as copy } from "@/content/copy";
import {
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
      onClick={onStart}
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
  stepKey,
  onEnd,
}: {
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

  // One engine while the concierge is on.
  useEffect(() => {
    const e = new VoiceEngine(
      gender,
      {
        onSpeaking: (on) => setBeat(on ? "speaking" : "listening"),
        onListening: (on) => setBeat((b) => (b === "speaking" ? b : on ? "listening" : "idle")),
        onHeard: (text) => void heard(text),
        onNoMic: () => setHeardText(copy.voiceNoMic),
      },
      clips ?? {},
    );
    engine.current = e;
    e.listen();
    // The guest pressed the bubble on the welcome: greet them and start.
    void e.say(["hello"]).then(() => press("yes"));
    return () => {
      e.stop();
      engine.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gender]);

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
    const s = scriptFor(stepKey, { registerPage });
    currentScript.current = s;
    listen.current = s.listen;
    script.current = s.say;
    const name = stepKey.split(":")[0];
    // The welcome's hello is said on start; the camera screens speak when the camera opens.
    if (name === "welcome") return;
    e.hush();
    void e.say(s.say);
  }, [stepKey, registerPage]);

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

  return (
    <>
      {heardText ? (
        <p
          role="status"
          className="fixed bottom-[10.5rem] right-4 z-[60] max-w-[min(22rem,80vw)] rounded-2xl bg-black px-4 py-2 text-base text-white shadow-lg"
        >
          {heardText}
        </p>
      ) : null}
      <button
        type="button"
        data-voice-corner
        onClick={() => end.current()}
        aria-label={copy.voiceStop}
        title={copy.voiceStop}
        className="fixed bottom-[4.5rem] right-4 z-[60] grid size-20 place-items-center rounded-full focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring"
      >
        <Orb className="absolute inset-0" beat={beat} />
        <Mic className="relative size-7 text-white drop-shadow" aria-hidden />
        <span className="sr-only" aria-live="polite">
          {beat === "listening" ? copy.voiceListening : ""}
        </span>
      </button>
    </>
  );
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
