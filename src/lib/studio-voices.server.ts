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

async function read(): Promise<Store> {
  const { data } = await (
    await db()
  )
    .from("platform_secrets")
    .select("value")
    .eq("key", KEY)
    .maybeSingle();
  return (data?.value as Store | undefined) ?? {};
}

async function write(next: Store): Promise<void> {
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
