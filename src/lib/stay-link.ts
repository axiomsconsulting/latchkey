/**
 * The guest's private stay link, remembered in their own browser when they
 * open it: in storage, so the in-room guide can offer "Open your stay", and
 * in a cookie (lk_stay_<property>), so scanning a room's QR code goes
 * straight to their stay without the room guide loading first (roomEntry,
 * stay-access.functions.ts).
 */
export const stayKey = (propertyId: string) => `latchkey.stay.${propertyId}`;

export function rememberStay(propertyId: string, token: string, checkOutDate: string) {
  try {
    window.localStorage.setItem(
      stayKey(propertyId),
      JSON.stringify({ token, until: `${checkOutDate}T23:59:59` }),
    );
  } catch {
    // Private browsing: the room guide just won't offer the shortcut.
  }
  try {
    // Until the day after check-out; never sent to other sites.
    const until = new Date(`${checkOutDate}T23:59:59`);
    until.setDate(until.getDate() + 1);
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${stayCookie(propertyId)}=${token}; Path=/; Expires=${until.toUTCString()}; SameSite=Lax${secure}`;
  } catch {
    // Cookies blocked: the room guide opens first and offers the stay.
  }
}

/** The cookie name for a property's remembered stay (letters and digits only). */
export const stayCookie = (propertyId: string) => `lk_stay_${propertyId.replace(/-/g, "")}`;

/** The stay link for this property, if this browser has one that hasn't ended. */
export function rememberedStay(propertyId: string, now = new Date()): string | null {
  try {
    const v = JSON.parse(window.localStorage.getItem(stayKey(propertyId)) ?? "null") as {
      token?: string;
      until?: string;
    } | null;
    if (!v?.token || !v.until || Date.parse(v.until) < now.getTime()) return null;
    return v.token;
  } catch {
    return null;
  }
}
