/**
 * The pictures on the home page (site_settings.home_art, migration 0058;
 * null = Latchkey's defaults). Light, transparent-background illustrations
 * of guests arriving and hosts welcoming them: the main one beside the
 * headline from laptop width up, the rest in the side margins next to a
 * section on very wide screens only, never behind text. The super admin
 * adds, removes and moves them in Latchkey admin → Site settings. Pure.
 */

export const HOME_ART_SLOTS = ["hero", "benefits", "audience", "journey", "pillars", "beforeAfter", "pricing", "why", "next", "developers"] as const;
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

/** Bundled with the app (public/home): Latchkey's own photos of guests arriving and settling in (no licence fees or credit needed). The older illustrations stay valid for saved lists. */
export const HOME_ART_LIBRARY: Array<Pick<HomeArtItem, "src" | "alt">> = [
  { src: "/home/guests-check-in.jpg", alt: "A happy couple checking in on the door tablet" },
  { src: "/home/arriving-at-door.jpg", alt: "A guest arriving at the guest house door" },
  { src: "/home/host-welcome.jpg", alt: "A host welcoming a family with their luggage" },
  { src: "/home/settled-in.jpg", alt: "A guest settled in, reading the stay guide on his phone" },
  { src: "/home/guest-house.jpg", alt: "An independent guest house front door" },
];

export const DEFAULT_HOME_ART: HomeArtItem[] = [
  { id: "d1", src: "/home/guests-check-in.jpg", alt: "A happy couple checking in on the door tablet", slot: "hero", side: "right", opacity: 1 },
  { id: "d2", src: "/home/settled-in.jpg", alt: "A guest settled in, reading the stay guide on his phone", slot: "journey", side: "left", opacity: 1 },
  { id: "d3", src: "/home/host-welcome.jpg", alt: "A host welcoming a family with their luggage", slot: "audience", side: "right", opacity: 1 },
  { id: "d4", src: "/home/guest-house.jpg", alt: "An independent guest house front door", slot: "pricing", side: "left", opacity: 1 },
  { id: "d5", src: "/home/arriving-at-door.jpg", alt: "A guest arriving at the guest house door", slot: "why", side: "right", opacity: 1 },
];

export const MAX_HOME_ART = 10;

/** Our own files, or an https image (an upload to Latchkey's storage). */
const okSrc = (s: unknown): s is string => typeof s === "string" && s.length <= 2000 && (/^\/home\/[a-z0-9-]+\.(svg|png|webp|jpe?g)$/.test(s) || /^https:\/\/[^\s"'<>]+$/.test(s));

/** Photos get a rounded, framed look; illustrations float as before. */
export const isPhoto = (src: string) => !/\.svg$/i.test(src);

/** Stored value → the pictures to show; null or anything unreadable means the defaults. */
export function normaliseHomeArt(raw: unknown): HomeArtItem[] {
  if (!Array.isArray(raw)) return DEFAULT_HOME_ART;
  const out: HomeArtItem[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const v = r as Record<string, unknown>;
    if (!okSrc(v["src"])) continue;
    const slot = HOME_ART_SLOTS.includes(v["slot"] as HomeArtSlot) ? (v["slot"] as HomeArtSlot) : "hero";
    const op = typeof v["opacity"] === "number" && Number.isFinite(v["opacity"]) ? Math.min(1, Math.max(0.1, v["opacity"])) : 0.7;
    out.push({
      id: typeof v["id"] === "string" && /^[\w-]{1,40}$/.test(v["id"]) ? v["id"] : `a${out.length + 1}`,
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

/** The pictures for one place on the page; the headline takes only one. */
export function artFor(items: HomeArtItem[], slot: HomeArtSlot): HomeArtItem[] {
  const here = items.filter((i) => i.slot === slot);
  return slot === "hero" ? here.slice(0, 1) : here.slice(0, 2);
}
