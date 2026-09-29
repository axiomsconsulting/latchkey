/**
 * Property theming: presets, font list, and conversion of a saved theme into
 * CSS custom properties. Pure and client-safe. Colour values chosen by hosts
 * are stored as hex and injected as the same tokens styles.css defines.
 */

export type LogoPreset = "key" | "arch" | "fern" | "knot" | "lantern" | "monogram";

export type ThemeConfig = {
  presetId: string;
  primary: string;
  accent: string;
  background: string;
  surface: string;
  foreground: string;
  headingFont: string;
  bodyFont: string;
  customFontUrl: string | null;
  customFontName: string | null;
  logoPreset: LogoPreset;
  logoUrl: string | null;
  radius: number; // rem
};

export type ThemePreset = ThemeConfig & { name: string; blurb: string };

const base = { customFontUrl: null, customFontName: null, logoUrl: null } as const;

export const THEME_PRESETS: ThemePreset[] = [
  {
    ...base,
    presetId: "heritage",
    name: "Boutique Heritage",
    blurb: "Forest green, cream and terracotta",
    primary: "#2f4f3a",
    accent: "#c2643c",
    background: "#f8f3ea",
    surface: "#fdfaf4",
    foreground: "#23332a",
    headingFont: "Fraunces",
    bodyFont: "Inter",
    logoPreset: "key",
    radius: 1,
  },
  {
    ...base,
    presetId: "cotswold",
    name: "Cotswold Stone",
    blurb: "Warm sand, slate and ochre",
    primary: "#3d4a57",
    accent: "#c58a2b",
    background: "#f4ede1",
    surface: "#fbf7f0",
    foreground: "#2a3038",
    headingFont: "Playfair Display",
    bodyFont: "Plus Jakarta Sans",
    logoPreset: "arch",
    radius: 0.75,
  },
  {
    ...base,
    presetId: "midnight",
    name: "Midnight Manor",
    blurb: "Oxford blue, linen and champagne",
    primary: "#1f2e4d",
    accent: "#b8955a",
    background: "#f3efe7",
    surface: "#fbf9f4",
    foreground: "#1b2336",
    headingFont: "DM Serif Display",
    bodyFont: "Outfit",
    logoPreset: "lantern",
    radius: 0.5,
  },
  {
    ...base,
    presetId: "nordic",
    name: "Nordic Sanctuary",
    blurb: "Sage, alabaster and charcoal",
    primary: "#56705f",
    accent: "#3b3b3b",
    background: "#f2f2ec",
    surface: "#fafaf6",
    foreground: "#2b2f2c",
    headingFont: "Syne",
    bodyFont: "Manrope",
    logoPreset: "fern",
    radius: 1.5,
  },
  {
    ...base,
    presetId: "seaside",
    name: "Seaside Guesthouse",
    blurb: "Harbour teal, sandstone and coral",
    primary: "#1f5f66",
    accent: "#e0765a",
    background: "#f5f1ea",
    surface: "#fcfaf6",
    foreground: "#1d3538",
    headingFont: "Cormorant Garamond",
    bodyFont: "Karla",
    logoPreset: "knot",
    radius: 1.25,
  },
  {
    ...base,
    presetId: "townhouse",
    name: "Modern Townhouse",
    blurb: "Ink, bone and brick red",
    primary: "#1e1e1e",
    accent: "#b3412f",
    background: "#f4f1ec",
    surface: "#ffffff",
    foreground: "#1e1e1e",
    headingFont: "Space Grotesk",
    bodyFont: "DM Sans",
    logoPreset: "monogram",
    radius: 0.375,
  },
];

export const DEFAULT_THEME: ThemeConfig = THEME_PRESETS[0]!;

/** Google Fonts the host can choose from. */
export const FONT_CHOICES = [
  "Fraunces",
  "Playfair Display",
  "DM Serif Display",
  "Cormorant Garamond",
  "Libre Baskerville",
  "Syne",
  "Space Grotesk",
  "Inter",
  "Plus Jakarta Sans",
  "Outfit",
  "Manrope",
  "Karla",
  "DM Sans",
  "Work Sans",
] as const;

const HEX = /^#[0-9a-f]{6}$/i;

/** Accepts anything from storage and returns a complete, safe theme. */
export function normaliseTheme(raw: unknown): ThemeConfig {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<ThemeConfig>;
  const preset = THEME_PRESETS.find((p) => p.presetId === r.presetId) ?? DEFAULT_THEME;
  const colour = (v: unknown, fb: string) => (typeof v === "string" && HEX.test(v) ? v : fb);
  const font = (v: unknown, fb: string) =>
    typeof v === "string" && /^[A-Za-z0-9 ]{2,40}$/.test(v) ? v : fb;
  const url = (v: unknown) => (typeof v === "string" && /^https:\/\//.test(v) ? v : null);
  const logo: LogoPreset[] = ["key", "arch", "fern", "knot", "lantern", "monogram"];
  return {
    presetId: preset.presetId,
    primary: colour(r.primary, preset.primary),
    accent: colour(r.accent, preset.accent),
    background: colour(r.background, preset.background),
    surface: colour(r.surface, preset.surface),
    foreground: colour(r.foreground, preset.foreground),
    headingFont: font(r.headingFont, preset.headingFont),
    bodyFont: font(r.bodyFont, preset.bodyFont),
    customFontUrl: url(r.customFontUrl),
    customFontName: r.customFontName ? font(r.customFontName, "") || null : null,
    logoPreset: logo.includes(r.logoPreset as LogoPreset) ? (r.logoPreset as LogoPreset) : preset.logoPreset,
    logoUrl: url(r.logoUrl),
    radius: typeof r.radius === "number" && r.radius >= 0 && r.radius <= 2 ? r.radius : preset.radius,
  };
}

/** Relative luminance, used to pick readable text on a colour. */
export function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0]! + 0.7152 * ch[1]! + 0.0722 * ch[2]!;
}

export function readableOn(hex: string): string {
  return luminance(hex) > 0.4 ? "#1c1c1c" : "#fdfbf7";
}

function mix(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const c = [16, 8, 0].map((sh) => {
    const x = (pa >> sh) & 255;
    const y = (pb >> sh) & 255;
    return Math.round(x + (y - x) * t);
  });
  return `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/** CSS variables that override the design tokens inside a themed area. */
export function themeVars(t: ThemeConfig): Record<string, string> {
  const heading = t.customFontName ?? t.headingFont;
  return {
    "--background": t.background,
    "--foreground": t.foreground,
    "--surface": t.surface,
    "--surface-foreground": t.foreground,
    "--card": t.surface,
    "--card-foreground": t.foreground,
    "--popover": t.surface,
    "--popover-foreground": t.foreground,
    "--primary": t.primary,
    "--primary-foreground": readableOn(t.primary),
    "--secondary": mix(t.background, t.primary, 0.08),
    "--secondary-foreground": t.primary,
    "--muted": mix(t.background, t.foreground, 0.05),
    "--muted-foreground": mix(t.foreground, t.background, 0.4),
    "--accent": t.accent,
    "--accent-foreground": readableOn(t.accent),
    "--border": mix(t.background, t.foreground, 0.13),
    "--input": mix(t.background, t.foreground, 0.13),
    "--ring": t.primary,
    "--sidebar": t.primary,
    "--sidebar-foreground": readableOn(t.primary),
    "--sidebar-primary": t.accent,
    "--sidebar-primary-foreground": readableOn(t.accent),
    "--sidebar-accent": mix(t.primary, readableOn(t.primary), 0.12),
    "--sidebar-accent-foreground": readableOn(t.primary),
    "--radius": `${t.radius}rem`,
    "--font-display": `"${heading}", ui-serif, Georgia, serif`,
    "--font-sans": `"${t.bodyFont}", ui-sans-serif, system-ui, sans-serif`,
  };
}

/** Google Fonts stylesheet URL for the chosen preset fonts. */
export function googleFontsHref(t: ThemeConfig): string {
  const fams = [...new Set([t.headingFont, t.bodyFont])]
    .filter((f) => (FONT_CHOICES as readonly string[]).includes(f))
    .map((f) => `family=${f.replace(/ /g, "+")}:wght@400;500;600;700`);
  return `https://fonts.googleapis.com/css2?${fams.join("&")}&display=swap`;
}

/** Short codes that clash with app pages can't be used as vanity links. */
export const RESERVED_SLUGS = new Set([
  "app", "auth", "api", "stay", "kiosk", "checkin", "p", "assets", "favicon.ico", "robots.txt",
]);
