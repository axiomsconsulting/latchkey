import { describe, expect, it } from "vitest";
import { DEFAULT_REVIEW_TEXT, DEFAULT_ROOM_CARD_TEXT, DEFAULT_STAY_MESSAGE, reviewDay, starsOf, distanceMetres, inStayWindow, joinKind, nearKiosk, networkKey, normaliseStayAccess, stayProgress, wifiFor, wifiProfile, wifiQrText } from "@/lib/stay-access";

describe("stay access", () => {
  it("normalises the host's settings", () => {
    expect(normaliseStayAccess(null)).toMatchObject({ roomQrEarly: false, presence: "network_or_location", stayMessage: DEFAULT_STAY_MESSAGE, wifiAfterCheckIn: false, askReview: false, showDirectReviews: false });
    const s = normaliseStayAccess({ roomQrEarly: true, presence: "network", stayMessage: "  Hope all's <well>  ", wifiAfterCheckIn: true, askReview: true, reviewText: " Please review ", showDirectReviews: true });
    expect(s).toEqual({ roomQrEarly: true, presence: "network", stayMessage: "Hope all's well", wifiAfterCheckIn: true, askReview: true, reviewText: "Please review", showDirectReviews: true, bufferMinutes: 60, roomCardText: DEFAULT_ROOM_CARD_TEXT });
    expect(normaliseStayAccess({ reviewText: "  " }).reviewText).toBe(DEFAULT_REVIEW_TEXT);
    // The old default read like feedback: it becomes the new "anything else?" wording.
    expect(normaliseStayAccess({ stayMessage: "We hope your stay has been comfortable so far. If anything would make it better, just send us a message." }).stayMessage).toBe(DEFAULT_STAY_MESSAGE);
  });
  it("turns scores into stars and picks the review day", () => {
    expect([1, 2, 5, 9, 10].map(starsOf)).toEqual([1, 1, 3, 5, 5]);
    expect(reviewDay("leaving")).toBe(true);
    expect(reviewDay("during")).toBe(false);
  });
  it("counts the nights of a stay", () => {
    expect(stayProgress("2026-10-25", "2026-10-28", "2026-10-24")).toMatchObject({ phase: "before", nights: 3 });
    expect(stayProgress("2026-10-25", "2026-10-28", "2026-10-25")).toEqual({ nights: 3, phase: "arrival", night: 1, done: 0, left: 3 });
    expect(stayProgress("2026-10-25", "2026-10-28", "2026-10-26")).toEqual({ nights: 3, phase: "during", night: 2, done: 1, left: 2 });
    expect(stayProgress("2026-10-25", "2026-10-28", "2026-10-28")).toMatchObject({ phase: "leaving", left: 0 });
    expect(stayProgress("2026-10-25", "2026-10-28", "2026-10-30").phase).toBe("after");
    expect(inStayWindow("2026-10-25", "2026-10-28", "2026-10-28")).toBe(true);
  });
  it("finds the shared part of an address", () => {
    expect(networkKey("81.2.69.160")).toBe("4:81.2.69.160");
    expect(networkKey("::ffff:81.2.69.160")).toBe("4:81.2.69.160");
    // Two devices on different /64s of one /56 line match.
    expect(networkKey("2a02:c7c:1234:5601::1")).toBe(networkKey("2a02:0c7c:1234:56ff:abcd::9"));
    expect(networkKey("2a02:c7c:1234:5701::1")).not.toBe(networkKey("2a02:c7c:1234:5601::1"));
    expect(networkKey("not an ip")).toBeNull();
    expect(networkKey(null)).toBeNull();
  });
  it("measures how far a phone is from the door tablet", () => {
    const kiosk = { lat: 51.6286, lng: -0.7482, accuracy: 20 };
    expect(Math.round(distanceMetres(kiosk, { lat: 51.6295, lng: -0.7482 }))).toBe(100);
    expect(nearKiosk(kiosk, { lat: 51.6295, lng: -0.7482, accuracy: 30 })).toBe(true);
    expect(nearKiosk(kiosk, { lat: 51.64, lng: -0.7482, accuracy: 30 })).toBe(false);
    expect(nearKiosk(kiosk, { lat: 51.6287, lng: -0.7482, accuracy: 1500 })).toBe(false);
  });
  it("uses the room's own network before the property's", () => {
    expect(wifiFor({ wifi_name: "Room 2", wifi_password: "abc" }, { wifi_name: "House", wifi_password: "x" })).toEqual({ name: "Room 2", password: "abc" });
    expect(wifiFor({ wifi_name: " " }, { wifi_name: "House", wifi_password: "" })).toEqual({ name: "House", password: null });
    expect(wifiFor(null, null)).toBeNull();
  });
  it("writes join codes and profiles", () => {
    expect(wifiQrText('My;Net', 'p:a"ss')).toBe('WIFI:T:WPA;S:My\\;Net;P:p\\:a\\"ss;;');
    expect(wifiQrText("Open", null)).toBe("WIFI:T:nopass;S:Open;;");
    const p = wifiProfile("Hill <Guest>", "pw&1", "The Hill", (n) => `0000000${n}-0000-4000-8000-000000000000`);
    expect(p).toContain("<string>Hill &lt;Guest&gt;</string>");
    expect(p).toContain("<string>pw&amp;1</string>");
    expect(joinKind("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)")).toBe("ios");
    expect(joinKind("Mozilla/5.0 (Linux; Android 15)")).toBe("android");
    expect(joinKind("Mozilla/5.0 (Windows NT 10.0)")).toBe("other");
  });
});
