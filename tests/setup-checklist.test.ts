import { describe, expect, it } from "vitest";

import { checklist } from "@/lib/setup-checklist";

const none = { rooms: 0, calendars: 0, pin: false, guideEdits: 0, tablets: 0, payments: false };

describe("the getting-started checklist", () => {
  it("ticks off what's really set up", () => {
    const c = checklist({ ...none, rooms: 2, pin: true }, []);
    expect(c.items.filter((i) => i.done).map((i) => i.step)).toEqual(["rooms", "pin"]);
    expect(c.left).toBe(4);
  });

  it("lets a host skip only the steps that may not apply", () => {
    const c = checklist(none, ["tablet", "payments", "guide"]);
    expect(c.items.find((i) => i.step === "tablet")?.skipped).toBe(true);
    // The guide can't be skipped.
    expect(c.items.find((i) => i.step === "guide")?.skipped).toBe(false);
    expect(c.left).toBe(4);
  });

  it("has nothing left once everything is done or skipped", () => {
    const c = checklist(
      { rooms: 1, calendars: 0, pin: true, guideEdits: 3, tablets: 0, payments: false },
      ["calendar", "tablet", "payments"],
    );
    expect(c.left).toBe(0);
  });
});
