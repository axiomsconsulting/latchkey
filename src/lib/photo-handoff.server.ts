/* eslint-disable @typescript-eslint/no-explicit-any -- photo_handoffs is from migration 0079, newer than the generated types */
/**
 * Photos on a phone (src/lib/photo-handoff.ts): the row, its secrets (kept
 * only as hashes), the server's ping to both screens, and the sealed
 * check-in token of a stay found from the ID. Server only.
 */
import type { PhotoResult, PhotoTask } from "./photo-handoff";

type Loose = { from: (t: string) => any };

export type HandoffRow = {
  id: string;
  property_id: string;
  channel: string;
  /** The phone's link secret, sealed, so "Text me the link" sends the same link as the square. */
  phone_sealed: string | null;
  device_id: string;
  session_id: string | null;
  task: PhotoTask | null;
  result: PhotoResult | null;
  opened_at: string | null;
  phone_seen_at: string | null;
  expires_at: string;
};

export type PhoneHandoff = HandoffRow;

const COLS =
  "id, property_id, channel, phone_sealed, device_id, session_id, task, result, opened_at, phone_seen_at, expires_at";

export async function db(): Promise<Loose> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as Loose;
}

async function byHash(column: "kiosk_hash" | "phone_hash", secret: string) {
  const { sha256 } = await import("./checkin.server");
  const { data } = await (
    await db()
  )
    .from("photo_handoffs")
    .select(COLS)
    .eq(column, sha256(`photos:${secret}`))
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  return (data as HandoffRow | null) ?? null;
}

export const loadKioskHandoff = (key: string) => byHash("kiosk_hash", key);
export const loadPhoneHandoff = (token: string) => byHash("phone_hash", token);

export async function hashFor(secret: string): Promise<string> {
  const { sha256 } = await import("./checkin.server");
  return sha256(`photos:${secret}`);
}

/** Both screens listen on the row's channel: "something changed, ask again". Never carries data. */
export async function pingHandoff(channel: string): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const ch = supabaseAdmin.channel(`photo-handoff:${channel}`);
    await ch.httpSend("changed", { at: Date.now() });
    void supabaseAdmin.removeChannel(ch);
  } catch {
    // Both screens also ask every couple of seconds.
  }
}

async function key(): Promise<CryptoKey> {
  const { signingSecret } = await import("./private-store.server");
  const raw = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`photo-handoff:${signingSecret()}`),
  );
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

const b64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

/** The check-in token of a stay found from the ID, sealed until the tablet collects it. */
export async function seal(text: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const out = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      await key(),
      new TextEncoder().encode(text),
    ),
  );
  return `${b64(iv)}.${b64(out)}`;
}

export async function unseal(sealed: string): Promise<string | null> {
  try {
    const [iv, body] = sealed.split(".");
    if (!iv || !body) return null;
    const out = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: unb64(iv) },
      await key(),
      unb64(body),
    );
    return new TextDecoder().decode(out);
  } catch {
    return null;
  }
}

/** Old links: deleted by the daily clean-up. */
export async function purgeHandoffs(): Promise<number> {
  const { data } = await (
    await db()
  )
    .from("photo_handoffs")
    .delete()
    .lt("expires_at", new Date().toISOString())
    .select("id");
  return (data ?? []).length;
}
