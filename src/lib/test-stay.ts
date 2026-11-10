/**
 * A host trying their own check-in. It behaves like a guest's stay, but never holds a room (see
 * migration 0092) and can be wiped whole. Pure; the server side is test-stay.server.ts.
 */
import { addDays } from "./dates";

/** A test stay is removed by itself this long after its check-out, if nobody resets it. */
export const TEST_KEEP_DAYS = 7;

export const testStayNote = (name: string) =>
  `Test check-in by ${name}. Not a real guest. It doesn't block any room or show on any calendar. Use Reset on Today to remove it and everything it saved.`;

/** Tonight only: arrives today, leaves tomorrow. */
export const testStayDates = (today: string) => ({
  check_in_date: today,
  check_out_date: addDays(today, 1),
});

/** A full name for the register and for matching their own ID: two words at least. */
export function testNameProblem(name: string): boolean {
  return name.trim().replace(/\s+/g, " ").split(" ").length < 2;
}

/** From what sign-in knows: a name if there is one, else nothing for them to replace. */
export function suggestedName(meta: Record<string, unknown> | null | undefined): string {
  const v = meta?.["full_name"] ?? meta?.["name"];
  return typeof v === "string" ? v.trim().slice(0, 120) : "";
}

/** The surname's first letter, which the kiosk asks for. */
export function surnameLetter(name: string): string {
  const parts = name.trim().split(/\s+/);
  return (parts[parts.length - 1] ?? "").charAt(0).toUpperCase();
}

/* ----------------------------- sample photos ----------------------------- */

/** How long the kiosk link with the host's sample photos works. */
export const TEST_LINK_HOURS = 12;

const enc = new TextEncoder();
async function hmac(secret: string, text: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(`test-samples:${secret}`),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(text)));
  return btoa(String.fromCharCode(...sig))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** The kiosk link's ?test= value: this property's samples, until `expires` (ms). */
export async function testToken(secret: string, propertyId: string, expires: number) {
  return `${expires.toString(36)}.${await hmac(secret, `${propertyId}.${expires}`)}`;
}

/** Whether a ?test= value is this property's and still in time. */
export async function testTokenValid(
  secret: string,
  propertyId: string,
  token: string,
  now = Date.now(),
): Promise<boolean> {
  const [exp, sig] = token.split(".");
  const expires = parseInt(exp ?? "", 36);
  if (!sig || !Number.isFinite(expires) || expires < now) return false;
  return (await hmac(secret, `${propertyId}.${expires}`)) === sig;
}
