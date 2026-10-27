/**
 * The pictures on the home page (site_settings.home_art, migration 0058;
 * null = Latchkey's defaults): photos of guests arriving and hosts
 * welcoming them, each one a full-width background behind the headline or
 * a section, made faint so the words stay easy to read. How faint is the
 * super admin's choice (HomeArtStyle): transparency, a wash of the page's
 * own colour (dimming), a colour tint and how grey. Stored as a list (older
 * saves) or { items, style }. Pure.
 */

export const HOME_ART_SLOTS = [
  "hero",
  "benefits",
  "audience",
  "journey",
  "pillars",
  "beforeAfter",
  "pricing",
  "why",
  "next",
  "developers",
] as const;
export type HomeArtSlot = (typeof HOME_ART_SLOTS)[number];

export type HomeArtItem = {
  id: string;
  src: string;
  alt: string;
  slot: HomeArtSlot;
  side: "left" | "right";
  /** 0.1 to 1. */
  opacity: number;
};

/** Bundled with the app (public/home): Latchkey's own photos of guests arriving and settling in (no licence fees or credit needed). The older bundled illustrations were removed, so saved lists skip them. */
export const HOME_ART_LIBRARY: Array<Pick<HomeArtItem, "src" | "alt">> = [
  { src: "/home/guests-check-in.jpg", alt: "A happy couple checking in on the door tablet" },
  { src: "/home/arriving-at-door.jpg", alt: "A guest arriving at the guest house door" },
  { src: "/home/host-welcome.jpg", alt: "A host welcoming a family with their luggage" },
  { src: "/home/settled-in.jpg", alt: "A guest settled in, reading the stay guide on his phone" },
  { src: "/home/guest-house.jpg", alt: "An independent guest house front door" },
];

export const DEFAULT_HOME_ART: HomeArtItem[] = [
  {
    id: "d1",
    src: "/home/guests-check-in.jpg",
    alt: "A happy couple checking in on the door tablet",
    slot: "hero",
    side: "right",
    opacity: 1,
  },
  {
    id: "d2",
    src: "/home/settled-in.jpg",
    alt: "A guest settled in, reading the stay guide on his phone",
    slot: "journey",
    side: "left",
    opacity: 1,
  },
  {
    id: "d3",
    src: "/home/host-welcome.jpg",
    alt: "A host welcoming a family with their luggage",
    slot: "audience",
    side: "right",
    opacity: 1,
  },
  {
    id: "d4",
    src: "/home/guest-house.jpg",
    alt: "An independent guest house front door",
    slot: "pricing",
    side: "left",
    opacity: 1,
  },
  {
    id: "d5",
    src: "/home/arriving-at-door.jpg",
    alt: "A guest arriving at the guest house door",
    slot: "why",
    side: "right",
    opacity: 1,
  },
];

export const MAX_HOME_ART = 10;

/** Our own files, or an https image (an upload to Latchkey's storage). */
const okSrc = (s: unknown): s is string =>
  typeof s === "string" &&
  s.length <= 2000 &&
  (/^\/home\/[a-z0-9-]+\.(svg|png|webp|jpe?g)$/.test(s) || /^https:\/\/[^\s"'<>]+$/.test(s));

/** Photos get a rounded, framed look; illustrations float as before. */
export const isPhoto = (src: string) => !/\.svg$/i.test(src);

/** Stored value → the pictures to show; null or anything unreadable means the defaults. */
export function normaliseHomeArt(raw: unknown): HomeArtItem[] {
  if (raw && typeof raw === "object" && !Array.isArray(raw) && "items" in raw)
    return normaliseHomeArt((raw as { items: unknown }).items);
  if (!Array.isArray(raw)) return DEFAULT_HOME_ART;
  const out: HomeArtItem[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const v = r as Record<string, unknown>;
    if (!okSrc(v["src"]) || /^\/home\/.*\.svg$/.test(v["src"])) continue;
    const slot = HOME_ART_SLOTS.includes(v["slot"] as HomeArtSlot)
      ? (v["slot"] as HomeArtSlot)
      : "hero";
    const op =
      typeof v["opacity"] === "number" && Number.isFinite(v["opacity"])
        ? Math.min(1, Math.max(0.1, v["opacity"]))
        : 0.7;
    out.push({
      id:
        typeof v["id"] === "string" && /^[\w-]{1,40}$/.test(v["id"])
          ? v["id"]
          : `a${out.length + 1}`,
      src: v["src"],
      alt: typeof v["alt"] === "string" ? v["alt"].replace(/[<>]/g, "").trim().slice(0, 120) : "",
      slot,
      side: v["side"] === "left" ? "left" : "right",
      opacity: Math.round(op * 100) / 100,
    });
    if (out.length >= MAX_HOME_ART) break;
  }
  return out;
}

export type HomeArtStyle = {
  /** How much of the photo shows through: 0.05 (barely) to 0.6. */
  opacity: number;
  /** A wash of the page's own colour over the photo: 0 to 0.9. */
  dim: number;
  /** A colour laid over the photo (hex), or null for its own colours. */
  tint: string | null;
  /** How strongly the tint colours the photo: 0 to 1. */
  tintStrength: number;
  /** How much colour is taken out: 0 (full colour) to 1 (black and white). */
  grey: number;
};

export const DEFAULT_HOME_ART_STYLE: HomeArtStyle = {
  opacity: 0.22,
  dim: 0.35,
  tint: "#183b2b",
  tintStrength: 0.3,
  grey: 0.4,
};

const clamp = (v: unknown, lo: number, hi: number, fb: number) =>
  typeof v === "number" && Number.isFinite(v)
    ? Math.round(Math.min(hi, Math.max(lo, v)) * 100) / 100
    : fb;

export function normaliseHomeArtStyle(raw: unknown): HomeArtStyle {
  const r = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Record<
    string,
    unknown
  >;
  const d = DEFAULT_HOME_ART_STYLE;
  return {
    opacity: clamp(r["opacity"], 0.05, 0.6, d.opacity),
    dim: clamp(r["dim"], 0, 0.9, d.dim),
    tint:
      r["tint"] === null
        ? null
        : typeof r["tint"] === "string" && /^#[0-9a-f]{6}$/i.test(r["tint"])
          ? r["tint"].toLowerCase()
          : d.tint,
    tintStrength: clamp(r["tintStrength"], 0, 1, d.tintStrength),
    grey: clamp(r["grey"], 0, 1, d.grey),
  };
}

/**
 * The home page's boxes as frosted glass, iOS style: each keeps its own
 * colour as a light tint, lets the photo behind show through blurred, with
 * a bright edge. Off = solid boxes as before.
 */
export type HomeGlass = {
  on: boolean;
  /** How see-through a box is: 0 (solid) to 0.85. */
  clear: number;
  /** Blur of what's behind, in pixels: 0 to 40. */
  blur: number;
  /** Colour boost of what's behind: 1 (none) to 2. */
  saturate: number;
};

export const DEFAULT_HOME_GLASS: HomeGlass = { on: true, clear: 0.4, blur: 18, saturate: 1.6 };

export function normaliseHomeGlass(raw: unknown): HomeGlass {
  const r = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Record<
    string,
    unknown
  >;
  const d = DEFAULT_HOME_GLASS;
  return {
    on: typeof r["on"] === "boolean" ? r["on"] : d.on,
    clear: clamp(r["clear"], 0, 0.85, d.clear),
    blur: Math.round(clamp(r["blur"], 0, 40, d.blur)),
    saturate: clamp(r["saturate"], 1, 2, d.saturate),
  };
}

/** The CSS variables the home page's glass rule reads (styles.css, [data-home-glass]). */
export function glassVars(g: HomeGlass): Record<string, string> {
  return {
    "--glass-fill": `${Math.round((1 - g.clear) * 100)}%`,
    "--glass-blur": `${g.blur}px`,
    "--glass-sat": String(g.saturate),
  };
}

/** What's stored (a list from older saves, or { items, style, glass }) → the pictures, how faint they are, and the glass. */
export function normaliseHomeArtConfig(raw: unknown): {
  items: HomeArtItem[];
  style: HomeArtStyle;
  glass: HomeGlass;
} {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const r = raw as Record<string, unknown>;
    return {
      items: normaliseHomeArt(r["items"] ?? null),
      style: normaliseHomeArtStyle(r["style"]),
      glass: normaliseHomeGlass(r["glass"]),
    };
  }
  return { items: normaliseHomeArt(raw), style: DEFAULT_HOME_ART_STYLE, glass: DEFAULT_HOME_GLASS };
}

/** The pictures for one place on the page; the headline takes only one. */
export function artFor(items: HomeArtItem[], slot: HomeArtSlot): HomeArtItem[] {
  const here = items.filter((i) => i.slot === slot);
  // Each picture is a background: one per place.
  return here.slice(0, 1);
}
