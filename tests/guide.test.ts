import { describe, expect, it } from "vitest";

import {
  SECTIONS,
  buildGuide,
  editorSections,
  forgetCard,
  guideWindow,
  normaliseStarters,
  startersOffFor,
  type GuideFacts,
  type StoredSection,
  windowsOn,
} from "../src/lib/guide";

const facts: GuideFacts = {
  wifiName: null,
  wifiPassword: null,
  quietStart: "22:00",
  quietEnd: "07:00",
  checkOutTime: "11:00",
  checkOutDateLabel: "Thu 1 Oct",
  parkingNotes: null,
  hostName: "Swapnil",
  hostPhone: "07700 900123",
  roomName: "Room 1",
  unavailableLines: [],
};

const stored: StoredSection[] = [
  {
    roomId: null,
    sectionKey: "getting_in",
    summary: "House door",
    steps: [{ heading: "Keypad", body: "Right side", imageUrl: "x" }],
  },
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
    {
      room_id: null,
      reason: "Cleaning",
      starts_at: null,
      ends_at: null,
      day_of_week: 2,
      start_time: "13:00:00",
      end_time: "15:00:00",
    },
    {
      room_id: "r9",
      reason: null,
      starts_at: null,
      ends_at: null,
      day_of_week: 2,
      start_time: "10:00:00",
      end_time: "11:00:00",
    },
  ];
  it("includes today's windows for this room only", () => {
    const lines = windowsOn(windows, "r1", "2026-09-29", "Europe/London"); // Tuesday
    expect(lines).toEqual(["Cleaning 13:00–15:00"]);
    const card = forgetCard(buildGuide(stored, "r1", "detailed", facts), lines);
    expect(card.map((c) => c.key)).toEqual(["shoes", "quiet", "checkout", "today"]);
  });
  it("no windows on other days", () => {
    expect(windowsOn(windows, "r1", "2026-09-30", "Europe/London")).toEqual([]);
  });
});

describe("pinned reminders", () => {
  const pinned: StoredSection[] = [
    ...stored,
    {
      roomId: null,
      sectionKey: "parking",
      summary: "Park on Amersham Hill.",
      steps: [],
      pinned: true,
    },
  ];
  it("uses the host's pinned sections instead of the defaults", () => {
    const card = forgetCard(buildGuide(pinned, "r1", "detailed", facts), []);
    expect(card).toEqual([{ key: "parking", text: "Park on Amersham Hill." }]);
  });
  it("never repeats a pinned section in the list below", () => {
    const sections = buildGuide(pinned, "r1", "detailed", facts);
    const card = forgetCard(sections, []);
    const shown = sections.filter((s) => !card.some((c) => c.key === s.key));
    expect(shown.some((s) => s.key === "parking")).toBe(false);
  });
  it("follows the host's running order", () => {
    const ordered: StoredSection[] = [
      { roomId: null, sectionKey: "checkout", summary: "Leave by 11.", steps: [], sortOrder: 1 },
      { roomId: null, sectionKey: "getting_in", summary: "House door", steps: [], sortOrder: 2 },
    ];
    const keys = buildGuide(ordered, null, "detailed", facts).map((s) => s.key);
    expect(keys.slice(0, 2)).toEqual(["checkout", "getting_in"]);
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

describe("adding and removing guide sections", () => {
  const facts2 = {
    wifiName: "HillSuites",
    wifiPassword: "bellfield12",
    quietStart: "22:00",
    quietEnd: "07:00",
    checkOutTime: "11:00",
    checkOutDateLabel: "Sun 18 Oct",
    parkingNotes: null,
    hostName: null,
    hostPhone: null,
    roomName: "Room 1",
    unavailableLines: [],
  };
  it("keeps a removed section out, even one Latchkey would fill in itself", async () => {
    const { buildGuide } = await import("../src/lib/guide");
    const withQuiet = buildGuide([], null, "detailed", facts2).map((s) => s.key);
    expect(withQuiet).toContain("quiet");
    const removed = buildGuide(
      [{ roomId: null, sectionKey: "quiet", summary: null, steps: [], published: false }],
      null,
      "detailed",
      facts2,
    ).map((s) => s.key);
    expect(removed).not.toContain("quiet");
  });

  it("shows the host's own sections with their title, in the running order", async () => {
    const { buildGuide } = await import("../src/lib/guide");
    const g = buildGuide(
      [
        {
          roomId: null,
          sectionKey: "custom_abc123de",
          title: "Bins and recycling",
          summary: "Blue bin on Tuesdays.",
          steps: [],
          sortOrder: 1,
        },
        {
          roomId: null,
          sectionKey: "custom_zzz999yy",
          title: "Empty one",
          summary: null,
          steps: [],
        },
      ],
      null,
      "detailed",
      facts2,
    );
    expect(g[0]).toMatchObject({ key: "custom_abc123de", title: "Bins and recycling" });
    expect(g.some((s) => s.key === "custom_zzz999yy")).toBe(false);
  });

  it("lists every section for the editor, removed ones apart", async () => {
    const { editorSections, SECTIONS } = await import("../src/lib/guide");
    const e = editorSections([
      { roomId: null, sectionKey: "parking", summary: null, steps: [], published: false },
      {
        roomId: null,
        sectionKey: "custom_abc123de",
        title: "Bins",
        summary: null,
        steps: [],
        sortOrder: 2,
      },
      { roomId: null, sectionKey: "rules", summary: null, steps: [], sortOrder: 1 },
    ]);
    expect(e.shown.slice(0, 2).map((s) => s.key)).toEqual(["rules", "custom_abc123de"]);
    expect(e.shown.find((s) => s.key === "custom_abc123de")).toMatchObject({
      title: "Bins",
      custom: true,
    });
    expect(e.removed.map((s) => s.key)).toEqual(["parking"]);
    expect(e.shown.length).toBe(SECTIONS.length);
  });
});

describe("starter sections for new hosts", () => {
  it("only leaves a starter out for hosts who signed up after the super admin took it out", () => {
    const removed = { taxis: "2026-10-19T10:00:00Z" };
    expect(startersOffFor(removed, "2026-10-20T09:00:00Z")).toEqual(["taxis"]);
    expect(startersOffFor(removed, "2026-01-01T09:00:00Z")).toEqual([]);
    expect(startersOffFor(null, "2026-10-20T09:00:00Z")).toEqual([]);
  });

  it("never takes every starter away", () => {
    const all = Object.fromEntries(SECTIONS.map((s) => [s.key, "2026-10-19T10:00:00Z"]));
    expect(Object.keys(normaliseStarters({ removed: all }).removed)).toHaveLength(
      SECTIONS.length - 1,
    );
    expect(normaliseStarters({ removed: { nonsense: "x", taxis: "not a date" } }).removed).toEqual(
      {},
    );
  });

  it("puts a starter the host never had with the removed ones, until they add it", () => {
    const { shown, removed } = editorSections([], ["taxis"]);
    expect(shown.some((s) => s.key === "taxis")).toBe(false);
    expect(removed.some((s) => s.key === "taxis")).toBe(true);
    const added = editorSections(
      [
        {
          roomId: null,
          sectionKey: "taxis",
          summary: null,
          pinned: false,
          sortOrder: 0,
          title: "Local taxis",
          published: true,
          steps: [],
        },
      ],
      ["taxis"],
    );
    expect(added.shown.some((s) => s.key === "taxis")).toBe(true);
  });
});
