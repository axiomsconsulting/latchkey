import { describe, expect, it } from "vitest";

import {
  cleanDomains,
  isPlatformKey,
  newSiteKey,
  normalisePlatformSites,
  normaliseStoredSites,
  platformKey,
  resolveSites,
  siteForUrl,
  toChannel,
  urlFitsSite,
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

  it("built-ins are Latchkey's: a host's old wording and logos are ignored", () => {
    const platform = normalisePlatformSites({
      airbnb: { icon_url: "https://x.test/a.png" },
      direct: { label: "Book direct" },
    });
    const sites = resolveSites(
      [
        {
          key: "site_abcd1234",
          label: "Expedia",
          icon_url: null,
          url: "https://www.expedia.co.uk",
        },
        { key: "airbnb", label: "My Airbnb", icon_url: "https://x.test/mine.png" },
      ],
      platform,
      DEFAULTS,
    );
    expect(sites[0]).toMatchObject({
      key: "airbnb",
      label: "Airbnb",
      iconUrl: "https://x.test/a.png",
      builtIn: true,
      domains: ["airbnb"],
    });
    expect(sites.find((s) => s.key === "direct")?.label).toBe("Book direct");
    expect(sites.at(-1)).toEqual({
      key: "site_abcd1234",
      label: "Expedia",
      iconUrl: null,
      builtIn: false,
      domains: [],
      url: "https://www.expedia.co.uk",
    });
  });

  it("has default web address rules, which the admin can change or clear", () => {
    const d = normalisePlatformSites(null);
    expect(d.airbnb.domains).toEqual(["airbnb"]);
    expect(d.booking_com.domains).toEqual(["booking.com"]);
    expect(d.direct.domains).toEqual([]);
    expect(normalisePlatformSites({ airbnb: { domains: ["abnb.me"] } }).airbnb.domains).toEqual([
      "abnb.me",
    ]);
    expect(normalisePlatformSites({ airbnb: { domains: [] } }).airbnb.domains).toEqual([]);
  });

  it("tidies web address rules as typed", () => {
    expect(cleanDomains("https://Airbnb.com/x, airbnb.com  booking.com")).toEqual([
      "airbnb.com",
      "booking.com",
    ]);
    expect(cleanDomains("a <script>")).toEqual([]);
  });

  it("checks a link against its site, by the web address only", () => {
    const rule = { domains: ["airbnb"] };
    expect(urlFitsSite("https://www.airbnb.co.uk/calendar/ical/1.ics", rule)).toBe(true);
    expect(urlFitsSite("https://ical.booking.com/v1/export?t=airbnb", rule)).toBe(false);
    expect(urlFitsSite("not a link", rule)).toBe(false);
    expect(urlFitsSite("https://anything.example/x.ics", { domains: [] })).toBe(true);
  });

  it("works out a link's site, including one the host added", () => {
    const sites = resolveSites(
      [
        {
          key: "site_abcd1234",
          label: "Expedia",
          icon_url: null,
          url: "https://www.expedia.co.uk/",
        },
      ],
      normalisePlatformSites(null),
      DEFAULTS,
    );
    expect(siteForUrl(sites, "https://ical.booking.com/v1/export")?.key).toBe("booking_com");
    expect(siteForUrl(sites, "https://expedia.co.uk/feed.ics")?.key).toBe("site_abcd1234");
    expect(siteForUrl(sites, "https://unknown.example/x.ics")).toBeNull();
    expect(siteForUrl(sites, "nonsense")).toBeNull();
  });

  it("keeps an added site's https website only", () => {
    expect(
      normaliseStoredSites([{ key: "site_abcd1234", label: "X", url: "http://x.test" }])[0],
    ).toEqual({ key: "site_abcd1234", label: "X", icon_url: null });
  });

  it("stores an added site as 'other' plus its key", () => {
    expect(toChannel("airbnb")).toEqual({ channel: "airbnb", site_key: null });
    expect(toChannel("site_abcd1234")).toEqual({ channel: "other", site_key: "site_abcd1234" });
    expect(platformKey({ channel: "other", site_key: "site_abcd1234" })).toBe("site_abcd1234");
    expect(platformKey({ channel: "airbnb", site_key: null })).toBe("airbnb");
  });
});
