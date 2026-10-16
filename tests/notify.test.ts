import { describe, expect, it } from "vitest";

import { DEFAULT_PREFS, alertPath, channelsFor, normalisePrefs, smsText } from "../src/lib/notify";
import { fromB64url, newVapidKeys, vapidAuth } from "../src/lib/webpush";

const all = { email: true, push: true, telegram: true, sms: true };

describe("where alerts go", () => {
  it("uses the host's choices and only channels Latchkey has switched on", () => {
    expect(channelsFor("service_request", DEFAULT_PREFS, all)).toEqual(["push", "telegram", "email"]);
    expect(channelsFor("service_request", DEFAULT_PREFS, { ...all, push: false, telegram: false })).toEqual(["email"]);
    expect(channelsFor("lockout", { ...DEFAULT_PREFS, email: false }, all)).toEqual(["push", "telegram"]);
  });

  it("sends SMS only for urgent alerts unless the host asks for all", () => {
    const sms = { ...DEFAULT_PREFS, sms: true };
    expect(channelsFor("lockout", sms, all)).toContain("sms");
    expect(channelsFor("handover", sms, all)).toContain("sms");
    expect(channelsFor("service_request", sms, all)).not.toContain("sms");
    expect(channelsFor("service_request", { ...sms, smsUrgentOnly: false }, all)).toContain("sms");
    expect(channelsFor("lockout", sms, { ...all, sms: false })).not.toContain("sms");
  });

  it("cleans stored choices", () => {
    expect(normalisePrefs(null)).toEqual(DEFAULT_PREFS);
    expect(normalisePrefs({ sms: true, email: "yes" })).toEqual({ ...DEFAULT_PREFS, sms: true });
  });

  it("links to the stay, and keeps texts to one message", () => {
    expect(alertPath("lockout", "b1")).toBe("/app/bookings?guest=b1");
    expect(alertPath("test", "b1")).toBe("/app/today");
    const t = smsText("lockout", "Jane at The Hill Suites can't open the door. ".repeat(5), "https://latchkey.app/app/today");
    expect(t.length).toBeLessThanOrEqual(160);
    expect(t.startsWith("Latchkey: Guest can't get in.")).toBe(true);
    expect(t.endsWith("https://latchkey.app/app/today")).toBe(true);
  });
});

describe("web push signing", () => {
  it("signs a VAPID token the push service can verify", async () => {
    const keys = await newVapidKeys();
    expect(fromB64url(keys.publicKey).length).toBe(65);
    const header = await vapidAuth("https://fcm.googleapis.com/fcm/send/abc", { ...keys, subject: "mailto:host@example.com" }, Date.UTC(2026, 9, 16));
    const m = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(header)!;
    expect(m[4]).toBe(keys.publicKey);
    const claims = JSON.parse(new TextDecoder().decode(fromB64url(m[2]!)));
    expect(claims).toMatchObject({ aud: "https://fcm.googleapis.com", sub: "mailto:host@example.com" });
    const pub = await crypto.subtle.importKey("raw", fromB64url(keys.publicKey), { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
    const ok = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, pub, fromB64url(m[3]!), new TextEncoder().encode(`${m[1]}.${m[2]}`));
    expect(ok).toBe(true);
  });
});
