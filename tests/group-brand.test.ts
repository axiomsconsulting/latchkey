import { describe, expect, it } from "vitest";

import { applyGroup, effectiveLogo, normaliseGroupBrand } from "../src/lib/group-brand";
import { normaliseTheme } from "../src/lib/theme";

const own = normaliseTheme({ logoPreset: "lantern" });
const none = normaliseTheme({});
const uploaded = normaliseTheme({ logoUrl: "https://x.example/p.png" });

describe("group brand", () => {
  it("is safe against anything stored, and starts with each property's own logo", () => {
    expect(normaliseGroupBrand(null)).toEqual({ logoUrl: null, logoPreset: null, propertyLogos: "own", showOnGuestPages: false, showOnInvoices: true });
    expect(normaliseGroupBrand({ logoUrl: "javascript:x", logoPreset: "lasers", propertyLogos: "x" })).toMatchObject({ logoUrl: null, logoPreset: null, propertyLogos: "own" });
    expect(normaliseGroupBrand({ logoPreset: "site" }).logoPreset).toBeNull();
  });

  it("keeps a property's own logo, and uses the group's where a property has none", () => {
    const g = normaliseGroupBrand({ logoPreset: "crest" });
    expect(effectiveLogo(own, g)).toMatchObject({ logoPreset: "lantern", source: "property" });
    expect(effectiveLogo(uploaded, g)).toMatchObject({ logoUrl: "https://x.example/p.png", source: "property" });
    expect(effectiveLogo(none, g)).toMatchObject({ logoPreset: "crest", source: "group" });
    // No group logo either: the site logo.
    expect(effectiveLogo(none, normaliseGroupBrand(null))).toMatchObject({ logoPreset: "site", source: "site" });
  });

  it("puts the group logo on every property when the host says so", () => {
    const g = normaliseGroupBrand({ logoUrl: "https://x.example/group.png", propertyLogos: "group" });
    expect(effectiveLogo(own, g)).toMatchObject({ logoUrl: "https://x.example/group.png", source: "group" });
  });

  it("shows 'Part of {group}' only when chosen, and never for a group named like the property", () => {
    const off = applyGroup(own, normaliseGroupBrand({ logoPreset: "crest" }), { name: "Hill Hospitality", propertyName: "Ashcombe House" });
    expect(off.group).toBeUndefined();
    const on = applyGroup(own, normaliseGroupBrand({ logoPreset: "crest", showOnGuestPages: true }), { name: "Hill Hospitality", propertyName: "Ashcombe House" });
    expect(on.group).toEqual({ name: "Hill Hospitality", logoUrl: null, logoPreset: "crest" });
    expect(applyGroup(own, normaliseGroupBrand({ showOnGuestPages: true }), { name: "Ashcombe House", propertyName: "ashcombe house" }).group).toBeUndefined();
  });
});
