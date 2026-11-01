/**
 * Express mode on door tablets (stored as kioskLook "xl"): the check-in and
 * check-out screens look like the welcome and goodbye cards, built from the
 * host's theme. The page is the theme's main colour (deepened when it's
 * light, so the cards stand out); each step sits on a big bold card in the
 * check-in card colour (the phone panel in the check-out card colour), with
 * readable ink and buttons filled with that ink. Corners, borders, shadows,
 * heading case, letter spacing, weight and icon lines all come from the
 * theme, made bolder; card colours the host hasn't picked are tints of the
 * theme's colours. The host picks Standard, Express or automatic
 * (theme.kioskLook); automatic follows Latchkey admin's default
 * (site_settings.kiosk_saver.experience). Pure; tested in tests/kiosk-xl.test.ts.
 */
import { cardEdge, cardInk } from "@/lib/checkout-goodbye";
import { PILL, luminance, mix, type ThemeConfig } from "@/lib/theme";

export const KIOSK_LOOKS = ["standard", "xl"] as const;
export type KioskLook = (typeof KIOSK_LOOKS)[number];
export type KioskLookChoice = "auto" | KioskLook;

/** The look a door tablet shows: the host's choice, else Latchkey's default. */
export const resolveLook = (choice: KioskLookChoice, adminDefault: KioskLook): KioskLook =>
  choice === "auto" ? adminDefault : choice;

/** What Express takes from the theme. */
export type ExpressTheme = Pick<
  ThemeConfig,
  | "primary"
  | "accent"
  | "background"
  | "radius"
  | "buttonRadius"
  | "buttonFill"
  | "buttonCase"
  | "cardStyle"
  | "headingCase"
  | "headingTracking"
  | "headingWeight"
  | "iconStroke"
>;

const hex = (v: string | null | undefined, d: string) =>
  typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v) ? v : d;

/**
 * The page behind the cards: a dark theme's own background, else the main
 * colour, deepened when it's too light for bold cards.
 */
export function expressPage(primary: string, background?: string | null): string {
  const bg = hex(background, "#ffffff");
  if (luminance(bg) < 0.06) return bg;
  const p = hex(primary, "#183B2B");
  return luminance(p) > 0.2 ? mix(p, "#000000", 0.55) : p;
}

/** The card colours: the host's own, else light tints of the theme's accent and main colour. */
export function expressCards(
  t: Pick<ExpressTheme, "primary" | "accent">,
  cardIn: string | null | undefined,
  cardOut: string | null | undefined,
): { cardIn: string; cardOut: string } {
  return {
    cardIn: hex(cardIn, mix(hex(t.accent, "#C8A24A"), "#ffffff", 0.62)),
    cardOut: hex(cardOut, mix(hex(t.primary, "#183B2B"), "#ffffff", 0.8)),
  };
}

const round = (n: number) => Math.round(n * 100) / 100;

/** The theme's shapes, made bolder for a screen read from a step away. */
export function expressShape(t: ExpressTheme): Record<string, string> {
  const r = Math.max(0, t.radius);
  const b = Math.max(0, t.buttonRadius);
  const weight = Math.min(900, Math.max(700, Math.round(t.headingWeight / 100) * 100 + 200));
  return {
    "--x-card-radius": r === 0 ? "0px" : `max(${round(r * 1.6)}rem, ${round(r * 2.6)}vmin)`,
    "--x-btn-radius": b >= PILL ? "9999px" : b === 0 ? "0px" : `${round(b * 1.5)}rem`,
    "--x-qr-radius": r === 0 ? "0px" : `max(${round(r)}rem, ${round(r * 1.4)}vmin)`,
    "--x-border-width":
      t.cardStyle === "flat"
        ? "0px"
        : t.cardStyle === "outline"
          ? "max(4px, 0.8vmin)"
          : "max(3px, 0.45vmin)",
    "--x-shadow":
      t.cardStyle === "flat"
        ? "none"
        : t.cardStyle === "shadow"
          ? "0 1.8vmin 4.5vmin rgb(0 0 0 / 0.34)"
          : "0 0.8vmin 2vmin rgb(0 0 0 / 0.2)",
    "--x-head-weight": String(weight),
    "--x-head-case": t.headingCase === "upper" ? "uppercase" : "none",
    "--x-head-variant": t.headingCase === "smallcaps" ? "small-caps" : "normal",
    "--x-head-tracking": `${round(Math.min(0.3, Math.max(0, t.headingTracking)))}em`,
    "--x-btn-case": t.buttonCase === "upper" ? "uppercase" : "none",
    "--x-btn-tracking": t.buttonCase === "upper" ? "0.06em" : "0em",
    "--x-icon-stroke": String(round(Math.min(3, Math.max(2.25, t.iconStroke + 0.5)))),
  };
}

/**
 * The theme colours for one card colour: the same ink and outline as the
 * guest cards. A theme with outline buttons keeps them outlined, in the ink.
 */
export function cardVars(
  colour: string,
  fill: ThemeConfig["buttonFill"] = "solid",
): Record<string, string> {
  const ink = cardInk(colour);
  const edge = cardEdge(colour);
  const outline = fill === "outline";
  return {
    "--card": colour,
    "--card-foreground": ink,
    "--foreground": ink,
    "--muted": mix(colour, ink, 0.06),
    "--muted-foreground": mix(ink, colour, 0.25),
    "--primary": ink,
    "--primary-foreground": colour,
    "--secondary": mix(colour, ink, 0.08),
    "--secondary-foreground": ink,
    "--accent": ink,
    "--accent-foreground": colour,
    "--border": edge,
    "--input": edge,
    "--ring": ink,
    "--card-border": edge,
    "--icon": ink,
    "--btn": ink,
    "--btn-bg": outline ? "transparent" : ink,
    "--btn-fg": outline ? ink : colour,
    "--btn-image": "none",
    "--btn-border": ink,
  };
}

/** The page around the cards (expressPage) with readable ink. */
export function pageVars(primary: string, background?: string | null): Record<string, string> {
  const page = expressPage(primary, background);
  const ink = cardInk(page);
  return {
    "--background": page,
    "--foreground": ink,
    "--muted": mix(page, ink, 0.12),
    "--muted-foreground": mix(ink, page, 0.22),
    "--border": mix(page, ink, 0.35),
    "--accent": ink,
    "--icon": ink,
    "--page-image": "none",
  };
}

const decl = (vars: Record<string, string>) =>
  Object.entries(vars)
    .map(([k, v]) => `${k}:${v}`)
    .join(";");

/**
 * Express as a style sheet for the kiosk (inside [data-kiosk-xl]): the
 * theme's shapes and the page, each step's card and the phone panel.
 * Colours are checked hex values only; shapes come from numbers and fixed words.
 */
export function xlCss(o: {
  theme: ExpressTheme;
  cardIn: string | null | undefined;
  cardOut: string | null | undefined;
}): string {
  const cards = expressCards(o.theme, o.cardIn, o.cardOut);
  const fill = o.theme.buttonFill;
  return [
    `[data-kiosk-xl]{${decl({ ...pageVars(o.theme.primary, o.theme.background), ...expressShape(o.theme) })}}`,
    `[data-kiosk-xl] [data-kiosk-flow] main{${decl(cardVars(cards.cardIn, fill))}}`,
    `[data-kiosk-xl] [data-kiosk-flow] aside{${decl(cardVars(cards.cardOut, fill))}}`,
  ].join("\n");
}
