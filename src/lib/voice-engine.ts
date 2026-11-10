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
  /** The tablet's own listening failed (why): the engine switches to cloud listening if it can. */
  onTrouble?: (reason: string) => void;
  /**
   * Cloud listening: turns a short recording into text (voice.functions voiceTranscribe), for
   * tablets whose browser can't listen itself. Null when it isn't available.
   */
  transcribe?: ((audio: Blob) => Promise<string | null>) | null;
};

/** Errors that mean the tablet's own listening won't work here (as opposed to just silence). */
const BROKEN = new Set([
  "network",
  "service-not-allowed",
  "language-not-supported",
  "audio-capture",
]);

/**
 * Listening without the browser's speech recognition: watches the microphone's level, records
 * from when someone starts speaking until a short pause, and has it turned into text.
 */
class CloudEar {
  private stream: MediaStream | null = null;
  private ctx: AudioContext | null = null;
  private timer = 0;
  private rec: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private paused = true;
  private loudSince = 0;
  private quietSince = 0;
  private startedAt = 0;
  constructor(
    private transcribe: (audio: Blob) => Promise<string | null>,
    private heard: (text: string) => void,
    private trouble: (reason: string) => void,
  ) {}

  async open(): Promise<boolean> {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
    } catch {
      this.trouble("microphone");
      return false;
    }
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor || typeof MediaRecorder === "undefined") {
      this.trouble("recorder");
      return false;
    }
    this.ctx = new Ctor();
    const analyser = this.ctx.createAnalyser();
    analyser.fftSize = 1024;
    this.ctx.createMediaStreamSource(this.stream).connect(analyser);
    const buf = new Uint8Array(analyser.fftSize);
    this.timer = window.setInterval(() => {
      if (this.paused) return;
      analyser.getByteTimeDomainData(buf);
      let sum = 0;
      for (const v of buf) sum += ((v - 128) / 128) ** 2;
      const level = Math.sqrt(sum / buf.length);
      const now = Date.now();
      const loud = level > 0.045;
      if (!this.rec) {
        if (loud) {
          this.loudSince ||= now;
          if (now - this.loudSince > 150) this.begin();
        } else this.loudSince = 0;
        return;
      }
      if (loud) this.quietSince = 0;
      else this.quietSince ||= now;
      if ((this.quietSince && now - this.quietSince > 900) || now - this.startedAt > 7000)
        this.finish();
    }, 60);
    return true;
  }

  private begin() {
    if (!this.stream) return;
    this.chunks = [];
    const type = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"].find((t) =>
      MediaRecorder.isTypeSupported?.(t),
    );
    try {
      this.rec = new MediaRecorder(this.stream, type ? { mimeType: type } : undefined);
    } catch {
      this.rec = null;
      return;
    }
    this.rec.ondataavailable = (e) => {
      if (e.data.size) this.chunks.push(e.data);
    };
    this.rec.onstop = () => {
      const blob = new Blob(this.chunks, { type: this.rec?.mimeType || type || "audio/webm" });
      this.rec = null;
      this.loudSince = 0;
      this.quietSince = 0;
      // Too short to be words: a cough or a door.
      if (blob.size < 3000 || this.paused) return;
      void this.transcribe(blob).then((text) => {
        if (text?.trim() && !this.paused) this.heard(text);
      });
    };
    this.startedAt = Date.now();
    this.quietSince = 0;
    this.rec.start();
  }

  private finish() {
    try {
      this.rec?.stop();
    } catch {
      this.rec = null;
    }
  }

  pause() {
    this.paused = true;
    if (this.rec) {
      this.chunks = [];
      this.finish();
    }
  }
  resume() {
    this.paused = false;
    this.loudSince = 0;
  }
  close() {
    this.pause();
    window.clearInterval(this.timer);
    this.stream?.getTracks().forEach((t) => t.stop());
    void this.ctx?.close().catch(() => undefined);
  }
}

export class VoiceEngine {
  private rec: Rec | null = null;
  private want = false;
  private speaking = 0;
  private gender: VoiceGender;
  private stopped = false;
  private clips: Partial<Record<PhraseKey, HTMLAudioElement>> = {};
  /** Cloud listening, once the tablet's own has failed here. */
  private ear: CloudEar | null = null;
  private earOpening = false;
  /** Listening that kept ending at once without hearing anything (an Android failure with no error). */
  private quickEnds = 0;
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
    this.ear?.pause();
    this.ev.onListening(false);
  }

  /** The tablet's own listening doesn't work here: listen through the cloud instead, if we can. */
  private async useCloud(reason: string) {
    this.ev.onTrouble?.(reason);
    if (this.ear || this.earOpening || !this.ev.transcribe) {
      if (!this.ev.transcribe) this.ev.onNoMic();
      return;
    }
    this.earOpening = true;
    const ear = new CloudEar(
      this.ev.transcribe,
      (text) => this.ev.onHeard(text),
      (why) => this.ev.onTrouble?.(why),
    );
    if (await ear.open()) this.ear = ear;
    else this.ev.onNoMic();
    this.earOpening = false;
    this.resumeListening();
  }

  private resumeListening() {
    if (!this.want || this.stopped || this.speaking) return;
    if (this.ear) {
      this.ear.resume();
      this.ev.onListening(true);
      return;
    }
    if (this.rec || this.earOpening) return;
    const w = window as unknown as {
      SpeechRecognition?: new () => Rec;
      webkitSpeechRecognition?: new () => Rec;
    };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) return void this.useCloud("unsupported");
    const rec = new Ctor();
    rec.lang = "en-GB";
    // One phrase at a time, started again each time: continuous listening is unreliable on
    // Android tablets (it ends at once or never delivers a result).
    rec.continuous = false;
    rec.interimResults = true;
    let latest = "";
    let delivered = false;
    const began = Date.now();
    rec.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]!;
        const text = r[0]?.transcript ?? "";
        if (r.isFinal) {
          if (text.trim()) {
            delivered = true;
            this.ev.onHeard(text);
          }
        } else latest = text;
      }
    };
    rec.onerror = (e) => {
      if (e.error === "not-allowed") {
        this.want = false;
        this.ev.onNoMic();
        return;
      }
      if (BROKEN.has(e.error)) {
        this.rec = null;
        void this.useCloud(e.error);
      }
    };
    rec.onend = () => {
      if (this.rec === rec) this.rec = null;
      // Some tablets end without a final result: what they last heard counts.
      if (!delivered && latest.trim()) this.ev.onHeard(latest);
      const heardAnything = delivered || !!latest.trim();
      this.quickEnds = !heardAnything && Date.now() - began < 1500 ? this.quickEnds + 1 : 0;
      if (this.quickEnds >= 5) {
        this.quickEnds = 0;
        void this.useCloud("ends-at-once");
        return;
      }
      this.ev.onListening(false);
      if (this.want && !this.stopped && !this.speaking && !this.ear)
        window.setTimeout(() => this.resumeListening(), 200);
    };
    try {
      rec.start();
      this.rec = rec;
      this.ev.onListening(true);
    } catch {
      this.rec = null;
      void this.useCloud("start");
    }
  }

  stop() {
    this.stopped = true;
    this.want = false;
    this.hush();
    this.pauseListening();
    this.ear?.close();
    this.ear = null;
    this.ev.onSpeaking(false);
  }
}
