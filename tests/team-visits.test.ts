import { describe, expect, it } from "vitest";

import { isDevHost, summarise, teamVisits, type VisitIn, type VisitorIn } from "@/lib/analytics";

const visit = (o: Partial<VisitIn> & { id: string; visitorId: string }): VisitIn => ({
  startedAt: "2026-11-13T10:00:00Z",
  pages: 3,
  durationMs: 60_000,
  entryPath: "/",
  referrer: null,
  utmSource: null,
  ip: null,
  country: "GB",
  region: null,
  city: null,
  isBot: false,
  ...o,
});
const visitor = (o: Partial<VisitorIn> & { id: string }): VisitorIn => ({
  profileId: null,
  firstSeen: "2026-11-13T10:00:00Z",
  lastSeen: "2026-11-13T10:00:00Z",
  browser: "Chrome",
  os: "macOS",
  device: "Desktop",
  isBot: false,
  botReason: null,
  userAgent: "Mozilla/5.0 (Macintosh) Chrome/131",
  ...o,
});

describe("Latchkey team visits", () => {
  it("spots preview and local hosts, not the live site", () => {
    expect(isDevHost("localhost:5173")).toBe(true);
    expect(isDevHost("id-preview--abc.lovable.app")).toBe(true);
    expect(isDevHost("abc.lovableproject.com")).toBe(true);
    expect(isDevHost("latchkey.omsestates.uk")).toBe(false);
    expect(isDevHost("latchkey.lovable.app")).toBe(false);
  });

  it("names the tool, the account, previews, the connection and long sessions", () => {
    const input = {
      visitors: [
        visitor({ id: "a", userAgent: "Mozilla/5.0 Code/1.95.0 Chrome/128 Electron/32.2.1" }),
        visitor({ id: "b", profileId: "p1" }),
        visitor({ id: "c" }),
        visitor({ id: "d" }),
        visitor({ id: "e" }),
        visitor({ id: "f", profileId: "host" }),
      ],
      profiles: [
        {
          id: "p1",
          userId: "u",
          email: "me@x.uk",
          hostId: null,
          knownAt: null,
          firstSeen: "2026-11-01T00:00:00Z",
          isTeam: true,
        },
        {
          id: "host",
          userId: "h",
          email: "host@x.uk",
          hostId: "h1",
          knownAt: null,
          firstSeen: "2026-11-01T00:00:00Z",
          isTeam: false,
        },
      ],
      visits: [
        visit({ id: "1", visitorId: "a" }),
        visit({ id: "2", visitorId: "b", ipHash: "net1" }),
        visit({ id: "3", visitorId: "c", pageHost: "localhost:3000" }),
        visit({ id: "4", visitorId: "d", ipHash: "net1" }),
        visit({ id: "5", visitorId: "e", pages: 40, durationMs: 90 * 60_000 }),
        visit({ id: "6", visitorId: "f", ipHash: "net1", pages: 40, durationMs: 90 * 60_000 }),
      ],
      views: ["/app/today", "/kiosk/x", "/stay/t", "/book/x", "/room/y"].map((path) => ({
        visitId: "5",
        path,
        title: null,
        at: "2026-11-13T10:00:00Z",
        durationMs: 1,
      })),
    };
    const t = teamVisits(input);
    expect(t.get("1")).toBe("VS Code");
    expect(t.get("2")).toBe("Team account");
    expect(t.get("3")).toBe("Preview or local build");
    expect(t.get("4")).toBe("Team connection");
    expect(t.get("5")).toBe("Long testing session");
    expect(t.has("6")).toBe(false); // a host is never the team

    const s = summarise(input, { hideBots: true, hideTeam: true, who: "all", search: "" }, "day");
    expect(s.teamHidden).toBe(5);
    expect(s.rows.map((r) => r.key)).toEqual(["p:host"]);
    expect(s.team.find((x) => x.key === "VS Code")?.visits).toBe(1);
  });
});
