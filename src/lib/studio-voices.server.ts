/* eslint-disable @typescript-eslint/no-explicit-any -- ElevenLabs answers and platform_secrets read loosely */
/**
 * Server only: the voice concierge's studio voices. Latchkey admin pastes an ElevenLabs API key
 * once (kept in platform_secrets "studio_voices", never sent to a browser), picks a female and
 * a male voice from their library, and Latchkey records every phrase (voice-concierge.ts
 * PHRASES) once as an MP3 in the private "branding" bucket, shown through long-lived links. The
 * door tablet plays those files: nothing is generated per check-in. A phrase whose words change
 * is recorded again (its hash no longer matches).
 */
import { PHRASES, type PhraseKey, type VoiceGender } from "./voice-concierge";

const KEY = "studio_voices";
const API = "https://api.elevenlabs.io/v1";
const LINK_SECONDS = 60 * 60 * 24 * 365 * 5;
/** Phrases recorded per call, so each request stays short. */
const PER_CALL = 6;

type Clip = { url: string; hash: string };
type Store = {
  apiKey?: string;
  female?: { voiceId: string; name: string };
  male?: { voiceId: string; name: string };
  clips?: Partial<Record<VoiceGender, Partial<Record<PhraseKey, Clip>>>>;
};

async function db(): Promise<any> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function stored(): Promise<Store> {
  const { data } = await (
    await db()
  )
    .from("platform_secrets")
    .select("value")
    .eq("key", KEY)
    .maybeSingle();
  return (data?.value as Store | undefined) ?? {};
}

async function read(): Promise<Store> {
  const s = await stored();
  // Keys and secrets: an ElevenLabs key in Lovable Secrets counts when none was pasted here.
  const env = (process.env["ELEVENLABS_API_KEY"] ?? "").trim();
  return s.apiKey || !env ? s : { ...s, apiKey: env };
}

async function write(next: Store): Promise<void> {
  // A key that only comes from Lovable Secrets is never copied into the saved settings.
  if (
    next.apiKey &&
    !(await stored()).apiKey &&
    next.apiKey === (process.env["ELEVENLABS_API_KEY"] ?? "").trim()
  )
    next = Object.fromEntries(Object.entries(next).filter(([k]) => k !== "apiKey")) as Store;
  const { error } = await (
    await db()
  )
    .from("platform_secrets")
    .upsert({ key: KEY, value: next }, { onConflict: "key" });
  if (error) throw new Error(error.message);
}

async function hashOf(text: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(d)]
    .slice(0, 6)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function voicesWith(apiKey: string) {
  const res = await fetch(`${API}/voices`, { headers: { "xi-api-key": apiKey } });
  if (res.status === 401) throw new Error("ElevenLabs didn't accept that API key.");
  if (!res.ok) throw new Error(`ElevenLabs answered ${res.status}.`);
  const json = (await res.json()) as {
    voices?: Array<{ voice_id: string; name: string; labels?: Record<string, string> }>;
  };
  return (json.voices ?? []).map((v) => ({
    id: v.voice_id,
    name: v.name,
    gender: v.labels?.["gender"] ?? null,
    accent: v.labels?.["accent"] ?? null,
    description: v.labels?.["description"] ?? v.labels?.["descriptive"] ?? null,
  }));
}

/** For Latchkey admin: the key's state, the library to choose from, and how much is recorded. */
export async function studioStatus() {
  const s = await read();
  const total = Object.keys(PHRASES).length;
  const done = async (g: VoiceGender) => {
    let n = 0;
    for (const [k, text] of Object.entries(PHRASES)) {
      const c = s.clips?.[g]?.[k as PhraseKey];
      if (c && c.hash === (await hashOf(`${s[g]?.voiceId}|${text}`))) n++;
    }
    return n;
  };
  let voices: Awaited<ReturnType<typeof voicesWith>> = [];
  let error: string | null = null;
  if (s.apiKey) {
    try {
      voices = await voicesWith(s.apiKey);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }
  return {
    hasKey: !!s.apiKey,
    error,
    voices,
    female: s.female ?? null,
    male: s.male ?? null,
    total,
    done: { female: await done("female"), male: await done("male") },
  };
}

export async function saveStudioKey(apiKey: string): Promise<void> {
  await voicesWith(apiKey);
  await write({ ...(await read()), apiKey });
}

export async function chooseStudioVoice(
  gender: VoiceGender,
  voiceId: string,
  name: string,
): Promise<void> {
  const s = await read();
  await write({ ...s, [gender]: { voiceId, name } });
}

/** Records the next few phrases still missing (or changed) for one voice. */
export async function recordSome(gender: VoiceGender): Promise<{ done: number; left: number }> {
  const s = await read();
  const voice = s[gender];
  if (!s.apiKey) throw new Error("Paste the ElevenLabs API key first.");
  if (!voice) throw new Error("Pick a voice first.");
  const clips = { ...(s.clips?.[gender] ?? {}) };
  const todo: Array<[PhraseKey, string, string]> = [];
  for (const [k, text] of Object.entries(PHRASES)) {
    const h = await hashOf(`${voice.voiceId}|${text}`);
    if (clips[k as PhraseKey]?.hash !== h) todo.push([k as PhraseKey, text, h]);
  }
  const sb = await db();
  let done = 0;
  for (const [k, text, h] of todo.slice(0, PER_CALL)) {
    const res = await fetch(
      `${API}/text-to-speech/${encodeURIComponent(voice.voiceId)}?output_format=mp3_44100_64`,
      {
        method: "POST",
        headers: {
          "xi-api-key": s.apiKey,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify({
          text,
          model_id: "eleven_multilingual_v2",
          voice_settings: { stability: 0.5, similarity_boost: 0.75 },
        }),
      },
    );
    if (res.status === 401) throw new Error("ElevenLabs didn't accept the API key.");
    if (res.status === 402 || res.status === 429)
      throw new Error("ElevenLabs is out of credits or busy. Try again later.");
    if (!res.ok) throw new Error(`ElevenLabs couldn't record "${k}" (${res.status}).`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    const path = `voice/${gender}/${k}-${h}.mp3`;
    const up = await sb.storage
      .from("branding")
      .upload(path, bytes, { contentType: "audio/mpeg", upsert: true });
    if (up.error) throw new Error(up.error.message);
    const signed = await sb.storage.from("branding").createSignedUrl(path, LINK_SECONDS);
    if (signed.error) throw new Error(signed.error.message);
    clips[k] = { url: signed.data.signedUrl, hash: h };
    done++;
  }
  const latest = await read();
  await write({ ...latest, clips: { ...(latest.clips ?? {}), [gender]: clips } });
  return { done, left: Math.max(0, todo.length - done) };
}

export async function forgetStudioVoices(): Promise<void> {
  await (await db()).from("platform_secrets").delete().eq("key", KEY);
}

/** For the door tablet: the recorded phrase links for one voice (only ones matching their words). */
export async function clipsFor(gender: VoiceGender): Promise<Partial<Record<PhraseKey, string>>> {
  try {
    const s = await read();
    const voice = s[gender];
    if (!voice) return {};
    const out: Partial<Record<PhraseKey, string>> = {};
    for (const [k, text] of Object.entries(PHRASES)) {
      const c = s.clips?.[gender]?.[k as PhraseKey];
      if (c && c.hash === (await hashOf(`${voice.voiceId}|${text}`))) out[k as PhraseKey] = c.url;
    }
    return out;
  } catch {
    return {};
  }
}

/** Whether cloud listening is possible (the ElevenLabs key is saved). */
export async function hasStudioKey(): Promise<boolean> {
  try {
    return !!(await read()).apiKey;
  } catch {
    return false;
  }
}

/**
 * Cloud listening for tablets whose browser can't: one short recording of a guest's reply,
 * turned into text by ElevenLabs speech-to-text. Nothing is kept.
 */
export async function transcribeReply(bytes: Uint8Array, mime: string): Promise<string | null> {
  const { apiKey } = await read();
  if (!apiKey) return null;
  const form = new FormData();
  form.append("model_id", "scribe_v1");
  form.append("language_code", "en");
  form.append("tag_audio_events", "false");
  form.append(
    "file",
    new Blob([bytes as Uint8Array<ArrayBuffer>], { type: mime }),
    `reply.${mime.includes("mp4") ? "mp4" : "webm"}`,
  );
  const res = await fetch(`${API}/speech-to-text`, {
    method: "POST",
    headers: { "xi-api-key": apiKey },
    body: form,
  });
  if (!res.ok) return null;
  const json = (await res.json().catch(() => ({}))) as { text?: string };
  return typeof json.text === "string" ? json.text.slice(0, 300) : null;
}

/**
 * The receptionist's answer spoken in the chosen studio voice (ElevenLabs, live, not kept), as MP3
 * bytes; null when there's no key or voice, or ElevenLabs refuses (the device's own voice is used then).
 */
export async function speakLive(text: string, gender: VoiceGender): Promise<Uint8Array | null> {
  const s = await read();
  const voice = s[gender];
  if (!s.apiKey || !voice || !text.trim()) return null;
  try {
    const res = await fetch(
      `${API}/text-to-speech/${encodeURIComponent(voice.voiceId)}?output_format=mp3_44100_64`,
      {
        method: "POST",
        headers: {
          "xi-api-key": s.apiKey,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify({
          text: text.slice(0, 900),
          model_id: "eleven_flash_v2_5",
          voice_settings: { stability: 0.5, similarity_boost: 0.75 },
        }),
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (!res.ok) return null;
    return new Uint8Array(await res.arrayBuffer());
  } catch {
    return null;
  }
}
