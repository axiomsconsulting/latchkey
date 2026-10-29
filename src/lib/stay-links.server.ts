/* eslint-disable @typescript-eslint/no-explicit-any -- reads a table the generated Supabase types don't cover yet */
/** Server only: making the short /g/<three-words> link for a stay (see stay-links.functions.ts). */
import { newRoomWords } from "@/lib/room-words";

async function admin(): Promise<any> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

const secureRandom = () => {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0]! / 2 ** 32;
};

/**
 * The stay's short link words: the one already made (still valid) or a new
 * one. Null if the database hasn't the table yet.
 */
export async function shortLinkFor(bookingId: string, expiresAt: Date): Promise<string | null> {
  const db = await admin();
  const { data: have, error } = await db
    .from("stay_short_links")
    .select("code, expires_at")
    .eq("booking_id", bookingId)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) return null;
  if (have?.[0]) return have[0].code as string;
  for (let i = 0; i < 6; i++) {
    const code = newRoomWords(secureRandom);
    const { error: e } = await db
      .from("stay_short_links")
      .insert({ code, booking_id: bookingId, expires_at: expiresAt.toISOString() });
    if (!e) return code;
  }
  return null;
}
