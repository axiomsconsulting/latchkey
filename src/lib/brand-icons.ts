/**
 * Which icon files show the site logo the super admin chose (Latchkey admin →
 * Brand): the installed app's icons, the home-screen icon and the browser tab.
 * The key's set lives in public/icons, the other marks' in public/brand/icons;
 * an uploaded logo is used as is; a letter is drawn as SVG by
 * /api/public/brand/icon. Pure.
 */
import type { Brand } from "./brand";

export type ManifestIcon = { src: string; sizes: string; type?: string; purpose?: string };

const SET = (mark: "key" | "arch" | "monogram") =>
  mark === "key"
    ? {
        small: "/icons/icon-192.png",
        large: "/icons/icon-512.png",
        maskable: "/icons/icon-maskable-512.png",
        apple: "/icons/apple-touch-icon.png",
      }
    : {
        small: `/brand/icons/${mark}-192.png`,
        large: `/brand/icons/${mark}-512.png`,
        maskable: `/brand/icons/${mark}-maskable-512.png`,
        apple: `/brand/icons/${mark}-apple.png`,
      };

export function appIcons(b: Pick<Brand, "logoMark" | "logoUrl">): ManifestIcon[] {
  if (b.logoUrl) return [{ src: b.logoUrl, sizes: "any", purpose: "any" }];
  if (b.logoMark === "initial")
    return [{ src: "/api/public/brand/icon", sizes: "any", type: "image/svg+xml", purpose: "any" }];
  const s = SET(b.logoMark);
  return [
    { src: s.small, sizes: "192x192", type: "image/png", purpose: "any" },
    { src: s.large, sizes: "512x512", type: "image/png", purpose: "any" },
    { src: s.maskable, sizes: "512x512", type: "image/png", purpose: "maskable" },
  ];
}

/** The small icon for app shortcuts and alerts. */
export function smallIcon(b: Pick<Brand, "logoMark" | "logoUrl">): string {
  return appIcons(b)[0]!.src;
}

/** iPhone and iPad home-screen icon (a PNG; a letter has none, so it uses the SVG). */
export function appleIcon(b: Pick<Brand, "logoMark" | "logoUrl">): string {
  if (b.logoUrl) return b.logoUrl;
  if (b.logoMark === "initial") return "/api/public/brand/icon";
  return SET(b.logoMark).apple;
}
