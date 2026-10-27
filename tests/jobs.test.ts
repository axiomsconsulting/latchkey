import { describe, expect, it } from "vitest";

import { JOBS, jobDue } from "../src/lib/jobs";

const sync = JOBS.find((j) => j.key === "calendar_sync")!;
const ai = JOBS.find((j) => j.key === "ai_id_reading")!;
const now = new Date("2026-10-14T12:00:00Z");
const ago = (min: number) => new Date(now.getTime() - min * 60_000).toISOString();

describe("routines", () => {
  it("runs a scheduled job when it's due, not before", () => {
    expect(jobDue(sync, undefined, now)).toBe(true);
    expect(
      jobDue(
        sync,
        { key: "calendar_sync", enabled: true, every_minutes: 120, last_run_at: ago(60) },
        now,
      ),
    ).toBe(false);
    expect(
      jobDue(
        sync,
        { key: "calendar_sync", enabled: true, every_minutes: 120, last_run_at: ago(121) },
        now,
      ),
    ).toBe(true);
    expect(
      jobDue(
        sync,
        { key: "calendar_sync", enabled: true, every_minutes: null, last_run_at: ago(29.5) },
        now,
      ),
    ).toBe(true);
  });
  it("never runs a routine that's switched off", () => {
    expect(
      jobDue(
        sync,
        { key: "calendar_sync", enabled: false, every_minutes: 30, last_run_at: null },
        now,
      ),
    ).toBe(false);
    expect(
      jobDue(
        ai,
        { key: "ai_id_reading", enabled: false, every_minutes: null, last_run_at: null },
        now,
      ),
    ).toBe(false);
    expect(jobDue(ai, undefined, now)).toBe(true);
  });
  it("keeps experimental routines off until switched on", () => {
    const listing = JOBS.find((j) => j.key === "listing_import")!;
    expect(jobDue(listing, undefined, now)).toBe(false);
    expect(
      jobDue(
        listing,
        { key: "listing_import", enabled: true, every_minutes: null, last_run_at: null },
        now,
      ),
    ).toBe(true);
  });
  it("keeps the Commission Partner month close off until switched on", () => {
    const close = JOBS.find((j) => j.key === "commission_close")!;
    expect(jobDue(close, undefined, now)).toBe(false);
    expect(
      jobDue(
        close,
        { key: "commission_close", enabled: true, every_minutes: 1440, last_run_at: null },
        now,
      ),
    ).toBe(true);
    expect(
      jobDue(
        close,
        { key: "commission_close", enabled: true, every_minutes: 1440, last_run_at: ago(60) },
        now,
      ),
    ).toBe(false);
  });
  it("lists each routine once", () => {
    expect(new Set(JOBS.map((j) => j.key)).size).toBe(JOBS.length);
  });
});
