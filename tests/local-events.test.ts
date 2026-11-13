import { describe, expect, it } from "vitest";

import { parseIcs } from "@/lib/ical";
import {
  calendarUrl,
  eventsFromCalendar,
  eventsFromSkiddle,
  nominatimUrl,
  normaliseLocalGuide,
  placesFromNominatim,
} from "@/lib/local-guide";
import { aiMessage } from "@/lib/ai-health.server";

const ICS = [
  "BEGIN:VCALENDAR",
  "BEGIN:VEVENT",
  "UID:walk-1",
  "SUMMARY:Saturday heritage walk",
  "DTSTART:20261114T100000",
  "DTEND:20261114T120000",
  "LOCATION:Market Cross\\, High Street",
  "URL:https://example.org/walk",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:fair-1",
  "SUMMARY:Winter fair",
  "DTSTART;VALUE=DATE:20261110",
  "DTEND;VALUE=DATE:20261116",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:old-1",
  "SUMMARY:Last month's quiz",
  "DTSTART;VALUE=DATE:20261001",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:gone-1",
  "SUMMARY:Cancelled film",
  "STATUS:CANCELLED",
  "DTSTART:20261115T190000",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:moment-1",
  "SUMMARY:Bonfire",
  "DTSTART:20261120T190000",
  "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");

describe("local event calendars", () => {
  it("reads webcal and https links only", () => {
    expect(calendarUrl("webcal://example.org/cal.ics")).toBe("https://example.org/cal.ics");
    expect(calendarUrl("http://example.org/cal.ics")).toBeNull();
    expect(
      normaliseLocalGuide({
        calendars: [{ name: "Town", url: "webcal://x.org/a.ics" }, { url: "nope" }],
      }).calendars,
    ).toEqual([{ id: "cal-0", name: "Town", url: "https://x.org/a.ics" }]);
  });
  it("shows what's on from today, running events included, cancelled and past left out", () => {
    const ev = eventsFromCalendar(
      parseIcs(ICS, "Europe/London", { noEndOk: true }),
      "2026-11-13",
      "cal-0",
    );
    expect(ev.map((e) => [e.name, e.date, e.time, e.venue])).toEqual([
      ["Winter fair", "2026-11-13", null, null],
      ["Saturday heritage walk", "2026-11-14", "10:00", "Market Cross, High Street"],
      ["Bonfire", "2026-11-20", "19:00", null],
    ]);
  });
  it("booking feeds still need an end", () => {
    expect(parseIcs(ICS).map((e) => e.uid)).not.toContain("moment-1");
  });
});

describe("Skiddle", () => {
  it("turns listings into events", () => {
    const ev = eventsFromSkiddle({
      results: [
        {
          id: "123",
          eventname: "Comedy night",
          date: "2026-11-14",
          startdate: "2026-11-14T20:00:00+00:00",
          openingtimes: { doorsopen: "19:30" },
          venue: {
            name: "The Old Fire Station",
            town: "Bristol",
            latitude: "51.45",
            longitude: "-2.59",
          },
          link: "https://www.skiddle.com/e/123",
        },
        { id: "9", eventname: "Gone", date: "2026-11-14", cancelled: "1" },
      ],
    });
    expect(ev).toEqual([
      {
        id: "sk-123",
        name: "Comedy night",
        date: "2026-11-14",
        time: "19:30",
        venue: "The Old Fire Station, Bristol",
        url: "https://www.skiddle.com/e/123",
        lat: 51.45,
        lng: -2.59,
        image: null,
      },
    ]);
  });
});

describe("OpenStreetMap search fallback", () => {
  it("searches in a box round the property and keeps the nearest", () => {
    const at = { lat: 51.4545, lng: -2.5879 };
    const url = new URL(nominatimUrl("pub", at));
    expect(url.searchParams.get("amenity")).toBe("pub");
    expect(url.searchParams.get("bounded")).toBe("1");
    const places = placesFromNominatim(
      [
        { osm_type: "node", osm_id: 2, name: "Far Inn", lat: "51.46", lon: "-2.58" },
        {
          osm_type: "way",
          osm_id: 1,
          name: "The Fleece",
          lat: "51.4535",
          lon: "-2.5885",
          address: { house_number: "12", road: "St Thomas St" },
        },
        { osm_type: "node", osm_id: 3, name: "", lat: "51.45", lon: "-2.58" },
      ],
      at,
      "pub",
    );
    expect(places.map((p) => [p.name, p.address, p.category])).toEqual([
      ["The Fleece", "12 St Thomas St", "pub"],
      ["Far Inn", null, "pub"],
    ]);
  });
});

describe("AI service health", () => {
  it("says what the service said, in plain words", () => {
    expect(aiMessage(402, '{"error":{"message":"Payment required"}}')).toBe(
      "out of AI credits: Payment required",
    );
    expect(aiMessage(400, "bad schema")).toBe("answered 400: bad schema");
  });
});

import {
  eventWindow,
  keepEvents,
  placeImage,
  placeTabs,
  placesInTab,
  readRouteTable,
  recommended,
  routeTableUrl,
  ticketmasterImage,
  travelMinutes,
  whenBadge,
  withHygiene,
  type LocalEvent,
  type Place,
} from "@/lib/local-guide";

describe("what's on, by date", () => {
  const today = "2026-11-13"; // a Friday
  it("badges today, tonight, tomorrow and this week", () => {
    expect(whenBadge(today, "14:00", today)).toEqual({ label: "Today", soon: true });
    expect(whenBadge(today, "19:30", today).label).toBe("Tonight");
    expect(whenBadge("2026-11-14", null, today).label).toBe("Tomorrow");
    expect(whenBadge("2026-11-14", "20:00", today).label).toBe("Tomorrow night");
    expect(whenBadge("2026-11-17", null, today).label).toBe("Tuesday");
    expect(whenBadge("2026-11-25", null, today).label).toBe("Wed 25 Nov");
  });

  it("reads events only while guests are staying or arriving within a week", () => {
    const stay = (i: string, o: string, status = "upcoming") => ({
      check_in_date: i,
      check_out_date: o,
      status,
    });
    expect(eventWindow([], today)).toBeNull();
    expect(eventWindow([stay("2026-11-25", "2026-11-28")], today)).toBeNull();
    expect(eventWindow([stay("2026-11-10", "2026-11-13")], today)).toBeNull();
    expect(eventWindow([stay("2026-11-18", "2026-11-22", "cancelled")], today)).toBeNull();
    expect(
      eventWindow([stay("2026-11-12", "2026-11-15"), stay("2026-11-18", "2026-11-22")], today),
    ).toBe("2026-11-22");
    expect(eventWindow([stay("2026-11-12", "2027-02-01")], today)).toBe("2026-12-13");
  });

  it("drops past events and those after the last check-out", () => {
    const e = (date: string) =>
      ({
        id: date,
        name: date,
        date,
        time: null,
        venue: null,
        url: null,
        lat: null,
        lng: null,
      }) as LocalEvent;
    expect(
      keepEvents([e("2026-11-12"), e(today), e("2026-11-20")], today, "2026-11-15").map(
        (x) => x.date,
      ),
    ).toEqual([today]);
  });
});

describe("pictures straight from the source", () => {
  it("uses a place's own Commons or image link", () => {
    expect(placeImage({ wikimedia_commons: "File:Old Pub.jpg" })).toBe(
      "https://commons.wikimedia.org/wiki/Special:FilePath/Old%20Pub.jpg?width=320",
    );
    expect(placeImage({ image: "https://example.com/front.jpg" })).toBe(
      "https://example.com/front.jpg",
    );
    expect(placeImage({ image: "http://example.com/front.jpg" })).toBeNull();
    expect(placeImage({ image: "https://example.com/page" })).toBeNull();
  });

  it("picks Ticketmaster's wide picture about 640 across", () => {
    expect(
      ticketmasterImage([
        { url: "https://s1.ticketm.net/a.jpg", ratio: "3_2", width: 640 },
        { url: "https://s1.ticketm.net/b.jpg", ratio: "16_9", width: 2048 },
        { url: "https://s1.ticketm.net/c.jpg", ratio: "16_9", width: 640 },
      ]),
    ).toBe("https://s1.ticketm.net/c.jpg");
  });
});

describe("places", () => {
  const place = (o: Partial<Place> & { id: string }): Place => ({
    name: o.id,
    category: "cafe",
    lat: 51.45,
    lng: -2.6,
    metres: 400,
    address: null,
    website: null,
    ...o,
  });

  it("reads walking and driving times by road", () => {
    const url = routeTableUrl("foot", { lat: 51.45, lng: -2.6 }, [{ lat: 51.46, lng: -2.59 }]);
    expect(url).toContain(
      "routing.openstreetmap.de/routed-foot/table/v1/driving/-2.60000,51.45000;-2.59000,51.46000",
    );
    expect(
      readRouteTable({ distances: [[0, 993.9, null]], durations: [[0, 700, null]] }, 2),
    ).toEqual([[993.9, 700], null]);
    expect(travelMinutes(place({ id: "a", walkS: 700 }), "walk")).toEqual({ min: 12, exact: true });
    expect(travelMinutes(place({ id: "a" }), "walk")?.exact).toBe(false);
  });

  it("matches food hygiene ratings by name nearby", () => {
    const body = {
      establishments: [
        {
          BusinessName: "The Cash Hall Ltd",
          RatingValue: "5",
          geocode: { latitude: "51.4501", longitude: "-2.6001" },
        },
        {
          BusinessName: "Far Cafe",
          RatingValue: "2",
          geocode: { latitude: "51.47", longitude: "-2.6" },
        },
      ],
    };
    const out = withHygiene(
      [
        place({ id: "a", name: "Cash Hall", category: "food" }),
        place({ id: "b", name: "Far Cafe" }),
        place({ id: "c", name: "Cash Hall", category: "shop" }),
      ],
      body,
    );
    expect(out.map((p) => p.hygiene ?? null)).toEqual(["5", null, null]);
  });

  it("puts Recommended first, then host picks, kinds, and All last", () => {
    const ps = [
      place({ id: "c1", category: "cafe", metres: 900 }),
      place({ id: "c2", category: "cafe", metres: 300, hygiene: "5", image: "https://x/y.jpg" }),
      place({ id: "f1", category: "food", pick: true }),
      place({ id: "f2", category: "food", hygiene: "5" }),
    ];
    expect(placeTabs(ps)).toEqual(["recommended", "picks", "food", "cafe", "all"]);
    expect(recommended(ps).map((p) => p.id)).toEqual(["f1", "c2"]);
    expect(placesInTab(ps, "picks").map((p) => p.id)).toEqual(["f1"]);
    expect(placeTabs([])).toEqual([]);
  });
});

import {
  distanceIn,
  hygieneBadge,
  hygienePage,
  placeMetres,
  tileOf,
  usesMiles,
  wikidataImages,
} from "@/lib/local-guide";

describe("tiles", () => {
  it("uses the FSA's official badge for 0–5, never for Scotland's Pass", () => {
    expect(hygieneBadge("5")).toBe(
      "https://ratings.food.gov.uk/images/badges/fhrs/3/fhrs-badge-5.svg",
    );
    expect(hygieneBadge("Pass")).toBeNull();
    expect(hygienePage(123)).toBe("https://ratings.food.gov.uk/business/123");
  });

  it("gives distances in miles in the UK, km elsewhere, by path first", () => {
    expect(usesMiles("GB")).toBe(true);
    expect(usesMiles("FR")).toBe(false);
    expect(distanceIn(805, true)).toBe("0.5 mi");
    expect(distanceIn(40, true)).toBe("0.1 mi");
    expect(distanceIn(32_000, true)).toBe("20 mi");
    expect(distanceIn(1200, false)).toBe("1.2 km");
    const p = {
      id: "a",
      name: "a",
      category: "cafe" as const,
      lat: 0,
      lng: 0,
      metres: 300,
      address: null,
      website: null,
    };
    expect(placeMetres(p)).toBe(300);
    expect(placeMetres({ ...p, walkM: 420 })).toBe(420);
  });

  it("finds the map tile and the spot in it", () => {
    const t = tileOf(51.4545, -2.5879, 17);
    expect(t.x).toBe(64593);
    expect(t.y).toBeGreaterThan(43000);
    expect(t.fx).toBeGreaterThanOrEqual(0);
    expect(t.fx).toBeLessThan(1);
  });

  it("reads Wikidata's main photo", () => {
    expect(
      wikidataImages({
        entities: {
          Q1: { claims: { P18: [{ mainsnak: { datavalue: { value: "Old Pub.jpg" } } }] } },
          Q2: { claims: {} },
        },
      }),
    ).toEqual({
      Q1: "https://commons.wikimedia.org/wiki/Special:FilePath/Old%20Pub.jpg?width=320",
    });
  });
});
