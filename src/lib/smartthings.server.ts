/* eslint-disable @typescript-eslint/no-explicit-any -- smart_home_links is from migration 0098, newer than the generated types */
/**
 * Server only: each business's SmartThings connection (room-devices.ts).
 * Latchkey has one SmartThings API app (OAuth-In), made from inside the app:
 * a super admin pastes a short-lived SmartThings token once (Latchkey admin
 * → System → SmartThings) and createApp() registers it through SmartThings'
 * Apps API, keeping its client id and secret in platform_secrets
 * "smartthings_app" (server only, never sent to the browser). Each host then
 * signs in to their own SmartThings account and allows "see and control
 * devices". Access tokens last about 24 hours; refresh tokens are single
 * use, so only one refresh runs at a time per business (refreshing_until).
 */
import { DEMO_DEVICE, knownCapabilities, stateFromStatus, type Capability } from "./room-devices";

const API = "https://api.smartthings.com/v1";
export const SMARTTHINGS_SCOPES = ["r:devices:*", "x:devices:*", "r:locations:*"];
const env = (k: string) => (process.env[k] ?? "").trim();

type Loose = { from: (t: string) => any };
async function db(): Promise<Loose> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as Loose;
}

const APP_KEY = "smartthings_app";

type AppCredentials = {
  clientId: string;
  clientSecret: string;
  appId: string | null;
  redirectUri: string;
  createdAt: string;
};

async function appCredentials(): Promise<AppCredentials | null> {
  const { data } = await (
    await db()
  )
    .from("platform_secrets")
    .select("value")
    .eq("key", APP_KEY)
    .maybeSingle();
  const v = data?.value as Partial<AppCredentials> | undefined;
  return v?.clientId && v.clientSecret && v.redirectUri
    ? {
        clientId: v.clientId,
        clientSecret: v.clientSecret,
        appId: v.appId ?? null,
        redirectUri: v.redirectUri,
        createdAt: v.createdAt ?? "",
      }
    : null;
}

export async function smartThingsConfigured(): Promise<boolean> {
  return !!(await appCredentials());
}

/** What the admin card shows: never the secret. */
export async function appStatus(): Promise<{ redirectUri: string; createdAt: string } | null> {
  const c = await appCredentials();
  return c ? { redirectUri: c.redirectUri, createdAt: c.createdAt } : null;
}

/** The address SmartThings sends the host back to; it must be registered on the app exactly. */
export function callbackFor(requestOrigin: string): string {
  const site = env("PUBLIC_SITE_URL").replace(/\/+$/, "");
  return `${site || requestOrigin}/api/public/smartthings/callback`;
}

/** The registered address (the one the app was made with). */
export async function smartThingsCallback(): Promise<string> {
  const c = await appCredentials();
  if (!c) throw new SmartHomeError("not_connected");
  return c.redirectUri;
}

/**
 * Registers Latchkey's SmartThings app with SmartThings' Apps API, using a
 * token the super admin made at account.smartthings.com/tokens (it only
 * needs to work for this one call and isn't kept). Replaces any earlier one.
 */
export async function createApp(
  token: string,
  redirectUri: string,
  displayName: string,
  privacyUrl: string,
): Promise<void> {
  const slug = displayName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const res = await fetch(`${API}/apps`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token.trim()}`,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      appName: `${/^[a-z0-9]/.test(slug) ? slug : `a${slug}`}-room-lights-${crypto.randomUUID()}`,
      displayName: `${displayName} room lights`.slice(0, 75),
      description: "Lets guests switch the lights in their room from their stay guide.",
      appType: "API_ONLY",
      classifications: ["CONNECTED_SERVICE"],
      singleInstance: true,
      principalType: "LOCATION",
      apiOnly: { privacyPolicyUrl: privacyUrl },
      oauth: {
        clientName: `${displayName} room lights`.slice(0, 75),
        scope: SMARTTHINGS_SCOPES,
        redirectUris: [redirectUri],
      },
    }),
  });
  const json = (await res.json().catch(() => ({}))) as {
    oauthClientId?: string;
    oauthClientSecret?: string;
    app?: { appId?: string };
    message?: string;
    error?: { message?: string };
  };
  if (res.status === 401 || res.status === 403)
    throw new Error(
      "SmartThings didn't accept that token. Make a new one with the Apps permissions ticked and paste it straight away.",
    );
  if (!res.ok || !json.oauthClientId || !json.oauthClientSecret)
    throw new Error(
      json.error?.message ?? json.message ?? `SmartThings didn't make the app (${res.status}).`,
    );
  const { error } = await (await db()).from("platform_secrets").upsert(
    {
      key: APP_KEY,
      value: {
        clientId: json.oauthClientId,
        clientSecret: json.oauthClientSecret,
        appId: json.app?.appId ?? null,
        redirectUri,
        createdAt: new Date().toISOString(),
      },
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" },
  );
  if (error) throw new Error(error.message);
}

/** Forgets Latchkey's app. Hosts' connections stop working until a new one is made and they connect again. */
export async function forgetApp(): Promise<void> {
  await (await db()).from("platform_secrets").delete().eq("key", APP_KEY);
}

/* ---------------------------------- state ---------------------------------- */

async function hmac(text: string): Promise<string> {
  const { signingSecret } = await import("./attachments.server");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(signingSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(text));
  return btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** A signed, 15-minute state naming the business and who's connecting it. */
export async function makeState(hostId: string, userId: string): Promise<string> {
  const body = `${hostId}.${userId}.${Date.now() + 15 * 60_000}`;
  return `${body}.${await hmac(body)}`;
}

export async function readState(state: string): Promise<{ hostId: string; userId: string } | null> {
  const parts = state.split(".");
  if (parts.length !== 4) return null;
  const [hostId, userId, exp, sig] = parts as [string, string, string, string];
  if (!(Number(exp) > Date.now())) return null;
  if ((await hmac(`${hostId}.${userId}.${exp}`)) !== sig) return null;
  return { hostId, userId };
}

export async function consentUrl(state: string): Promise<string> {
  const c = await appCredentials();
  if (!c) throw new SmartHomeError("not_connected");
  const redirectUri = c.redirectUri;
  const q = new URLSearchParams({
    client_id: c.clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    scope: SMARTTHINGS_SCOPES.join(" "),
    state,
  });
  return `${API}/oauth/authorize?${q}`;
}

/* ---------------------------------- tokens ---------------------------------- */

type TokenAnswer = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  installed_app_id?: string;
  scope?: string;
  error?: string;
  error_description?: string;
};

async function tokenCall(body: Record<string, string>): Promise<TokenAnswer & { ok: boolean }> {
  const c = await appCredentials();
  if (!c) return { ok: false, error: "not_set_up" };
  const basic = btoa(`${c.clientId}:${c.clientSecret}`);
  const res = await fetch(`${API}/oauth/token`, {
    method: "POST",
    headers: {
      authorization: `Basic ${basic}`,
      "content-type": "application/x-www-form-urlencoded",
      accept: "application/json",
    },
    body: new URLSearchParams({ ...body, client_id: c.clientId }),
  });
  const json = (await res.json().catch(() => ({}))) as TokenAnswer;
  return { ...json, ok: res.ok && !!json.access_token && !!json.refresh_token };
}

const expiry = (seconds: number | undefined) =>
  new Date(Date.now() + Math.max(60, (seconds ?? 86_000) - 120) * 1000).toISOString();

/** Swaps SmartThings' code for the business's connection. */
export async function finishConnect(hostId: string, userId: string, code: string): Promise<void> {
  const redirectUri = await smartThingsCallback();
  const t = await tokenCall({ grant_type: "authorization_code", code, redirect_uri: redirectUri });
  if (!t.ok) throw new Error(t.error_description ?? t.error ?? "SmartThings refused the sign-in.");
  const now = new Date().toISOString();
  const { error } = await (await db()).from("smart_home_links").upsert(
    {
      host_id: hostId,
      provider: "smartthings",
      access_token: t.access_token,
      refresh_token: t.refresh_token,
      expires_at: expiry(t.expires_in),
      installed_app_id: t.installed_app_id ?? null,
      scope: t.scope ?? null,
      refreshing_until: null,
      connected_by: userId,
      connected_at: now,
      updated_at: now,
      last_error: null,
    },
    { onConflict: "host_id" },
  );
  if (error) throw new Error(error.message);
}

export type LinkInfo = { connectedAt: string; lastError: string | null };

export async function linkInfo(hostId: string): Promise<LinkInfo | null> {
  const { data, error } = await (
    await db()
  )
    .from("smart_home_links")
    .select("connected_at, last_error")
    .eq("host_id", hostId)
    .maybeSingle();
  if (error || !data) return null;
  return { connectedAt: data.connected_at, lastError: data.last_error ?? null };
}

export async function disconnect(hostId: string): Promise<void> {
  const sb = await db();
  const { data } = await sb
    .from("smart_home_links")
    .select("installed_app_id, access_token")
    .eq("host_id", hostId)
    .maybeSingle();
  // Uninstalls Latchkey from their SmartThings account too (best effort).
  if (data?.installed_app_id && data?.access_token)
    await fetch(`${API}/installedapps/${encodeURIComponent(data.installed_app_id)}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${data.access_token}` },
    }).catch(() => undefined);
  await sb.from("smart_home_links").delete().eq("host_id", hostId);
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * A working access token for the business, refreshing it first when it's
 * near its end (or when `force`). One refresh at a time: whoever takes the
 * lock refreshes; others wait for the new token.
 */
export async function accessToken(hostId: string, force = false): Promise<string> {
  const sb = await db();
  for (let attempt = 0; attempt < 8; attempt++) {
    const { data: link } = await sb
      .from("smart_home_links")
      .select("access_token, refresh_token, expires_at, refreshing_until")
      .eq("host_id", hostId)
      .maybeSingle();
    if (!link) throw new SmartHomeError("not_connected");
    const fresh = Date.parse(link.expires_at) > Date.now() + 5 * 60_000;
    if (fresh && !force) return link.access_token;
    const nowIso = new Date().toISOString();
    const { data: locked } = await sb
      .from("smart_home_links")
      .update({ refreshing_until: new Date(Date.now() + 20_000).toISOString() })
      .eq("host_id", hostId)
      .eq("refresh_token", link.refresh_token)
      .or(`refreshing_until.is.null,refreshing_until.lt."${nowIso}"`)
      .select("host_id");
    if (!locked?.length) {
      // Someone else is refreshing: their token arrives shortly.
      await wait(750);
      force = false;
      continue;
    }
    const t = await tokenCall({ grant_type: "refresh_token", refresh_token: link.refresh_token });
    if (!t.ok) {
      await sb
        .from("smart_home_links")
        .update({
          refreshing_until: null,
          last_error: t.error_description ?? t.error ?? "refresh failed",
          updated_at: nowIso,
        })
        .eq("host_id", hostId);
      throw new SmartHomeError("signed_out");
    }
    await sb
      .from("smart_home_links")
      .update({
        access_token: t.access_token,
        refresh_token: t.refresh_token,
        expires_at: expiry(t.expires_in),
        refreshing_until: null,
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("host_id", hostId);
    return t.access_token!;
  }
  throw new SmartHomeError("busy");
}

export class SmartHomeError extends Error {
  constructor(
    public reason: "not_connected" | "signed_out" | "busy" | "offline" | "refused" | "not_found",
  ) {
    super(`smart_home:${reason}`);
  }
}

async function call(hostId: string, path: string, init: RequestInit = {}): Promise<any> {
  for (let tryNo = 0; tryNo < 2; tryNo++) {
    const token = await accessToken(hostId, tryNo > 0);
    const res = await fetch(`${API}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${token}`,
        accept: "application/json",
        ...(init.body ? { "content-type": "application/json" } : {}),
      },
    });
    if (res.status === 401 && tryNo === 0) continue;
    if (res.status === 404) throw new SmartHomeError("not_found");
    if (res.status === 429 || res.status >= 500) throw new SmartHomeError("offline");
    if (!res.ok) throw new SmartHomeError("refused");
    return res.status === 204 ? null : res.json().catch(() => null);
  }
  throw new SmartHomeError("signed_out");
}

/* --------------------------------- devices --------------------------------- */

export type FoundDevice = { deviceId: string; label: string; capabilities: Capability[] };

/** The devices in their SmartThings account that Latchkey can use (on/off at least). */
export async function listDevices(hostId: string): Promise<FoundDevice[]> {
  const out: FoundDevice[] = [];
  let path: string | null = "/devices";
  for (let page = 0; path && page < 10; page++) {
    const json: any = await call(hostId, path);
    for (const d of (json?.items ?? []) as any[]) {
      const main = ((d.components ?? []) as any[]).find((c) => c.id === "main");
      const caps = knownCapabilities(((main?.capabilities ?? []) as any[]).map((c) => c.id));
      if (!caps.includes("switch")) continue;
      out.push({
        deviceId: String(d.deviceId),
        label: String(d.label || d.name || "Device").slice(0, 80),
        capabilities: caps,
      });
    }
    const next: string | undefined = json?._links?.next?.href;
    path = next && next.startsWith(API) ? next.slice(API.length) : null;
  }
  return out.sort((a, b) => a.label.localeCompare(b.label));
}

export async function deviceState(hostId: string, deviceId: string) {
  const id = encodeURIComponent(deviceId);
  const [status, health] = await Promise.all([
    call(hostId, `/devices/${id}/status`),
    call(hostId, `/devices/${id}/health`).catch(() => undefined),
  ]);
  return stateFromStatus(status, health);
}

export async function sendCommands(hostId: string, deviceId: string, commands: unknown[]) {
  if (!commands.length) return;
  await call(hostId, `/devices/${encodeURIComponent(deviceId)}/commands`, {
    method: "POST",
    body: JSON.stringify({ commands }),
  });
}

/** Demo mode's account: one sample bulb. */
export const demoDevices = (): FoundDevice[] => [DEMO_DEVICE];

/**
 * Keeps each connection alive: a refresh token unused for 30 days stops
 * working, so the daily clean-up refreshes any not refreshed for a week.
 */
export async function keepSmartHomeAlive(): Promise<void> {
  const sb = await db();
  await sb
    .from("room_device_uses")
    .delete()
    .lt("at", new Date(Date.now() - 7 * 86_400_000).toISOString());
  if (!(await smartThingsConfigured())) return;
  const { data, error } = await sb
    .from("smart_home_links")
    .select("host_id")
    .lt("updated_at", new Date(Date.now() - 7 * 86_400_000).toISOString());
  if (error) return;
  for (const r of (data ?? []) as Array<{ host_id: string }>)
    await accessToken(r.host_id, true).catch(() => undefined);
}
