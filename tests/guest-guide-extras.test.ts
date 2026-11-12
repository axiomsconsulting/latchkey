import { describe, expect, it } from "vitest";

import {
  directionsTo,
  levelName,
  normalisePins,
  whereFrom,
  type FloorPlan,
} from "@/lib/floor-plans";
import {
  directionsLink,
  distanceText,
  driveMinutes,
  eventsFromTicketmaster,
  guestLocal,
  localText,
  metresBetween,
  normaliseLocalGuide,
  overpassQuery,
  placesFromOverpass,
  readWhere,
  walkMinutes,
} from "@/lib/local-guide";
import { infoText, normalisePropertyInfo } from "@/lib/property-info";

const P = "11111111-1111-4111-8111-111111111111";
const R1 = "22222222-2222-4222-8222-222222222222";
const R2 = "33333333-3333-4333-8333-333333333333";

describe("property information", () => {
  it("keeps titled items with known icons, short fields and this property's photos only", () => {
    const items = normalisePropertyInfo(
      [
        {
          id: "info-bins",
          icon: "bins",
          title: "Bins",
          notes: "Black bin **Tuesday**",
          fields: [
            { label: "Day", value: "Tuesday" },
            { label: "", value: "" },
          ],
          images: [`${P}/info/abc123.jpg`, `other/info/x.jpg`, "../../etc"],
        },
        { title: "", icon: "bins" },
        { title: "Parking", icon: "spaceship" },
      ],
      P,
    );
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      id: "info-bins",
      icon: "bins",
      fields: [{ label: "Day", value: "Tuesday" }],
      images: [`${P}/info/abc123.jpg`],
    });
    expect(items[1]!.icon).toBe("info");
    expect(infoText(items)).toContain("Bins: Day: Tuesday");
  });
});

describe("around here", () => {
  const at = { lat: 51.5, lng: -0.12 };

  it("works out distance, walking and driving time, and words", () => {
    const m = metresBetween(at, { lat: 51.509, lng: -0.12 });
    expect(m).toBeGreaterThan(990);
    expect(m).toBeLessThan(1010);
    expect(walkMinutes(1000)).toBe(16);
    expect(driveMinutes(1000)).toBe(5);
    expect(distanceText(340)).toBe("340 m");
    expect(distanceText(1234)).toBe("1.2 km");
  });

  it("opens directions from where the guest is in their maps app", () => {
    expect(directionsLink({ lat: 51.5, lng: -0.12 }, "walking")).toBe(
      "https://www.google.com/maps/dir/?api=1&destination=51.500000,-0.120000&travelmode=walking",
    );
    expect(directionsLink({ lat: 51.5, lng: -0.12, name: "The Swan" }, "driving", "apple")).toBe(
      "https://maps.apple.com/?daddr=51.500000,-0.120000&dirflg=d&q=The%20Swan",
    );
  });

  it("asks OpenStreetMap for each chosen kind within its own distance", () => {
    const q = overpassQuery(at, ["pub", "shopping"]);
    expect(q).toContain('nwr["amenity"="pub"]["name"](around:1500,51.50000,-0.12000);');
    expect(q).toContain('nwr["shop"="mall"]["name"](around:8000,');
    expect(q).not.toContain("restaurant");
  });

  it("reads OpenStreetMap's answer: named, positioned, nearest first, each once", () => {
    const places = placesFromOverpass(
      {
        elements: [
          {
            type: "node",
            id: 1,
            lat: 51.502,
            lon: -0.12,
            tags: { amenity: "pub", name: "The Swan", "addr:street": "High St" },
          },
          {
            type: "way",
            id: 2,
            center: { lat: 51.5005, lon: -0.12 },
            tags: { amenity: "pub", name: "The Crown" },
          },
          {
            type: "node",
            id: 3,
            lat: 51.5005,
            lon: -0.12,
            tags: { amenity: "pub", name: "The Crown" },
          },
          { type: "node", id: 4, lat: 51.5, lon: -0.12, tags: { amenity: "pub" } },
          {
            type: "node",
            id: 5,
            lat: 51.51,
            lon: -0.12,
            tags: { shop: "supermarket", name: "Tesco" },
          },
        ],
      },
      at,
    );
    expect(places.map((p) => p.name)).toEqual(["The Crown", "The Swan", "Tesco"]);
    expect(places[0]!.id).toBe("way/2");
    expect(places[1]!.address).toBe("High St");
  });

  it("reads Ticketmaster events, soonest first", () => {
    const ev = eventsFromTicketmaster({
      _embedded: {
        events: [
          {
            id: "b",
            name: "Late gig",
            url: "https://tm.example/b",
            dates: { start: { localDate: "2027-03-06", localTime: "20:00:00" } },
            _embedded: {
              venues: [{ name: "Hall", location: { latitude: "51.5", longitude: "-0.1" } }],
            },
          },
          { id: "a", name: "Market", dates: { start: { localDate: "2027-03-05" } } },
        ],
      },
    });
    expect(ev.map((e) => e.id)).toEqual(["a", "b"]);
    expect(ev[1]).toMatchObject({ time: "20:00", venue: "Hall", lat: 51.5 });
  });

  it("guests see the host's picks first, chosen kinds only, nothing hidden, events from today", () => {
    const g = normaliseLocalGuide({
      categories: ["pub"],
      hidden: ["node/9"],
      picks: [
        { name: "Fish shack", category: "food", note: "Best chips", lat: 51.501, lng: -0.12 },
      ],
      events: [
        { name: "Fete", date: "2027-03-01" },
        { name: "Past", date: "2027-02-01" },
      ],
    });
    const out = guestLocal(
      g,
      [
        {
          id: "node/9",
          name: "Hidden",
          category: "pub",
          lat: 1,
          lng: 1,
          metres: 10,
          address: null,
          website: null,
        },
        {
          id: "node/8",
          name: "Shop",
          category: "shop",
          lat: 1,
          lng: 1,
          metres: 10,
          address: null,
          website: null,
        },
        {
          id: "node/7",
          name: "The Swan",
          category: "pub",
          lat: 1,
          lng: 1,
          metres: 10,
          address: null,
          website: null,
        },
      ],
      [],
      at,
      "2027-03-01",
    );
    expect(out.places.map((p) => p.name)).toEqual(["Fish shack", "The Swan"]);
    expect(out.places[0]!.pick).toBe(true);
    expect(out.events.map((e) => e.name)).toEqual(["Fete"]);
    expect(localText(out.places, out.events)).toContain("Fish shack");
  });

  it("reads a position from a pasted map link or numbers", () => {
    expect(readWhere("https://www.google.com/maps/@51.5072,-0.1276,15z")).toEqual({
      lat: 51.5072,
      lng: -0.1276,
    });
    expect(readWhere("51.5, -0.12")).toEqual({ lat: 51.5, lng: -0.12 });
    expect(readWhere("the corner")).toBeNull();
  });
});

describe("floor plans", () => {
  const ground: FloorPlan = {
    id: "g",
    level: 0,
    label: null,
    pins: normalisePins({
      entrance: { x: 0.5, y: 0.9, facing: "up" },
      stairs: { x: 0.8, y: 0.6 },
      rooms: { [R1]: { x: 0.2, y: 0.85 } },
    }),
  };
  const second: FloorPlan = {
    id: "s",
    level: 2,
    label: null,
    pins: normalisePins({ stairs: { x: 0.8, y: 0.6 }, rooms: { [R2]: { x: 0.2, y: 0.2 } } }),
  };

  it("keeps only positions on the picture and real room ids", () => {
    const p = normalisePins({
      entrance: { x: 2, y: 0.5 },
      stairs: { x: 0.5, y: 0.5 },
      rooms: { bad: { x: 0.1, y: 0.1 } },
    });
    expect(p).toEqual({ rooms: {}, stairs: { x: 0.5, y: 0.5 } });
  });

  it("says where something is as you face walking in", () => {
    expect(whereFrom({ x: 0.5, y: 0.9 }, { x: 0.8, y: 0.3 }, "up")).toEqual({
      side: "on the right",
      depth: "at the far end",
    });
    expect(whereFrom({ x: 0.5, y: 0.5 }, { x: 0.5, y: 0.8 }, "right")).toEqual({
      side: "on the right",
      depth: "close by",
    });
    expect(levelName(0)).toBe("ground floor");
    expect(levelName(2)).toBe("second floor");
    expect(levelName(-1)).toBe("basement");
  });

  it("a room on the entrance floor", () => {
    expect(directionsTo([ground, second], R1, "Room 1")!.steps).toEqual([
      "Come in through the main entrance.",
      "Room 1 is on this floor, close by, on the left.",
    ]);
  });

  it("a room upstairs: the stairs, how many flights, then which way", () => {
    const d = directionsTo([ground, second], R2, "Room 7")!;
    expect(d.steps).toEqual([
      "Come in through the main entrance.",
      "The stairs are further along, on the right.",
      "Go up 2 flights of stairs to the second floor.",
      "From the top of the stairs, Room 7 is further along, on the left.",
    ]);
    expect(d.planId).toBe("s");
  });

  it("nothing until the host has marked the entrance and the room", () => {
    expect(directionsTo([second], R2, "Room 7")).toBeNull();
    expect(directionsTo([ground], R2, "Room 7")).toBeNull();
  });
});
