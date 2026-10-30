import { describe, expect, it } from "vitest";

import {
  newerVersion,
  normaliseUpdates,
  shouldReload,
  upcomingUpdate,
  updateDue,
} from "@/lib/app-update";

const t = (h: number) => Date.parse(`2026-10-30T${String(h).padStart(2, "0")}:00:00Z`);

describe("app updates", () => {
  it("compares versions", () => {
    expect(newerVersion("0.91.0", "0.90.0")).toBe(true);
    expect(newerVersion("0.90.10", "0.90.9")).toBe(true);
    expect(newerVersion("0.90.0", "0.90.0")).toBe(false);
    expect(newerVersion("0.89.9", "0.90.0")).toBe(false);
    expect(newerVersion(null, "0.90.0")).toBe(false);
  });

  it("is due only for a request made after the page loaded, once its time has come", () => {
    const loaded = t(9);
    expect(updateDue([new Date(t(8)).toISOString()], loaded, t(10))).toBe(false);
    expect(updateDue([new Date(t(10)).toISOString()], loaded, t(10))).toBe(true);
    // Scheduled for later: not yet.
    expect(updateDue([new Date(t(22)).toISOString()], loaded, t(10))).toBe(false);
    expect(updateDue([null, "junk"], loaded, t(10))).toBe(false);
  });

  it("reloads only after 15 minutes untouched, and never while busy", () => {
    expect(shouldReload({ due: true, idleMs: 15 * 60_000, busy: false })).toBe(true);
    expect(shouldReload({ due: true, idleMs: 14 * 60_000, busy: false })).toBe(false);
    expect(shouldReload({ due: true, idleMs: 60 * 60_000, busy: true })).toBe(false);
    expect(shouldReload({ due: false, idleMs: 60 * 60_000, busy: false })).toBe(false);
  });

  it("announces a scheduled update within the next day", () => {
    const later = new Date(t(22)).toISOString();
    expect(upcomingUpdate([later, null], t(10))).toBe(later);
    expect(upcomingUpdate([new Date(t(9)).toISOString()], t(10))).toBeNull();
    expect(upcomingUpdate([new Date(t(10) + 2 * 86_400_000).toISOString()], t(10))).toBeNull();
  });

  it("reads stored requests safely", () => {
    expect(normaliseUpdates({ hosts: "2026-10-30T22:00:00Z", kiosks: 5 })).toEqual({
      hosts: "2026-10-30T22:00:00.000Z",
      kiosks: null,
    });
  });
});
