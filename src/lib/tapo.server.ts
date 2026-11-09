/* eslint-disable @typescript-eslint/no-explicit-any -- TP-Link's answers and the 0099 columns aren't in the generated types */
/**
 * Server only: room lights through TP-Link's own cloud for Tapo devices
 * (room-devices.ts), the free route Latchkey admin can choose instead of
 * SmartThings. Unofficial: TP-Link publishes no API, so this speaks the
 * cloud protocol the Kasa and Tapo apps use (wap.tplinkcloud.com: login,
 * getDeviceList, passthrough). The newer n-wap.i.tplinkcloud.com service
 * uses a private certificate that Latchkey's server can't trust, so it
 * isn't used. TP-Link can change or close this at any time; every failure
 * is reported to the host in plain words.
 *
 * The host signs in with their TP-Link account inside Latchkey. Its
 * password is kept sealed (AES-GCM, server key) because TP-Link's sign-ins
 * end and Latchkey has to sign in again; it never leaves the server.
 */
import { tapoCapabilities, decodeAlias, isTapoDevice, type Capability } from "./room-devices";

const CLOUD = "https://wap.tplinkcloud.com";
const APP_TYPE = "Tapo_Android";

type Loose = { from: (t: string) => any };
async function db(): Promise<Loose> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as Loose;
}

export class TapoError extends Error {
  constructor(
    public reason:
      | "wrong_login"
      | "locked"
      | "two_step"
      | "not_connected"
      | "offline"
      | "refused"
      | "not_found"
      | "unsupported",
  ) {
    super(`smart_home:${reason}`);
  }
}

/* --------------------------------- sealing --------------------------------- */

async function key(): Promise<CryptoKey> {
  const { signingSecret } = await import("./attachments.server");
  const raw = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`room-lights:${signingSecret()}`),
  );
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}
const b64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function seal(text: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const out = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      await key(),
      new TextEncoder().encode(text),
    ),
  );
  return `${b64(iv)}.${b64(out)}`;
}

async function unseal(sealed: string): Promise<string | null> {
  try {
    const [iv, body] = sealed.split(".");
    if (!iv || !body) return null;
    const out = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: unb64(iv) },
      await key(),
      unb64(body),
    );
    return new TextDecoder().decode(out);
  } catch {
    return null;
  }
}

/* ---------------------------------- calls ---------------------------------- */

type Answer = { error_code?: number; msg?: string; result?: any };

async function post(url: string, body: unknown, token?: string): Promise<Answer> {
  const target = token ? `${url}?token=${encodeURIComponent(token)}` : url;
  let res: Response;
  try {
    res = await fetch(target, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new TapoError("offline");
  }
  if (!res.ok) throw new TapoError("offline");
  return ((await res.json().catch(() => ({}))) as Answer) ?? {};
}

const WRONG = -20601;
const LOCKED = -20675;
const TWO_STEP = -20677;
/** "Device is offline" (and its sibling): no point signing in again. */
const OFFLINE = [-20571, -20572];

async function login(email: string, password: string, terminalId: string) {
  const a = await post(CLOUD, {
    method: "login",
    params: {
      appType: APP_TYPE,
      cloudUserName: email,
      cloudPassword: password,
      terminalUUID: terminalId,
    },
  });
  if (a.error_code === 0 && a.result?.token) return String(a.result.token);
  if (a.error_code === WRONG) throw new TapoError("wrong_login");
  if (a.error_code === LOCKED) throw new TapoError("locked");
  if (a.error_code === TWO_STEP) throw new TapoError("two_step");
  throw new TapoError("refused");
}

/** Signs the business in to TP-Link and keeps the connection (replacing any other). */
export async function connectTapo(
  hostId: string,
  userId: string,
  email: string,
  password: string,
): Promise<number> {
  const terminalId = crypto.randomUUID();
  const token = await login(email, password, terminalId);
  const now = new Date().toISOString();
  const { error } = await (await db()).from("smart_home_links").upsert(
    {
      host_id: hostId,
      provider: "tapo",
      access_token: token,
      refresh_token: null,
      // TP-Link doesn't say; Latchkey signs in again whenever TP-Link says the sign-in ended.
      expires_at: new Date(Date.now() + 30 * 86_400_000).toISOString(),
      installed_app_id: null,
      scope: null,
      refreshing_until: null,
      account_email: email.toLowerCase(),
      secret_sealed: await seal(password),
      terminal_id: terminalId,
      connected_by: userId,
      connected_at: now,
      updated_at: now,
      last_error: null,
    },
    { onConflict: "host_id" },
  );
  if (error) throw new Error(error.message);
  return (await listTapoDevices(hostId)).length;
}

async function link(hostId: string) {
  const { data } = await (
    await db()
  )
    .from("smart_home_links")
    .select("provider, access_token, account_email, secret_sealed, terminal_id")
    .eq("host_id", hostId)
    .maybeSingle();
  if (!data || data.provider !== "tapo") throw new TapoError("not_connected");
  return data as {
    access_token: string;
    account_email: string;
    secret_sealed: string;
    terminal_id: string;
  };
}

/** Signs in again with the kept password; marks the connection signed out if TP-Link refuses. */
async function signInAgain(hostId: string): Promise<string> {
  const l = await link(hostId);
  const password = await unseal(l.secret_sealed);
  const sb = await db();
  try {
    if (!password) throw new TapoError("wrong_login");
    const token = await login(l.account_email, password, l.terminal_id);
    await sb
      .from("smart_home_links")
      .update({ access_token: token, last_error: null, updated_at: new Date().toISOString() })
      .eq("host_id", hostId);
    return token;
  } catch (e) {
    await sb
      .from("smart_home_links")
      .update({
        last_error: e instanceof TapoError ? e.reason : "sign-in failed",
        updated_at: new Date().toISOString(),
      })
      .eq("host_id", hostId);
    throw e;
  }
}

/** A call with the business's sign-in, signing in again once if it has ended. */
async function signed(hostId: string, url: string, body: unknown): Promise<Answer> {
  let token = (await link(hostId)).access_token;
  for (let attempt = 0; attempt < 2; attempt++) {
    const a = await post(url, body, token);
    if (a.error_code === 0) return a;
    if (a.error_code !== undefined && OFFLINE.includes(a.error_code))
      throw new TapoError("offline");
    // Anything else first time round is usually an ended sign-in (-20651 and friends).
    if (attempt === 0) {
      token = await signInAgain(hostId);
      continue;
    }
    throw new TapoError("refused");
  }
  throw new TapoError("refused");
}

/* --------------------------------- devices --------------------------------- */

export type TapoDevice = {
  deviceId: string;
  label: string;
  capabilities: Capability[];
  serverUrl: string;
  model: string;
  online: boolean;
};

export async function listTapoDevices(hostId: string): Promise<TapoDevice[]> {
  const a = await signed(hostId, CLOUD, { method: "getDeviceList" });
  const list = (a.result?.deviceList ?? []) as any[];
  return list
    .filter((d) => isTapoDevice(d.deviceType))
    .map((d) => ({
      deviceId: String(d.deviceId),
      label: (decodeAlias(d.alias) || String(d.deviceModel ?? "Tapo device")).slice(0, 80),
      capabilities: tapoCapabilities(String(d.deviceType), String(d.deviceModel ?? "")),
      serverUrl:
        typeof d.appServerUrl === "string" &&
        /^https:\/\/[a-z0-9.-]+\.tplinkcloud\.com/.test(d.appServerUrl)
          ? d.appServerUrl
          : CLOUD,
      model: String(d.deviceModel ?? "").slice(0, 40),
      online: d.status === 1,
    }))
    .sort((x, y) => x.label.localeCompare(y.label));
}

async function passthrough(
  hostId: string,
  serverUrl: string,
  deviceId: string,
  request: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const a = await signed(hostId, serverUrl || CLOUD, {
    method: "passthrough",
    params: {
      deviceId,
      requestData: JSON.stringify({ ...request, requestTimeMils: Date.now() }),
    },
  });
  const raw = a.result?.responseData;
  let inner: { error_code?: number; result?: Record<string, unknown> } = {};
  try {
    inner = typeof raw === "string" ? JSON.parse(raw) : (raw ?? {});
  } catch {
    throw new TapoError("unsupported");
  }
  // TP-Link took the request but the device wouldn't answer it this way.
  if (inner.error_code !== 0) throw new TapoError("unsupported");
  return inner.result ?? {};
}

export async function tapoInfo(hostId: string, serverUrl: string, deviceId: string) {
  return passthrough(hostId, serverUrl, deviceId, { method: "get_device_info" });
}

export async function tapoSet(
  hostId: string,
  serverUrl: string,
  deviceId: string,
  params: Record<string, number | boolean>,
) {
  await passthrough(hostId, serverUrl, deviceId, { method: "set_device_info", params });
}
