/* eslint-disable @typescript-eslint/no-explicit-any -- reads tables and payloads the generated Supabase types don't cover */
/**
 * Server only: the room behind a QR code, by its three words
 * (rooms.guide_words, migration 0059) or its older random code
 * (rooms.guide_code, for cards printed before).
 */
import { readRoomWords } from "./room-words";

type Loose = { from: (t: string) => any };

export async function roomByCode<T = Record<string, any>>(
  db: Loose,
  code: string,
  cols: string,
): Promise<T | null> {
  const words = readRoomWords(code);
  if (words) {
    const { data, error } = await db
      .from("rooms")
      .select(cols)
      .eq("guide_words", words)
      .maybeSingle();
    return error ? null : ((data as T | null) ?? null);
  }
  const { data } = await db.from("rooms").select(cols).eq("guide_code", code).maybeSingle();
  return (data as T | null) ?? null;
}
