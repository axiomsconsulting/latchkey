import { describe, expect, it } from "vitest";

import {
  PHRASES,
  guideScript,
  guidanceFor,
  intentFor,
  pickVoice,
  scriptFor,
  shouldSay,
  type Intent,
} from "../src/lib/voice-concierge";

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map((l) => `letter-${l}` as Intent);

describe("understanding what a guest says", () => {
  it("yes and no, in everyday words", () => {
    expect(intentFor("Yeah that's me", ["yes", "no"])).toBe("yes");
    expect(intentFor("okay", ["yes", "no"])).toBe("yes");
    expect(intentFor("no that's not right", ["yes", "no"])).toBe("no");
    expect(intentFor("banana", ["yes", "no"])).toBeNull();
  });
  it("only answers the screen is listening for", () => {
    expect(intentFor("yes", ["no"])).toBeNull();
    expect(intentFor("going home", ["home", "elsewhere", "yes"])).toBe("home");
    expect(intentFor("somewhere else", ["home", "elsewhere"])).toBe("elsewhere");
  });
  it("letters said any way", () => {
    expect(intentFor("S for Sierra", LETTERS)).toBe("letter-S");
    expect(intentFor("Kilo", LETTERS)).toBe("letter-K");
    expect(intentFor("the letter M", LETTERS)).toBe("letter-M");
    expect(intentFor("zed", LETTERS)).toBe("letter-Z");
    expect(intentFor("double-u", LETTERS)).toBe("letter-W");
  });
  it("stop, repeat and help whenever they're allowed", () => {
    expect(intentFor("please stop", ["yes", "stop"])).toBe("stop");
    expect(intentFor("can you say that again", ["yes", "repeat"])).toBe("repeat");
    expect(intentFor("done thank you", ["done", "add"])).toBe("done");
    expect(intentFor("add another guest", ["done", "add"])).toBe("add");
    expect(intentFor("my wife", ["yes", "no", "done", "add"])).toBe("add");
    // A no is never an add, even with "guests" in it.
    expect(intentFor("no more guests", ["yes", "no", "done", "add"])).toBe("no");
  });
  it("at the end, yes adds a guest and no finishes", () => {
    const s = scriptFor("done:");
    expect(s.alias).toEqual({ yes: "add", no: "done" });
    expect(s.listen).toEqual(expect.arrayContaining(["yes", "no", "add", "done"]));
  });
});

describe("each screen's script", () => {
  it("asks, then listens for that screen's answers", () => {
    expect(scriptFor("confirm:")).toMatchObject({ say: ["confirm"] });
    expect(scriptFor("confirm:").listen).toContain("no");
    expect(scriptFor("letter:").listen).toContain("letter-Q");
    expect(scriptFor("register:0", { registerPage: "destination" }).listen).toContain("home");
    // Photo screens speak when the camera opens.
    expect(scriptFor("face:0").say).toEqual([]);
    expect(scriptFor("somethingNew:").say).toEqual(["tapInstead"]);
  });
});

describe("guiding the ID into place", () => {
  const base = {
    kind: "id" as const,
    say: "look" as const,
    good: false,
    w: 1000,
    h: 750,
    front: true,
  };
  const box = (x: number, y: number, w: number, h: number) => [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
  ];
  it("perfect once it's good", () => {
    expect(guidanceFor({ ...base, good: true, points: box(250, 200, 500, 350) })).toBe("perfect");
  });
  it("in the guest's own left and right with the front camera", () => {
    // Left of the picture is the guest's right: they move it to their left.
    expect(guidanceFor({ ...base, points: box(0, 200, 450, 330) })).toBe("moveLeft");
    expect(guidanceFor({ ...base, points: box(540, 200, 450, 330) })).toBe("moveRight");
    expect(guidanceFor({ ...base, front: false, points: box(0, 200, 450, 330) })).toBe("moveRight");
  });
  it("up, down, closer and back", () => {
    expect(guidanceFor({ ...base, points: box(275, 0, 450, 300) })).toBe("moveDown");
    expect(guidanceFor({ ...base, points: box(275, 440, 450, 300) })).toBe("moveUp");
    expect(guidanceFor({ ...base, points: box(420, 320, 160, 110) })).toBe("closer");
    expect(guidanceFor({ ...base, say: "cut_off", points: box(0, 0, 1000, 750) })).toBe("back");
    expect(guidanceFor({ ...base, say: "glare", points: null })).toBe("glare");
  });
  it("never chatters", () => {
    const now = 10_000;
    expect(shouldSay("moveLeft", { key: null, at: now - 500 }, now)).toBe(false);
    expect(shouldSay("moveLeft", { key: "moveLeft", at: now - 2000 }, now)).toBe(false);
    expect(shouldSay("moveUp", { key: "moveLeft", at: now - 2000 }, now)).toBe(true);
  });
});

describe("the tablet's own voices", () => {
  const voices = [
    { name: "Google UK English Male", lang: "en-GB" },
    { name: "Google UK English Female", lang: "en-GB" },
    { name: "Samantha", lang: "en-US" },
    { name: "Thomas", lang: "fr-FR" },
  ];
  it("picks the kind the host chose, British English first", () => {
    expect(pickVoice(voices, "female")?.name).toBe("Google UK English Female");
    expect(pickVoice(voices, "male")?.name).toBe("Google UK English Male");
    expect(pickVoice([], "male")).toBeNull();
  });
  it("never a voice the tablet would have to download first", () => {
    const online = [
      { name: "Google UK English Female", lang: "en-GB", localService: false },
      { name: "English United Kingdom", lang: "en-GB", localService: true },
    ];
    expect(pickVoice(online, "female")?.name).toBe("English United Kingdom");
    expect(pickVoice([online[0]!], "female")).toBeNull();
  });
});

describe("guide only (the tablet doesn't listen)", () => {
  const steps = [
    "welcome:0",
    "idFirst:0",
    "identity:0",
    "letter:0",
    "checkout:0",
    "confirm:0",
    "party:0",
    "register:0",
    "no_match:0",
    "done:0",
    "something_new:0",
  ];
  const pages = [null, "name", "nationality", "document", "destination", "address"];
  it("listens for nothing and never asks for a spoken answer", () => {
    for (const step of steps)
      for (const registerPage of pages) {
        const s = guideScript(scriptFor(step, { registerPage }));
        expect(s.listen).toEqual([]);
        for (const k of s.say) {
          expect(PHRASES[k]).not.toMatch(/\bsay\b/i);
          expect(k).not.toBe("tapInstead");
        }
      }
  });
  it("still talks the guest through each screen", () => {
    expect(guideScript(scriptFor("idFirst:0")).say).toEqual(["idConsentGuide"]);
    expect(guideScript(scriptFor("done:0")).say).toEqual(["doneGuide"]);
    expect(guideScript(scriptFor("checkout:0")).say).toEqual(["checkout"]);
  });
});
