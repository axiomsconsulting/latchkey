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

/** Bundled with the app (public/home): unDraw illustrations (free to use, no attribution needed), in Latchkey's colours. */
export const HOME_ART_LIBRARY: Array<Pick<HomeArtItem, "src" | "alt">> = [
  { src: "/home/host-greets-guest.svg", alt: "A host greeting a guest at the door" },
  { src: "/home/self-check-in.svg", alt: "Checking in with a phone" },
  { src: "/home/guests-arriving.svg", alt: "Two guests arriving with a suitcase and a map" },
  { src: "/home/at-the-door.svg", alt: "A guest arriving at the front door" },
  { src: "/home/guest-with-luggage.svg", alt: "A guest arriving with their luggage" },
];

export const DEFAULT_HOME_ART: HomeArtItem[] = [
  { id: "d1", src: "/home/host-greets-guest.svg", alt: "A host greeting a guest at the door", slot: "hero", side: "right", opacity: 0.85 },
  { id: "d2", src: "/home/self-check-in.svg", alt: "Checking in with a phone", slot: "journey", side: "left", opacity: 0.7 },
  { id: "d3", src: "/home/guests-arriving.svg", alt: "Two guests arriving with a suitcase and a map", slot: "audience", side: "right", opacity: 0.7 },
  { id: "d4", src: "/home/at-the-door.svg", alt: "A guest arriving at the front door", slot: "pricing", side: "left", opacity: 0.7 },
  { id: "d5", src: "/home/guest-with-luggage.svg", alt: "A guest arriving with their luggage", slot: "why", side: "right", opacity: 0.7 },
];

export const MAX_HOME_ART = 10;

/** Our own files, or an https image (an upload to Latchkey's storage). */
const okSrc = (s: unknown): s is string => typeof s === "string" && s.length <= 2000 && (/^\/home\/[a-z0-9-]+\.(svg|png|webp)$/.test(s) || /^https:\/\/[^\s"'<>]+$/.test(s));

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
