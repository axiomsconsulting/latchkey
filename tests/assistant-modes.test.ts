import { describe, expect, it } from "vitest";

import { matchTopic, normaliseAiModes } from "@/lib/assistant-modes";
import { assistedAnswer, openTopics, type Knowledge } from "@/lib/receptionist";

const topics = [
  { key: "stay-wifi", title: "Wi-Fi" },
  { key: "getting_in", title: "Getting in" },
  { key: "checkout", title: "Check-out time and steps" },
  { key: "parking", title: "Parking" },
  { key: "local", title: "Around here" },
  { key: "house", title: "Around the house" },
  { key: "custom_abcdef", title: "Hot tub" },
];

describe("assistant modes", () => {
  it("defaults to full AI and reads stored choices", () => {
    expect(normaliseAiModes(null)).toEqual({ concierge: "full", receptionist: "full" });
    expect(normaliseAiModes({ receptionist: "assisted", concierge: "x" })).toEqual({
      concierge: "full",
      receptionist: "assisted",
    });
  });

  it("finds the part of the guide from the question's words", () => {
    expect(matchTopic("What's the wifi password?", topics)).toBe("stay-wifi");
    expect(matchTopic("How do I get in the front door", topics)).toBe("getting_in");
    expect(matchTopic("What time do I need to check out?", topics)).toBe("checkout");
    expect(matchTopic("Any good restaurants nearby?", topics)).toBe("local");
    expect(matchTopic("How hot is the hot tub", topics)).toBe("custom_abcdef");
    expect(matchTopic("Tell me a joke", topics)).toBeNull();
  });

  it("answers with a recorded phrase and opens the part, or says it couldn't find it", () => {
    const k: Knowledge = {
      property: "The Hill",
      wifi: { name: "Hill", password: "x" },
      guide: [{ key: "parking", title: "Parking", text: "Round the back" }],
    };
    expect(openTopics(k, false).map((t) => t.key)).toEqual(["parking"]);
    expect(assistedAnswer(k, "where can I park my car", true)).toMatchObject({
      open: "parking",
      phrase: "rcHere",
    });
    expect(assistedAnswer(k, "wifi?", true).open).toBe("stay-wifi");
    expect(assistedAnswer(k, "wifi?", false).open).toBeNull();
    expect(assistedAnswer(k, "sing a song", true).phrase).toBe("rcNotFound");
  });
});
