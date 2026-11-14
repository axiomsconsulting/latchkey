import { describe, expect, it } from "vitest";

import { normaliseStarters, starterNamesFor, withStarterNames, SECTIONS } from "@/lib/guide";
import { packColumns } from "@/lib/guide-view";
import {
  amenitiesFor,
  linkRoomsByPins,
  normaliseMap,
  spotIn,
  stairMarks,
  type MapFloor,
  type Point,
} from "@/lib/floor-map";
import { placesNeedNewFormat, previewFromHtml } from "@/lib/local-guide";

const rect = (x0: number, y0: number, x1: number, y1: number): Point[] => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
];
const R2 = "22222222-2222-4222-8222-222222222222";
const R3 = "33333333-3333-4333-8333-333333333333";

describe("starter names", () => {
  it("calls the unavailable section House timings", () => {
    expect(SECTIONS.find((s) => s.key === "unavailable")?.title).toBe("House timings");
  });

  it("gives new hosts Latchkey admin's names and keeps earlier hosts' ones", () => {
    const { names } = normaliseStarters({
      names: {
        parking: [
          { title: "Parking and permits", hint: "Where to park", at: "2026-11-10T00:00:00Z" },
          { title: "Car parking", hint: "", at: "2026-11-20T00:00:00Z" },
        ],
        nope: [{ title: "x", hint: "", at: "2026-11-10T00:00:00Z" }],
      },
    });
    expect(Object.keys(names)).toEqual(["parking"]);
    expect(starterNamesFor(names, "2026-11-01T00:00:00Z")).toEqual({});
    expect(starterNamesFor(names, "2026-11-15T00:00:00Z").parking?.title).toBe(
      "Parking and permits",
    );
    const late = starterNamesFor(names, "2026-11-25T00:00:00Z");
    expect(late.parking).toEqual({
      title: "Car parking",
      hint: "Where to park, permits, where not to park.",
    });
    expect(
      withStarterNames(
        [
          { key: "parking", title: "Parking" },
          { key: "custom_abcdef", title: "Mine" },
        ],
        late,
      ).map((x) => x.title),
    ).toEqual(["Car parking", "Mine"]);
  });
});

describe("gallery columns", () => {
  it("stacks at most two cards", () => {
    expect(packColumns([0.2, 0.2, 0.2], 1, 2)).toEqual([[0, 1], [2]]);
  });
});

describe("rooms from their pins, and what's whose", () => {
  // Second floor: two bedrooms marked only by pins, each with an unlinked en-suite below,
  // a shared kitchenette and a landing; Room 2's own kettle and a shared fridge.
  const floor = (): MapFloor => ({
    id: "f2",
    level: 2,
    building: "",
    rooms: { [R2]: { x: 0.65, y: 0.43 }, [R3]: { x: 0.34, y: 0.44 } },
    map: normaliseMap({
      areas: [
        { id: "bedrooma", kind: "bedroom", poly: rect(0.248, 0.157, 0.432, 0.628) },
        { id: "bedroomb", kind: "bedroom", poly: rect(0.571, 0.161, 0.749, 0.627) },
        { id: "ensuitea", kind: "ensuite", poly: rect(0.251, 0.628, 0.432, 0.871) },
        { id: "ensuiteb", kind: "ensuite", poly: rect(0.571, 0.627, 0.749, 0.881) },
        {
          id: "kitch",
          kind: "kitchenette",
          access: "shared",
          poly: rect(0.434, 0.163, 0.57, 0.299),
        },
        { id: "land", kind: "landing", poly: rect(0.434, 0.3, 0.57, 0.6) },
      ],
      lines: [
        {
          id: "stairsup",
          kind: "stairs",
          pts: [
            { x: 0.5, y: 0.58 },
            { x: 0.5, y: 0.35 },
          ],
          toLevel: 3,
        },
      ],
      items: [
        { id: "kettleb", kind: "kettle", at: { x: 0.735, y: 0.417 }, note: "" },
        { id: "fridge1", kind: "fridge", at: { x: 0.53, y: 0.227 }, note: "" },
        { id: "kettlea", kind: "kettle", at: { x: 0.39, y: 0.603 }, note: "" },
      ],
    }),
  });

  it("links each room's bedroom and en-suite from its pin", () => {
    const f = linkRoomsByPins(floor());
    const of = (id: string) => f.map.areas.find((a) => a.id === id)?.roomId;
    expect(of("bedroomb")).toBe(R2);
    expect(of("ensuiteb")).toBe(R2);
    expect(of("bedrooma")).toBe(R3);
    expect(of("ensuitea")).toBe(R3);
    expect(of("kitch") ?? null).toBeNull();
  });

  it("points a guest to their own kettle and the shared fridge, never another room's", () => {
    const a = amenitiesFor([floor()], R2);
    const kettle = a.find((x) => x.kind === "kettle");
    expect(kettle?.yours).toBe(true);
    expect(kettle?.where).toMatch(/your room/);
    const fridge = a.find((x) => x.kind === "fridge");
    expect(fridge?.yours).toBe(false);
    expect(fridge?.where).toMatch(/kitchenette/);
    // Someone with no room of their own sees no kettle: both are in guests' rooms.
    expect(amenitiesFor([floor()], null).some((x) => x.kind === "kettle")).toBe(false);
  });

  it("says where in an area", () => {
    expect(spotIn(rect(0, 0, 1, 1), { x: 0.1, y: 0.1 })).toBe("top-left corner");
    expect(spotIn(rect(0, 0, 1, 1), { x: 0.9, y: 0.5 })).toBe("right side");
    expect(spotIn(rect(0, 0, 1, 1), { x: 0.5, y: 0.5 })).toBe("middle");
  });

  it("labels stairs up from here and where stairs from below arrive", () => {
    const lower: MapFloor = {
      id: "f1",
      level: 1,
      building: "",
      map: normaliseMap({
        areas: [],
        lines: [
          {
            id: "stairs1",
            kind: "stairs",
            pts: [
              { x: 0.6, y: 0.7 },
              { x: 0.6, y: 0.4 },
            ],
            toLevel: 2,
          },
        ],
        items: [],
      }),
    };
    const marks = stairMarks([lower, floor()], "f2");
    expect(marks.map((m) => m.text)).toEqual([
      "Up to the third floor",
      "Stairs down to the first floor",
    ]);
    expect(stairMarks([lower, floor()], "f1").map((m) => m.text)).toEqual([
      "Up to the second floor",
    ]);
  });
});

describe("venue websites", () => {
  it("reads the link-preview picture and the logo", () => {
    const html = `<html><head>
      <meta property="og:image" content="/img/front.jpg">
      <link rel="icon" href="/favicon.ico">
      <link rel="apple-touch-icon" sizes="180x180" href="https://cdn.example.com/touch.png">
    </head></html>`;
    expect(previewFromHtml(html, "https://cafe.example.com/")).toEqual({
      image: "https://cafe.example.com/img/front.jpg",
      logo: "https://cdn.example.com/touch.png",
    });
    expect(
      previewFromHtml(`<meta content="http://x/a.jpg" name="twitter:image">`, "https://x/"),
    ).toEqual({
      image: null,
      logo: null,
    });
  });

  it("reads places saved before ratings and distances again, once", () => {
    const old = [
      {
        id: "a",
        name: "a",
        category: "cafe" as const,
        lat: 0,
        lng: 0,
        metres: 1,
        address: null,
        website: null,
      },
    ];
    expect(placesNeedNewFormat(old, "2026-11-13T12:36:00Z")).toBe(true);
    expect(placesNeedNewFormat([{ ...old[0]!, walkS: 100 }], "2026-11-13T12:36:00Z")).toBe(false);
    expect(placesNeedNewFormat(old, "2026-11-14T09:00:00Z")).toBe(false);
  });
});
