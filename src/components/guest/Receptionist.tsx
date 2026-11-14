import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ConciergeBell, Loader2, Mic, MicOff, Send, X } from "lucide-react";

import { GUEST_SEX_EVENT } from "@/components/guest/receptionist-events";
import { receptionistCopy as copy } from "@/content/copy";
import {
  receptionistAsk,
  receptionistHere,
  receptionistListen,
} from "@/lib/receptionist.functions";
import { voiceForGuest } from "@/lib/receptionist";
import { PHRASES, pickVoice } from "@/lib/voice-concierge";
import { Orb } from "@/components/guest/VoiceConcierge";
import { cn } from "@/lib/utils";

export type ReceptionistWhere =
  | { surface: "stay"; token: string }
  | { surface: "room"; code: string }
  | { surface: "kiosk"; code: string; device: string | null; session: string | null };

/** Asks the guide on this page to open a part of itself (GuideSections listens). */
export const OPEN_GUIDE_EVENT = "lk-open-guide";
/** The check-in under way on this screen (CheckInFlow tells it once the stay is found). */
export const CHECKIN_SESSION_EVENT = "lk-checkin-session";

type Turn = { role: "guest" | "receptionist"; text: string };
type Mode = "idle" | "listening" | "thinking" | "speaking";

type SR = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};
const recognition = (): (new () => SR) | null =>
  typeof window === "undefined"
    ? null
    : ((
        window as unknown as {
          SpeechRecognition?: new () => SR;
          webkitSpeechRecognition?: new () => SR;
        }
      ).SpeechRecognition ??
      (window as unknown as { webkitSpeechRecognition?: new () => SR }).webkitSpeechRecognition ??
      null);

/**
 * The AI receptionist (receptionist.ts): a text box with a microphone at the bottom of the guide,
 * or a button on the door tablet, opening a short conversation. Voice mode listens, answers aloud
 * (the studio voice when Latchkey has one, else the device's own) and listens again until the
 * guest stops it. An answer can open a part of the guide.
 */
export function Receptionist({
  where,
  variant,
  stepKey,
  raised = false,
}: {
  where: ReceptionistWhere;
  variant: "guide" | "kiosk";
  /** Sits above the check-in banner at the bottom of the stay guide. */
  raised?: boolean;
  /** The kiosk's check-in step: on "done" it opens with the way to the room. */
  stepKey?: string;
}) {
  const hereFn = useServerFn(receptionistHere);
  const askFn = useServerFn(receptionistAsk);
  const listenFn = useServerFn(receptionistListen);
  const [session, setSession] = useState<string | null>(
    where.surface === "kiosk" ? where.session : null,
  );
  const [sex, setSex] = useState<"M" | "F" | "X" | null>(null);
  const place = where.surface === "kiosk" ? { ...where, session } : where;
  const here = useQuery({
    queryKey: ["receptionist-here", JSON.stringify(place)],
    queryFn: () => hereFn({ data: { where: place } }),
    staleTime: 5 * 60_000,
  });
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const turnsRef = useRef<Turn[]>([]);
  turnsRef.current = turns;
  const [text, setText] = useState("");
  const [mode, setMode] = useState<Mode>("idle");
  const [voiceMode, setVoiceMode] = useState(false);
  const voiceRef = useRef(false);
  voiceRef.current = voiceMode;
  const audio = useRef<HTMLAudioElement | null>(null);
  const rec = useRef<SR | null>(null);
  const list = useRef<HTMLDivElement>(null);

  // The ID's sex field and the check-in's session, from the check-in on the same screen.
  useEffect(() => {
    const onSex = (e: Event) => setSex((e as CustomEvent).detail ?? null);
    const onSession = (e: Event) => setSession((e as CustomEvent).detail ?? null);
    window.addEventListener(GUEST_SEX_EVENT, onSex);
    window.addEventListener(CHECKIN_SESSION_EVENT, onSession);
    return () => {
      window.removeEventListener(GUEST_SEX_EVENT, onSex);
      window.removeEventListener(CHECKIN_SESSION_EVENT, onSession);
    };
  }, []);

  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: "smooth" });
  }, [turns, mode]);

  const stopAll = useCallback(() => {
    audio.current?.pause();
    audio.current = null;
    if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
    try {
      rec.current?.stop();
    } catch {
      // Already stopped.
    }
    rec.current = null;
  }, []);
  useEffect(() => stopAll, [stopAll]);

  const say = useCallback(
    (reply: string, mp3: string | null, voice: "female" | "male", clipUrl: string | null = null) =>
      new Promise<void>((done) => {
        stopAll();
        setMode("speaking");
        const finish = () => {
          setMode("idle");
          done();
        };
        if (mp3 || clipUrl) {
          const a = new Audio(clipUrl ?? `data:audio/mpeg;base64,${mp3}`);
          audio.current = a;
          a.onended = finish;
          a.onerror = finish;
          void a.play().catch(finish);
          return;
        }
        if (typeof speechSynthesis === "undefined") return finish();
        const u = new SpeechSynthesisUtterance(reply);
        const v = pickVoice(speechSynthesis.getVoices(), voice);
        if (v) u.voice = v;
        u.lang = v?.lang ?? "en-GB";
        u.onend = finish;
        u.onerror = finish;
        speechSynthesis.speak(u);
        // A voice that never ends (some tablets) doesn't hold the conversation up.
        setTimeout(finish, Math.min(30_000, 2000 + reply.length * 90));
      }),
    [stopAll],
  );

  // The latest ask, for answers heard after this render.
  const askRef = useRef<(q: string, spoken?: boolean) => Promise<void>>(async () => undefined);
  const listen = () => {
    const SRC = recognition();
    if (SRC) {
      const r = new SRC();
      r.lang = "en-GB";
      r.interimResults = false;
      r.continuous = false;
      let heard = "";
      r.onresult = (e) => {
        heard = Array.from(e.results)
          .map((x) => x[0]?.transcript ?? "")
          .join(" ")
          .trim();
      };
      r.onend = () => {
        rec.current = null;
        setMode("idle");
        if (heard) void askRef.current(heard, true);
        else if (voiceRef.current) setVoiceMode(false);
      };
      r.onerror = () => setMode("idle");
      rec.current = r;
      setMode("listening");
      try {
        r.start();
      } catch {
        setMode("idle");
      }
      return;
    }
    // No listening in this browser: record up to 8 seconds and read it on the server.
    void (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mr = new MediaRecorder(stream);
        const chunks: Blob[] = [];
        mr.ondataavailable = (e) => chunks.push(e.data);
        mr.onstop = async () => {
          stream.getTracks().forEach((t) => t.stop());
          setMode("thinking");
          const blob = new Blob(chunks, { type: mr.mimeType });
          const b64 = await new Promise<string>((res) => {
            const fr = new FileReader();
            fr.onload = () => res(String(fr.result).split(",")[1] ?? "");
            fr.readAsDataURL(blob);
          });
          const r = await listenFn({
            data: { where: place, audio: b64, mime: mr.mimeType || "audio/webm" },
          }).catch(() => null);
          setMode("idle");
          if (r?.text) void askRef.current(r.text, true);
          else setVoiceMode(false);
        };
        setMode("listening");
        mr.start();
        setTimeout(() => mr.state !== "inactive" && mr.stop(), 8000);
        rec.current = { stop: () => mr.state !== "inactive" && mr.stop() } as unknown as SR;
      } catch {
        setVoiceMode(false);
        setTurns((t) => [...t, { role: "receptionist", text: copy.noVoice }]);
      }
    })();
  };

  askRef.current = ask;
  async function ask(question: string, spoken = false) {
    const q = question.trim();
    if (!q) return;
    const history = turnsRef.current.slice(-8);
    setTurns((t) => [...t, { role: "guest", text: q }]);
    setText("");
    setMode("thinking");
    try {
      const r = await askFn({ data: { where: place, question: q, history, speak: spoken, sex } });
      setTurns((t) => [...t, { role: "receptionist", text: r.reply }]);
      if (r.open) {
        // The card itself matters more than the chat: fold the chat away so the card shows,
        // then the guide brings it into view and lights it up (showCard).
        if (variant === "guide") setOpen(false);
        window.dispatchEvent(new CustomEvent(OPEN_GUIDE_EVENT, { detail: r.open }));
      }
      // Recorded phrases (assisted mode) are played as recorded; the tablet's voice says the rest.
      const phrase = (r as { phrase?: string }).phrase ?? null;
      const clip = phrase ? (here.data?.clips?.[phrase] ?? null) : null;
      if (spoken || voiceRef.current) {
        await say(
          phrase && !clip ? ((PHRASES as Record<string, string>)[phrase] ?? r.reply) : r.reply,
          r.audio,
          r.voice,
          clip,
        );
        if (voiceRef.current) listen();
      } else setMode("idle");
    } catch {
      setTurns((t) => [...t, { role: "receptionist", text: copy.failed }]);
      setMode("idle");
    }
  }

  // The kiosk: once checked in, it opens and says the way to the room.
  const doneShown = useRef("");
  useEffect(() => {
    if (
      variant !== "kiosk" ||
      !here.data ||
      !stepKey?.startsWith("done:") ||
      doneShown.current === stepKey
    )
      return;
    doneShown.current = stepKey;
    const d = here.data.directions;
    if (!d?.length) return;
    const msg = `${copy.directions} ${d.join(" ")}`;
    setOpen(true);
    setTurns((t) => [...t, { role: "receptionist", text: msg }]);
    // After the check-in's own last words.
    const timer = setTimeout(
      () => void say(d.join(" "), null, voiceForGuest(here.data!, sex)),
      2500,
    );
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepKey, here.data]);
  // A new check-in on the tablet starts a new conversation.
  useEffect(() => {
    if (
      variant === "kiosk" &&
      stepKey &&
      !stepKey.startsWith("done:") &&
      stepKey.startsWith("welcome")
    ) {
      stopAll();
      setTurns([]);
      setOpen(false);
      setVoiceMode(false);
      setSex(null);
    }
  }, [stepKey, variant, stopAll]);

  if (!here.data) return null;
  const h = here.data;
  const start = () => {
    setOpen(true);
    if (!turns.length) setTurns([{ role: "receptionist", text: h.greeting }]);
  };
  const toggleVoice = () => {
    if (voiceMode) {
      setVoiceMode(false);
      stopAll();
      setMode("idle");
      return;
    }
    start();
    setVoiceMode(true);
    listen();
  };

  const panel = (
    <div
      className={cn(
        "flex flex-col overflow-hidden rounded-3xl border border-border bg-card shadow-2xl",
        variant === "kiosk" ? "max-h-[70dvh] w-[min(36rem,92vw)]" : "max-h-[60dvh] w-full",
      )}
      role="dialog"
      aria-label={copy.open}
    >
      <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <ConciergeBell className="size-5 text-primary" aria-hidden />
        <span className="min-w-0 flex-1 truncate font-medium">{h.name || copy.open}</span>
        <button
          type="button"
          onClick={() => {
            stopAll();
            setVoiceMode(false);
            setMode("idle");
            setOpen(false);
          }}
          aria-label={copy.close}
          className="grid size-10 place-items-center rounded-full hover:bg-muted"
        >
          <X className="size-5" />
        </button>
      </div>
      <div ref={list} className="min-h-0 flex-1 space-y-2 overflow-y-auto p-4" aria-live="polite">
        {turns.map((t, i) => (
          <p
            key={i}
            className={cn(
              "max-w-[85%] whitespace-pre-line rounded-2xl px-3.5 py-2 text-base",
              t.role === "guest" ? "ml-auto bg-primary text-primary-foreground" : "bg-secondary",
            )}
          >
            {t.text}
          </p>
        ))}
        {mode !== "idle" ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            {mode === "listening" ? (
              <Mic className="size-4 animate-pulse text-primary" />
            ) : (
              <Loader2 className="size-4 animate-spin" />
            )}
            {mode === "listening"
              ? copy.listening
              : mode === "thinking"
                ? copy.thinking
                : copy.speaking}
          </p>
        ) : null}
        <p className="pt-1 text-xs text-muted-foreground">{copy.aiNote}</p>
      </div>
    </div>
  );

  // The microphone, as on the door tablet's concierge: the orb, grey while muted (it starts
  // muted), breathing while it listens, beating while it speaks.
  const orbState: "muted" | "listening" | "speaking" | "thinking" | "ready" = !voiceMode
    ? "muted"
    : mode === "listening"
      ? "listening"
      : mode === "speaking"
        ? "speaking"
        : mode === "thinking"
          ? "thinking"
          : "ready";
  const bar = (
    <div className="space-y-1">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          start();
          void ask(text);
        }}
        className="flex items-center gap-2 rounded-full border border-border bg-card p-1.5 shadow-lg"
      >
        <button
          type="button"
          onClick={toggleVoice}
          aria-pressed={voiceMode}
          aria-label={voiceMode ? copy.stopTalking : copy.talk}
          title={voiceMode ? copy.stopTalking : copy.talk}
          className="relative grid size-11 shrink-0 place-items-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Orb
            className={cn("absolute inset-0", !voiceMode && "opacity-40 grayscale")}
            beat={
              orbState === "speaking" ? "speaking" : orbState === "listening" ? "listening" : "idle"
            }
          />
          {orbState === "thinking" ? (
            <Loader2 className="relative size-5 animate-spin text-white drop-shadow" aria-hidden />
          ) : voiceMode ? (
            <Mic className="relative size-5 text-white drop-shadow" aria-hidden />
          ) : (
            <MicOff className="relative size-5 text-white drop-shadow" aria-hidden />
          )}
        </button>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onFocus={start}
          placeholder={copy.ask}
          aria-label={copy.askLabel}
          maxLength={600}
          className="h-11 min-w-0 flex-1 bg-transparent px-2 text-base outline-none"
        />
        <button
          type="submit"
          disabled={!text.trim() || mode === "thinking"}
          aria-label={copy.send}
          className="grid size-11 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground disabled:opacity-40"
        >
          <Send className="size-5" />
        </button>
      </form>
      <p className="px-4 text-xs text-muted-foreground" aria-live="polite">
        {copy.orb[orbState]}
      </p>
    </div>
  );

  if (variant === "guide")
    return (
      <div
        className={cn(
          "fixed inset-x-0 z-40 mx-auto w-full max-w-2xl space-y-2 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]",
          raised ? "bottom-24" : "bottom-0",
        )}
      >
        {open ? panel : null}
        {bar}
      </div>
    );

  return (
    // Bottom centre: the corners hold the phone QR and the tablet's own controls.
    <div
      className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 flex-col items-center gap-2"
      data-no-sound
    >
      {open ? (
        <>
          {panel}
          <div className="w-[min(36rem,92vw)]">{bar}</div>
        </>
      ) : (
        <button
          type="button"
          onClick={() => {
            start();
          }}
          className="flex h-14 items-center gap-2 rounded-full bg-primary px-5 text-lg font-medium text-primary-foreground shadow-xl"
        >
          <ConciergeBell className="size-6" aria-hidden />
          {copy.open}
        </button>
      )}
    </div>
  );
}
