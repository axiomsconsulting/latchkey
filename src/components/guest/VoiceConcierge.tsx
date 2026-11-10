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
import { voiceIntent } from "@/lib/voice.functions";
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
  if (!voiceSupported().speak) return null;
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
  stepKey,
  onEnd,
}: {
  code: string;
  gender: VoiceGender;
  stepKey: string;
  onEnd: () => void;
}) {
  const [beat, setBeat] = useState<"idle" | "speaking" | "listening">("idle");
  const engine = useRef<VoiceEngine | null>(null);
  const listen = useRef<Intent[]>([]);
  const script = useRef<PhraseKey[]>([]);
  const lastGuide = useRef<{ key: PhraseKey | null; at: number }>({ key: null, at: 0 });
  const intentFn = useServerFn(voiceIntent);
  const end = useRef(onEnd);
  end.current = onEnd;

  const press = (intent: Intent): boolean => {
    const el = document.querySelector<HTMLButtonElement>(
      `[data-kiosk-flow] [data-voice="${intent}"]:not([disabled])`,
    );
    if (!el) return false;
    el.click();
    return true;
  };

  // One engine while the concierge is on.
  useEffect(() => {
    const e = new VoiceEngine(gender, {
      onSpeaking: (on) => setBeat(on ? "speaking" : "listening"),
      onListening: (on) => setBeat((b) => (b === "speaking" ? b : on ? "listening" : "idle")),
      onHeard: (text) => void heard(text),
      onNoMic: () => undefined,
    });
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
    if (!press(intent)) return void e.say(["tapInstead"]);
    // Going home fills the answer; saying it should also move on.
    if (intent === "home") window.setTimeout(() => press("yes"), 700);
  }

  // Each screen: its script, said once, and the answers it listens for.
  const registerPage = useRegisterPage();
  useEffect(() => {
    const e = engine.current;
    if (!e) return;
    const s = scriptFor(stepKey, { registerPage });
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
