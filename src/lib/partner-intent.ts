/**
 * This browser came to sign up as a Commission Partner, not to run rooms.
 * Set by the join page's sign-up / sign-in buttons and read by getWorkspace's
 * callers, so the dashboard doesn't quietly make a host account for them (a
 * host account would stop them applying). Starting a free trial clears it.
 */
const KEY = "latchkey.partnerIntent";

export function markPartnerIntent(): void {
  try {
    window.localStorage.setItem(KEY, "1");
  } catch {
    // Not remembered; the server still checks the partner sign-up and partners row.
  }
}

export function clearPartnerIntent(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // Nothing to clear.
  }
}

export function partnerIntent(): boolean {
  try {
    return typeof window !== "undefined" && window.localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}
