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
