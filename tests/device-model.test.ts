import { describe, expect, it } from "vitest";

import { describeDevice, deviceLine, modelFromUa } from "@/lib/device-model";
import { deviceActivity, forgetDevice, nextSeen, tabletName } from "@/lib/kiosk-devices";

const tabA8 =
  "Mozilla/5.0 (Linux; Android 13; SM-X200 Build/TP1A.220624.014; wv) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const reduced =
  "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const fire =
  "Mozilla/5.0 (Linux; Android 11; KFTRWI) AppleWebKit/537.36 (KHTML, like Gecko) Silk/120.4.1 like Chrome/120.0.6099.230 Safari/537.36";
const ipad =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";

describe("device names", () => {
  it("reads the model from the user agent, never the reduced K", () => {
    expect(modelFromUa(tabA8)).toBe("SM-X200");
    expect(modelFromUa(reduced)).toBeNull();
    expect(modelFromUa(fire)).toBe("KFTRWI");
  });

  it("names a Samsung tablet with size and Wi-Fi variant", () => {
    const d = describeDevice({ ua: tabA8, w: 800, h: 1280, dpr: 1.5, touch: 5 });
    expect(d.name).toBe("Galaxy Tab A8 10.5-inch");
    expect(d.variant).toBe("Wi-Fi");
    expect(d.maker).toBe("Samsung");
    expect(d.kind).toBe("tablet");
    expect(deviceLine(d)).toContain("SM-X200");
    expect(
      describeDevice({ ua: tabA8.replace("SM-X200", "SM-X205"), w: 800, h: 1280 }).variant,
    ).toBe("Wi-Fi + mobile data");
  });

  it("uses Client Hints' model when the user agent is reduced", () => {
    const d = describeDevice({ ua: reduced, model: "SM-X110", w: 800, h: 1340, touch: 5 });
    expect(d.model).toBe("Galaxy Tab A9");
    expect(d.osVersion).toBe("10");
  });

  it("names a Fire tablet", () => {
    expect(describeDevice({ ua: fire, w: 800, h: 1280, touch: 5 }).name).toBe(
      "Fire HD 10 (2021) 10.1-inch",
    );
  });

  it("tells iPads apart by screen, even when Safari says Mac", () => {
    const d = describeDevice({ ua: ipad, w: 820, h: 1180, dpr: 2, touch: 5 });
    expect(d.os).toBe("iPadOS");
    expect(d.model).toBe("iPad Air or iPad (10th gen) 10.9-inch");
    expect(d.maker).toBe("Apple");
    expect(describeDevice({ ua: ipad, w: 820, h: 1180 }).kind).toBe("computer");
  });

  it("keeps an unknown code and estimates the size", () => {
    const d = describeDevice({ ua: tabA8.replace("SM-X200", "ZX-900"), w: 800, h: 1280, touch: 5 });
    expect(d.model).toBe("ZX-900");
    expect(d.inchesKnown).toBe(false);
    expect(deviceLine(d)).toContain("about");
  });

  it("the host's name wins over the device's", () => {
    expect(tabletName({ label: "Front door", autoName: "Galaxy Tab A8", number: 1 })).toBe(
      "Front door",
    );
    expect(tabletName({ label: null, autoName: "Galaxy Tab A8", number: 1 })).toBe("Galaxy Tab A8");
    expect(tabletName({ label: null, number: 2 })).toBe("Tablet 2");
  });
});

describe("temporary tablets", () => {
  const now = Date.parse("2026-11-20T12:00:00Z");
  const days = (n: number) => new Date(now - n * 86_400_000).toISOString();
  const row = (o: Partial<Parameters<typeof forgetDevice>[0]> = {}) => ({
    status: "confirmed",
    seenDays: 1,
    createdAt: days(10),
    lastSeenAt: days(9),
    label: null,
    ...o,
  });

  it("forgets a tablet opened once or twice and quiet a week", () => {
    expect(forgetDevice(row(), now)).toBe(true);
    expect(forgetDevice(row({ seenDays: 2 }), now)).toBe(true);
    expect(forgetDevice(row({ lastSeenAt: days(5) }), now)).toBe(false);
    expect(forgetDevice(row({ status: "pending", lastSeenAt: days(4) }), now)).toBe(true);
  });

  it("never forgets a used, named or set-up tablet", () => {
    expect(forgetDevice(row({ seenDays: 3 }), now)).toBe(false);
    expect(forgetDevice(row({ label: "Hall" }), now)).toBe(false);
    expect(forgetDevice(row({ setUp: true }), now)).toBe(false);
  });

  it("describes how often it's used", () => {
    expect(deviceActivity(row({ seenDays: 6 }), now)).toBe("regular");
    expect(deviceActivity(row({ createdAt: days(1), lastSeenAt: days(1) }), now)).toBe("new");
    expect(deviceActivity(row(), now)).toBe("temporary");
    expect(deviceActivity(row({ seenDays: 3 }), now)).toBe("occasional");
  });

  it("counts each day once", () => {
    expect(nextSeen({ seenDays: 1, lastDay: null }, "2026-11-20")).toEqual({
      seen_days: 1,
      last_day: "2026-11-20",
    });
    expect(nextSeen({ seenDays: 1, lastDay: "2026-11-20" }, "2026-11-20")).toBeNull();
    expect(nextSeen({ seenDays: 1, lastDay: "2026-11-20" }, "2026-11-21")?.seen_days).toBe(2);
  });
});
