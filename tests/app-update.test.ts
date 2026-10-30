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

  const req = (h: number, mode: "now" | "idle" = "idle") => ({
    at: new Date(t(h)).toISOString(),
    mode,
  });

  it("is due only for a request made after the page loaded, once its time has come", () => {
    const loaded = t(9);
    expect(updateDue([req(8)], loaded, t(10))).toBeNull();
    expect(updateDue([req(10)], loaded, t(10))).toBe("idle");
    expect(updateDue([req(10), req(10, "now")], loaded, t(10))).toBe("now");
    // Scheduled for later: not yet.
    expect(updateDue([req(22, "now")], loaded, t(10))).toBeNull();
    expect(updateDue([null], loaded, t(10))).toBeNull();
  });

  it("reloads at once when asked to now; otherwise only after 15 minutes untouched and never while busy", () => {
    expect(shouldReload({ due: "now", idleMs: 0, busy: true })).toBe(true);
    expect(shouldReload({ due: "idle", idleMs: 15 * 60_000, busy: false })).toBe(true);
    expect(shouldReload({ due: "idle", idleMs: 14 * 60_000, busy: false })).toBe(false);
    expect(shouldReload({ due: "idle", idleMs: 60 * 60_000, busy: true })).toBe(false);
    expect(shouldReload({ due: null, idleMs: 60 * 60_000, busy: false })).toBe(false);
  });

  it("announces a scheduled update within the next day", () => {
    expect(upcomingUpdate([req(22), null], t(10))).toBe(new Date(t(22)).toISOString());
    expect(upcomingUpdate([req(9)], t(10))).toBeNull();
    expect(
      upcomingUpdate([{ at: new Date(t(10) + 2 * 86_400_000).toISOString(), mode: "now" }], t(10)),
    ).toBeNull();
  });

  it("reads stored requests safely, older plain times waiting for idle", () => {
    expect(
      normaliseUpdates({
        hosts: "2026-10-30T22:00:00Z",
        kiosks: { at: "2026-10-30T22:00:00Z", mode: "now" },
      }),
    ).toEqual({
      hosts: { at: "2026-10-30T22:00:00.000Z", mode: "idle" },
      kiosks: { at: "2026-10-30T22:00:00.000Z", mode: "now" },
    });
    expect(normaliseUpdates({ hosts: 5 }).hosts).toBeNull();
  });
});
