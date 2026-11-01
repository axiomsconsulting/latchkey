import { describe, expect, it } from "vitest";

import { normaliseScreen, screenFrom, stepWords } from "@/lib/kiosk-screen";

const base = {
  welcomeUp: false,
  welcomeRest: false,
  cardsUp: false,
  saver: false,
  rest: "clock" as const,
  atWelcome: true,
  step: "welcome:",
  join: false,
};

describe("what a tablet shows", () => {
  it("picks the screen on top", () => {
    expect(screenFrom(base)).toEqual({ view: "start", step: null });
    expect(screenFrom({ ...base, saver: true })).toEqual({ view: "saver", step: null });
    expect(screenFrom({ ...base, saver: true, rest: "night" }).view).toBe("night");
    expect(screenFrom({ ...base, saver: true, cardsUp: true }).view).toBe("cards");
    expect(screenFrom({ ...base, cardsUp: true, welcomeUp: true, welcomeRest: true }).view).toBe(
      "welcomeRest",
    );
    expect(screenFrom({ ...base, atWelcome: false, step: "face:2" })).toEqual({
      view: "checkin",
      step: "face",
    });
  });

  it("reads reports safely, with no step outside a check-in", () => {
    expect(normaliseScreen(null)).toBeNull();
    expect(normaliseScreen({ view: "nope" })).toBeNull();
    expect(normaliseScreen({ view: "start", step: "face", fullscreen: true })).toEqual({
      view: "start",
      step: null,
      fullscreen: true,
      lite: false,
      camera: null,
      camPermission: null,
      at: null,
    });
    expect(normaliseScreen({ view: "checkin", step: "<b>" })?.step).toBeNull();
  });

  it("says steps in words", () => {
    expect(stepWords("confirm")).toBe("Is this you?");
    expect(stepWords("new_step")).toBe("new step");
    expect(stepWords(null)).toBe("Checking in");
  });
});
