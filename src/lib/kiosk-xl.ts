/**
 * The door tablet's XL experience: the check-in screens look like the
 * welcome and goodbye cards. The page takes the property's main colour, and
 * each step sits on a big bold card in the check-in card colour (the phone
 * panel in the check-out card colour), with readable ink, a strong outline
 * and pill buttons filled with the ink. The host picks Standard, XL or
 * automatic (theme.kioskLook); automatic follows Latchkey admin's default
 * (site_settings.kiosk_saver.experience). Pure; tested in tests/kiosk-xl.test.ts.
 */
import { cardEdge, cardInk } from "@/lib/checkout-goodbye";
import { mix } from "@/lib/theme";

export const KIOSK_LOOKS = ["standard", "xl"] as const;
export type KioskLook = (typeof KIOSK_LOOKS)[number];
export type KioskLookChoice = "auto" | KioskLook;

/** The look a door tablet shows: the host's choice, else Latchkey's default. */
export const resolveLook = (choice: KioskLookChoice, adminDefault: KioskLook): KioskLook =>
  choice === "auto" ? adminDefault : choice;

/** The theme colours for one card colour: the same ink and outline as the guest cards. */
export function cardVars(colour: string): Record<string, string> {
  const ink = cardInk(colour);
  const edge = cardEdge(colour);
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
    "--btn-bg": ink,
    "--btn-fg": colour,
    "--btn-image": "none",
    "--btn-border": ink,
  };
}

/** The page around the cards: the property's main colour with readable ink. */
export function pageVars(primary: string): Record<string, string> {
  const ink = cardInk(primary);
  return {
    "--background": primary,
    "--foreground": ink,
    "--muted": mix(primary, ink, 0.12),
    "--muted-foreground": mix(ink, primary, 0.22),
    "--border": mix(primary, ink, 0.35),
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
 * The colours as a style sheet for the kiosk (inside [data-kiosk-xl]): the
 * page, each step's card and the phone panel. Colours are checked hex values only.
 */
export function xlCss(o: { primary: string; cardIn: string; cardOut: string }): string {
  const hex = (v: string, d: string) => (/^#[0-9a-f]{6}$/i.test(v) ? v : d);
  const primary = hex(o.primary, "#183B2B");
  return [
    `[data-kiosk-xl]{${decl(pageVars(primary))}}`,
    `[data-kiosk-xl] [data-kiosk-flow] main{${decl(cardVars(hex(o.cardIn, "#F6E2A8")))}}`,
    `[data-kiosk-xl] [data-kiosk-flow] aside{${decl(cardVars(hex(o.cardOut, "#CFE3EC")))}}`,
  ].join("\n");
}
