import { describe, expect, it } from "vitest";

import { soundFor } from "../src/lib/kiosk-sound";
import { sampleLook, samplePhase } from "../src/lib/test-sample-motion";
import { SERVICE_MINUTES, inService, testToken, testTokenValid } from "../src/lib/test-stay";
import { normaliseTheme } from "../src/lib/theme";

describe("sample photos play a guest's moment", () => {
  it("tilted and blurred, lined up, sharp, outlined, held, then taken", () => {
    expect([0, 1000, 2000, 2700, 3400, 4600].map(samplePhase)).toEqual([
      "tilt",
      "align",
      "focus",
      "outline",
      "hold",
      "take",
    ]);
    expect(sampleLook("tilt").filter).toContain("blur");
    expect(sampleLook("hold")).toEqual({ transform: "none", filter: "none" });
    expect(sampleLook(null)).toEqual({ transform: "none", filter: "none" });
  });
});

describe("the kiosk link with sample photos", () => {
  const secret = "s3cret";
  it("works for its own property until it ends", async () => {
    const t = await testToken(secret, "prop-a", 2_000);
    expect(await testTokenValid(secret, "prop-a", t, 1_000)).toBe(true);
    expect(await testTokenValid(secret, "prop-b", t, 1_000)).toBe(false);
    expect(await testTokenValid(secret, "prop-a", t, 3_000)).toBe(false);
    expect(await testTokenValid("other", "prop-a", t, 1_000)).toBe(false);
    expect(await testTokenValid(secret, "prop-a", "junk", 1_000)).toBe(false);
  });
});

describe("door tablet sounds", () => {
  it("a key for letters, dates and choices in a grid; a click for other buttons", () => {
    expect(soundFor({ tag: "BUTTON", keyLike: true })).toBe("key");
    expect(soundFor({ tag: "button", role: "gridcell" })).toBe("key");
    expect(soundFor({ tag: "BUTTON" })).toBe("button");
    expect(soundFor({ tag: "div", role: "radio" })).toBe("button");
  });
  it("nothing for disabled buttons, plain text or sliders (they tick as they move)", () => {
    expect(soundFor({ tag: "BUTTON", disabled: true })).toBeNull();
    expect(soundFor({ tag: "div" })).toBeNull();
    expect(soundFor({ tag: "INPUT", type: "range" })).toBeNull();
    expect(soundFor({ tag: "span", role: "slider" })).toBeNull();
  });
  it("flash and sounds are on unless the host turns them off", () => {
    expect(normaliseTheme({})).toMatchObject({ kioskFlash: true, kioskSounds: true });
    expect(normaliseTheme({ kioskFlash: false, kioskSounds: false })).toMatchObject({
      kioskFlash: false,
      kioskSounds: false,
    });
  });
});

describe("service mode on one door tablet", () => {
  it("lasts until its time, then the tablet is back to normal", () => {
    const now = Date.parse("2026-11-10T12:00:00Z");
    const until = new Date(now + SERVICE_MINUTES * 60_000).toISOString();
    expect(SERVICE_MINUTES).toBe(10);
    expect(inService(until, now)).toBe(true);
    expect(inService(until, now + SERVICE_MINUTES * 60_000)).toBe(false);
    expect(inService(null, now)).toBe(false);
  });
});
