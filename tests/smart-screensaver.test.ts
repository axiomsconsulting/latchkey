import { describe, expect, it } from "vitest";

import {
  normaliseRest,
  nightFrom,
  nightTo,
  restNow,
  dayLookFor,
  lowPowerNow,
  shouldInvert,
} from "../src/lib/kiosk-rest";
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
  it("starts off, and ignores the older wake choice", () => {
    expect(rest()).toMatchObject({ smart: false, idleMinutes: null });
    expect(rest({ wakeBy: "sound", idleMinutes: 7 })).not.toHaveProperty("wakeBy");
    expect(rest({ idleMinutes: 7 }).idleMinutes).toBeNull();
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

describe("the low power look by day", () => {
  const on = {
    shared: true,
    smart: true,
    byClock: "day" as const,
    atStart: true,
    idle: true,
    tapped: false,
  };
  it("only when it's by day, smart is on, and nobody's using it", () => {
    expect(lowPowerNow(on)).toBe(true);
    expect(lowPowerNow({ ...on, smart: false })).toBe(false);
    expect(lowPowerNow({ ...on, byClock: "clock" })).toBe(false);
    expect(lowPowerNow({ ...on, byClock: "night" })).toBe(false);
    expect(lowPowerNow({ ...on, idle: false })).toBe(false);
    expect(lowPowerNow({ ...on, atStart: false })).toBe(false);
    expect(lowPowerNow({ ...on, shared: false })).toBe(false);
  });
  it("gives way to the night look from the sun or moon button", () => {
    expect(lowPowerNow({ ...on, tapped: true })).toBe(false);
  });
  it("turns a light page dark, and leaves a dark one", () => {
    expect(shouldInvert(255, 250, 240)).toBe(true);
    expect(shouldInvert(20, 30, 25)).toBe(false);
  });
  it("keeps the look inside its limits", () => {
    expect(dayLookFor(null)).toEqual({ brightness: 0.7, contrast: 1 });
    expect(dayLookFor({ brightness: 5, contrast: 0 })).toEqual({ brightness: 1, contrast: 0.5 });
    expect(dayLookFor({ brightness: "x" }).brightness).toBe(0.7);
  });
});
