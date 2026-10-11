import { describe, expect, it } from "vitest";

import { explainSyncError, linkState } from "../src/lib/sync-status";

const now = new Date("2026-10-11T12:00:00Z");

describe("linkState", () => {
  it("shows a sync in progress for a few minutes, then trusts the result", () => {
    expect(linkState({ sync_status: "ok", sync_started_at: "2026-10-11T11:59:00Z" }, now)).toBe("syncing");
    expect(linkState({ sync_status: "error", sync_started_at: "2026-10-11T11:50:00Z" }, now)).toBe("error");
  });

  it("maps the stored status", () => {
    expect(linkState({ sync_status: "ok" }, now)).toBe("ok");
    expect(linkState({ sync_status: "warning" }, now)).toBe("warning");
    expect(linkState({ sync_status: "never" }, now)).toBe("never");
  });
});

describe("explainSyncError", () => {
  it("says what to do when the platform no longer knows the link", () => {
    expect(explainSyncError("The calendar provider replied with an error (404).")).toMatch(/fresh calendar link/);
    expect(explainSyncError("The calendar provider replied with an error (403).")).toMatch(/refused/);
  });

  it("treats outages as temporary", () => {
    expect(explainSyncError("The calendar provider did not respond in time.")).toMatch(/temporary/);
    expect(explainSyncError("The calendar provider replied with an error (503).")).toMatch(/try again/);
  });

  it("spots a web page pasted instead of a calendar", () => {
    expect(explainSyncError("That link did not return a calendar file.")).toMatch(/Export calendar/);
  });

  it("falls back to the original message", () => {
    expect(explainSyncError("Something odd")).toBe("Something odd");
    expect(explainSyncError(null)).toMatch(/Try Sync now/);
  });
});
