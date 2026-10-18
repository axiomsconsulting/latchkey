/**
 * Server only: free guest links and door PINs, checked against every
 * property with the server's access.
 */
import { linkCandidates, randomPin, type LinkContext } from "./property-codes";

type Loose = { from: (t: string) => any };

async function db(): Promise<Loose> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as Loose;
}

/** Crypto-strength 0 ≤ x < 1 (Workers have WebCrypto). */
const secureRandom = () => crypto.getRandomValues(new Uint32Array(1))[0]! / 2 ** 32;

/** Which of these values another property already uses in `column`. */
export async function takenAmong(column: "short_code" | "check_in_pin", values: string[], propertyId?: string | null): Promise<Set<string>> {
  if (!values.length) return new Set();
  let q = (await db()).from("properties").select(`id, ${column}`).in(column, values);
  if (propertyId) q = q.neq("id", propertyId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return new Set(((data ?? []) as Array<Record<string, string>>).map((r) => r[column]!));
}

/** The first free guest link for a property with this name and address. */
export async function freeGuestLink(ctx: LinkContext, propertyId?: string | null): Promise<string> {
  const tries = linkCandidates(ctx);
  const taken = await takenAmong("short_code", tries, propertyId);
  const free = tries.find((c) => !taken.has(c));
  if (free) return free;
  // Every obvious one is taken: the best word plus a random number.
  const base = tries[0] ?? "stay";
  for (let i = 0; i < 5; i++) {
    const c = `${base}-${100 + Math.floor(secureRandom() * 900)}`;
    if (!(await takenAmong("short_code", [c], propertyId)).size) return c;
  }
  throw new Error("Couldn't find a free guest link. Please type one.");
}

/** A random door PIN that's free and not an easy guess. */
export async function freeDoorPin(propertyId?: string | null): Promise<string> {
  for (let round = 0; round < 5; round++) {
    const batch = [...new Set(Array.from({ length: 20 }, () => randomPin(secureRandom)))];
    const taken = await takenAmong("check_in_pin", batch, propertyId);
    const free = batch.find((p) => !taken.has(p));
    if (free) return free;
  }
  throw new Error("Couldn't find a free door PIN. Please try again.");
}

