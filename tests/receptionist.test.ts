import { describe, expect, it } from "vitest";

import {
  DEFAULT_RECEPTIONIST,
  briefFor,
  greeting,
  normaliseReceptionist,
  openKeys,
  readAnswer,
  trimHistory,
  voiceForGuest,
  type Knowledge,
} from "@/lib/receptionist";

const k: Knowledge = {
  property: "Trinity Suites",
  guestName: "Pawel",
  room: "Trinity 4",
  times: "check-in from 15:00; check-out by 11:00",
  wifi: { name: "Trinity", password: "secret123" },
  directions: ["Come in through the main entrance.", "Go up 1 flight of stairs."],
  info: "Bins: Day: Tuesday",
  guide: [{ key: "breakfast", title: "Breakfast", text: "8 to 10 in the kitchen" }],
  local: "pub: The Swan (200 m)",
  extras: "Late check-out (£20)",
  checkout: "by 11:00",
};

describe("settings", () => {
  it("starts off, on phones too when turned on, matched voices, every topic, normal detail", () => {
    const s = normaliseReceptionist(null);
    expect(s).toEqual(DEFAULT_RECEPTIONIST);
    expect(s.on).toBe(false);
    expect(s.voiceMatch).toBe("opposite");
  });

  it("keeps only known values and short text", () => {
    const s = normaliseReceptionist({
      on: true,
      voice: "robot",
      detail: "huge",
      topics: { wifi: false, nonsense: false },
      name: "<Ava>",
      notes: "x".repeat(2000),
    });
    expect(s.voice).toBe("female");
    expect(s.detail).toBe("normal");
    expect(s.topics.wifi).toBe(false);
    expect(s.topics.local).toBe(true);
    expect(s.name).toBe("Ava");
    expect(s.notes).toHaveLength(1000);
  });
});

describe("voice", () => {
  it("female greets male guests and male greets female guests when matching", () => {
    const s = { voiceMatch: "opposite" as const, voice: "female" as const };
    expect(voiceForGuest(s, "M")).toBe("female");
    expect(voiceForGuest(s, "F")).toBe("male");
    expect(voiceForGuest(s, "X")).toBe("female");
    expect(voiceForGuest(s, null)).toBe("female");
    expect(voiceForGuest({ voiceMatch: "fixed", voice: "male" }, "M")).toBe("male");
  });
});

describe("what it knows", () => {
  it("only the topics the host allows, and never the Wi-Fi password on a shared tablet", () => {
    const s = normaliseReceptionist({ on: true });
    const tablet = briefFor(k, s, "tablet");
    expect(tablet).toContain("Wi-Fi network: Trinity");
    expect(tablet).not.toContain("secret123");
    expect(briefFor(k, s, "phone")).toContain("password secret123");
    const noLocal = briefFor(
      k,
      normaliseReceptionist({ on: true, topics: { local: false, wifi: false } }),
      "phone",
    );
    expect(noLocal).not.toContain("The Swan");
    expect(noLocal).not.toContain("secret123");
  });

  it("always says no door codes and no making things up, and carries the host's instructions", () => {
    const b = briefFor(
      k,
      normaliseReceptionist({ on: true, notes: "Mention breakfast." }),
      "phone",
    );
    expect(b).toContain("Never give door codes");
    expect(b).toContain("Never invent");
    expect(b).toContain("Mention breakfast.");
    expect(b).toContain("[breakfast] Breakfast");
  });

  it("only opens parts of the guide it was given", () => {
    expect(openKeys(k)).toEqual(["breakfast", "property_info", "local", "find_room"]);
    expect(readAnswer({ reply: "It's on Tuesday.", open: "property_info" }, openKeys(k))).toEqual({
      reply: "It's on Tuesday.",
      open: "property_info",
    });
    expect(readAnswer({ reply: "Hi", open: "getting_in" }, openKeys(k)).open).toBeNull();
    expect(readAnswer({ reply: "The key safe code is 4821." }, []).reply).toBe(
      "The key safe code is ••••.",
    );
    expect(readAnswer(null, []).reply).toMatch(/ask again/);
  });

  it("keeps the last few turns, trimmed", () => {
    const h = Array.from({ length: 12 }, (_, i) => ({
      role: (i % 2 ? "receptionist" : "guest") as "guest" | "receptionist",
      text: `t${i}`,
    }));
    expect(trimHistory(h)).toHaveLength(8);
    expect(trimHistory(h)[0]!.text).toBe("t4");
  });

  it("greets by first name with its own name when it has one", () => {
    expect(greeting(normaliseReceptionist({ name: "Ava" }), "Trinity Suites", "Pawel")).toBe(
      "Hello Pawel, welcome to Trinity Suites. I'm Ava, the receptionist here: ask me anything about your stay.",
    );
    expect(greeting(normaliseReceptionist({}), "Trinity Suites")).toBe(
      "Hello, welcome to Trinity Suites. I'm the receptionist here: ask me anything about your stay.",
    );
  });
});
