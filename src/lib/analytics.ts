/**
 * Visitor analytics for the super admin: reading browsers and devices,
 * spotting bots, grouping visits by day, week or month, and the dashboard
 * summary. Pure, so it can be unit tested; the database does the matching.
 */

/* ------------------------------ the browser ------------------------------ */

export type Agent = {
  browser: string;
  os: string;
  device: "Desktop" | "Phone" | "Tablet" | "Bot" | "Unknown";
};

export function parseUserAgent(ua: string | null | undefined): Agent {
  const s = ua ?? "";
  if (!s) return { browser: "Unknown", os: "Unknown", device: "Unknown" };
  const browser = /Edg\//.test(s)
    ? "Edge"
    : /OPR\/|Opera/.test(s)
      ? "Opera"
      : /SamsungBrowser/.test(s)
        ? "Samsung Internet"
        : /Firefox\/|FxiOS/.test(s)
          ? "Firefox"
          : /CriOS|Chrome\//.test(s)
            ? "Chrome"
            : /Safari\//.test(s)
              ? "Safari"
              : "Other";
  const os = /iPhone|iPad|iPod/.test(s)
    ? "iOS"
    : /Android/.test(s)
      ? "Android"
      : /Windows/.test(s)
        ? "Windows"
        : /Mac OS X|Macintosh/.test(s)
          ? "macOS"
          : /CrOS/.test(s)
            ? "ChromeOS"
            : /Linux/.test(s)
              ? "Linux"
              : "Other";
  const device =
    /iPad|Tablet/.test(s) || (/Android/.test(s) && !/Mobile/.test(s))
      ? "Tablet"
      : /Mobi|iPhone|iPod/.test(s)
        ? "Phone"
        : "Desktop";
  return { browser, os, device };
}

const BOT_UA =
  /bot|crawl|spider|slurp|archiver|facebookexternalhit|embedly|preview|headless|phantom|puppeteer|playwright|selenium|lighthouse|pagespeed|gtmetrix|pingdom|uptime|monitor|curl|wget|python|httpclient|axios|node-fetch|go-http|java\/|okhttp|scrapy|feedfetcher|mediapartners|whatsapp|telegram|discord|slack|skypeuri|bingpreview/i;

/** Why a browser looks like a bot or crawler, or null for a person. */
export function botReason(
  ua: string | null | undefined,
  signals: { webdriver?: boolean; pagesInVisit?: number; secondsInVisit?: number } = {},
): string | null {
  const s = ua ?? "";
  if (!s.trim()) return "No browser name";
  const m = s.match(BOT_UA);
  if (m) return `Says it's ${m[0].toLowerCase()}`;
  if (signals.webdriver) return "Automated browser";
  // Dozens of pages in a minute or two isn't a person reading.
  if ((signals.pagesInVisit ?? 0) >= 40 && (signals.secondsInVisit ?? Infinity) < 120)
    return "Too many pages too fast";
  return null;
}

/** The site a visitor came from, without paths or query strings. */
export function sourceOf(referrer: string | null | undefined, ownHost?: string): string {
  if (!referrer) return "Direct";
  try {
    const host = new URL(referrer).hostname.replace(/^www\./, "");
    if (ownHost && host === ownHost.replace(/^www\./, "")) return "Direct";
    if (/google\./.test(host)) return "Google";
    if (/bing\.com$/.test(host)) return "Bing";
    if (/duckduckgo\.com$/.test(host)) return "DuckDuckGo";
    if (/(^|\.)facebook\.com$|fb\.me$/.test(host)) return "Facebook";
    if (/instagram\.com$/.test(host)) return "Instagram";
    if (/(^|\.)t\.co$|twitter\.com$|x\.com$/.test(host)) return "X";
    if (/linkedin\.com$|lnkd\.in$/.test(host)) return "LinkedIn";
    if (/chatgpt\.com$|openai\.com$/.test(host)) return "ChatGPT";
    if (/claude\.ai$/.test(host)) return "Claude";
    return host;
  } catch {
    return "Direct";
  }
}

/** One place, from the most to the least specific we know. */
export function placeOf(v: {
  city?: string | null;
  region?: string | null;
  country?: string | null;
}): string {
  return [v.city, v.region, v.country].filter(Boolean).join(", ") || "Unknown";
}

/* ------------------------------ the summary ------------------------------ */

export type Period = "day" | "week" | "month";

export type VisitIn = {
  id: string;
  visitorId: string;
  startedAt: string;
  pages: number;
  durationMs: number;
  entryPath: string | null;
  referrer: string | null;
  utmSource: string | null;
  ip: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  isBot: boolean;
  /** Migration 0111: the page's host (preview and local builds), and the one-day connection hash. */
  pageHost?: string | null | undefined;
  ipHash?: string | null | undefined;
};

export type VisitorIn = {
  id: string;
  profileId: string | null;
  firstSeen: string;
  lastSeen: string;
  browser: string | null;
  os: string | null;
  device: string | null;
  isBot: boolean;
  botReason: string | null;
  userAgent?: string | null | undefined;
};

export type ProfileIn = {
  id: string;
  userId: string | null;
  email: string | null;
  hostId: string | null;
  knownAt: string | null;
  firstSeen: string;
  isTeam: boolean;
};

export type ViewIn = {
  visitId: string;
  path: string;
  title: string | null;
  at: string;
  durationMs: number;
};

export type Filters = {
  hideBots: boolean;
  hideTeam: boolean;
  who: "all" | "known" | "anonymous" | "converted";
  search: string;
};

export type Club = { period: string; visits: number; pages: number; ms: number };

export type PersonRow = {
  key: string;
  label: string;
  status: "known" | "trial" | "anonymous";
  converted: boolean;
  knownAt: string | null;
  firstSeen: string;
  lastSeen: string;
  visits: number;
  pages: number;
  ms: number;
  clubs: Club[];
  places: string[];
  devices: string[];
  ips: string[];
  sources: string[];
  browsers: number;
  isBot: boolean;
  botReason: string | null;
  isTeam: boolean;
  /** Why it counts as the Latchkey team (teamVisits), e.g. "VS Code", "Team account". */
  teamReasons: string[];
  visitIds: string[];
};

export type Count = { key: string; visits: number; visitors: number };
export type PageCount = { path: string; views: number; visitors: number; avgMs: number };

/* ------------------------- the Latchkey team ------------------------- */

/** Tools the team builds and tests with, told apart by what their browsers call themselves. */
const TOOLS: Array<[RegExp, string]> = [
  [/\bCode\/[\d.]+.*Electron|VSCode|vscode-webview/i, "VS Code"],
  [/\bCursor\/[\d.]+/i, "Cursor"],
  [/Claude/i, "Claude"],
  [/Grok|xAI/i, "Grok"],
  [/Lovable/i, "Lovable"],
  [/ChatGPT|OpenAI/i, "ChatGPT"],
  [/HeadlessChrome|Playwright|Puppeteer|Cypress|Selenium/i, "Automated test browser"],
];

/** Hosts that are never the live site: local builds and Lovable's previews. */
export function isDevHost(host: string | null | undefined): boolean {
  if (!host) return false;
  const h = host.toLowerCase().replace(/:\d+$/, "");
  return (
    h === "localhost" ||
    /^127\.|^10\.|^192\.168\.|^\[?::1\]?$/.test(h) ||
    h.endsWith(".local") ||
    h.endsWith(".lovableproject.com") ||
    /^(id-)?preview--/.test(h) ||
    h.endsWith(".webcontainer.io") ||
    h.endsWith(".trycloudflare.com") ||
    h.endsWith(".ngrok-free.app") ||
    h.endsWith(".ngrok.io")
  );
}

/** A long working session across many parts of the app: testing, not a host or guest. */
export const DEV_SESSION = { pages: 25, minutes: 45, areas: 4 };

/** Which part of the app a path is: "app", "kiosk", "stay", "book", … */
export const areaOf = (path: string) => path.split(/[/?#]/)[1] || "home";

/**
 * Visits by the Latchkey team, with why: a super admin's account; a development tool's
 * browser (VS Code, Cursor, Claude, Grok, Lovable, an automated test browser); a preview or
 * local build; the same connection as a team account that day; or a long session across
 * many parts of the app by someone who isn't a host. Tools that only fetch pages (without
 * running them) never send visits, so they don't appear at all.
 */
export function teamVisits(input: {
  visits: VisitIn[];
  visitors: VisitorIn[];
  profiles: ProfileIn[];
  views: ViewIn[];
}): Map<string, string> {
  const visitors = new Map(input.visitors.map((v) => [v.id, v]));
  const profiles = new Map(input.profiles.map((p) => [p.id, p]));
  const profileOf = (visitorId: string) => {
    const pid = visitors.get(visitorId)?.profileId;
    return pid ? (profiles.get(pid) ?? null) : null;
  };
  const areas = new Map<string, Set<string>>();
  for (const v of input.views) {
    const a = areas.get(v.visitId) ?? new Set<string>();
    a.add(areaOf(v.path));
    areas.set(v.visitId, a);
  }
  const out = new Map<string, string>();
  const teamNets = new Set<string>();
  for (const x of input.visits) {
    const p = profileOf(x.visitorId);
    const ua = visitors.get(x.visitorId)?.userAgent ?? "";
    const tool = TOOLS.find(([re]) => re.test(ua))?.[1] ?? null;
    const reason = p?.isTeam
      ? "Team account"
      : tool
        ? tool
        : isDevHost(x.pageHost)
          ? "Preview or local build"
          : !p?.hostId &&
              x.pages >= DEV_SESSION.pages &&
              x.durationMs >= DEV_SESSION.minutes * 60_000 &&
              (areas.get(x.id)?.size ?? 0) >= DEV_SESSION.areas
            ? "Long testing session"
            : null;
    if (reason) {
      out.set(x.id, reason);
      if (x.ipHash && (p?.isTeam || tool)) teamNets.add(`${x.ipHash}|${x.startedAt.slice(0, 10)}`);
    }
  }
  // Anyone else on a team connection that day (the hash changes daily), unless they're a host.
  for (const x of input.visits) {
    if (out.has(x.id) || !x.ipHash || profileOf(x.visitorId)?.hostId) continue;
    if (teamNets.has(`${x.ipHash}|${x.startedAt.slice(0, 10)}`)) out.set(x.id, "Team connection");
  }
  return out;
}

export type Summary = {
  visitors: number;
  people: number;
  visits: number;
  views: number;
  avgVisitMs: number;
  converted: number;
  known: number;
  conversionPct: number;
  botsHidden: number;
  /** Team visits left out (hideTeam), and every team visit by why, whatever the filter. */
  teamHidden: number;
  team: Count[];
  pages: PageCount[];
  sources: Count[];
  places: Count[];
  devices: Count[];
  browsers: Count[];
  rows: PersonRow[];
};

/** The start of the day, ISO week (Monday) or month a time falls in, as YYYY-MM-DD. */
export function periodKey(iso: string, period: Period): string {
  const d = new Date(iso);
  const day = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  if (period === "month") return `${day.toISOString().slice(0, 7)}-01`;
  if (period === "week") day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7));
  return day.toISOString().slice(0, 10);
}

function tally(
  map: Map<string, { visits: number; visitors: Set<string> }>,
  key: string,
  visitor: string,
) {
  const t = map.get(key) ?? { visits: 0, visitors: new Set<string>() };
  t.visits++;
  t.visitors.add(visitor);
  map.set(key, t);
}

const ranked = (map: Map<string, { visits: number; visitors: Set<string> }>, n = 12): Count[] =>
  [...map.entries()]
    .map(([key, t]) => ({ key, visits: t.visits, visitors: t.visitors.size }))
    .sort((a, b) => b.visits - a.visits)
    .slice(0, n);

const uniq = (xs: Array<string | null | undefined>) => [
  ...new Set(xs.filter((x): x is string => !!x)),
];

/**
 * Everything the dashboard shows, for the visits in a period. A person is a
 * profile (every browser matched to them) or, until identified, one browser.
 */
export function summarise(
  input: {
    visits: VisitIn[];
    visitors: VisitorIn[];
    profiles: ProfileIn[];
    views: ViewIn[];
    ownHost?: string | undefined;
  },
  f: Filters,
  period: Period,
): Summary {
  const visitors = new Map(input.visitors.map((v) => [v.id, v]));
  const profiles = new Map(input.profiles.map((p) => [p.id, p]));
  const personOf = (visitorId: string) => {
    const v = visitors.get(visitorId);
    return v?.profileId && profiles.has(v.profileId) ? `p:${v.profileId}` : `v:${visitorId}`;
  };
  const team = teamVisits(input);
  // A team member's automated browser is the team testing, not a bot.
  const isBotVisit = (x: VisitIn) =>
    !team.has(x.id) && (x.isBot || !!visitors.get(x.visitorId)?.isBot);

  const people = new Map<string, PersonRow>();
  let botsHidden = 0;
  let teamHidden = 0;
  const search = f.search.trim().toLowerCase();

  for (const visit of input.visits) {
    const bot = isBotVisit(visit);
    if (bot && f.hideBots) {
      botsHidden++;
      continue;
    }
    const key = personOf(visit.visitorId);
    const v = visitors.get(visit.visitorId);
    const p = key.startsWith("p:") ? profiles.get(key.slice(2)) : undefined;
    const teamWhy = team.get(visit.id) ?? null;
    if (f.hideTeam && (p?.isTeam || teamWhy)) {
      teamHidden++;
      continue;
    }
    let row = people.get(key);
    if (!row) {
      const status: PersonRow["status"] = p?.email ? "known" : p ? "trial" : "anonymous";
      row = {
        key,
        label:
          p?.email ??
          (p ? "Trial user (no email yet)" : `Anonymous visitor ${visit.visitorId.slice(0, 6)}`),
        status,
        converted: !!p?.knownAt && Date.parse(p.firstSeen) < Date.parse(p.knownAt) - 60_000,
        knownAt: p?.knownAt ?? null,
        firstSeen: p?.firstSeen ?? v?.firstSeen ?? visit.startedAt,
        lastSeen: visit.startedAt,
        visits: 0,
        pages: 0,
        ms: 0,
        clubs: [],
        places: [],
        devices: [],
        ips: [],
        sources: [],
        browsers: 0,
        isBot: bot,
        botReason: v?.botReason ?? null,
        isTeam: !!p?.isTeam || !!teamWhy,
        teamReasons: [],
        visitIds: [],
      };
      people.set(key, row);
    }
    if (teamWhy) {
      row.isTeam = true;
      row.teamReasons = uniq([...row.teamReasons, teamWhy]);
      if (row.status === "anonymous") row.label = `Latchkey team (${row.teamReasons.join(", ")})`;
    }
    row.visits++;
    row.pages += visit.pages;
    row.ms += visit.durationMs;
    if (visit.startedAt > row.lastSeen) row.lastSeen = visit.startedAt;
    if (visit.startedAt < row.firstSeen) row.firstSeen = visit.startedAt;
    row.visitIds.push(visit.id);
    row.places = uniq([...row.places, placeOf(visit)]);
    row.ips = uniq([...row.ips, visit.ip]);
    row.sources = uniq([
      ...row.sources,
      visit.utmSource ?? sourceOf(visit.referrer, input.ownHost),
    ]);
    if (v)
      row.devices = uniq([...row.devices, [v.browser, v.os, v.device].filter(Boolean).join(" · ")]);
    const pk = periodKey(visit.startedAt, period);
    const club =
      row.clubs.find((c) => c.period === pk) ??
      (row.clubs.push({ period: pk, visits: 0, pages: 0, ms: 0 }),
      row.clubs[row.clubs.length - 1]!);
    club.visits++;
    club.pages += visit.pages;
    club.ms += visit.durationMs;
  }

  let rows = [...people.values()];
  for (const r of rows) {
    r.clubs.sort((a, b) => b.period.localeCompare(a.period));
    r.browsers = new Set(
      input.visits.filter((x) => personOf(x.visitorId) === r.key).map((x) => x.visitorId),
    ).size;
  }
  if (f.who === "known") rows = rows.filter((r) => r.status === "known");
  if (f.who === "anonymous") rows = rows.filter((r) => r.status !== "known");
  if (f.who === "converted") rows = rows.filter((r) => r.converted);
  if (search)
    rows = rows.filter((r) =>
      [r.label, ...r.places, ...r.ips, ...r.devices, ...r.sources].some((x) =>
        x.toLowerCase().includes(search),
      ),
    );
  rows.sort((a, b) => b.lastSeen.localeCompare(a.lastSeen));

  // Everything below counts only the people left after filtering.
  const keep = new Set(rows.flatMap((r) => r.visitIds));
  const kept = input.visits.filter((x) => keep.has(x.id));
  const sources = new Map<string, { visits: number; visitors: Set<string> }>();
  const places = new Map<string, { visits: number; visitors: Set<string> }>();
  const devices = new Map<string, { visits: number; visitors: Set<string> }>();
  const browsers = new Map<string, { visits: number; visitors: Set<string> }>();
  for (const x of kept) {
    const v = visitors.get(x.visitorId);
    tally(sources, x.utmSource ?? sourceOf(x.referrer, input.ownHost), x.visitorId);
    tally(
      places,
      x.country ? placeOf({ region: x.region, country: x.country }) : "Unknown",
      x.visitorId,
    );
    tally(devices, v?.device ?? "Unknown", x.visitorId);
    tally(browsers, v?.browser ?? "Unknown", x.visitorId);
  }
  const pageMap = new Map<string, { views: number; visitors: Set<string>; ms: number }>();
  const visitorOfVisit = new Map(kept.map((x) => [x.id, x.visitorId]));
  let views = 0;
  for (const view of input.views) {
    const who = visitorOfVisit.get(view.visitId);
    if (!who) continue;
    views++;
    const t = pageMap.get(view.path) ?? { views: 0, visitors: new Set<string>(), ms: 0 };
    t.views++;
    t.visitors.add(who);
    t.ms += view.durationMs;
    pageMap.set(view.path, t);
  }
  const pages = [...pageMap.entries()]
    .map(([path, t]) => ({
      path,
      views: t.views,
      visitors: t.visitors.size,
      avgMs: Math.round(t.ms / t.views),
    }))
    .sort((a, b) => b.views - a.views)
    .slice(0, 25);

  const known = rows.filter((r) => r.status === "known").length;
  const converted = rows.filter((r) => r.converted).length;
  const totalMs = kept.reduce((n, x) => n + x.durationMs, 0);
  return {
    visitors: new Set(kept.map((x) => x.visitorId)).size,
    people: rows.length,
    visits: kept.length,
    views,
    avgVisitMs: kept.length ? Math.round(totalMs / kept.length) : 0,
    converted,
    known,
    conversionPct: rows.length ? Math.round((converted / rows.length) * 1000) / 10 : 0,
    botsHidden,
    teamHidden,
    team: (() => {
      const by = new Map<string, { visits: number; visitors: Set<string> }>();
      for (const x of input.visits) {
        const why = team.get(x.id);
        if (why) tally(by, why, x.visitorId);
      }
      return ranked(by);
    })(),
    pages,
    sources: ranked(sources),
    places: ranked(places),
    devices: ranked(devices),
    browsers: ranked(browsers),
    rows,
  };
}

/** "1h 4m", "3m 20s", "12s". */
export function duration(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

/* --------------------------- funnel events ---------------------------- */

/** The launch funnel: the only events the browser may send (analytics_events, migration 0046). */
export const EVENT_NAMES = [
  "tour_view",
  "tour_complete",
  "demo_host_view",
  "trial_signup_started",
  "trial_signup_completed",
] as const;
export type EventName = (typeof EVENT_NAMES)[number];

export function isEventName(n: unknown): n is EventName {
  return typeof n === "string" && (EVENT_NAMES as readonly string[]).includes(n);
}

const UTM_FIELDS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const;
export type UtmFields = Partial<Record<(typeof UTM_FIELDS)[number], string>>;

/** utm_* from a beacon: an object (now) or a bare source string (older pages). Each up to 200 characters. */
export function cleanUtm(raw: unknown): UtmFields {
  if (typeof raw === "string")
    return raw.trim() && raw.length <= 200 ? { utm_source: raw.trim() } : {};
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out: UtmFields = {};
  for (const k of UTM_FIELDS) {
    const v = r[k];
    if (typeof v === "string" && v.trim() && v.length <= 200) out[k] = v.trim();
  }
  return out;
}

/** Extra details on an event: a flat object, at most 1 KB, or nothing. */
export function cleanProps(raw: unknown): Record<string, string | number | boolean> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>).slice(0, 20)) {
    if (!/^[a-z0-9_]{1,40}$/i.test(k)) continue;
    if (typeof v === "string") out[k] = v.slice(0, 200);
    else if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
    else if (typeof v === "boolean") out[k] = v;
  }
  return JSON.stringify(out).length <= 1024 ? out : {};
}

export type FunnelEvent = {
  name: string;
  visitor_id: string | null;
  utm_source: string | null;
  utm_campaign: string | null;
};
export type FunnelRow = {
  utmSource: string;
  utmCampaign: string;
  tourViews: number;
  tourCompletes: number;
  hostDemoViews: number;
  trialsStarted: number;
  trialsCompleted: number;
  /** Trials completed per visitor who saw either demo. */
  demoToTrial: number | null;
};

/** The funnel by source and campaign: distinct visitors at each step. */
export function funnelRows(events: FunnelEvent[]): FunnelRow[] {
  const groups = new Map<string, Map<string, Set<string>>>();
  for (const e of events) {
    if (!isEventName(e.name) || !e.visitor_id) continue;
    const key = `${e.utm_source || "(direct)"}\u0000${e.utm_campaign || "(none)"}`;
    const g = groups.get(key) ?? new Map<string, Set<string>>();
    const set = g.get(e.name) ?? new Set<string>();
    set.add(e.visitor_id);
    g.set(e.name, set);
    groups.set(key, g);
  }
  const rows: FunnelRow[] = [];
  for (const [key, g] of groups) {
    const [utmSource, utmCampaign] = key.split("\u0000") as [string, string];
    const n = (name: EventName) => g.get(name)?.size ?? 0;
    const sawDemo = new Set([...(g.get("tour_view") ?? []), ...(g.get("demo_host_view") ?? [])])
      .size;
    rows.push({
      utmSource,
      utmCampaign,
      tourViews: n("tour_view"),
      tourCompletes: n("tour_complete"),
      hostDemoViews: n("demo_host_view"),
      trialsStarted: n("trial_signup_started"),
      trialsCompleted: n("trial_signup_completed"),
      demoToTrial: sawDemo ? Math.round((n("trial_signup_completed") / sawDemo) * 1000) / 10 : null,
    });
  }
  return rows.sort((a, b) => b.trialsCompleted - a.trialsCompleted || b.tourViews - a.tourViews);
}
