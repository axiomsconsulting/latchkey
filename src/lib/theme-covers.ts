import heritage from "@/assets/covers/heritage.jpg";
import cotswold from "@/assets/covers/cotswold.jpg";
import midnight from "@/assets/covers/midnight.jpg";
import nordic from "@/assets/covers/nordic.jpg";
import seaside from "@/assets/covers/seaside.jpg";
import townhouse from "@/assets/covers/townhouse.jpg";
import grandCrimson from "@/assets/covers/grand-crimson.jpg";
import expressGreen from "@/assets/covers/express-green.jpg";
import palaceHeritage from "@/assets/covers/palace-heritage.jpg";
import desertStar from "@/assets/covers/desert-star.jpg";

/** A bundled cover photo per built-in template, used until the host uploads their own. */
const COVERS: Record<string, string> = {
  heritage,
  cotswold,
  midnight,
  nordic,
  seaside,
  townhouse,
  "grand-crimson": grandCrimson,
  "express-green": expressGreen,
  "palace-heritage": palaceHeritage,
  "desert-star": desertStar,
};

export function coverFor(theme: { coverImageUrl: string | null; presetId: string }): string | null {
  return theme.coverImageUrl || COVERS[theme.presetId] || null;
}
