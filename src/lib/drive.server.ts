/* eslint-disable @typescript-eslint/no-explicit-any -- reads tables and payloads the generated Supabase types don't cover */
/**
 * Server only: guide attachments kept in Google Drive, in the Google account
 * the super admin connected (Latchkey admin → Integrations). The app only
 * gets the "drive.file" permission: it can see and change the files it
 * created, nothing else in that Drive. Each host has their own folder; files
 * are never shared, guests see them only through signed links from this
 * server. Secrets: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET (Lovable Cloud).
 */
import { DOC_CONVERSIONS, storedName } from "./attachments";

type Loose = { from: (t: string) => any };
async function db(): Promise<Loose> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as Loose;
}

const env = (k: string) => (process.env[k] ?? "").trim();
export const DRIVE_SCOPES = ["https://www.googleapis.com/auth/drive.file", "openid", "email"];
const SECRET_KEY = "google_drive";

export type DriveConnection = {
  refreshToken: string;
  email: string | null;
  rootFolderId: string | null;
  connectedAt: string;
};

export function driveConfigured(): boolean {
  return !!env("GOOGLE_CLIENT_ID") && !!env("GOOGLE_CLIENT_SECRET");
}

export async function driveConnection(): Promise<DriveConnection | null> {
  const { data } = await (
    await db()
  )
    .from("platform_secrets")
    .select("value")
    .eq("key", SECRET_KEY)
    .maybeSingle();
  const v = data?.value as Partial<DriveConnection> | undefined;
  return v?.refreshToken
    ? {
        refreshToken: v.refreshToken,
        email: v.email ?? null,
        rootFolderId: v.rootFolderId ?? null,
        connectedAt: v.connectedAt ?? "",
      }
    : null;
}

async function saveConnection(c: DriveConnection | null) {
  const sb = await db();
  if (!c) {
    await sb.from("platform_secrets").delete().eq("key", SECRET_KEY);
    return;
  }
  await sb
    .from("platform_secrets")
    .upsert(
      { key: SECRET_KEY, value: c, updated_at: new Date().toISOString() },
      { onConflict: "key" },
    );
}

/* --------------------------------- OAuth --------------------------------- */

export function consentUrl(redirectUri: string, state: string): string {
  const q = new URLSearchParams({
    client_id: env("GOOGLE_CLIENT_ID"),
    redirect_uri: redirectUri,
    response_type: "code",
    scope: DRIVE_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
}

/** Remembers a one-time state for the consent round trip (10 minutes). */
export async function newOAuthState(): Promise<string> {
  const state = crypto.randomUUID();
  await (
    await db()
  )
    .from("platform_secrets")
    .upsert(
      { key: "google_oauth_state", value: { state, expires: Date.now() + 600_000 } },
      { onConflict: "key" },
    );
  return state;
}

export async function takeOAuthState(state: string): Promise<boolean> {
  const sb = await db();
  const { data } = await sb
    .from("platform_secrets")
    .select("value")
    .eq("key", "google_oauth_state")
    .maybeSingle();
  await sb.from("platform_secrets").delete().eq("key", "google_oauth_state");
  const v = data?.value as { state?: string; expires?: number } | undefined;
  return !!v?.state && v.state === state && (v.expires ?? 0) > Date.now();
}

/** Swaps the consent code for a long-lived connection. */
export async function finishConnect(code: string, redirectUri: string): Promise<void> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env("GOOGLE_CLIENT_ID"),
      client_secret: env("GOOGLE_CLIENT_SECRET"),
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  const json = (await res.json()) as {
    refresh_token?: string;
    access_token?: string;
    id_token?: string;
    error_description?: string;
  };
  if (!res.ok || !json.refresh_token)
    throw new Error(
      json.error_description ?? "Google didn't give a lasting connection. Try again.",
    );
  let email: string | null = null;
  try {
    const payload = JSON.parse(
      atob(json.id_token!.split(".")[1]!.replace(/-/g, "+").replace(/_/g, "/")),
    ) as { email?: string };
    email = payload.email ?? null;
  } catch {
    email = null;
  }
  const before = await driveConnection();
  // A different Google account: its own fresh root folder.
  await saveConnection({
    refreshToken: json.refresh_token,
    email,
    rootFolderId: before?.email === email ? (before?.rootFolderId ?? null) : null,
    connectedAt: new Date().toISOString(),
  });
  token = null;
  if (before?.email !== email) {
    await (await db()).from("host_storage").delete().eq("provider", "google_drive");
    // Private records start a fresh folder tree in the new account (files already moved stay in the old one).
    await (await db()).from("drive_folders").delete().neq("key", "");
  }
}

export async function disconnect() {
  await saveConnection(null);
  token = null;
}

let token: { value: string; expires: number } | null = null;

async function accessToken(): Promise<string> {
  if (token && token.expires > Date.now() + 60_000) return token.value;
  const c = await driveConnection();
  if (!c) throw new Error("Attachments aren't set up yet.");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: c.refreshToken,
      client_id: env("GOOGLE_CLIENT_ID"),
      client_secret: env("GOOGLE_CLIENT_SECRET"),
      grant_type: "refresh_token",
    }),
  });
  const json = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!res.ok || !json.access_token)
    throw new Error("The attachments store needs reconnecting (Latchkey admin → Integrations).");
  token = { value: json.access_token, expires: Date.now() + (json.expires_in ?? 3000) * 1000 };
  return token.value;
}

/** A Google Drive API call with the connected account's token (private-store.server.ts uses it too). */
export async function drive(path: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(`https://www.googleapis.com${path}`, {
    ...init,
    headers: { authorization: `Bearer ${await accessToken()}`, ...(init.headers ?? {}) },
  });
  return res;
}

export async function createFolder(name: string, parent: string | null): Promise<string> {
  const res = await drive("/drive/v3/files?fields=id", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name,
      mimeType: "application/vnd.google-apps.folder",
      ...(parent ? { parents: [parent] } : {}),
    }),
  });
  const json = (await res.json()) as { id?: string; error?: { message?: string } };
  if (!res.ok || !json.id)
    throw new Error(json.error?.message ?? "Couldn't make a folder for attachments.");
  return json.id;
}

/** The one folder all hosts' folders live in, made on first use. */
async function rootFolder(): Promise<string> {
  const c = await driveConnection();
  if (!c) throw new Error("Attachments aren't set up yet.");
  if (c.rootFolderId) return c.rootFolderId;
  const id = await createFolder("Guest guide attachments", null);
  await saveConnection({ ...c, rootFolderId: id });
  return id;
}

/** A host's own folder, named by their id, made the first time they attach something. */
export async function hostFolder(hostId: string, businessName: string): Promise<string> {
  const sb = await db();
  const { data } = await sb
    .from("host_storage")
    .select("folder_id")
    .eq("host_id", hostId)
    .maybeSingle();
  if (data?.folder_id) return data.folder_id as string;
  const id = await createFolder(`${hostId} · ${businessName}`.slice(0, 120), await rootFolder());
  await sb
    .from("host_storage")
    .upsert(
      { host_id: hostId, provider: "google_drive", folder_id: id },
      { onConflict: "host_id" },
    );
  return id;
}

/**
 * Uploads one attachment into the host's folder as <section_key>-<id>.<ext>.
 * Office documents are converted to Google's own format so they can be shown
 * to guests as PDF.
 */
export async function uploadAttachment(o: {
  folderId: string;
  sectionKey: string;
  id: string;
  originalName: string;
  mime: string;
  bytes: Uint8Array;
}): Promise<string> {
  const convert = DOC_CONVERSIONS[o.mime];
  const meta = {
    name: convert
      ? storedName(o.sectionKey, o.id, o.originalName).replace(/\.[a-z0-9]+$/, "")
      : storedName(o.sectionKey, o.id, o.originalName),
    parents: [o.folderId],
    ...(convert ? { mimeType: convert } : {}),
    appProperties: { sectionKey: o.sectionKey, attachmentId: o.id },
  };
  const boundary = `lk${crypto.randomUUID().replace(/-/g, "")}`;
  const head = new TextEncoder().encode(
    `--${boundary}\r\ncontent-type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\ncontent-type: ${o.mime}\r\n\r\n`,
  );
  const tail = new TextEncoder().encode(`\r\n--${boundary}--`);
  const body = new Uint8Array(head.length + o.bytes.length + tail.length);
  body.set(head, 0);
  body.set(o.bytes, head.length);
  body.set(tail, head.length + o.bytes.length);
  const res = await drive("/upload/drive/v3/files?uploadType=multipart&fields=id", {
    method: "POST",
    headers: { "content-type": `multipart/related; boundary=${boundary}` },
    body,
  });
  const json = (await res.json()) as { id?: string; error?: { message?: string } };
  if (!res.ok || !json.id) throw new Error(json.error?.message ?? "Couldn't upload that file.");
  return json.id;
}

/** The file's contents to show a guest: images and PDFs as they are, converted documents as PDF. */
export async function readAttachment(
  fileId: string,
  kind: "image" | "pdf" | "doc",
): Promise<Response> {
  return kind === "doc"
    ? drive(`/drive/v3/files/${encodeURIComponent(fileId)}/export?mimeType=application%2Fpdf`)
    : drive(`/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`);
}

export async function deleteFiles(fileIds: string[]) {
  for (const id of fileIds) {
    try {
      await drive(`/drive/v3/files/${encodeURIComponent(id)}`, { method: "DELETE" });
    } catch {
      // Already gone, or the store was disconnected: the record goes anyway.
    }
  }
}
