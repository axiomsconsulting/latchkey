import { describe, expect, it } from "vitest";

import { botReason, duration, parseUserAgent, periodKey, placeOf, sourceOf, summarise, type ProfileIn, type VisitIn, type VisitorIn } from "../src/lib/analytics";

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const MAC_CHROME = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
const GOOGLEBOT = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";

describe("reading the browser", () => {
  it("names browser, system and device", () => {
    expect(parseUserAgent(IPHONE)).toEqual({ browser: "Safari", os: "iOS", device: "Phone" });
    expect(parseUserAgent(MAC_CHROME)).toEqual({ browser: "Chrome", os: "macOS", device: "Desktop" });
    expect(parseUserAgent("Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 Chrome/141 Safari/537.36").device).toBe("Tablet");
    expect(parseUserAgent(null).device).toBe("Unknown");
  });

  it("spots bots and crawlers but not people", () => {
    expect(botReason(GOOGLEBOT)).toMatch(/bot/);
    expect(botReason("curl/8.4.0")).toMatch(/curl/);
    expect(botReason("Mozilla/5.0 HeadlessChrome/120")).toMatch(/headless/);
    expect(botReason("")).toBe("No browser name");
    expect(botReason(MAC_CHROME, { webdriver: true })).toBe("Automated browser");
    expect(botReason(MAC_CHROME, { pagesInVisit: 60, secondsInVisit: 30 })).toBe("Too many pages too fast");
    expect(botReason(IPHONE)).toBeNull();
  });

  it("names where people came from", () => {
    expect(sourceOf(null)).toBe("Direct");
    expect(sourceOf("https://www.google.co.uk/search?q=x")).toBe("Google");
    expect(sourceOf("https://latchkey.app/about", "latchkey.app")).toBe("Direct");
    expect(sourceOf("https://www.airbnb.co.uk/rooms/1")).toBe("airbnb.co.uk");
    expect(sourceOf("not a url")).toBe("Direct");
    expect(placeOf({ city: "Amersham", region: "England", country: "GB" })).toBe("Amersham, England, GB");
    expect(placeOf({})).toBe("Unknown");
  });

  it("groups by day, Monday weeks and months", () => {
    expect(periodKey("2026-10-14T22:00:00Z", "day")).toBe("2026-10-14");
    expect(periodKey("2026-10-14T22:00:00Z", "week")).toBe("2026-10-12");
    expect(periodKey("2026-10-12T00:00:00Z", "week")).toBe("2026-10-12");
    expect(periodKey("2026-10-18T23:00:00Z", "week")).toBe("2026-10-12");
    expect(periodKey("2026-10-14T22:00:00Z", "month")).toBe("2026-10-01");
    expect(duration(12_400)).toBe("12s");
    expect(duration(200_000)).toBe("3m 20s");
    expect(duration(3_840_000)).toBe("1h 4m");
  });
});

describe("the dashboard summary", () => {
  const visit = (id: string, visitorId: string, startedAt: string, extra: Partial<VisitIn> = {}): VisitIn => ({
    id,
    visitorId,
    startedAt,
    pages: 2,
    durationMs: 60_000,
    entryPath: "/",
    referrer: null,
    utmSource: null,
    ip: "81.2.69.160",
    country: "GB",
    region: "England",
    city: "London",
    isBot: false,
    ...extra,
  });
  const visitor = (id: string, profileId: string | null, extra: Partial<VisitorIn> = {}): VisitorIn => ({
    id,
    profileId,
    firstSeen: "2026-10-01T09:00:00Z",
    lastSeen: "2026-10-10T09:00:00Z",
    browser: "Chrome",
    os: "macOS",
    device: "Desktop",
    isBot: false,
    botReason: null,
    ...extra,
  });
  const profiles: ProfileIn[] = [
    { id: "P1", userId: "u1", email: "sam@example.com", hostId: null, knownAt: "2026-10-05T10:00:00Z", firstSeen: "2026-10-01T09:00:00Z", isTeam: false },
    { id: "P2", userId: "u2", email: "me@example.com", hostId: null, knownAt: "2026-09-01T00:00:00Z", firstSeen: "2026-09-01T00:00:00Z", isTeam: true },
  ];
  const input = {
    profiles,
    visitors: [
      visitor("phone", "P1", { browser: "Safari", os: "iOS", device: "Phone" }),
      visitor("laptop", "P1"),
      visitor("anon", null),
      visitor("crawler", null, { isBot: true, botReason: "Says it's bot" }),
      visitor("mine", "P2"),
    ],
    visits: [
      visit("a", "phone", "2026-10-01T09:00:00Z", { referrer: "https://www.google.com/" }),
      visit("b", "phone", "2026-10-01T15:00:00Z"),
      visit("c", "laptop", "2026-10-06T09:00:00Z", { ip: "81.2.69.161", city: "Amersham" }),
      visit("d", "anon", "2026-10-07T09:00:00Z", { utmSource: "newsletter" }),
      visit("e", "crawler", "2026-10-07T09:00:00Z"),
      visit("f", "mine", "2026-10-08T09:00:00Z"),
    ],
    views: [
      { visitId: "a", path: "/", title: null, at: "2026-10-01T09:00:00Z", durationMs: 10_000 },
      { visitId: "a", path: "/about", title: null, at: "2026-10-01T09:01:00Z", durationMs: 50_000 },
      { visitId: "c", path: "/", title: null, at: "2026-10-06T09:00:00Z", durationMs: 30_000 },
      { visitId: "e", path: "/", title: null, at: "2026-10-07T09:00:00Z", durationMs: 1 },
    ],
  };
  const all = { hideBots: true, hideTeam: false, who: "all" as const, search: "" };

  it("clubs one person's browsers and visits together", () => {
    const s = summarise(input, all, "day");
    const sam = s.rows.find((r) => r.label === "sam@example.com")!;
    expect(sam.visits).toBe(3);
    expect(sam.browsers).toBe(2);
    expect(sam.converted).toBe(true);
    expect(sam.clubs).toEqual([
      { period: "2026-10-06", visits: 1, pages: 2, ms: 60_000 },
      { period: "2026-10-01", visits: 2, pages: 4, ms: 120_000 },
    ]);
    expect(sam.places).toEqual(["London, England, GB", "Amersham, England, GB"]);
    expect(sam.ips).toHaveLength(2);
    expect(sam.devices).toEqual(["Safari · iOS · Phone", "Chrome · macOS · Desktop"]);
    expect(sam.sources).toEqual(["Google", "Direct"]);
    expect(summarise(input, all, "month").rows.find((r) => r.key === "p:P1")!.clubs).toEqual([{ period: "2026-10-01", visits: 3, pages: 6, ms: 180_000 }]);
  });

  it("hides bots and the team when asked, and filters people", () => {
    const s = summarise(input, all, "day");
    expect(s.botsHidden).toBe(1);
    expect(s.rows.some((r) => r.isBot)).toBe(false);
    expect(summarise(input, { ...all, hideBots: false }, "day").rows.some((r) => r.isBot)).toBe(true);
    expect(summarise(input, { ...all, hideTeam: true }, "day").rows.some((r) => r.isTeam)).toBe(false);
    expect(summarise(input, { ...all, who: "anonymous" }, "day").rows.map((r) => r.status)).toEqual(["anonymous"]);
    expect(summarise(input, { ...all, who: "converted" }, "day").rows.map((r) => r.label)).toEqual(["sam@example.com"]);
    expect(summarise(input, { ...all, search: "amersham" }, "day").rows.map((r) => r.label)).toEqual(["sam@example.com"]);
  });

  it("counts totals, pages and sources for the people shown", () => {
    const s = summarise(input, all, "day");
    expect(s.visits).toBe(5);
    expect(s.visitors).toBe(4);
    expect(s.people).toBe(3);
    expect(s.views).toBe(3);
    expect(s.pages[0]).toEqual({ path: "/", views: 2, visitors: 2, avgMs: 20_000 });
    expect(s.sources.find((x) => x.key === "newsletter")?.visits).toBe(1);
    expect(s.known).toBe(2);
    expect(s.converted).toBe(1);
    expect(s.devices.find((d) => d.key === "Phone")).toEqual({ key: "Phone", visits: 2, visitors: 1 });
  });
});
