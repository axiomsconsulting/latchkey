/**
 * The guest's private stay link, remembered in their own browser when they
 * open it, so the in-room guide can offer "Open your stay" to that guest.
 */
export const stayKey = (propertyId: string) => `latchkey.stay.${propertyId}`;

export function rememberStay(propertyId: string, token: string, checkOutDate: string) {
  try {
    window.localStorage.setItem(stayKey(propertyId), JSON.stringify({ token, until: `${checkOutDate}T23:59:59` }));
  } catch {
    // Private browsing: the room guide just won't offer the shortcut.
  }
}

/** The stay link for this property, if this browser has one that hasn't ended. */
export function rememberedStay(propertyId: string, now = new Date()): string | null {
  try {
    const v = JSON.parse(window.localStorage.getItem(stayKey(propertyId)) ?? "null") as { token?: string; until?: string } | null;
    if (!v?.token || !v.until || Date.parse(v.until) < now.getTime()) return null;
    return v.token;
  } catch {
    return null;
  }
}
