import { describe, expect, it } from "vitest";

import { googleFontLinks, normaliseTheme, PILL, templateConfig, THEME_PRESETS, themeVars, welcomeTitle } from "../src/lib/theme";

describe("property themes", () => {
  it("keeps a theme saved before the new settings looking the same", () => {
    const old = normaliseTheme({ presetId: "heritage", primary: "#112233", radius: 0.75 });
    expect(old.primary).toBe("#112233");
    expect(old.radius).toBe(0.75);
    // Buttons followed the one corner setting before: they still do.
    expect(old.buttonRadius).toBe(0.75);
    expect(old.headingCase).toBe("normal");
    expect(old.artwork).toBe("none");
    expect(old.features).toEqual([]);
  });

  it("starts each hotel template with its whole look", () => {
    const palace = normaliseTheme({ presetId: "palace-heritage" });
    expect(palace).toMatchObject({ frame: "ornate", artwork: "palace", headingCase: "upper", buttonFill: "gradient", layout: "centred", subname: "St James's" });
    const desert = normaliseTheme({ presetId: "desert-star" });
    expect(desert).toMatchObject({ radius: 0, buttonRadius: 0, headerBand: true, buttonColour: "accent" });
    // A logo the host never picked follows the site logo; a picked one stays.
    expect(desert.logoPreset).toBe("site");
    expect(normaliseTheme({ presetId: "desert-star", logoPreset: "sunburst" }).logoPreset).toBe("sunburst");
    expect(normaliseTheme({ logoPreset: "antique-key" }).logoPreset).toBe("antique-key");
    expect(normaliseTheme({ presetId: "express-green" }).buttonRadius).toBe(PILL);
    // Boutique Heritage (The Hill Suites), the four hotel looks and Atelier Noir.
    expect(THEME_PRESETS.map((p) => p.presetId)).toEqual(["heritage", "grand-crimson", "express-green", "palace-heritage", "desert-star", "atelier"]);
    // A property on a retired look keeps it.
    expect(normaliseTheme({ presetId: "nordic" }).headingFont).toBe("Syne");
  });

  it("refuses unsafe or out-of-range values", () => {
    const t = normaliseTheme({ presetId: "heritage", headingTracking: 9, iconStroke: -1, artwork: "lasers", coverImageUrl: "javascript:x", welcomeTitle: "<script>Hi</script>", features: [{ icon: "star", text: "Lovely" }, null, { text: "" }, { icon: "x", text: "a" }, { icon: "y", text: "b" }] });
    expect(t.headingTracking).toBe(0.3);
    expect(t.iconStroke).toBe(1);
    expect(t.artwork).toBe("none");
    expect(t.coverImageUrl).toBeNull();
    expect(t.welcomeTitle).toBe("scriptHi/script");
    expect(t.features).toEqual([{ icon: "star", text: "Lovely" }, { icon: "sparkles", text: "a" }, { icon: "sparkles", text: "b" }]);
  });

  it("keeps a saved template's own id", () => {
    expect(normaliseTheme({ presetId: "tpl_ab12cd34" }).presetId).toBe("tpl_ab12cd34");
  });

  it("makes square really square, and pill buttons fully round", () => {
    const v = themeVars(normaliseTheme({ presetId: "desert-star" }));
    expect(v["--radius-2xl"]).toBe("0rem");
    expect(v["--radius-button"]).toBe("0rem");
    expect(themeVars(normaliseTheme({ presetId: "express-green" }))["--radius-button"]).toBe("9999px");
  });

  it("fills the welcome headline with the property's name", () => {
    expect(welcomeTitle(normaliseTheme({ presetId: "grand-crimson" }), "The Hill Suites", "x")).toBe("Welcome to The Hill Suites");
    expect(welcomeTitle(normaliseTheme({ presetId: "heritage" }), "The Hill Suites", "Fallback")).toBe("Fallback");
  });

  it("loads any Google font by name, with a plain fallback", () => {
    const [heading] = googleFontLinks(normaliseTheme({ presetId: "heritage", headingFont: "Cormorant Infant" }));
    expect(heading!.href).toContain("family=Cormorant+Infant:wght@");
    expect(heading!.fallback).toBe("https://fonts.googleapis.com/css2?family=Cormorant+Infant&display=swap");
  });

  it("leaves the host's own logo and photo out of shared templates", () => {
    const t = normaliseTheme({ presetId: "heritage", logoUrl: "https://x/logo.png", coverImageUrl: "https://x/c.jpg", customFontUrl: "https://x/f.woff2", customFontName: "Mine" });
    expect(templateConfig(t, { shared: true })).toMatchObject({ logoUrl: null, coverImageUrl: null, customFontUrl: "https://x/f.woff2" });
    expect(templateConfig(t, { shared: false }).logoUrl).toBe("https://x/logo.png");
  });
});
