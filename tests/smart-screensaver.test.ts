import { describe, expect, it } from "vitest";

import { normaliseRest, nightFrom, nightTo, restNow } from "../src/lib/kiosk-rest";
import { screenFrom } from "../src/lib/kiosk-screen";
import { changedShare, isLoud, loudness, movedIn, nextBaseline } from "../src/lib/motion-wake";

const rest = (o: Record<string, unknown> = {}) => normaliseRest(o);

describe("what shows at rest", () => {
  it("the clock only shows at night", () => {
    expect(restNow(rest(), true, false)).toBe("clock");
    expect(restNow(rest(), false, true)).toBe("clock");
    expect(restNow(rest(), false, false)).toBe("awake");
  });
  it("by day: the day screen with Smart Screensaver, the usual screen without", () => {
    expect(restNow(rest({ smart: true }), false, false)).toBe("day");
    expect(restNow(rest({ smart: false }), false, false)).toBe("awake");
    expect(restNow(rest({ smart: true }), true, false)).toBe("clock");
  });
  it("the night light follows the host's choice", () => {
    const quiet = rest({ nightLight: true, nightWhen: "quiet", smart: true });
    expect(restNow(quiet, true, false)).toBe("night");
    expect(restNow(quiet, false, true)).toBe("night");
    expect(restNow(quiet, false, false)).toBe("day");
    expect(restNow(rest({ nightLight: true, nightWhen: "always" }), false, false)).toBe("night");
  });
  it("a dark screen is a night look too", () => {
    expect(restNow(rest({ otherwise: "blank" }), true, false)).toBe("blank");
    expect(restNow(rest({ otherwise: "blank" }), false, false)).toBe("awake");
  });
  it("the night runs midnight to 5am unless the host says otherwise", () => {
    expect([nightFrom(rest()), nightTo(rest())]).toEqual(["00:00", "05:00"]);
    const own = rest({ lastCheckIn: "22:30", firstCheckOut: "06:15" });
    expect([nightFrom(own), nightTo(own)]).toEqual(["22:30", "06:15"]);
    expect(rest({ lastCheckIn: "nonsense" }).lastCheckIn).toBeNull();
  });
  it("starts off, touch only", () => {
    expect(rest()).toMatchObject({ smart: false, wakeBy: "off", idleMinutes: null });
    expect(rest({ wakeBy: "laser", idleMinutes: 7 })).toMatchObject({
      wakeBy: "off",
      idleMinutes: null,
    });
    expect(rest({ idleMinutes: 15 }).idleMinutes).toBe(15);
  });
});

describe("the host's live view", () => {
  const base = {
    welcomeUp: false,
    welcomeRest: false,
    cardsUp: false,
    saver: true,
    atWelcome: true,
    step: "welcome:",
    join: false,
  };
  it("says what's really showing", () => {
    expect(screenFrom({ ...base, rest: "day" }).view).toBe("day");
    expect(screenFrom({ ...base, rest: "awake" }).view).toBe("start");
    expect(screenFrom({ ...base, rest: "clock" }).view).toBe("saver");
  });
});

describe("waking", () => {
  const frame = (v: number, n = 100) => {
    const a = new Uint8ClampedArray(n * 4);
    a.fill(v);
    return a;
  };
  it("sees part of the picture move", () => {
    const a = frame(100);
    const b = frame(100);
    for (let i = 0; i < 10 * 4; i++) b[i] = 220;
    expect(changedShare(a, b)).toBeCloseTo(0.1);
    expect(movedIn(changedShare(a, b))).toBe(true);
  });
  it("ignores a still picture, a little noise, and a light being switched on", () => {
    expect(movedIn(changedShare(frame(100), frame(100)))).toBe(false);
    expect(movedIn(changedShare(frame(100), frame(110)))).toBe(false);
    expect(movedIn(changedShare(frame(10), frame(240)))).toBe(false);
  });
  it("hears something clearly louder than the room", () => {
    expect(loudness([0.5, -0.5])).toBeCloseTo(0.5);
    expect(isLoud(0.2, 0.01)).toBe(true);
    expect(isLoud(0.02, 0.01)).toBe(false);
    expect(isLoud(0.2, 0.1)).toBe(false);
  });
  it("the room's level follows slowly", () => {
    expect(nextBaseline(0, 0.1)).toBe(0.1);
    expect(nextBaseline(0.1, 0.2)).toBeCloseTo(0.105);
  });
});
