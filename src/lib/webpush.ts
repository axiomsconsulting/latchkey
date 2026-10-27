/**
 * Web Push without libraries: a VAPID-signed request with no content
 * (the service worker then asks Latchkey for the newest alert). Uses only
 * WebCrypto, so it runs on the edge server. Tested.
 */

const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

export function fromB64url(s: string): Uint8Array {
  const pad = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(pad);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

/** The VAPID private key (32 bytes, base64url) as a signing key, with its public half (65 bytes). */
async function signingKey(publicKey: string, privateKey: string): Promise<CryptoKey> {
  const pub = fromB64url(publicKey);
  if (pub.length !== 65 || pub[0] !== 4)
    throw new Error("VAPID public key should be 65 bytes, uncompressed.");
  const jwk: JsonWebKey = {
    kty: "EC",
    crv: "P-256",
    x: b64url(pub.slice(1, 33)),
    y: b64url(pub.slice(33, 65)),
    d: privateKey.replace(/=+$/, ""),
    ext: true,
  };
  return crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, [
    "sign",
  ]);
}

/** The Authorization header value for a push to this endpoint. */
export async function vapidAuth(
  endpoint: string,
  keys: { publicKey: string; privateKey: string; subject: string },
  now = Date.now(),
): Promise<string> {
  const aud = new URL(endpoint).origin;
  const enc = new TextEncoder();
  const header = b64url(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = b64url(
    enc.encode(JSON.stringify({ aud, exp: Math.floor(now / 1000) + 12 * 3600, sub: keys.subject })),
  );
  const unsigned = `${header}.${claims}`;
  const key = await signingKey(keys.publicKey, keys.privateKey);
  // WebCrypto gives the raw r||s signature JWT needs.
  const sig = new Uint8Array(
    await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(unsigned)),
  );
  return `vapid t=${unsigned}.${b64url(sig)}, k=${keys.publicKey}`;
}

export type PushResult = "sent" | "gone" | "failed";

/** Sends one content-free push. "gone" means the device unsubscribed: delete it. */
export async function sendPush(
  endpoint: string,
  keys: { publicKey: string; privateKey: string; subject: string },
): Promise<PushResult> {
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: await vapidAuth(endpoint, keys),
        TTL: "86400",
        Urgency: "high",
        "Content-Length": "0",
      },
    });
    if (res.status === 404 || res.status === 410) return "gone";
    return res.ok ? "sent" : "failed";
  } catch {
    return "failed";
  }
}

/** Makes a new VAPID key pair (for the super admin's one-time set-up). */
export async function newVapidKeys(): Promise<{ publicKey: string; privateKey: string }> {
  const pair = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
    "sign",
    "verify",
  ])) as CryptoKeyPair;
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
  const jwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
  return { publicKey: b64url(raw), privateKey: jwk.d! };
}
