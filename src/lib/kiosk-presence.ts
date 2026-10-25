/**
 * The door tablet's side of "is this phone at the property?" (see
 * stay-access.functions.ts): its paired-device token, kept in this browser,
 * and a location reading taken only when the browser already allows it (the
 * prompt is shown once, while the host pairs the tablet with their PIN).
 */
const KEY = (code: string) => `latchkey.kioskDevice.${code}`;

export function deviceToken(code: string): string | null {
  try {
    return localStorage.getItem(KEY(code));
  } catch {
    return null;
  }
}

export function keepDeviceToken(code: string, token: string) {
  try {
    localStorage.setItem(KEY(code), token);
  } catch {
    // Not kept: it pairs again next time.
  }
}

export type Fix = { lat: number; lng: number; accuracy: number };

/** A location reading; `ask` may show the browser's prompt, otherwise only when already allowed. */
export async function readFix(ask: boolean): Promise<Fix | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return null;
  if (!ask) {
    try {
      const state = await navigator.permissions?.query({ name: "geolocation" as PermissionName });
      if (state?.state !== "granted") return null;
    } catch {
      return null;
    }
  }
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 10 * 60_000 },
    );
  });
}
