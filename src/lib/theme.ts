/**
 * Property theming: presets, font list, and conversion of a saved theme into
 * CSS custom properties. Pure and client-safe. Colour values chosen by hosts
 * are stored as hex and injected as the same tokens styles.css defines.
 */

/**
 * "site" = the site logo the super admin chose (Latchkey admin → Brand), used
 * until the host picks their own; "antique-key", "portico" and "serif-l" are
 * Latchkey's own marks drawn in the host's colours.
 */
export type LogoPreset =
  | "site"
  | "antique-key"
  | "portico"
  | "serif-l"
  | "key"
  | "arch"
  | "fern"
  | "knot"
  | "lantern"
  | "monogram"
  | "sunburst"
  | "crest"
  | "leaf";

export const LOGO_PRESETS: LogoPreset[] = [
  "site",
  "antique-key",
  "portico",
  "serif-l",
  "key",
  "arch",
  "fern",
  "knot",
  "lantern",
  "monogram",
  "sunburst",
  "crest",
  "leaf",
];

export type Artwork = "none" | "skyline" | "palace" | "dunes" | "coast" | "hills";
export const ARTWORKS: Artwork[] = ["none", "skyline", "palace", "dunes", "coast", "hills"];

export type ThemeFeature = { icon: string; text: string };

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
  /** Guest pages only, set by the server (src/lib/group-brand.ts): "Part of {group}", when the host shows it. Never stored. */
  group?: { name: string; logoUrl: string | null; logoPreset: LogoPreset };
  /** Cards, panels and tiles (rem, 0 = square). */
  radius: number;
  /** Buttons (rem, 0 = square, PILL = fully round). */
  buttonRadius: number;
  buttonFill: "solid" | "gradient" | "outline";
  buttonColour: "primary" | "accent";
  buttonCase: "normal" | "upper";
  cardStyle: "shadow" | "outline" | "flat";
  headingCase: "normal" | "upper" | "smallcaps";
  /** Letter spacing for headings, in em (0–0.3). */
  headingTracking: number;
  headingWeight: number;
  /** Icon line weight (1–2.75) and colour, with an optional circle or square behind. */
  iconStroke: number;
  iconTone: "primary" | "accent" | "foreground";
  iconFrame: "none" | "circle" | "square";
  backgroundStyle: "plain" | "gradient";
  frame: "none" | "line" | "ornate";
  artwork: Artwork;
  artworkOpacity: number;
  /** The property's name on a band of its main colour across the top of guest pages. */
  headerBand: boolean;
  coverImageUrl: string | null;
  /** Welcome screens: name and logo centred above the welcome, or to the left. */
  layout: "left" | "centred";
  /** Words: a line under the name ("St James's"), a small heading above the welcome, the welcome itself ({property} for the name), a footer line, two side notes, up to three short features. */
  subname: string;
  eyebrow: string;
  welcomeTitle: string;
  welcomeBody: string;
  tagline: string;
  sideNotes: [string, string];
  features: ThemeFeature[];
  /** "Powered by <product>" at the foot of guest pages. */
  poweredBy: boolean;
  /** Door tablets: buttons as designed, or expanded to fill the screen for big, easy-to-press targets. */
  kioskTouch: "standard" | "expanded";
};

/** buttonRadius for fully round ("pill") buttons. */
export const PILL = 9;

export type ThemePreset = ThemeConfig & { name: string; blurb: string };

/** What every preset starts from: today's look, with nothing extra. */
const base = {
  customFontUrl: null,
  customFontName: null,
  logoUrl: null,
  buttonFill: "solid",
  buttonColour: "primary",
  buttonCase: "normal",
  cardStyle: "shadow",
  headingCase: "normal",
  headingTracking: 0,
  headingWeight: 500,
  iconStroke: 2,
  iconTone: "primary",
  iconFrame: "none",
  backgroundStyle: "plain",
  frame: "none",
  artwork: "none",
  artworkOpacity: 0.14,
  headerBand: false,
  coverImageUrl: null,
  layout: "left",
  subname: "",
  eyebrow: "",
  welcomeTitle: "",
  welcomeBody: "",
  tagline: "",
  sideNotes: ["", ""],
  features: [],
  poweredBy: false,
  kioskTouch: "standard",
} as const satisfies Partial<ThemeConfig>;

type Preset = Omit<ThemePreset, keyof typeof base | "buttonRadius" | "sideNotes" | "features"> &
  Partial<Omit<ThemePreset, "sideNotes" | "features">> & {
    sideNotes?: [string, string];
    features?: ThemeFeature[];
  };
const preset = (p: Preset): ThemePreset =>
  ({ ...base, sideNotes: ["", ""], features: [], buttonRadius: p.radius, ...p }) as ThemePreset;

export const THEME_PRESETS: ThemePreset[] = [
  preset({
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
  }),

  // Hotel-grade templates: whole looks (shape, type, icons, backdrop, words), start points any host can pick and adjust.
  preset({
    presetId: "grand-crimson",
    name: "Grand Crimson",
    blurb: "International luxury: crimson and linen, centred crest, square corners",
    primary: "#a50d36",
    accent: "#1e2229",
    background: "#f8f6f3",
    surface: "#ffffff",
    foreground: "#16181d",
    headingFont: "Libre Caslon Text",
    bodyFont: "Lato",
    logoPreset: "monogram",
    radius: 0,
    buttonRadius: 0,
    cardStyle: "outline",
    headingWeight: 400,
    iconStroke: 1.5,
    iconTone: "foreground",
    layout: "centred",
    subname: "Mayfair",
    welcomeTitle: "Welcome to {property}",
    welcomeBody: "Check yourself in, find your room and ask for anything you need.",
    poweredBy: true,
  }),
  preset({
    presetId: "express-green",
    name: "Express Green",
    blurb: "Friendly and bright: green, navy and fresh white, round buttons, city skyline",
    primary: "#00754a",
    accent: "#0b2550",
    background: "#ffffff",
    surface: "#ffffff",
    foreground: "#0b2550",
    headingFont: "Nunito Sans",
    bodyFont: "Nunito Sans",
    logoPreset: "leaf",
    radius: 1.25,
    buttonRadius: PILL,
    cardStyle: "flat",
    headingWeight: 800,
    iconStroke: 1.75,
    iconFrame: "circle",
    artwork: "skyline",
    artworkOpacity: 0.12,
    subname: "Oxford Central",
    eyebrow: "",
    welcomeTitle: "Hello! Let's get you checked in",
    welcomeBody: "First letter of your surname to begin.",
    tagline: "A brighter stay ahead",
    features: [
      { icon: "leaf", text: "Comfortable stays" },
      { icon: "users", text: "Greener tomorrows" },
      { icon: "map-pin", text: "Right in the heart of town" },
    ],
    poweredBy: true,
  }),
  preset({
    presetId: "palace-heritage",
    name: "Palace Heritage",
    blurb: "Royal heritage: midnight blue and gold, ornate frame, palace line art",
    primary: "#c9a35a",
    accent: "#c9a35a",
    background: "#0d233a",
    surface: "#13304d",
    foreground: "#f4ecdc",
    headingFont: "Cinzel",
    bodyFont: "Lato",
    logoPreset: "crest",
    radius: 0.5,
    buttonRadius: 0.5,
    buttonFill: "gradient",
    buttonCase: "upper",
    cardStyle: "outline",
    headingCase: "upper",
    headingTracking: 0.06,
    headingWeight: 500,
    iconStroke: 1.25,
    iconTone: "accent",
    backgroundStyle: "gradient",
    frame: "ornate",
    artwork: "palace",
    artworkOpacity: 0.18,
    layout: "centred",
    subname: "St James's",
    welcomeTitle: "Welcome, your stay awaits",
    welcomeBody: "Tap to begin your arrival",
    sideNotes: [
      "History · Hospitality · A brighter tomorrow",
      "London · Heritage · Always a place",
    ],
    poweredBy: true,
  }),
  preset({
    presetId: "desert-star",
    name: "Desert Star",
    blurb: "Grand residence: mahogany and saffron, brand band, square corners",
    primary: "#4a1521",
    accent: "#e09a12",
    background: "#fbf7f0",
    surface: "#fffdf8",
    foreground: "#2a1016",
    headingFont: "Marcellus",
    bodyFont: "Mulish",
    logoPreset: "sunburst",
    radius: 0,
    buttonRadius: 0,
    buttonColour: "accent",
    buttonCase: "upper",
    cardStyle: "outline",
    headingWeight: 400,
    iconStroke: 1.75,
    iconTone: "accent",
    artwork: "dunes",
    artworkOpacity: 0.1,
    headerBand: true,
    subname: "Residency",
    eyebrow: "Welcome",
    welcomeTitle: "Your stay at {property}",
    welcomeBody: "Everything you need for a comfortable and memorable stay.",
    tagline: "A brighter stay awaits",
    poweredBy: true,
  }),
  // The sixth: contemporary and dark, nothing like the five above (bright coral and mint on charcoal, bold rounded shapes).
  preset({
    presetId: "atelier",
    name: "Atelier Noir",
    blurb: "Contemporary studio: charcoal, coral and mint, bold type, round buttons",
    primary: "#ff6b4a",
    accent: "#7fe0c8",
    background: "#141414",
    surface: "#1f1f1f",
    foreground: "#f5f1ea",
    headingFont: "Syne",
    bodyFont: "Figtree",
    logoPreset: "monogram",
    radius: 1.5,
    buttonRadius: PILL,
    cardStyle: "flat",
    headingWeight: 700,
    iconStroke: 2,
    iconTone: "accent",
    iconFrame: "square",
    eyebrow: "Hello",
    welcomeTitle: "Make yourself at home",
    welcomeBody: "Check yourself in, then everything for your stay is in your guide.",
    tagline: "Stay well",
    poweredBy: true,
  }),
];

/**
 * Looks no longer offered as templates (grouped into Atelier Noir). Properties
 * that chose one keep it: normaliseTheme still reads them.
 */
const RETIRED_PRESETS: ThemePreset[] = [
  preset({
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
  }),
  preset({
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
  }),
  preset({
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
  }),
  preset({
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
    artwork: "coast",
  }),
  preset({
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
  }),
];

export const DEFAULT_THEME: ThemeConfig = THEME_PRESETS[0]!;

/** Google Fonts offered in the pickers (any other Google font can be typed by name). */
export const FONT_CHOICES = [
  // Serif and display
  "Fraunces",
  "Playfair Display",
  "DM Serif Display",
  "Cormorant Garamond",
  "Libre Baskerville",
  "Libre Caslon Text",
  "EB Garamond",
  "Bodoni Moda",
  "Cinzel",
  "Marcellus",
  "Prata",
  "Italiana",
  "Lora",
  "Crimson Pro",
  // Sans
  "Syne",
  "Space Grotesk",
  "Inter",
  "Plus Jakarta Sans",
  "Outfit",
  "Manrope",
  "Karla",
  "DM Sans",
  "Work Sans",
  "Lato",
  "Nunito Sans",
  "Mulish",
  "Montserrat",
  "Poppins",
  "Raleway",
  "Josefin Sans",
  "Jost",
  "Figtree",
] as const;

const HEX = /^#[0-9a-f]{6}$/i;

const clamp = (v: unknown, lo: number, hi: number, fb: number) =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fb;
const pick = <T extends string>(v: unknown, options: readonly T[], fb: T): T =>
  options.includes(v as T) ? (v as T) : fb;
/** Plain words only: no markup or control characters, trimmed to length. */
const words = (v: unknown, max: number, fb: string) =>
  typeof v === "string"
    ? v
        // eslint-disable-next-line no-control-regex -- strips control characters from text people type
        .replace(/[\u0000-\u001f<>]/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, max)
    : fb;

/** Accepts anything from storage and returns a complete, safe theme. */
export function normaliseTheme(raw: unknown): ThemeConfig {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<ThemeConfig> &
    Record<string, unknown>;
  const preset =
    [...THEME_PRESETS, ...RETIRED_PRESETS].find((p) => p.presetId === r.presetId) ?? DEFAULT_THEME;
  const colour = (v: unknown, fb: string) => (typeof v === "string" && HEX.test(v) ? v : fb);
  const font = (v: unknown, fb: string) =>
    typeof v === "string" && /^[A-Za-z0-9 ]{2,40}$/.test(v) ? v : fb;
  const url = (v: unknown) => (typeof v === "string" && /^https:\/\//.test(v) ? v : null);
  const notes = Array.isArray(r.sideNotes) ? r.sideNotes : preset.sideNotes;
  const features = (Array.isArray(r.features) ? r.features : preset.features)
    .filter((f): f is ThemeFeature => !!f && typeof f === "object")
    .map((f) => ({
      icon: typeof f.icon === "string" && /^[a-z0-9-]{2,40}$/.test(f.icon) ? f.icon : "sparkles",
      text: words(f.text, 40, ""),
    }))
    .filter((f) => f.text)
    .slice(0, 3);
  return {
    // A saved template keeps its own id; anything unknown falls back to the default's values.
    presetId:
      typeof r.presetId === "string" && /^[a-z0-9_-]{1,60}$/.test(r.presetId)
        ? r.presetId
        : preset.presetId,
    primary: colour(r.primary, preset.primary),
    accent: colour(r.accent, preset.accent),
    background: colour(r.background, preset.background),
    surface: colour(r.surface, preset.surface),
    foreground: colour(r.foreground, preset.foreground),
    headingFont: font(r.headingFont, preset.headingFont),
    bodyFont: font(r.bodyFont, preset.bodyFont),
    customFontUrl: url(r.customFontUrl),
    customFontName: r.customFontName ? font(r.customFontName, "") || null : null,
    // Never picked: the site logo, which the super admin chooses.
    logoPreset: pick(r.logoPreset, LOGO_PRESETS, "site"),
    logoUrl: url(r.logoUrl),
    radius: clamp(r.radius, 0, 2, preset.radius),
    buttonRadius:
      r.buttonRadius === PILL
        ? PILL
        : clamp(
            r.buttonRadius,
            0,
            2,
            typeof r.radius === "number" && r.buttonRadius === undefined
              ? clamp(r.radius, 0, 2, preset.radius)
              : preset.buttonRadius,
          ),
    buttonFill: pick(r.buttonFill, ["solid", "gradient", "outline"] as const, preset.buttonFill),
    buttonColour: pick(r.buttonColour, ["primary", "accent"] as const, preset.buttonColour),
    buttonCase: pick(r.buttonCase, ["normal", "upper"] as const, preset.buttonCase),
    cardStyle: pick(r.cardStyle, ["shadow", "outline", "flat"] as const, preset.cardStyle),
    headingCase: pick(r.headingCase, ["normal", "upper", "smallcaps"] as const, preset.headingCase),
    headingTracking: clamp(r.headingTracking, 0, 0.3, preset.headingTracking),
    headingWeight: Math.round(clamp(r.headingWeight, 300, 900, preset.headingWeight) / 100) * 100,
    iconStroke: clamp(r.iconStroke, 1, 2.75, preset.iconStroke),
    iconTone: pick(r.iconTone, ["primary", "accent", "foreground"] as const, preset.iconTone),
    iconFrame: pick(r.iconFrame, ["none", "circle", "square"] as const, preset.iconFrame),
    backgroundStyle: pick(
      r.backgroundStyle,
      ["plain", "gradient"] as const,
      preset.backgroundStyle,
    ),
    frame: pick(r.frame, ["none", "line", "ornate"] as const, preset.frame),
    artwork: pick(r.artwork, ARTWORKS, preset.artwork),
    artworkOpacity: clamp(r.artworkOpacity, 0.04, 0.5, preset.artworkOpacity),
    headerBand: typeof r.headerBand === "boolean" ? r.headerBand : preset.headerBand,
    coverImageUrl: r.coverImageUrl === undefined ? preset.coverImageUrl : url(r.coverImageUrl),
    layout: pick(r.layout, ["left", "centred"] as const, preset.layout),
    subname: words(r.subname, 40, preset.subname),
    eyebrow: words(r.eyebrow, 40, preset.eyebrow),
    welcomeTitle: words(r.welcomeTitle, 80, preset.welcomeTitle),
    welcomeBody: words(r.welcomeBody, 200, preset.welcomeBody),
    tagline: words(r.tagline, 60, preset.tagline),
    sideNotes: [words(notes[0], 80, ""), words(notes[1], 80, "")],
    features,
    poweredBy: typeof r.poweredBy === "boolean" ? r.poweredBy : preset.poweredBy,
    kioskTouch: pick(r.kioskTouch, ["standard", "expanded"] as const, "standard"),
  };
}

/** The welcome headline: the host's own words (with {property} for the name), or the standard one. */
export function welcomeTitle(t: ThemeConfig, property: string, fallback: string): string {
  return t.welcomeTitle ? t.welcomeTitle.replace(/\{property\}/g, property) : fallback;
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
  const btn = t.buttonColour === "accent" ? t.accent : t.primary;
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
    // Every corner size follows the theme, so 0 really is square (not "a little rounded").
    "--radius": `${t.radius}rem`,
    "--radius-sm": `${t.radius * 0.5}rem`,
    "--radius-md": `${t.radius * 0.75}rem`,
    "--radius-lg": `${t.radius}rem`,
    "--radius-xl": `${t.radius * 1.25}rem`,
    "--radius-2xl": `${t.radius * 1.5}rem`,
    "--radius-3xl": `${t.radius * 1.75}rem`,
    "--radius-4xl": `${t.radius * 2}rem`,
    "--radius-button": t.buttonRadius === PILL ? "9999px" : `${t.buttonRadius}rem`,
    "--theme-font-display": `"${heading}", ui-serif, Georgia, serif`,
    "--theme-font-sans": `"${t.bodyFont}", ui-sans-serif, system-ui, sans-serif`,
    // Headings, buttons, cards and icons (applied inside guest pages, see styles.css [data-themed]).
    "--heading-case": t.headingCase === "upper" ? "uppercase" : "none",
    "--heading-variant": t.headingCase === "smallcaps" ? "all-small-caps" : "normal",
    "--heading-tracking": `${t.headingTracking}em`,
    "--heading-weight": String(t.headingWeight),
    "--button-case": t.buttonCase === "upper" ? "uppercase" : "none",
    "--button-tracking": t.buttonCase === "upper" ? "0.14em" : "normal",
    "--btn": btn,
    "--btn-fg": t.buttonFill === "outline" ? btn : readableOn(btn),
    "--btn-bg": t.buttonFill === "outline" ? "transparent" : btn,
    "--btn-image":
      t.buttonFill === "gradient"
        ? `linear-gradient(180deg, ${mix(btn, "#ffffff", 0.28)} 0%, ${btn} 55%, ${mix(btn, "#000000", 0.12)} 100%)`
        : "none",
    "--btn-border": t.buttonFill === "outline" ? btn : "transparent",
    "--card-shadow": t.cardStyle === "shadow" ? "var(--shadow-soft)" : "none",
    "--card-border":
      t.cardStyle === "flat"
        ? "transparent"
        : mix(t.surface, t.foreground, t.cardStyle === "outline" ? 0.16 : 0.1),
    "--icon-stroke": String(t.iconStroke),
    "--icon":
      t.iconTone === "accent" ? t.accent : t.iconTone === "foreground" ? t.foreground : t.primary,
    "--page-image":
      t.backgroundStyle === "gradient"
        ? `radial-gradient(120% 90% at 50% 0%, ${mix(t.background, t.foreground, 0.06)} 0%, ${t.background} 60%, ${mix(t.background, "#000000", 0.08)} 100%)`
        : "none",
  };
}

/** Google Fonts stylesheet URL for the chosen fonts (any Google font, by name). */
export function googleFontsHref(t: ThemeConfig): string {
  const fams = [...new Set([t.headingFont, t.bodyFont])]
    .filter((f) => /^[A-Za-z0-9 ]{2,40}$/.test(f))
    .map((f) => `family=${f.replace(/ /g, "+")}:wght@300;400;500;600;700;800`);
  return `https://fonts.googleapis.com/css2?${fams.join("&")}&display=swap`;
}

/** Short codes that clash with app pages can't be used as vanity links. */
export const RESERVED_SLUGS = new Set([
  "g",
  "app",
  "auth",
  "api",
  "stay",
  "kiosk",
  "checkin",
  "p",
  "assets",
  "favicon.ico",
  "robots.txt",
  "about",
  "developers",
  "invite",
  "invoice",
  "lovable",
  "room",
  "start",
  "icons",
  "offline",
  "sw",
  "manifest",
  "pricing",
  "help",
  "support",
  "admin",
  "login",
  "signin",
  "signup",
  "register",
  "terms",
  "privacy",
  "www",
  "mail",
  "static",
  "enquire",
  "book",
  "reserve",
  "stay-again",
  "brand",
  "partners",
  // The shared public demo owns these.
  "tour",
  "demo",
  "showcase",
  "desert-star-texas",
  "ashcombe-mayfair",
  "maison-vermeil-paris",
  "aoba-tokyo",
]);

/**
 * One Google Fonts link per family: the full range of weights, and a plain
 * one to fall back on (Google refuses a request for weights a font lacks,
 * and display fonts often have just one).
 */
export function googleFontLinks(
  t: ThemeConfig,
): Array<{ family: string; href: string; fallback: string }> {
  return [...new Set([t.headingFont, t.bodyFont])]
    .filter((f) => /^[A-Za-z0-9 ]{2,40}$/.test(f))
    .map((f) => {
      const fam = f.replace(/ /g, "+");
      return {
        family: f,
        href: `https://fonts.googleapis.com/css2?family=${fam}:wght@300;400;500;600;700;800&display=swap`,
        fallback: `https://fonts.googleapis.com/css2?family=${fam}&display=swap`,
      };
    });
}

/**
 * What a template keeps. A shared template leaves out the host's own logo and
 * cover photo (they're that business's), keeping everything else, fonts included.
 */
export function templateConfig(t: ThemeConfig, opts: { shared: boolean }): ThemeConfig {
  return opts.shared ? { ...t, logoUrl: null, coverImageUrl: null } : t;
}
