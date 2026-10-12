import { describe, expect, it } from "vitest";

import {
  isPlatformKey,
  newSiteKey,
  normaliseStoredSites,
  platformKey,
  resolveSites,
  toChannel,
} from "../src/lib/booking-sites";

const DEFAULTS = { airbnb: "Airbnb", booking_com: "Booking.com", direct: "Direct", other: "Other" };

describe("booking sites", () => {
  it("makes keys the database accepts", () => {
    const k = newSiteKey();
    expect(k).toMatch(/^site_[a-z0-9]{8}$/);
    expect(isPlatformKey(k)).toBe(true);
    expect(isPlatformKey("airbnb")).toBe(true);
    expect(isPlatformKey("site_")).toBe(false);
    expect(isPlatformKey("drop table")).toBe(false);
  });

  it("drops unnamed added sites, duplicates and unsafe icons", () => {
    const out = normaliseStoredSites([
      { key: "site_abcd1234", label: "Expedia", icon_url: "javascript:alert(1)" },
      { key: "site_abcd1234", label: "Again" },
      { key: "site_zzzz9999", label: "  " },
      { key: "airbnb", label: "", icon_url: "data:image/png;base64,AAAA" },
      "nonsense",
    ]);
    expect(out).toEqual([
      { key: "site_abcd1234", label: "Expedia", icon_url: null },
      { key: "airbnb", label: "", icon_url: "data:image/png;base64,AAAA" },
    ]);
  });

  it("lists built-ins first with host wording, then added sites", () => {
    const sites = resolveSites(
      { direct: "Our website" },
      [
        { key: "site_abcd1234", label: "Expedia", icon_url: null },
        { key: "airbnb", label: "", icon_url: "https://x.test/a.png" },
      ],
      DEFAULTS,
    );
    expect(sites[0]).toEqual({ key: "airbnb", label: "Airbnb", iconUrl: "https://x.test/a.png", builtIn: true });
    expect(sites.find((s) => s.key === "direct")?.label).toBe("Our website");
    expect(sites.at(-1)).toEqual({ key: "site_abcd1234", label: "Expedia", iconUrl: null, builtIn: false });
  });

  it("stores an added site as 'other' plus its key", () => {
    expect(toChannel("airbnb")).toEqual({ channel: "airbnb", site_key: null });
    expect(toChannel("site_abcd1234")).toEqual({ channel: "other", site_key: "site_abcd1234" });
    expect(platformKey({ channel: "other", site_key: "site_abcd1234" })).toBe("site_abcd1234");
    expect(platformKey({ channel: "airbnb", site_key: null })).toBe("airbnb");
  });
});
