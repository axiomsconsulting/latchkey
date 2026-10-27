/**
 * Consent for website statistics and the Commission Partner referral
 * cookie (UK PECR / UK GDPR). Nothing optional is stored on the visitor's
 * device, and no visit is sent, until they choose "Accept" on the cookie
 * banner or the switch on /privacy. Global Privacy Control and Do Not Track
 * always count as "no" (the banner isn't shown), and ?notrack=1 records a
 * "no". Signing in, settings and a guest's own stay need no consent and
 * aren't covered here. The choice itself is kept in localStorage (lk_consent),
 * which needs no consent. Pure parts tested in tests/consent.test.ts.
 */

export type ConsentChoice = "yes" | "no";
export type ConsentState = ConsentChoice | "unset";

export const CONSENT_KEY = "lk_consent";
/** Bump when what we ask for changes, so everyone is asked again. */
export const CONSENT_VERSION = 1;
/** Ask again after this long, as the ICO suggests. */
export const CONSENT_MAX_DAYS = 365;
export const CONSENT_EVENT = "lk-consent";

/** What a stored value says, given the browser's own signals and the time now. */
export function readConsent(
  raw: string | null,
  signals: { gpc: boolean; dnt: boolean; legacyNoTrack: boolean },
  now: number,
): ConsentState {
  if (signals.gpc || signals.dnt) return "no";
  if (raw) {
    try {
      const v = JSON.parse(raw) as { v?: unknown; choice?: unknown; at?: unknown };
      const at = Date.parse(String(v.at));
      if (
        v.v === CONSENT_VERSION &&
        (v.choice === "yes" || v.choice === "no") &&
        !Number.isNaN(at) &&
        now - at < CONSENT_MAX_DAYS * 86_400_000
      )
        return v.choice;
    } catch {
      // A broken value: ask again.
    }
  }
  // The old /privacy switch (lk_no_track = 1) was a clear "no".
  return signals.legacyNoTrack ? "no" : "unset";
}

/** Paths where the banner is shown: our own site and the dashboard, never a host's guest pages or a door tablet. */
const SITE_PATHS = [
  "/about",
  "/app",
  "/auth",
  "/demo",
  "/developers",
  "/invite",
  "/partners",
  "/privacy",
  "/start",
  "/terms",
];

export function bannerPath(path: string): boolean {
  if (path === "/" || path === "") return true;
  return SITE_PATHS.some((p) => path === p || path.startsWith(`${p}/`));
}

/* ------------------------------ browser only ----------------------------- */

function signals() {
  const n = navigator as Navigator & { globalPrivacyControl?: boolean };
  let legacy = false;
  try {
    legacy = localStorage.getItem("lk_no_track") === "1";
  } catch {
    // Storage blocked.
  }
  return { gpc: n.globalPrivacyControl === true, dnt: n.doNotTrack === "1", legacyNoTrack: legacy };
}

/** Whether the browser itself asks not to be tracked (then there's nothing to ask). */
export function browserSaysNo(): boolean {
  if (typeof window === "undefined") return false;
  const s = signals();
  return s.gpc || s.dnt;
}

export function consentState(): ConsentState {
  if (typeof window === "undefined") return "unset";
  // A link with ?notrack=1 is a "no" for this browser (?notrack=0 asks again).
  const flag = new URLSearchParams(window.location.search).get("notrack");
  if (flag === "1") setConsent("no");
  if (flag === "0") clearConsent();
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(CONSENT_KEY);
  } catch {
    // Storage blocked: never asked, never counted.
  }
  return readConsent(raw, signals(), Date.now());
}

export const hasConsent = () => consentState() === "yes";

const OPTIONAL_LOCAL = ["lk_vid", "lk_vid_who"];
const OPTIONAL_COOKIES = ["lk_ref", "lk_dev"];

/** Removes everything optional this site stored (on "Reject" or a change of mind). */
export function clearOptionalStorage() {
  try {
    for (const k of OPTIONAL_LOCAL) localStorage.removeItem(k);
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const k = sessionStorage.key(i);
      if (k && (k === "lk_attr" || k.startsWith("lk_ev_"))) sessionStorage.removeItem(k);
    }
  } catch {
    // Storage blocked: nothing was stored.
  }
  for (const c of OPTIONAL_COOKIES) document.cookie = `${c}=; Max-Age=0; Path=/; SameSite=Lax`;
}

export function setConsent(choice: ConsentChoice) {
  try {
    localStorage.setItem(
      CONSENT_KEY,
      JSON.stringify({ v: CONSENT_VERSION, choice, at: new Date().toISOString() }),
    );
    localStorage.removeItem("lk_no_track");
  } catch {
    // Storage blocked: the choice lasts for this page only.
  }
  if (choice === "no") clearOptionalStorage();
  window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: choice }));
}

function clearConsent() {
  try {
    localStorage.removeItem(CONSENT_KEY);
    localStorage.removeItem("lk_no_track");
  } catch {
    // Storage blocked.
  }
}

/** Runs fn whenever the visitor makes or changes their choice. */
export function onConsent(fn: (choice: ConsentChoice) => void): () => void {
  const h = (e: Event) => fn((e as CustomEvent<ConsentChoice>).detail);
  window.addEventListener(CONSENT_EVENT, h);
  return () => window.removeEventListener(CONSENT_EVENT, h);
}
