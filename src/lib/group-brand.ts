/**
 * A business with several properties (a group): its own logo, and where it
 * shows (hosts.group_brand, migration 0048). Each property keeps its own logo
 * (its theme); the group's is used where the host chooses: on every property,
 * or only where a property has no logo of its own. "Part of {group}" on guest
 * pages and the group on invoices are the host's choice too. Pure.
 */
import { LOGO_PRESETS, type LogoPreset, type ThemeConfig } from "./theme";

export type GroupBrand = {
  /** An uploaded group logo (storage link) or one of the logo marks; neither = no group logo. */
  logoUrl: string | null;
  logoPreset: LogoPreset | null;
  /** "own": each property's own logo, the group's where a property has none. "group": the group logo on every property. */
  propertyLogos: "own" | "group";
  /** "Part of {group}" (with the group logo) on guest pages. */
  showOnGuestPages: boolean;
  /** The group's name and logo at the top of invoices (the business details are always in the small print). */
  showOnInvoices: boolean;
};

export const DEFAULT_GROUP_BRAND: GroupBrand = {
  logoUrl: null,
  logoPreset: null,
  propertyLogos: "own",
  showOnGuestPages: false,
  showOnInvoices: true,
};

export function normaliseGroupBrand(raw: unknown): GroupBrand {
  const r = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Record<
    string,
    unknown
  >;
  const url =
    typeof r["logoUrl"] === "string" && /^https:\/\/\S{1,1990}$/.test(r["logoUrl"])
      ? r["logoUrl"]
      : null;
  const preset =
    typeof r["logoPreset"] === "string" &&
    (LOGO_PRESETS as readonly string[]).includes(r["logoPreset"]) &&
    r["logoPreset"] !== "site"
      ? (r["logoPreset"] as LogoPreset)
      : null;
  return {
    logoUrl: url,
    logoPreset: preset,
    propertyLogos: r["propertyLogos"] === "group" ? "group" : "own",
    showOnGuestPages: r["showOnGuestPages"] === true,
    showOnInvoices: r["showOnInvoices"] !== false,
  };
}

export function hasGroupLogo(g: Pick<GroupBrand, "logoUrl" | "logoPreset">): boolean {
  return !!(g.logoUrl || g.logoPreset);
}

/** A property has its own logo when it uploaded one or picked a mark (not "Site logo"). */
export function hasOwnLogo(t: Pick<ThemeConfig, "logoUrl" | "logoPreset">): boolean {
  return !!t.logoUrl || t.logoPreset !== "site";
}

/** The logo a property shows: its own, the group's (by the host's choice or because it has none), or the site logo. */
export function effectiveLogo(
  t: Pick<ThemeConfig, "logoUrl" | "logoPreset">,
  g: GroupBrand,
): Pick<ThemeConfig, "logoUrl" | "logoPreset"> & { source: "property" | "group" | "site" } {
  const group = hasGroupLogo(g)
    ? {
        logoUrl: g.logoUrl,
        logoPreset: g.logoPreset ?? ("site" as LogoPreset),
        source: "group" as const,
      }
    : null;
  if (group && g.propertyLogos === "group") return group;
  if (hasOwnLogo(t)) return { logoUrl: t.logoUrl, logoPreset: t.logoPreset, source: "property" };
  return group ?? { logoUrl: null, logoPreset: "site", source: "site" };
}

export type GroupLine = { name: string; logoUrl: string | null; logoPreset: LogoPreset };

/**
 * A property's look on a guest page, with the group applied: its logo as
 * effectiveLogo() says, and "Part of {group}" when the host shows it (and the
 * group isn't simply the property itself).
 */
export function applyGroup<T extends ThemeConfig>(
  theme: T,
  g: GroupBrand,
  group: { name: string; propertyName: string },
): T & { group?: GroupLine } {
  const logo = effectiveLogo(theme, g);
  const out = { ...theme, logoUrl: logo.logoUrl, logoPreset: logo.logoPreset } as T & {
    group?: GroupLine;
  };
  const name = group.name.trim();
  if (
    g.showOnGuestPages &&
    name &&
    name.toLowerCase() !== group.propertyName.trim().toLowerCase()
  ) {
    out.group = { name, logoUrl: g.logoUrl, logoPreset: g.logoPreset ?? "site" };
  }
  return out;
}
