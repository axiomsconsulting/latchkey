/**
 * The super admin's say over the app's shape, for every host:
 * - the menu: order, which items show, and their own extra items (a page in
 *   the app, or another site), each with an icon from the starter set or an
 *   uploaded one; "Latchkey admin" is always there for super admins;
 * - the sections of each page: order, and which show.
 * Stored in site_settings.ui (migration 0039). Pure, so the admin page, the
 * menu and the pages all agree (tests/ui-config.test.ts).
 */

/* ---------------------------------- menu ---------------------------------- */

export type NavBuiltIn = {
  id: string;
  to: string;
  /** Key in hostNav copy. */
  labelKey: string;
  icon: string;
  /** Can't be hidden or removed (only ever shown to super admins). */
  locked?: boolean;
  superOnly?: boolean;
};

/** The app's own menu items, in their default order. */
export const NAV_BUILT_INS: NavBuiltIn[] = [
  { id: "today", to: "/app/today", labelKey: "today", icon: "sun" },
  { id: "bookings", to: "/app/bookings", labelKey: "bookings", icon: "calendar-days" },
  { id: "housekeeping", to: "/app/housekeeping", labelKey: "housekeeping", icon: "spray-can" },
  { id: "services", to: "/app/services", labelKey: "services", icon: "wrench" },
  { id: "guides", to: "/app/guides", labelKey: "guides", icon: "book-open" },
  { id: "properties", to: "/app/properties", labelKey: "properties", icon: "home" },
  { id: "connections", to: "/app/connections", labelKey: "connections", icon: "plug" },
  { id: "direct", to: "/app/direct", labelKey: "direct", icon: "heart" },
  { id: "reports", to: "/app/reports", labelKey: "reports", icon: "chart-column" },
  { id: "settings", to: "/app/settings", labelKey: "settings", icon: "settings" },
  { id: "admin", to: "/app/admin", labelKey: "admin", icon: "shield-check", locked: true, superOnly: true },
];

export type NavEntry = {
  id: string;
  hidden?: boolean;
  /** Super admin's own items: */
  label?: string;
  href?: string;
  icon?: string;
  /** An uploaded icon: a small PNG data URL. */
  iconUrl?: string;
  /** Show the uploaded icon in its own colours (else tinted like the rest of the menu). */
  iconColour?: boolean;
};

export type NavItemResolved = {
  id: string;
  label: string;
  href: string;
  external: boolean;
  icon: string;
  iconUrl: string | null;
  iconColour: boolean;
  builtIn: boolean;
  locked: boolean;
  superOnly: boolean;
};

export const MAX_CUSTOM_ITEMS = 12;
export const MAX_ICON_DATA_URL = 40_000;

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** A link a menu item may go to: a page in this app ("/app/…"), or an https site. */
export function cleanHref(raw: unknown): string | null {
  const s = str(raw, 500);
  if (/^\/(?!\/)[^\s]*$/.test(s)) return s;
  try {
    const u = new URL(s);
    return u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/** The stored menu, made safe: every built-in item present once (new ones at the end), admin always shown. */
export function normaliseNav(raw: unknown): NavEntry[] {
  const list = Array.isArray(raw) ? raw : [];
  const builtIns = new Map(NAV_BUILT_INS.map((b) => [b.id, b]));
  const out: NavEntry[] = [];
  const seen = new Set<string>();
  let custom = 0;
  for (const r of list) {
    if (!r || typeof r !== "object") continue;
    const e = r as Record<string, unknown>;
    const id = str(e["id"], 60);
    if (!id || seen.has(id)) continue;
    const b = builtIns.get(id);
    if (b) {
      seen.add(id);
      out.push({ id, ...(e["hidden"] === true && !b.locked ? { hidden: true } : {}) });
      continue;
    }
    if (!id.startsWith("custom_") || custom >= MAX_CUSTOM_ITEMS) continue;
    const href = cleanHref(e["href"]);
    const label = str(e["label"], 30);
    if (!href || !label) continue;
    const iconUrl = typeof e["iconUrl"] === "string" && /^data:image\/(png|svg\+xml|webp);base64,/.test(e["iconUrl"]) && e["iconUrl"].length <= MAX_ICON_DATA_URL ? e["iconUrl"] : undefined;
    custom++;
    seen.add(id);
    out.push({
      id,
      label,
      href,
      icon: str(e["icon"], 40) || "link",
      ...(iconUrl ? { iconUrl } : {}),
      ...(iconUrl && e["iconColour"] === true ? { iconColour: true } : {}),
      ...(e["hidden"] === true ? { hidden: true } : {}),
    });
  }
  // Built-ins the admin hasn't placed (new ones in a later release) join their default neighbours:
  // straight after the built-in that comes before them, or at the end.
  for (const [i, b] of NAV_BUILT_INS.entries()) {
    if (seen.has(b.id)) continue;
    const before = NAV_BUILT_INS.slice(0, i).reverse().find((x) => seen.has(x.id));
    const at = before ? out.findIndex((e) => e.id === before.id) + 1 : out.length;
    out.splice(at, 0, { id: b.id });
    seen.add(b.id);
  }
  return out;
}

/** The menu someone sees: in order, hidden ones left out, admin only for super admins. */
export function resolveNav(entries: NavEntry[], labels: Record<string, string>, opts: { superAdmin: boolean; includeHidden?: boolean }): NavItemResolved[] {
  const builtIns = new Map(NAV_BUILT_INS.map((b) => [b.id, b]));
  return entries
    .map((e): NavItemResolved | null => {
      const b = builtIns.get(e.id);
      if (b) {
        if (b.superOnly && !opts.superAdmin) return null;
        if (e.hidden && !opts.includeHidden) return null;
        return { id: b.id, label: labels[b.labelKey] ?? b.id, href: b.to, external: false, icon: b.icon, iconUrl: null, iconColour: false, builtIn: true, locked: !!b.locked, superOnly: !!b.superOnly };
      }
      if (e.hidden && !opts.includeHidden) return null;
      const href = e.href ?? "/";
      return {
        id: e.id,
        label: e.label ?? "",
        href,
        external: /^https:/.test(href),
        icon: e.icon ?? "link",
        iconUrl: e.iconUrl ?? null,
        iconColour: !!e.iconColour,
        builtIn: false,
        locked: false,
        superOnly: false,
      };
    })
    .filter((x): x is NavItemResolved => x !== null);
}

/* --------------------------------- pages --------------------------------- */

export type PageSection = { id: string; label: string; locked?: boolean };

/** The pages whose sections the super admin can arrange, with their sections in default order. */
export const PAGES: Record<string, { label: string; sections: PageSection[] }> = {
  home: {
    label: "Home page",
    sections: [
      { id: "benefits", label: "Three outcomes" },
      { id: "audience", label: "Who it's for" },
      { id: "journey", label: "The guest journey" },
      { id: "pillars", label: "Four pillars" },
      { id: "beforeAfter", label: "Before and with" },
      { id: "why", label: "Booking platforms vs Latchkey" },
      { id: "next", label: "On the way" },
      { id: "pricing", label: "Pricing" },
      { id: "developers", label: "For developers" },
    ],
  },
  today: {
    label: "Today",
    sections: [
      { id: "guests", label: "Guests" },
      { id: "messages", label: "Guest messages" },
      { id: "leaving", label: "Leaving (invoices)" },
      { id: "requests", label: "Waiting on you" },
      { id: "cleaning", label: "Cleaning" },
      { id: "maintenance", label: "Maintenance" },
      { id: "connections", label: "Calendar links" },
      { id: "guide", label: "Stay guide" },
      { id: "arrivalGuides", label: "Today's arrivals: guide links" },
      { id: "kiosk", label: "Kiosk" },
      { id: "welcome", label: "Guest welcome on the kiosk" },
      { id: "settings", label: "Useful settings" },
      { id: "reviews", label: "Guest reviews" },
    ],
  },
  settings: {
    label: "Settings",
    // Grouped like the Settings menu tabs (settingsMenuCopy): business, guests, money, look, alerts and apps.
    sections: [
      { id: "business", label: "Business details" },
      { id: "group", label: "Group brand" },
      { id: "team", label: "Team" },
      { id: "support", label: "Support access" },
      { id: "domain", label: "Own web address" },
      { id: "messages", label: "Booking-site messages" },
      { id: "labels", label: "Booking sites" },
      { id: "checkin", label: "How guests check in" },
      { id: "records", label: "Who's staying and ID records" },
      { id: "privacy", label: "Privacy" },
      { id: "extras", label: "Extras price list" },
      { id: "payments", label: "Card payments" },
      { id: "invoices", label: "Invoices" },
      { id: "theme", label: "Look and feel" },
      { id: "kioskRest", label: "Screen saver" },
      { id: "alerts", label: "Alerts" },
      { id: "api", label: "API & MCP" },
      { id: "shortcuts", label: "Subscription shortcut (phones)" },
      { id: "shortcuts2", label: "Register and activity shortcuts (phones)" },
      { id: "adminLink", label: "Latchkey admin link", locked: true },
      { id: "demo", label: "Sample data (owners can remove)" },
    ],
  },
};

export type PageLayout = { order: string[]; hidden: string[] };
export type PageLayouts = Record<string, PageLayout>;

/** Stored page layouts, made safe: known sections only, new ones at the end, locked ones never hidden. */
export function normaliseLayouts(raw: unknown): PageLayouts {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out: PageLayouts = {};
  for (const [page, def] of Object.entries(PAGES)) {
    const p = (r[page] && typeof r[page] === "object" ? r[page] : {}) as Record<string, unknown>;
    const ids = def.sections.map((s) => s.id);
    const known = new Set(ids);
    const order = [...new Set((Array.isArray(p["order"]) ? p["order"] : []).filter((x): x is string => typeof x === "string" && known.has(x)))];
    // Sections the admin hasn't placed (new ones in a later release) join their default neighbours:
    // straight after the section that comes before them by default, or before the one after them.
    for (const [i, id] of ids.entries()) {
      if (order.includes(id)) continue;
      const before = ids.slice(0, i).reverse().find((x) => order.includes(x));
      if (before) {
        order.splice(order.indexOf(before) + 1, 0, id);
        continue;
      }
      const after = ids.slice(i + 1).find((x) => order.includes(x));
      order.splice(after ? order.indexOf(after) : order.length, 0, id);
    }
    const locked = new Set(def.sections.filter((s) => s.locked).map((s) => s.id));
    const hidden = [...new Set((Array.isArray(p["hidden"]) ? p["hidden"] : []).filter((x): x is string => typeof x === "string" && known.has(x) && !locked.has(x)))];
    out[page] = { order, hidden };
  }
  return out;
}

/** Ids in the admin's order with hidden ones left out; ids the page doesn't register keep their place at the end. */
export function arrange(layout: PageLayout | undefined, ids: string[]): string[] {
  if (!layout) return ids;
  const hidden = new Set(layout.hidden);
  const ordered = layout.order.filter((id) => ids.includes(id) && !hidden.has(id));
  const rest = ids.filter((id) => !layout.order.includes(id) && !hidden.has(id));
  return [...ordered, ...rest];
}

export type UiConfig = { nav: NavEntry[]; pages: PageLayouts };

export function normaliseUi(raw: unknown): UiConfig {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return { nav: normaliseNav(r["nav"]), pages: normaliseLayouts(r["pages"]) };
}
