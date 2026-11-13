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
