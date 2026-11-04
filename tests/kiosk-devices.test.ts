import { describe, expect, it } from "vitest";

import {
  besideTabletInUse,
  gridFor,
  isOnline,
  newPairCode,
  nextNumber,
  readPairCode,
  showPairCode,
  tabletName,
  deviceSignature,
  twinFor,
  type TwinRow,
} from "@/lib/kiosk-devices";
import { APP_VERSION } from "@/lib/app-version";
import { RELEASES } from "@/content/changelog";

const now = Date.parse("2026-10-29T12:00:00Z");
const minsAgo = (m: number) => new Date(now - m * 60_000).toISOString();

describe("door tablets", () => {
  it("numbers each new tablet with the lowest free number", () => {
    expect(nextNumber([])).toBe(1);
    expect(nextNumber([1, 2, 4])).toBe(3);
    expect(nextNumber([null, 1])).toBe(2);
    expect(nextNumber(Array.from({ length: 99 }, (_, i) => i + 1))).toBeNull();
  });

  it("makes and reads six-digit setup codes however they're typed", () => {
    const c = newPairCode(() => 0.5);
    expect(c).toMatch(/^[1-9]\d{5}$/);
    expect(showPairCode("482913")).toBe("482 913");
    expect(readPairCode(" 482-913 ")).toBe("482913");
    expect(readPairCode("12345")).toBeNull();
    expect(readPairCode("012345")).toBeNull();
  });

  it("names a tablet by its name, else its number", () => {
    expect(tabletName({ label: "Front door", number: 2 })).toBe("Front door");
    expect(tabletName({ label: " ", number: 2 })).toBe("Tablet 2");
  });

  it("joins a new tablet only beside one in use: same Wi-Fi recently, or close by", () => {
    const inUse = [
      { netHash: "n1", netDay: "2026-10-29", lastSeenAt: minsAgo(5), fix: null },
      {
        netHash: "n9",
        netDay: "2026-10-29",
        lastSeenAt: minsAgo(500),
        fix: { lat: 51.6, lng: -0.75, accuracy: 20 },
      },
    ];
    const day = "2026-10-29";
    expect(besideTabletInUse({ netHash: "n1", day, fix: null }, inUse, now)).toBe(true);
    expect(besideTabletInUse({ netHash: "n2", day, fix: null }, inUse, now)).toBe(false);
    // The same Wi-Fi as a tablet not seen for hours doesn't count…
    expect(besideTabletInUse({ netHash: "n9", day, fix: null }, inUse, now)).toBe(false);
    // …but standing right beside it does.
    expect(
      besideTabletInUse(
        { netHash: "x", day, fix: { lat: 51.6001, lng: -0.75, accuracy: 15 } },
        inUse,
        now,
      ),
    ).toBe(true);
    expect(
      besideTabletInUse(
        { netHash: "x", day, fix: { lat: 51.7, lng: -0.75, accuracy: 15 } },
        inUse,
        now,
      ),
    ).toBe(false);
  });

  it("lays tablets out as square as it can, wider than tall", () => {
    expect(gridFor(1)).toEqual({ cols: 1, rows: 1 });
    expect(gridFor(2)).toEqual({ cols: 2, rows: 1 });
    expect(gridFor(3)).toEqual({ cols: 2, rows: 2 });
    expect(gridFor(5)).toEqual({ cols: 3, rows: 2 });
    expect(gridFor(9)).toEqual({ cols: 3, rows: 3 });
  });

  it("counts a tablet seen in the last few minutes as on", () => {
    expect(isOnline(minsAgo(3), now)).toBe(true);
    expect(isOnline(minsAgo(30), now)).toBe(false);
    expect(isOnline(null, now)).toBe(false);
  });

  it("shows the newest release as the app version", () => {
    expect(APP_VERSION).toBe(RELEASES[0]!.version);
  });
});

describe("why a tablet's live camera can't open", async () => {
  const { cameraBlock } = await import("@/lib/kiosk-devices");
  const now = Date.parse("2026-11-01T12:00:00Z");
  const ok = {
    status: "confirmed",
    camera_allowed: true,
    last_seen_at: "2026-11-01T11:58:00Z",
    screen: { camera: true, camPermission: "granted" },
  };
  it("names the reason, most basic first", () => {
    expect(cameraBlock(ok, now)).toBeNull();
    expect(cameraBlock({ ...ok, status: "pending" }, now)).toBe("not_paired");
    expect(cameraBlock({ ...ok, camera_allowed: false }, now)).toBe("not_allowed");
    expect(cameraBlock({ ...ok, last_seen_at: "2026-11-01T11:40:00Z" }, now)).toBe("offline");
    expect(cameraBlock({ ...ok, screen: { camera: false } }, now)).toBe("no_camera");
    expect(cameraBlock({ ...ok, screen: { camPermission: "denied" } }, now)).toBe(
      "browser_blocked",
    );
    expect(cameraBlock({ ...ok, screen: { camPermission: "prompt" } }, now)).toBe("needs_allow");
    // A browser that won't say: try anyway.
    expect(cameraBlock({ ...ok, screen: null }, now)).toBeNull();
  });
});

describe("the same tablet in another browser", () => {
  const safari =
    "Mozilla/5.0 (iPad; CPU OS 9_3_5 like Mac OS X) AppleWebKit/601.1.46 Version/9.0 Mobile/13G36 Safari/601.1";
  const chromeIos =
    "Mozilla/5.0 (iPad; CPU OS 9_3_5 like Mac OS X) AppleWebKit/601.1 CriOS/37.0 Mobile/13G36 Safari/601.1.46";
  const now = Date.parse("2026-11-04T12:00:00Z");
  const row = (o: Partial<TwinRow> = {}): TwinRow => ({
    id: "a",
    status: "confirmed",
    device_sig: "ipad|768x1024@1",
    last_seen_at: "2026-11-04T10:00:00Z",
    ...o,
  });

  it("gives every browser on a device the same answer, either way up", () => {
    const hw = { w: 768, h: 1024, dpr: 1 };
    expect(deviceSignature(safari, hw)).toBe(deviceSignature(chromeIos, hw));
    expect(deviceSignature(safari, { w: 1024, h: 768, dpr: 1 })).toBe(deviceSignature(safari, hw));
  });
  it("sees a newer iPad calling itself a Mac, and ignores zoom on computers", () => {
    const mac = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15";
    expect(deviceSignature(mac, { w: 810, h: 1080, dpr: 2, touch: 5 })).toMatch(/^ipad/);
    expect(deviceSignature(mac, { w: 1920, h: 1080, dpr: 2 })).toBe(
      deviceSignature(mac, { w: 1920, h: 1080, dpr: 1.5 }),
    );
  });
  it("takes over a quiet entry of the same kind", () => {
    expect(twinFor([row()], "ipad|768x1024@1", now)?.id).toBe("a");
  });
  it("leaves one still in use: that's another tablet", () => {
    expect(
      twinFor([row({ last_seen_at: "2026-11-04T11:55:00Z" })], "ipad|768x1024@1", now),
    ).toBeNull();
  });
  it("needs the same kind of device, and a known one", () => {
    expect(twinFor([row()], "android|800x1280@2", now)).toBeNull();
    expect(twinFor([row({ device_sig: null })], null, now)).toBeNull();
  });
  it("prefers a confirmed entry, then the one seen last", () => {
    const rows = [
      row({ id: "wait", status: "pending", last_seen_at: "2026-11-04T11:00:00Z" }),
      row({ id: "old", last_seen_at: "2026-11-01T11:00:00Z" }),
      row({ id: "new", last_seen_at: "2026-11-03T11:00:00Z" }),
    ];
    expect(twinFor(rows, "ipad|768x1024@1", now)?.id).toBe("new");
  });
});
