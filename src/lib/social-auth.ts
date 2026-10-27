/**
 * Google and Apple sign-in (Lovable Cloud's managed OAuth), the "last used"
 * sign-in method remembered on this device, and handing a free trial over
 * when its visitor signs in with Google or Apple. Browser only.
 */
import { lovable } from "@/integrations/lovable";
import { supabase } from "@/integrations/supabase/client";

export type SignInMethod = "google" | "apple" | "password" | "email_link";

const LAST = "latchkey.lastSignIn";
const INTENT = "latchkey.signInIntent";
const CLAIM = "latchkey.trialClaim";

const read = (k: string) => {
  try {
    return window.localStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k: string, v: string | null) => {
  try {
    if (v === null) window.localStorage.removeItem(k);
    else window.localStorage.setItem(k, v);
  } catch {
    // Private browsing: just not remembered.
  }
};

/** How this device last signed in, for the "Last used" badge (and the email, to fill in). */
export function lastSignIn(): { method: SignInMethod; email: string | null } | null {
  try {
    const v = JSON.parse(read(LAST) ?? "null") as { method?: string; email?: string | null } | null;
    if (!v || !["google", "apple", "password", "email_link"].includes(v.method ?? "")) return null;
    return { method: v.method as SignInMethod, email: v.email ?? null };
  } catch {
    return null;
  }
}

/** Remembered just before signing in, then confirmed once the session arrives. */
export function signInIntent(method: SignInMethod) {
  write(INTENT, JSON.stringify({ method, at: Date.now() }));
}

/** Called when a real (not anonymous) session starts: makes the intended method the last used one. */
export function confirmSignIn(user: {
  email?: string | null;
  app_metadata?: { provider?: string };
}) {
  let method: SignInMethod | null = null;
  try {
    const intent = JSON.parse(read(INTENT) ?? "null") as {
      method?: SignInMethod;
      at?: number;
    } | null;
    // An intent from the last half hour; anything older was abandoned.
    if (intent?.method && Date.now() - (intent.at ?? 0) < 30 * 60_000) method = intent.method;
  } catch {
    method = null;
  }
  const provider = user.app_metadata?.provider;
  if (!method) method = provider === "google" ? "google" : provider === "apple" ? "apple" : null;
  write(INTENT, null);
  if (method) write(LAST, JSON.stringify({ method, email: user.email ?? null }));
}

export function pendingTrialClaim(): string | null {
  return read(CLAIM);
}
export function clearTrialClaim() {
  write(CLAIM, null);
}

/**
 * "Continue with Google / Apple". From a free trial, it first makes a claim
 * so the account that comes back takes the trial's business with it.
 * Usually leaves the page (true); in the editor's preview it uses a popup
 * and signs in here.
 */
export async function continueWith(
  provider: "google" | "apple",
  opts: { next?: string | undefined; makeClaim?: () => Promise<{ code: string | null }> } = {},
): Promise<"redirected" | "signed_in"> {
  if (typeof window === "undefined") throw new Error("Sign-in isn't available here.");
  const { data } = await supabase.auth.getSession();
  if (data.session?.user.is_anonymous && opts.makeClaim) {
    const { code } = await opts.makeClaim();
    if (code) write(CLAIM, code);
  }
  signInIntent(provider);
  // Lovable's own sign-in (src/integrations/lovable): sets the session itself when it can.
  const result = await lovable.auth.signInWithOAuth(provider, {
    redirect_uri: `${window.location.origin}${opts.next ?? "/app/today"}`,
  });
  if ("redirected" in result && result.redirected) return "redirected";
  if (result.error) throw result.error;
  return "signed_in";
}

/** Safety net: tokens handed back in the address after Google/Apple, if the client didn't take them already. */
export async function takeTokensFromUrl(): Promise<boolean> {
  if (typeof window === "undefined" || !window.location.hash.includes("access_token="))
    return false;
  const p = new URLSearchParams(window.location.hash.slice(1));
  const access_token = p.get("access_token");
  const refresh_token = p.get("refresh_token");
  if (!access_token || !refresh_token) return false;
  const { data } = await supabase.auth.getSession();
  if (data.session?.access_token !== access_token)
    await supabase.auth.setSession({ access_token, refresh_token });
  window.history.replaceState(null, "", window.location.pathname + window.location.search);
  return true;
}
