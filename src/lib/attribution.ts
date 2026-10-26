/**
 * Where a visit came from (utm_* and ref), kept for the session so it
 * survives redirects, the demo flows and the trial: first touch wins, unless
 * a later landing brings new utm_* values. sessionStorage "lk_attr" only;
 * gclid/fbclid are kept as a yes/no, never their values. Pure helpers plus
 * guarded storage (private windows and blocked storage just skip it).
 */

export const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const;
export type UtmKey = (typeof UTM_KEYS)[number];
export type Utm = Partial<Record<UtmKey, string>>;

export type Attribution = Utm & {
  ref?: string;
  /** An ad click id was on the landing URL (never its value). */
  clickId?: boolean;
  landing_path?: string;
  captured_at?: string;
};

const KEY = "lk_attr";
const MAX = 200;

const clean = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim();
  // Overlong values are dropped, not cut: they're junk or tracking blobs.
  if (!t || t.length > MAX) return null;
  return t.replace(/[\u0000-\u001f<>]/g, "");
};

/** The utm_* values in a query (object or URLSearchParams), cleaned. */
export function pickUtm(search: Record<string, unknown> | URLSearchParams): Utm {
  const get = (k: string) => (search instanceof URLSearchParams ? search.get(k) : search[k]);
  const out: Utm = {};
  for (const k of UTM_KEYS) {
    const v = clean(get(k));
    if (v) out[k] = v;
  }
  return out;
}

/** What a landing adds: utm_*, ref, and whether an ad click id came with it. */
export function attributionFrom(search: Record<string, unknown> | URLSearchParams, path: string, now = new Date()): Attribution | null {
  const get = (k: string) => (search instanceof URLSearchParams ? search.get(k) : search[k]);
  const utm = pickUtm(search);
  const ref = clean(get("ref"));
  const clickId = !!(clean(get("gclid")) || clean(get("fbclid")));
  if (!Object.keys(utm).length && !ref && !clickId) return null;
  return { ...utm, ...(ref ? { ref } : {}), ...(clickId ? { clickId: true } : {}), landing_path: path.slice(0, 200), captured_at: now.toISOString() };
}

/** First touch for the session; a landing with new utm_* values replaces it. */
export function mergeAttribution(stored: Attribution | null, incoming: Attribution | null): Attribution | null {
  if (!incoming) return stored;
  if (!stored) return incoming;
  const fresh = UTM_KEYS.some((k) => incoming[k] && incoming[k] !== stored[k]);
  return fresh ? incoming : stored;
}

/** A URL with the session's utm_* added (existing ones on the URL win; no duplicates). */
export function appendUtm(url: string, utm: Utm): string {
  const [pathAndQuery, hash = ""] = url.split("#") as [string, string?];
  const [path, query = ""] = pathAndQuery.split("?") as [string, string?];
  const params = new URLSearchParams(query);
  for (const k of UTM_KEYS) if (utm[k] && !params.has(k)) params.set(k, utm[k]!);
  const q = params.toString();
  return `${path}${q ? `?${q}` : ""}${hash ? `#${hash}` : ""}`;
}

/* ------------------------------ browser only ----------------------------- */

function read(): Attribution | null {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Attribution) : null;
  } catch {
    return null;
  }
}

/** Call once per page load (the root does), before anything redirects. */
export function captureAttribution(search: Record<string, unknown> | URLSearchParams = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : {}): Attribution | null {
  if (typeof window === "undefined") return null;
  const next = mergeAttribution(read(), attributionFrom(search, window.location.pathname));
  // A Commission Partner's link: kept in a cookie for the window and reported once (server checks the code).
  captureReferral(search, (code, device) => {
    void import("@/lib/partner-referrals.functions")
      .then(({ recordReferralClick }) => recordReferralClick({ data: { code, path: window.location.pathname.slice(0, 200), deviceId: device } }))
      .catch(() => undefined);
  });
  try {
    if (next) window.sessionStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage blocked: attribution just isn't kept.
  }
  return next;
}

let capturedOnce = false;

/** Once per page load, from the root's first render (before any child reads it). */
export function captureOnce() {
  if (capturedOnce || typeof window === "undefined") return;
  capturedOnce = true;
  captureAttribution();
}

/**
 * A demo link's own campaign, used only when the visit came with no utm_*
 * of its own (a post's tags always win).
 */
export function defaultCampaign(campaign: string) {
  if (typeof window === "undefined") return;
  const now = read();
  if (now && UTM_KEYS.some((k) => now[k])) return;
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify({ ...(now ?? {}), utm_source: "latchkey", utm_medium: "demo-link", utm_campaign: campaign, landing_path: window.location.pathname.slice(0, 200), captured_at: new Date().toISOString() }));
  } catch {
    // Storage blocked: nothing kept.
  }
}

export function getAttribution(): Attribution {
  return typeof window === "undefined" ? {} : (read() ?? {});
}

/** The session's utm_* only, for links and search params. */
export function sessionUtm(): Utm {
  return pickUtm(getAttribution() as Record<string, unknown>);
}

export function withAttribution(url: string): string {
  return appendUtm(url, sessionUtm());
}

/* ---------------------------------------------------- Commission Partners */

/**
 * A Commission Partner's referral link (?ref=CODE) is kept in a first-party
 * cookie, lk_ref, for the attribution window (60 days), so a host who comes
 * back in a new tab still signs up through it. The first valid code wins: a
 * later link doesn't take over an unexpired one (agreement 8.2). lk_dev is a
 * random device id (no fingerprinting) used only for fraud checks. Neither is
 * set when the visitor has asked not to be tracked (GPC, Do Not Track or
 * ?notrack=1); they can still type the code at set-up.
 * TODO(legal): PECR consent for the referral cookie.
 */
export const REF_COOKIE = "lk_ref";
export const DEVICE_COOKIE = "lk_dev";

export type RefCookie = { code: string; clicked_at: string };

/** A referral code as people type or link it: letters, digits and dashes, 3-32 long, upper case. */
export function cleanRefCode(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim().toUpperCase();
  return /^[A-Z0-9][A-Z0-9-]{2,31}$/.test(t) ? t : null;
}

/** The referral cookie's value, if it's still within the window. */
export function readRefCookie(cookieHeader: string, now: number, windowDays: number): RefCookie | null {
  const raw = cookieHeader
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${REF_COOKIE}=`));
  if (!raw) return null;
  try {
    const v = JSON.parse(decodeURIComponent(raw.slice(REF_COOKIE.length + 1))) as Partial<RefCookie>;
    const code = cleanRefCode(v.code);
    const at = Date.parse(String(v.clicked_at));
    if (!code || Number.isNaN(at) || now - at > windowDays * 86_400_000 || at > now + 60_000) return null;
    return { code, clicked_at: new Date(at).toISOString() };
  } catch {
    return null;
  }
}

/** The Set-Cookie value for a new referral, or null to keep the one there (first valid code wins). */
export function nextRefCookie(existing: RefCookie | null, code: string, now: number, windowDays: number, secure = true): string | null {
  const clean = cleanRefCode(code);
  if (!clean || existing) return null;
  const value = encodeURIComponent(JSON.stringify({ code: clean, clicked_at: new Date(now).toISOString() }));
  return `${REF_COOKIE}=${value}; Max-Age=${windowDays * 86_400}; Path=/; SameSite=Lax${secure ? "; Secure" : ""}`;
}

function noTracking(): boolean {
  const flag = new URLSearchParams(window.location.search).get("notrack");
  let stored: string | null = null;
  try {
    stored = window.localStorage.getItem("lk_no_track");
  } catch {
    // Storage blocked.
  }
  const n = navigator as Navigator & { globalPrivacyControl?: boolean };
  return flag === "1" || stored === "1" || n.globalPrivacyControl === true || n.doNotTrack === "1";
}

/** This browser's random device id for fraud checks (made once, kept for the window). */
export function deviceId(windowDays = 60): string | null {
  if (typeof document === "undefined" || noTracking()) return null;
  const found = document.cookie
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${DEVICE_COOKIE}=`));
  if (found) return found.slice(DEVICE_COOKIE.length + 1);
  const id = crypto.randomUUID();
  document.cookie = `${DEVICE_COOKIE}=${id}; Max-Age=${windowDays * 86_400}; Path=/; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
  return id;
}

/** The referral this browser came through, if any (within the window). */
export function storedReferral(windowDays = 60): RefCookie | null {
  if (typeof document === "undefined") return null;
  return readRefCookie(document.cookie, Date.now(), windowDays);
}

/**
 * Keeps ?ref=CODE in the referral cookie (first valid code wins) and reports
 * the click once. Called from captureAttribution on every landing.
 */
export function captureReferral(search: Record<string, unknown> | URLSearchParams, onNewClick?: (code: string, deviceId: string | null) => void, windowDays = 60) {
  if (typeof document === "undefined" || noTracking()) return;
  const get = (k: string) => (search instanceof URLSearchParams ? search.get(k) : search[k]);
  const code = cleanRefCode(get("ref"));
  if (!code) return;
  const set = nextRefCookie(storedReferral(windowDays), code, Date.now(), windowDays, location.protocol === "https:");
  if (!set) return;
  document.cookie = set;
  onNewClick?.(code, deviceId(windowDays));
}
