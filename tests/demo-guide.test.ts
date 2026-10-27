import { describe, expect, it } from "vitest";

import { demoLine, type DemoHint, type DemoStep } from "../src/lib/demo-guide";

const hint: DemoHint = {
  letter: "B",
  name: "Jane Brown",
  checkOut: "2026-10-15",
  channel: "airbnb",
  refLast4: "4K2P",
  phoneLast4: "0142",
};
const line = (step: DemoStep) => demoLine(step, hint, "Airbnb");

describe("demo guidance banner", () => {
  it("walks the visitor through the answers, one screen at a time", () => {
    expect(line({ name: "welcome" })).toContain("Jane Brown");
    expect(line({ name: "letter" })).toBe("Demo: tap B.");
    expect(line({ name: "checkout" })).toBe("Demo: tap Thu 15 Oct.");
    expect(line({ name: "platform" })).toBe("Demo: tap Airbnb.");
    expect(line({ name: "confirm" })).toBe("Demo: tap Yes, that's me.");
  });

  it("never mentions the platform on screens before it is asked", () => {
    for (const name of ["welcome", "letter", "checkout"] as const)
      expect(line({ name })).not.toContain("Airbnb");
  });

  it("follows whichever identity check the flow lands on", () => {
    expect(line({ name: "identity", method: "photo_id", consented: false })).toContain(
      "happy to continue",
    );
    expect(line({ name: "identity", method: "photo_id", consented: true })).toContain(
      "photograph anything",
    );
    expect(line({ name: "identity", method: "last4", consented: false })).toBe(
      "Demo: booking reference ends 4K2P or phone ends 0142.",
    );
    expect(line({ name: "identity", method: "self_declare", consented: false })).toContain(
      "I confirm",
    );
  });

  it("covers the steps added after the booking is found", () => {
    for (const step of [
      { name: "party" },
      { name: "register" },
      { name: "companion", ready: false },
      { name: "companion", ready: true },
      { name: "face" },
      { name: "handover" },
      { name: "done" },
    ] as DemoStep[]) {
      expect(line(step)).toMatch(/^Demo: /);
    }
  });

  it("picks the demo guest from a list of arrivals", () => {
    expect(line({ name: "pick", items: [{ label: "Sam L." }, { label: "Jane B." }] })).toBe(
      "Demo: tap Jane B.",
    );
  });
});
