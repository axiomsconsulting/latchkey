import { describe, expect, it } from "vitest";

import {
  JOB_COLOURS,
  jobColours,
  jobLines,
  jobRooms,
  jobSpan,
  jobWhen,
  openJobCounts,
  type TimelineJob,
} from "../src/lib/job-lines";
import { hkWords, normaliseHkWords } from "../src/lib/housekeeping";
import { at } from "../src/lib/timeline";

const TZ = "Europe/London";
const job = (over: Partial<TimelineJob> & { id: string }): TimelineJob => ({
  title: "Boiler service",
  status: "acknowledged",
  source: "maintenance",
  room_id: null,
  scheduled_at: null,
  eta_at: null,
  created_at: "2026-11-01T09:00:00Z",
  ...over,
});

describe("job rooms", () => {
  it("covers every listed room, else its one room, else the whole property", () => {
    expect(jobRooms({ room_id: "a", room_ids: ["a", "b", "a"] })).toEqual(["a", "b"]);
    expect(jobRooms({ room_id: "a", room_ids: null })).toEqual(["a"]);
    expect(jobRooms({ room_id: null })).toEqual([]);
  });
});

describe("job span", () => {
  it("takes the tradesperson's window on the property's clock", () => {
    // 08:00-12:00 UK time in November (GMT).
    expect(
      jobSpan(
        { scheduled_at: "2026-11-10T08:00:00Z", eta_at: null, window_end: "2026-11-10T12:00:00Z" },
        TZ,
      ),
    ).toEqual({ start: at("2026-11-10", "08:00"), end: at("2026-11-10", "12:00"), allDay: false });
  });

  it("uses summer time when it applies", () => {
    const s = jobSpan(
      { scheduled_at: "2026-07-10T07:00:00Z", eta_at: null, window_end: "2026-07-10T11:00:00Z" },
      TZ,
    );
    expect(s?.start).toBe(at("2026-07-10", "08:00"));
  });

  it("covers the whole day when it's all day or has no end", () => {
    const whole = {
      start: at("2026-11-10", "00:00"),
      end: at("2026-11-11", "00:00"),
      allDay: true,
    };
    expect(jobSpan({ scheduled_at: "2026-11-10T14:00:00Z", eta_at: null }, TZ)).toEqual(whole);
    expect(
      jobSpan(
        {
          scheduled_at: "2026-11-10T08:00:00Z",
          eta_at: null,
          window_end: "2026-11-10T12:00:00Z",
          all_day: true,
        },
        TZ,
      ),
    ).toEqual(whole);
  });

  it("prefers the agreed arrival, and has no place without a time", () => {
    expect(
      jobSpan({ scheduled_at: "2026-11-10T08:00:00Z", eta_at: "2026-11-12T08:00:00Z" }, TZ)?.start,
    ).toBe(at("2026-11-12", "00:00"));
    expect(jobSpan({ scheduled_at: null, eta_at: null }, TZ)).toBeNull();
  });

  it("says when in words", () => {
    expect(
      jobWhen(
        { scheduled_at: "2026-11-10T08:00:00Z", eta_at: null, window_end: "2026-11-10T12:00:00Z" },
        TZ,
      ),
    ).toBe("Tue 10 Nov, 08:00–12:00");
    expect(jobWhen({ scheduled_at: "2026-11-10T08:00:00Z", eta_at: null }, TZ)).toBe(
      "Tue 10 Nov, all day",
    );
    expect(jobWhen({ scheduled_at: null, eta_at: null }, TZ)).toBeNull();
  });
});

describe("job colours and lines", () => {
  it("gives open jobs different colours in the order they were made", () => {
    const c = jobColours([
      { id: "b", created_at: "2026-11-02T00:00:00Z" },
      { id: "a", created_at: "2026-11-01T00:00:00Z" },
    ]);
    expect(c["a"]).toBe(JOB_COLOURS[0]);
    expect(c["b"]).toBe(JOB_COLOURS[1]);
  });

  it("draws one line per room, stacks overlapping ones and leaves closed or untimed jobs out", () => {
    const { lines, lanes } = jobLines(
      [
        job({ id: "1", room_ids: ["r1", "r2"], scheduled_at: "2026-11-10T08:00:00Z" }),
        job({
          id: "2",
          room_id: "r1",
          scheduled_at: "2026-11-10T09:00:00Z",
          window_end: "2026-11-10T10:00:00Z",
        }),
        job({
          id: "3",
          room_id: "r1",
          scheduled_at: "2026-11-11T09:00:00Z",
          window_end: "2026-11-11T10:00:00Z",
        }),
        job({ id: "4", room_id: "r1", status: "done", scheduled_at: "2026-11-10T08:00:00Z" }),
        job({ id: "5", room_id: "r2" }),
        job({ id: "6", scheduled_at: "2026-11-10T08:00:00Z" }),
      ],
      TZ,
    );
    expect(lines.map((l) => l.id).sort()).toEqual(["1:r1", "1:r2", "2:r1", "3:r1", "6:all"]);
    const lane = (id: string) => lines.find((l) => l.id === id)!.lane;
    expect(lane("1:r1")).not.toBe(lane("2:r1"));
    // The next day's job doesn't overlap, so it shares the first lane.
    expect(lane("3:r1")).toBe(0);
    expect(lanes["r1"]).toBe(2);
    expect(lines.find((l) => l.id === "6:all")!.roomId).toBeNull();
    // Same job, same colour in every room.
    expect(lines.find((l) => l.id === "1:r1")!.colour).toBe(
      lines.find((l) => l.id === "1:r2")!.colour,
    );
  });

  it("counts open jobs per room", () => {
    expect(
      openJobCounts([
        job({ id: "1", room_ids: ["r1", "r2"] }),
        job({ id: "2", room_id: "r1" }),
        job({ id: "3", room_id: "r1", status: "cancelled" }),
        job({ id: "4" }),
      ]),
    ).toEqual({ r1: 2, r2: 1 });
  });
});

describe("housekeeping words", () => {
  it("keeps the super admin's words, tidied, and the usual ones otherwise", () => {
    expect(normaliseHkWords({ dirty: "  Needs   clean ", ready: "", x: "y" })).toEqual({
      dirty: "Needs clean",
    });
    expect(hkWords({ ready: "Done" })).toEqual({
      dirty: "Dirty",
      ready: "Done",
      unavailable: "Unavailable",
    });
    expect(hkWords(null).dirty).toBe("Dirty");
    expect(normaliseHkWords({ dirty: "x".repeat(40) }).dirty).toHaveLength(24);
  });
});
