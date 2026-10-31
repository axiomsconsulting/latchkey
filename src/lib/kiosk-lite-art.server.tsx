/**
 * The full kiosk's pictures as plain SVG for older door tablets (the
 * enhanced level of /lite/<code>, kiosk-lite.server.ts): the same icons,
 * logo mark, line art and corner flourishes, drawn once on the server with
 * the theme's colours written in (old browsers can't read CSS variables),
 * so the page looks like the kiosk without running the app.
 */
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";
import {
  ArrowLeft,
  Bell,
  Camera,
  Check,
  LogOut,
  Maximize,
  Minimize,
  Moon,
  Smartphone,
  Sun,
  Sunrise,
  Sunset,
  X,
} from "lucide-react";

import { PhoneQrIcon } from "@/components/guest/CheckInQr";
import { NAV_ICONS } from "@/components/NavIcon";
import { Flourish, ThemeArtSvg } from "@/components/theme/ThemeDecor";
import { LogoMark } from "@/components/theme/LogoMark";
import type { ThemeConfig } from "@/lib/theme";

/** Markup with the theme's accent written in (presentation attributes can't use var() on old browsers). */
function draw(node: ReactElement, accent: string): string {
  try {
    return renderToStaticMarkup(node).replace(/var\(--accent\)/g, accent);
  } catch {
    return "";
  }
}

const ICONS = {
  bell: Bell,
  camera: Camera,
  check: Check,
  back: ArrowLeft,
  close: X,
  leave: LogOut,
  full: Maximize,
  unfull: Minimize,
  phone: Smartphone,
  dawn: Sunrise,
  morning: Sunrise,
  midday: Sun,
  afternoon: Sun,
  dusk: Sunset,
  evening: Sunset,
  night: Moon,
};
const DAY = new Set(["dawn", "morning", "midday", "afternoon", "dusk", "evening", "night"]);

/** The icons the page uses, in the theme's line weight (the day icons thin, as on the kiosk). */
export function liteIcons(
  t: ThemeConfig,
  accent: string,
): Record<keyof typeof ICONS | "phoneQr", string> {
  const out = { phoneQr: draw(<PhoneQrIcon />, accent) } as Record<
    keyof typeof ICONS | "phoneQr",
    string
  >;
  for (const [k, Icon] of Object.entries(ICONS) as Array<[keyof typeof ICONS, typeof Bell]>)
    out[k] = draw(<Icon strokeWidth={DAY.has(k) ? 1.5 : t.iconStroke} aria-hidden />, accent);
  return out;
}

/** One of the theme's feature icons (NAV_ICONS key). */
export function liteFeatureIcon(t: ThemeConfig, key: string, accent: string): string {
  const Icon = NAV_ICONS[key] ?? NAV_ICONS["sparkles"]!;
  return draw(<Icon strokeWidth={t.iconStroke} aria-hidden />, accent);
}

/** The property's logo mark as the kiosk shows it (uploaded logo, preset mark or monogram). */
export function liteLogo(t: ThemeConfig, name: string, accent: string): string {
  return draw(<LogoMark theme={t} name={name} />, accent);
}

/** The theme's line drawing (or nothing). */
export function liteArt(t: ThemeConfig, accent: string): string {
  if (t.artwork === "none") return "";
  return draw(<ThemeArtSvg artwork={t.artwork} />, accent);
}

/** One corner flourish of an ornate frame (top left; the page mirrors it for the others). */
export function liteFlourish(accent: string): string {
  return draw(<Flourish />, accent);
}
