/**
 * The door tablet's voice (browser only): speaks with the tablet's own built-in voices
 * (speechSynthesis: on the device, free, no AI) and listens with its speech recognition.
 * Listening pauses while it speaks, so it never hears itself. Nothing is recorded or kept.
 */
import { PHRASES, pickVoice, type PhraseKey, type VoiceGender } from "./voice-concierge";

type Rec = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult:
    | ((e: {
        results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
        resultIndex: number;
      }) => void)
    | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
};

export function voiceSupported(): { speak: boolean; listen: boolean } {
  if (typeof window === "undefined") return { speak: false, listen: false };
  const w = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
  return {
    speak: "speechSynthesis" in window,
    listen: !!(w.SpeechRecognition ?? w.webkitSpeechRecognition),
  };
}

export type VoiceEvents = {
  onSpeaking: (on: boolean) => void;
  onListening: (on: boolean) => void;
  onHeard: (text: string) => void;
  /** The microphone was refused or isn't there: carry on speaking, guests tap instead. */
  onNoMic: () => void;
};

export class VoiceEngine {
  private rec: Rec | null = null;
  private want = false;
  private speaking = 0;
  private gender: VoiceGender;
  private stopped = false;
  private clips: Partial<Record<PhraseKey, HTMLAudioElement>> = {};
  private playing: HTMLAudioElement | null = null;
  constructor(
    gender: VoiceGender,
    private ev: VoiceEvents,
    /** Studio recordings by phrase (Latchkey admin made them once); the tablet's voice otherwise. */
    clipUrls: Partial<Record<string, string>> = {},
  ) {
    this.gender = gender;
    for (const [k, url] of Object.entries(clipUrls)) {
      if (!url) continue;
      const a = new Audio(url);
      a.preload = "auto";
      this.clips[k as PhraseKey] = a;
    }
  }

  /** One studio recording, start to end (or a few seconds' grace if it never says it ended). */
  private play(a: HTMLAudioElement): Promise<void> {
    return new Promise((resolve) => {
      let ended = false;
      const once = () => {
        if (ended) return;
        ended = true;
        window.clearTimeout(guard);
        a.onended = null;
        a.onerror = null;
        if (this.playing === a) this.playing = null;
        resolve();
      };
      const guard = window.setTimeout(once, 15_000);
      a.onended = once;
      a.onerror = once;
      this.playing = a;
      try {
        a.currentTime = 0;
      } catch {
        /* not loaded yet */
      }
      void a.play().catch(once);
    });
  }

  /** Says phrases one after another (or plain text); resolves when finished or cut short. */
  async say(keys: Array<PhraseKey | { text: string }>): Promise<void> {
    if (this.stopped || !keys.length) return;
    // Studio recordings where there are any; the tablet's own voice for the rest.
    const recorded = keys.every((k) => typeof k === "string" && this.clips[k]);
    if (recorded) {
      this.hush();
      this.pauseListening();
      this.speaking++;
      this.ev.onSpeaking(true);
      for (const k of keys) {
        if (this.stopped) break;
        await this.play(this.clips[k as PhraseKey]!);
      }
      this.speaking = Math.max(0, this.speaking - 1);
      if (!this.speaking) {
        this.ev.onSpeaking(false);
        this.resumeListening();
      }
      return;
    }
    return this.speakTts(keys);
  }

  private speakTts(keys: Array<PhraseKey | { text: string }>): Promise<void> {
    if (this.stopped || !voiceSupported().speak || !keys.length) return Promise.resolve();
    const synth = window.speechSynthesis;
    synth.cancel();
    this.pauseListening();
    const voice = pickVoice(synth.getVoices(), this.gender);
    return new Promise((resolve) => {
      let left = keys.length;
      this.speaking++;
      this.ev.onSpeaking(true);
      const finish = () => {
        if (--left > 0) return;
        this.speaking = Math.max(0, this.speaking - 1);
        if (!this.speaking) {
          this.ev.onSpeaking(false);
          this.resumeListening();
        }
        resolve();
      };
      for (const k of keys) {
        const u = new SpeechSynthesisUtterance(typeof k === "string" ? PHRASES[k] : k.text);
        if (voice) u.voice = voice;
        u.lang = voice?.lang ?? "en-GB";
        u.rate = 1;
        // Without a named voice of that kind, a touch higher or lower.
        u.pitch = voice ? 1 : this.gender === "female" ? 1.15 : 0.85;
        // Some tablets never say when a phrase ends (or fail to fetch a voice): it's ended after
        // about as long as it takes to say, so listening always comes back.
        let ended = false;
        const once = () => {
          if (ended) return;
          ended = true;
          window.clearTimeout(guard);
          finish();
        };
        const guard = window.setTimeout(
          () => {
            synth.cancel();
            once();
          },
          2500 + u.text.length * 90,
        );
        u.onend = once;
        u.onerror = once;
        synth.speak(u);
      }
    });
  }

  /** Stops talking at once (a new screen, or the guest spoke over it). */
  hush() {
    if (voiceSupported().speak) window.speechSynthesis.cancel();
    if (this.playing) {
      this.playing.pause();
      this.playing.dispatchEvent(new Event("ended"));
    }
  }

  listen() {
    this.want = true;
    this.resumeListening();
  }

  private pauseListening() {
    try {
      this.rec?.abort();
    } catch {
      /* already stopped */
    }
    this.rec = null;
    this.ev.onListening(false);
  }

  private resumeListening() {
    if (!this.want || this.stopped || this.speaking || this.rec) return;
    const w = window as unknown as {
      SpeechRecognition?: new () => Rec;
      webkitSpeechRecognition?: new () => Rec;
    };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) return this.ev.onNoMic();
    const rec = new Ctor();
    rec.lang = "en-GB";
    rec.continuous = true;
    rec.interimResults = false;
    rec.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]!;
        if (r.isFinal) {
          const text = r[0]?.transcript ?? "";
          if (text.trim()) this.ev.onHeard(text);
        }
      }
    };
    rec.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        this.want = false;
        this.ev.onNoMic();
      }
    };
    // Recognition ends by itself after a while: start again while we still want it.
    rec.onend = () => {
      if (this.rec === rec) this.rec = null;
      this.ev.onListening(false);
      if (this.want && !this.stopped && !this.speaking)
        window.setTimeout(() => this.resumeListening(), 250);
    };
    try {
      rec.start();
      this.rec = rec;
      this.ev.onListening(true);
    } catch {
      this.rec = null;
    }
  }

  stop() {
    this.stopped = true;
    this.want = false;
    this.hush();
    this.pauseListening();
    this.ev.onSpeaking(false);
  }
}
