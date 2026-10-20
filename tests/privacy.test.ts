import { describe, expect, it } from "vitest";

import { DEFAULT_PRIVACY, detailsCutoff, messagesCutoff, normalisePrivacy } from "../src/lib/privacy";

describe("privacy and retention", () => {
  it("keeps today's behaviour when nothing is chosen: details 90 days, messages kept", () => {
    expect(normalisePrivacy(null)).toEqual(DEFAULT_PRIVACY);
    expect(DEFAULT_PRIVACY).toEqual({ guestDetailsDays: 90, messagesDays: 0 });
  });

  it("only accepts the offered choices", () => {
    expect(normalisePrivacy({ guestDetailsDays: 30, messagesDays: 180 })).toEqual({ guestDetailsDays: 30, messagesDays: 180 });
    expect(normalisePrivacy({ guestDetailsDays: 1, messagesDays: -5 })).toEqual(DEFAULT_PRIVACY);
    expect(normalisePrivacy({ guestDetailsDays: "365" }).guestDetailsDays).toBe(90);
  });

  it("works out the check-out day before which data goes", () => {
    expect(detailsCutoff("2026-10-20", { guestDetailsDays: 30, messagesDays: 0 })).toBe("2026-09-20");
    expect(messagesCutoff("2026-10-20", { guestDetailsDays: 90, messagesDays: 0 })).toBeNull();
    expect(messagesCutoff("2026-10-20", { guestDetailsDays: 90, messagesDays: 365 })).toBe("2025-10-20");
  });
});
