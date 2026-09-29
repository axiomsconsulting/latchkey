/**
 * Minimal Stripe REST client. Server only.
 *
 * Keys are project secrets, never stored in the database and never sent to the
 * browser. Standard (sk_…) and restricted (rk_…) keys both work; the test key
 * is used unless a live key is present, so demo mode is the safe default.
 */

const API = "https://api.stripe.com/v1";

export class StripeSetupError extends Error {}

/** Live key wins only when it exists; otherwise we stay in Stripe's test mode. */
function resolveKey(): string | undefined {
  const live = process.env["STRIPE_LIVE_API_KEY"] ?? process.env["STRIPE_SECRET_KEY"];
  const test = process.env["STRIPE_TEST_API_KEY"];
  const isLive = (live ?? "").includes("_live_");
  return isLive ? live : (test ?? live);
}

export function stripeKey(): string {
  const key = resolveKey();
  if (!key) throw new StripeSetupError("Card payments aren't connected yet. Add your Stripe key in Settings, then try again.");
  return key;
}

export function stripeReady(): boolean {
  return Boolean(resolveKey());
}

export function stripeLiveMode(): boolean {
  return (resolveKey() ?? "").includes("_live_");
}

/** Stripe wants form-encoded bodies with bracket notation for nested values. */
export function form(obj: Record<string, unknown>, prefix = ""): URLSearchParams {
  const out = new URLSearchParams();
  const walk = (value: unknown, path: string) => {
    if (value === undefined || value === null) return;
    if (Array.isArray(value)) value.forEach((v, i) => walk(v, `${path}[${i}]`));
    else if (typeof value === "object") for (const [k, v] of Object.entries(value as object)) walk(v, path ? `${path}[${k}]` : k);
    else out.append(path, String(value));
  };
  walk(obj, prefix);
  return out;
}

export async function stripeCall<T>(path: string, body?: Record<string, unknown>, method: "GET" | "POST" = body ? "POST" : "GET"): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${stripeKey()}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    ...(body ? { body: form(body).toString() } : {}),
    signal: AbortSignal.timeout(15_000),
  });
  const json = (await res.json().catch(() => ({}))) as any;
  if (!res.ok) {
    const msg = json?.error?.message ?? "Stripe didn't accept that request.";
    throw new Error(msg);
  }
  return json as T;
}

/** Verify a Stripe-Signature header against the raw body. */
export async function verifyStripeSignature(rawBody: string, header: string | null, secret: string, toleranceSec = 300): Promise<boolean> {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=", 2) as [string, string]));
  const t = Number(parts["t"]);
  const v1 = parts["v1"];
  if (!t || !v1) return false;
  if (Math.abs(Date.now() / 1000 - t) > toleranceSec) return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(`${t}.${rawBody}`));
  const hex = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
  if (hex.length !== v1.length) return false;
  let diff = 0;
  for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ v1.charCodeAt(i);
  return diff === 0;
}
