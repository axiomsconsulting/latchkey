/**
 * White label: the product's name and wording, set once by the super admin
 * (site_settings.brand, Latchkey admin → Site settings → Brand) and used
 * everywhere. All copy is written with the default name; every exported
 * copy object is wrapped in branded(), and any other string with the name in
 * it goes through rebrand(), so changing the one field renames the whole app.
 *
 * The current brand is set on the server for each request (start.ts) and in
 * the browser from the root loader, before anything renders.
 */

export const DEFAULT_NAME = "Latchkey";

/** The site logo: one of Latchkey's marks (BrandLogo.tsx), or the name's initial. */
export const BRAND_LOGO_MARKS = ["key", "arch", "monogram", "initial"] as const;
export type BrandLogoMark = (typeof BRAND_LOGO_MARKS)[number];

export type Brand = {
  /** The product's name, everywhere it appears. */
  name: string;
  /** The site's default logo, chosen by the super admin: header, sign-in, browser tab, app icon, and hosts who haven't picked their own. */
  logoMark: BrandLogoMark;
  /** An uploaded logo instead of the mark (storage link); empty for none. */
  logoUrl: string;
  /** The short line under the name on the home page. */
  tagline: string;
  /** The home page footer; empty means "© <year> <name>." plus the default line. */
  footer: string;
};

export const DEFAULT_BRAND: Brand = {
  name: DEFAULT_NAME,
  logoMark: "key",
  logoUrl: "",
  tagline: "Guest operations for independent accommodation",
  footer: "",
};

const clean = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

/** Safe against anything stored. */
export function normaliseBrand(raw: unknown): Brand {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const name = clean(r["name"], 40) || DEFAULT_BRAND.name;
  const mark = BRAND_LOGO_MARKS.includes(r["logoMark"] as BrandLogoMark)
    ? (r["logoMark"] as BrandLogoMark)
    : // Saved before logos were chosen: a renamed (white label) product keeps its initial, never Latchkey's key.
      name === DEFAULT_NAME ? DEFAULT_BRAND.logoMark : "initial";
  const logoUrl = typeof r["logoUrl"] === "string" && /^https:\/\/\S{1,1990}$/.test(r["logoUrl"]) ? r["logoUrl"] : "";
  return {
    name,
    logoMark: mark,
    logoUrl,
    // A tagline still saved as an earlier default follows the current one.
    tagline: ((t) => (!t || OLD_TAGLINES.includes(t) ? DEFAULT_BRAND.tagline : t))(clean(r["tagline"], 120)),
    footer: clean(r["footer"], 300),
  };
}

const OLD_TAGLINES = ["Self check-in for guest houses, B&Bs and short lets"];

let current: Brand = DEFAULT_BRAND;
// On the server, each request's own brand (brand.server.ts), so two requests never mix.
let resolver: (() => Brand | undefined) | null = null;

/** The browser (and tests): the brand for this page. */
export function setBrand(b: unknown) {
  current = normaliseBrand(b);
}

/** Server only: read the brand from the request being handled. */
export function setBrandResolver(fn: () => Brand | undefined) {
  resolver = fn;
}

export function currentBrand(): Brand {
  return resolver?.() ?? current;
}

export function brandName(): string {
  return currentBrand().name;
}

const NAME = /\bLatchkey\b/g;

/** The text with the product's name swapped for the current brand. */
export function rebrand(text: string): string {
  const name = currentBrand().name;
  return name === DEFAULT_NAME ? text : text.replace(NAME, name);
}

const cache = new WeakMap<object, unknown>();

/**
 * The same object, read through the current brand: every string in it (and
 * every string its functions return) carries the brand's name. Nested
 * objects and arrays are wrapped as they're read.
 */
export function branded<T extends object>(obj: T): T {
  const hit = cache.get(obj);
  if (hit) return hit as T;
  const proxy = new Proxy(obj, {
    get(target, key, receiver) {
      const v = Reflect.get(target, key, receiver);
      if (typeof v === "string") return rebrand(v);
      if (typeof v === "function") {
        // Only the copy's own functions (not array methods, which then read through this proxy).
        if (!Object.prototype.hasOwnProperty.call(target, key)) return v;
        return (...args: unknown[]) => {
          const out = (v as (...a: unknown[]) => unknown).apply(receiver, args);
          return typeof out === "string" ? rebrand(out) : out;
        };
      }
      if (v && typeof v === "object" && !(v instanceof Date)) return branded(v as object);
      return v;
    },
  });
  cache.set(obj, proxy);
  return proxy;
}

/** "© 2026 Latchkey." style footer: the admin's own, or one made from the name. */
export function footerText(fallback: string): string {
  return currentBrand().footer || rebrand(fallback);
}
