/**
 * Guide attachments: what may be attached, how files are named in the
 * host's folder, and the short-lived signed links guests see them through.
 * Pure (WebCrypto for signing), tested in tests/attachments.test.ts.
 */

export type AttachmentKind = "image" | "pdf" | "doc";

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const MAX_PER_SECTION = 12;

/** Office documents Google converts so guests can read them in the app (shown as PDF). */
export const DOC_CONVERSIONS: Record<string, string> = {
  "application/msword": "application/vnd.google-apps.document",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    "application/vnd.google-apps.document",
  "application/vnd.oasis.opendocument.text": "application/vnd.google-apps.document",
  "application/rtf": "application/vnd.google-apps.document",
  "text/plain": "application/vnd.google-apps.document",
  "application/vnd.ms-excel": "application/vnd.google-apps.spreadsheet",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
    "application/vnd.google-apps.spreadsheet",
  "application/vnd.ms-powerpoint": "application/vnd.google-apps.presentation",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation":
    "application/vnd.google-apps.presentation",
};

const IMAGES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

/** What the file is shown as, or null when it can't be shown in the app. */
export function kindFor(mime: string): AttachmentKind | null {
  if (IMAGES.has(mime)) return "image";
  if (mime === "application/pdf") return "pdf";
  if (DOC_CONVERSIONS[mime]) return "doc";
  return null;
}

/** "Fire exit map.PDF" → "pdf"; nothing sensible → "bin". */
export function extensionOf(name: string): string {
  const m = /\.([a-z0-9]{1,6})$/i.exec(name.trim());
  return m ? m[1]!.toLowerCase() : "bin";
}

/** The file's name in the host's folder: the section it belongs to, then its own id. */
export function storedName(sectionKey: string, id: string, original: string): string {
  return `${sectionKey}-${id}.${extensionOf(original)}`;
}

/** A tidy title from what the host uploaded ("fire_exit-map.pdf" → "fire exit map"). */
export function displayName(original: string): string {
  const base = original
    .replace(/\.[a-z0-9]{1,6}$/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return (base || "Attachment").slice(0, 200);
}

const enc = new TextEncoder();

async function hmac(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(message)));
  return btoa(String.fromCharCode(...sig))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** A link that shows one attachment until `expires` (unix seconds). */
export async function signAttachment(secret: string, id: string, expires: number): Promise<string> {
  return `/api/public/attachment/${id}?e=${expires}&s=${await hmac(secret, `${id}.${expires}`)}`;
}

/** Whether a link's signature is right and it hasn't expired. */
export async function verifyAttachment(
  secret: string,
  id: string,
  expires: number,
  sig: string,
  now = Math.floor(Date.now() / 1000),
): Promise<boolean> {
  if (!Number.isFinite(expires) || expires < now) return false;
  const want = await hmac(secret, `${id}.${expires}`);
  if (want.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0;
}
