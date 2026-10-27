/**
 * Private files (guests' ID photos, Commission Partner ID photos, drawn
 * signatures and signed agreements) live in the Google Drive the super admin
 * connected, in restricted folders that are never shared. While Drive can't
 * be reached, a file waits in Latchkey's private "private-queue" bucket and
 * is moved across, checked and removed by syncDriveQueue
 * (private-store.server.ts). Text records stay in the database.
 *
 * Pure: how a stored file is referred to, which folder it belongs in, and
 * the signed links that show one for a few minutes.
 */

export type StoreKind =
  | "guest_id"
  | "guest_face"
  | "partner_id"
  | "partner_selfie"
  | "partner_signature"
  | "partner_agreement";

/** Folders under the root, so the records stay apart: guests by business, partners by person. */
export const STORE_GROUPS: Record<StoreKind, { key: string; name: string }> = {
  guest_id: { key: "guest_ids", name: "Guest ID photos (restricted)" },
  guest_face: { key: "guest_ids", name: "Guest ID photos (restricted)" },
  partner_id: { key: "partner_ids", name: "Commission Partner ID (restricted)" },
  partner_selfie: { key: "partner_ids", name: "Commission Partner ID (restricted)" },
  partner_signature: {
    key: "partner_agreements",
    name: "Commission Partner agreements (restricted)",
  },
  partner_agreement: {
    key: "partner_agreements",
    name: "Commission Partner agreements (restricted)",
  },
};

export const ROOT_FOLDER_NAME = "Latchkey private records (restricted, do not share)";

/** Database columns a stored file may be referred from (the queue updates only these). */
export const REF_COLUMNS: Record<string, readonly string[]> = {
  guest_ids: ["id_photo_path", "face_photo_path"],
  partner_id_checks: ["id_image_path", "selfie_image_path"],
  partner_agreement_acceptances: ["signature_png_path", "pdf_path"],
};

export function refAllowed(table: string, column: string): boolean {
  return !!REF_COLUMNS[table]?.includes(column);
}

export type StoredRef =
  | { where: "drive"; fileId: string }
  | { where: "queue"; path: string }
  /** Guest photos saved before Drive (the "guest-ids" bucket). */
  | { where: "legacy"; path: string };

export const driveRef = (fileId: string) => `drive:${fileId}`;
export const queueRef = (path: string) => `queue:${path}`;

export function readRef(ref: string): StoredRef {
  if (ref.startsWith("drive:")) return { where: "drive", fileId: ref.slice(6) };
  if (ref.startsWith("queue:")) return { where: "queue", path: ref.slice(6) };
  return { where: "legacy", path: ref };
}

/** A safe Drive and storage file name part: letters, digits, dots, dashes. */
export function safePart(s: string): string {
  return (
    s
      .replace(/[^\w.-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 80) || "file"
  );
}

/** The owner's folder name: their id first (stable), then a readable label. */
export function ownerFolderName(ownerKey: string, label: string): string {
  return `${ownerKey} · ${label}`.replace(/[/\\]/g, "-").slice(0, 120);
}

const enc = new TextEncoder();
const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

async function hmac(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return b64url(
    new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(`private-file.${message}`))),
  );
}

/** A link that shows one private file until `expires` (unix seconds), and only that file. */
export async function signPrivateLink(
  secret: string,
  ref: string,
  expires: number,
  name = "file",
): Promise<string> {
  const r = b64url(enc.encode(ref));
  const n = safePart(name);
  return `/api/public/private-file/${r}?e=${expires}&n=${encodeURIComponent(n)}&s=${await hmac(secret, `${r}.${expires}.${n}`)}`;
}

/** The file a link points at, if its signature is right and it hasn't expired. */
export async function verifyPrivateLink(
  secret: string,
  r: string,
  expires: number,
  name: string,
  sig: string,
  now = Math.floor(Date.now() / 1000),
): Promise<string | null> {
  if (!Number.isFinite(expires) || expires < now || !/^[\w-]+$/.test(r)) return null;
  const want = await hmac(secret, `${r}.${expires}.${name}`);
  if (want.length !== sig.length) return null;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ sig.charCodeAt(i);
  if (diff !== 0) return null;
  const pad = r.replace(/-/g, "+").replace(/_/g, "/");
  return new TextDecoder().decode(
    Uint8Array.from(atob(pad + "=".repeat((4 - (pad.length % 4)) % 4)), (c) => c.charCodeAt(0)),
  );
}

/** SHA-256 of bytes, as hex (Drive reports the same for an exact copy). */
export async function sha256OfBytes(bytes: Uint8Array): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", bytes as unknown as ArrayBuffer);
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
