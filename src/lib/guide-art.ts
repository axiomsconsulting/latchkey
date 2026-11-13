/**
 * The light picture behind each guide card (gallery view): the host's own for that section
 * (theme.guideArt, or "none"), else a bundled photo that suits it, else the theme's cover.
 * Off altogether with theme.guideArtOn false. Pure; tested in tests/guide-art.test.ts.
 */
import cotswold from "@/assets/covers/cotswold.jpg";
import heritage from "@/assets/covers/heritage.jpg";
import nordic from "@/assets/covers/nordic.jpg";
import seaside from "@/assets/covers/seaside.jpg";
import townhouse from "@/assets/covers/townhouse.jpg";

import { coverFor } from "./theme-covers";

/** Photos already served with the home page (public/home). */
const HOME = {
  door: "/home/arriving-at-door.jpg",
  house: "/home/guest-house.jpg",
  checkIn: "/home/guests-check-in.jpg",
  host: "/home/host-welcome.jpg",
  settled: "/home/settled-in.jpg",
};

/** A starting picture per kind of card. */
export const DEFAULT_ART: Record<string, string> = {
  getting_in: HOME.door,
  shoes: townhouse,
  room: HOME.settled,
  kitchenette: nordic,
  bathroom: seaside,
  parking: HOME.house,
  taxis: HOME.house,
  rules: cotswold,
  quiet: cotswold,
  unavailable: heritage,
  checkout: HOME.checkIn,
  contact: HOME.host,
  find_room: townhouse,
  property_info: HOME.house,
  local: HOME.house,
};

export function guideArtFor(
  key: string,
  theme: {
    guideArtOn?: boolean;
    guideArt?: Record<string, string>;
    coverImageUrl: string | null;
    presetId: string;
  },
): string | null {
  if (theme.guideArtOn === false) return null;
  const own = theme.guideArt?.[key];
  if (own === "none") return null;
  if (own) return own;
  return DEFAULT_ART[key] ?? coverFor(theme) ?? HOME.house;
}
