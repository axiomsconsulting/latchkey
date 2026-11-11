/**
 * The door tablet's voice (browser only): speaks with the tablet's own built-in voices
 * (speechSynthesis: on the device, free, no AI) and listens with its speech recognition.
 * Listening pauses while it speaks, so it never hears itself. Nothing is recorded or kept.
 */
import { PHRASES, pickVoice, type PhraseKey, type VoiceGender } from "./voice-concierge";
import { isLoud, loudness, nextBaseline } from "./motion-wake";

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
  /** How loud the microphone is right now (0-1), while Latchkey's own listening is on. */
  onLevel?: (level: number) => void;
  /**
   * Listen with Latchkey's own listening from the start (Android tablets, whose built-in
   * speech recognition so often hears nothing), when it's available.
   */
  preferCloud?: boolean;
};

/** Errors that mean the tablet's own listening won't work here (as opposed to just silence). */
const BROKEN = new Set([
  "network",
  "service-not-allowed",
  "language-not-supported",
  "audio-capture",
]);

/* ------------------------------ shared audio ------------------------------ */

let shared: AudioContext | null = null;

/**
 * Must run inside a tap (the voice bubble): Android Chrome only lets sound be measured once a
 * tap has started the page's audio, otherwise every level reads as silence.
 */
export function unlockAudio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    shared ??= new Ctor();
    if (shared.state === "suspended") void shared.resume();
    return shared;
  } catch {
    return null;
  }
}

/** One audio element per studio recording for the whole page, so a clip loaded once plays at once. */
const clipCache = new Map<string, HTMLAudioElement>();
function clipAudio(url: string): HTMLAudioElement {
  let a = clipCache.get(url);
  if (!a) {
    a = new Audio(url);
    a.preload = "auto";
    clipCache.set(url, a);
  }
  return a;
}

/**
 * Gets the concierge ready while the welcome is up: the studio recordings start loading and
 * the tablet's own voices are listed, so the first words come the moment Check in is tapped.
 */
export function warmVoice(clipUrls: Partial<Record<string, string>> = {}) {
  if (typeof window === "undefined") return;
  for (const url of Object.values(clipUrls)) if (url) clipAudio(url);
  if (voiceSupported().speak) window.speechSynthesis.getVoices();
}

/** The plain microphone (echo cancellation on Android picks the silent "voice call" input). */
const MIC: MediaStreamConstraints = {
  audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true },
  video: false,
};

const RECORD_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];

/**
 * Listening without the browser's speech recognition. The microphone is only open while
 * listening (never while the concierge speaks: an open microphone puts Android's sound into
 * "call" mode, which crackles). Hands free, a level clearly above the room's starts a recording
 * that stops after a short pause; held (push to talk), it records exactly while the orb is held.
 */
class CloudEar {
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private timer = 0;
  private rec: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private listening = false;
  private holding = false;
  private loudSince = 0;
  private quietSince = 0;
  private startedAt = 0;
  private silentSince = 0;
  private warned = false;
  private opening: Promise<boolean> | null = null;
  constructor(
    private transcribe: (audio: Blob) => Promise<string | null>,
    private heard: (text: string) => void,
    private trouble: (reason: string) => void,
    private level: (level: number) => void = () => {},
  ) {}

  /** Can it work here at all? */
  static possible(): boolean {
    return typeof MediaRecorder !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
  }

  private async openMic(): Promise<boolean> {
    if (this.stream) return true;
    this.opening ??= (async () => {
      try {
        this.stream = await navigator.mediaDevices.getUserMedia(MIC);
      } catch {
        this.trouble("microphone");
        return false;
      }
      const ctx = unlockAudio();
      if (ctx) {
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        this.source = ctx.createMediaStreamSource(this.stream);
        this.source.connect(analyser);
        const buf = new Float32Array(analyser.fftSize);
        let baseline = 0;
        window.clearInterval(this.timer);
        this.timer = window.setInterval(() => {
          analyser.getFloatTimeDomainData(buf);
          const level = loudness(buf);
          this.level(level);
          this.watch(level, baseline);
          if (!this.rec) baseline = nextBaseline(baseline, level);
        }, 60);
      }
      return true;
    })();
    const ok = await this.opening;
    this.opening = null;
    return ok;
  }

  private closeMic() {
    window.clearInterval(this.timer);
    this.source?.disconnect();
    this.source = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.level(0);
  }

  /** Hands free: start at speech, stop at a pause; and notice a microphone that hears nothing. */
  private watch(level: number, baseline: number) {
    if (!this.listening || this.holding) return;
    const now = Date.now();
    if (level < 0.002) {
      this.silentSince ||= now;
      if (!this.warned && now - this.silentSince > 6000) {
        this.warned = true;
        this.trouble("silent");
      }
    } else this.silentSince = 0;
    const loud = baseline > 0 && isLoud(level, baseline);
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
  }

  private begin() {
    if (!this.stream || this.rec) return;
    this.chunks = [];
    const type = RECORD_TYPES.find((t) => MediaRecorder.isTypeSupported?.(t));
    let rec: MediaRecorder;
    try {
      rec = new MediaRecorder(this.stream, type ? { mimeType: type } : undefined);
    } catch {
      this.trouble("recorder");
      return;
    }
    rec.ondataavailable = (e) => {
      if (e.data.size) this.chunks.push(e.data);
    };
    rec.onstop = () => {
      const blob = new Blob(this.chunks, { type: rec.mimeType || type || "audio/webm" });
      this.rec = null;
      this.loudSince = 0;
      this.quietSince = 0;
      // Too short to be words: a cough or a door.
      if (blob.size < 2000) return;
      void this.transcribe(blob).then((text) => {
        if (text?.trim()) this.heard(text);
        else if (this.holding === false) this.trouble("no-words");
      });
    };
    this.rec = rec;
    this.startedAt = Date.now();
    this.quietSince = 0;
    rec.start(250);
  }

  private finish() {
    try {
      this.rec?.stop();
    } catch {
      this.rec = null;
    }
  }

  async resume() {
    this.listening = true;
    this.silentSince = 0;
    await this.openMic();
  }

  /** The concierge is about to speak: stop listening and close the microphone. */
  pause() {
    this.listening = false;
    if (this.rec) {
      // Dropped: a half-said reply cut off by the concierge isn't worth sending.
      this.rec.onstop = () => {
        this.rec = null;
      };
      this.finish();
    }
    if (!this.holding) this.closeMic();
  }

  /** Push to talk: records exactly while held. */
  async holdStart() {
    this.holding = true;
    if (!(await this.openMic()) || !this.holding) return;
    if (this.rec) {
      this.rec.onstop = () => {
        this.rec = null;
      };
      this.finish();
    }
    this.begin();
  }

  holdEnd() {
    if (!this.holding) return;
    this.holding = false;
    // A moment more, so the last word isn't clipped.
    window.setTimeout(() => {
      this.finish();
      if (!this.listening) window.setTimeout(() => this.closeMic(), 300);
    }, 250);
  }

  close() {
    this.listening = false;
    this.holding = false;
    this.finish();
    this.closeMic();
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
      if (url) this.clips[k as PhraseKey] = clipAudio(url);
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
    if (this.stopped || this.muted || !keys.length) return;
    // Studio recordings where there are any; the tablet's own voice for the rest.
    const recorded = keys.every((k) => typeof k === "string" && this.clips[k]);
    if (recorded) {
      this.hush();
      // This turn to speak: anything said later (or hush) ends it, so two screens never overlap.
      const turn = this.turn;
      this.pauseListening();
      this.speaking++;
      this.ev.onSpeaking(true);
      for (const k of keys) {
        if (this.stopped || turn !== this.turn) break;
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
    // Whatever was being said (recordings included) stops first.
    this.hush();
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

  /** Bumped by hush(): a run of recordings stops when its turn has passed. */
  private turn = 0;

  /** Stops talking at once (a new screen, or the guest spoke over it). */
  hush() {
    this.turn++;
    if (voiceSupported().speak) window.speechSynthesis.cancel();
    if (this.playing) {
      this.playing.pause();
      this.playing.dispatchEvent(new Event("ended"));
    }
  }

  /** Muted: says nothing and doesn't listen until unmuted (the orb stays). */
  private muted = false;
  private wantedBefore = false;
  get isMuted(): boolean {
    return this.muted;
  }
  mute() {
    if (this.muted) return;
    this.muted = true;
    this.wantedBefore = this.want;
    this.want = false;
    this.hush();
    this.pauseListening();
  }
  unmute() {
    if (!this.muted) return;
    this.muted = false;
    this.want = this.wantedBefore;
    this.resumeListening();
  }

  listen() {
    this.want = true;
    if (this.ev.preferCloud && this.ev.transcribe) {
      void this.useCloud("android");
      return;
    }
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
    if (reason !== "android" && reason !== "held") this.ev.onTrouble?.(reason);
    if (this.ear || this.earOpening || !this.ev.transcribe) {
      if (!this.ev.transcribe) this.ev.onNoMic();
      return;
    }
    this.earOpening = true;
    const ear = new CloudEar(
      this.ev.transcribe,
      (text) => this.ev.onHeard(text),
      (why) => this.ev.onTrouble?.(why),
      (level) => this.ev.onLevel?.(level),
    );
    if (CloudEar.possible()) this.ear = ear;
    else this.ev.onNoMic();
    this.earOpening = false;
    this.resumeListening();
  }

  private resumeListening() {
    if (!this.want || this.stopped || this.speaking) return;
    if (this.ear) {
      void this.ear.resume();
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

  /** Push to talk (the orb held): records exactly while held, through Latchkey's own listening. */
  async holdStart() {
    if (this.stopped || this.muted) return;
    unlockAudio();
    this.hush();
    if (!this.ear && this.ev.transcribe) await this.useCloud("held");
    try {
      this.rec?.abort();
    } catch {
      /* fine */
    }
    this.rec = null;
    await this.ear?.holdStart();
    this.ev.onListening(true);
  }

  holdEnd() {
    this.ear?.holdEnd();
  }

  /** Whether push to talk can work here. */
  get canHold(): boolean {
    return !!this.ev.transcribe && CloudEar.possible();
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
