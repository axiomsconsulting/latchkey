import { describe, expect, it } from "vitest";

import { buildGuide, forgetCard, guideWindow, windowsOn, type GuideFacts, type StoredSection } from "../src/lib/guide";

const facts: GuideFacts = {
  wifiName: null, wifiPassword: null, quietStart: "22:00", quietEnd: "07:00", checkOutTime: "11:00",
  checkOutDateLabel: "Thu 1 Oct", parkingNotes: null, hostName: "Swapnil", hostPhone: "07700 900123",
  roomName: "Room 1", unavailableLines: [],
};

const stored: StoredSection[] = [
  { roomId: null, sectionKey: "getting_in", summary: "House door", steps: [{ heading: "Keypad", body: "Right side", imageUrl: "x" }] },
  { roomId: "r1", sectionKey: "getting_in", summary: "Side door for Room 1", steps: [] },
];

describe("buildGuide", () => {
  it("room sections replace house sections", () => {
    const g = buildGuide(stored, "r1", "detailed", facts);
    expect(g.find((s) => s.key === "getting_in")!.summary).toBe("Side door for Room 1");
  });
  it("other rooms get the house section", () => {
    const g = buildGuide(stored, "r2", "detailed", facts);
    expect(g.find((s) => s.key === "getting_in")!.steps).toHaveLength(1);
  });
  it("basic mode drops steps and photos but keeps facts", () => {
    const g = buildGuide(stored, "r2", "basic", facts);
    expect(g.every((s) => s.steps.length === 0)).toBe(true);
    expect(g.find((s) => s.key === "checkout")!.summary).toContain("11:00");
    expect(g.find((s) => s.key === "kitchenette")).toBeUndefined();
  });
});

describe("forget card and windows", () => {
  const windows = [
    { room_id: null, reason: "Cleaning", starts_at: null, ends_at: null, day_of_week: 2, start_time: "13:00:00", end_time: "15:00:00" },
    { room_id: "r9", reason: null, starts_at: null, ends_at: null, day_of_week: 2, start_time: "10:00:00", end_time: "11:00:00" },
  ];
  it("includes today's windows for this room only", () => {
    const lines = windowsOn(windows, "r1", "2026-09-29", "Europe/London"); // Tuesday
    expect(lines).toEqual(["Cleaning 13:00–15:00"]);
    const card = forgetCard(facts, lines);
    expect(card.map((c) => c.key)).toEqual(["quiet", "shoes", "checkout", "unavailable"]);
  });
  it("no windows on other days", () => {
    expect(windowsOn(windows, "r1", "2026-09-30", "Europe/London")).toEqual([]);
  });
});

describe("guideWindow", () => {
  it("opens 48h before arrival day, door at local midnight, closes 24h after check-out (BST)", () => {
    const w = guideWindow("2026-09-29", "2026-10-01", "11:00", "Europe/London");
    expect(w.doorOpensAt.toISOString()).toBe("2026-09-28T23:00:00.000Z");
    expect(w.validFrom.toISOString()).toBe("2026-09-26T23:00:00.000Z");
    expect(w.readOnlyAt.toISOString()).toBe("2026-10-01T10:00:00.000Z");
    expect(w.expiresAt.toISOString()).toBe("2026-10-02T10:00:00.000Z");
  });
  it("handles GMT in winter", () => {
    const w = guideWindow("2026-12-01", "2026-12-02", "11:00", "Europe/London");
    expect(w.readOnlyAt.toISOString()).toBe("2026-12-02T11:00:00.000Z");
  });
});
