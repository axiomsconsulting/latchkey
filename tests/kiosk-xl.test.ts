import { describe, expect, it } from "vitest";

import {
  cardVars,
  expressCards,
  expressPage,
  expressShape,
  pageVars,
  resolveLook,
  xlCss,
} from "@/lib/kiosk-xl";
import { normaliseDefaults } from "@/lib/kiosk-saver";
import { PILL, normaliseTheme } from "@/lib/theme";

describe("Express mode on door tablets", () => {
  it("follows the host's choice, else Latchkey's default", () => {
    expect(resolveLook("auto", "xl")).toBe("xl");
    expect(resolveLook("auto", "standard")).toBe("standard");
    expect(resolveLook("standard", "xl")).toBe("standard");
    expect(resolveLook("xl", "standard")).toBe("xl");
  });

  it("is automatic for hosts and standard by default for Latchkey", () => {
    expect(normaliseTheme(null).kioskLook).toBe("auto");
    expect(normaliseTheme({ kioskLook: "xl" }).kioskLook).toBe("xl");
    expect(normaliseTheme({ kioskLook: "huge" }).kioskLook).toBe("auto");
    expect(normaliseDefaults(null).experience).toBe("standard");
    expect(normaliseDefaults({ experience: "xl" }).experience).toBe("xl");
    expect(normaliseDefaults({ experience: "nope" }).experience).toBe("standard");
  });

  it("gives each card readable ink, a strong outline and ink-filled buttons", () => {
    const light = cardVars("#F6E2A8");
    expect(light["--foreground"]).toBe("#1B1B1B");
    expect(light["--btn-bg"]).toBe("#1B1B1B");
    expect(light["--btn-fg"]).toBe("#F6E2A8");
    expect(light["--border"]).not.toBe("#F6E2A8");
    expect(cardVars("#183B2B")["--foreground"]).toBe("#FFFFFF");
    expect(pageVars("#a50d36")["--background"]).toBe("#a50d36");
    expect(pageVars("#a50d36")["--foreground"]).toBe("#FFFFFF");
  });

  it("writes only checked colours into the style sheet", () => {
    const theme = normaliseTheme({ primary: "#a50d36", accent: "#c9a227" });
    const css = xlCss({ theme, cardIn: "red;}body{x:1", cardOut: "#CFE3EC" });
    expect(css).toContain("--background:#a50d36");
    // A bad colour falls back to the theme's own tint, never into the sheet.
    expect(css).toContain(`--card:${expressCards(theme, null, null).cardIn}`);
    expect(css).not.toContain("body{");
    expect(css).toContain("[data-kiosk-xl] [data-kiosk-flow] aside{");
  });

  it("deepens a light main colour so the cards stand out, and keeps a dark one", () => {
    expect(expressPage("#a50d36")).toBe("#a50d36");
    expect(expressPage("#f2e8d5")).not.toBe("#f2e8d5");
    expect(pageVars("#f2e8d5")["--foreground"]).toBe("#FFFFFF");
    // A dark theme keeps its own background.
    expect(expressPage("#ff6f61", "#16181d")).toBe("#16181d");
  });

  it("uses the host's card colours, else tints of the theme's", () => {
    const t = { primary: "#183B2B", accent: "#C8A24A" };
    expect(expressCards(t, "#123456", "#654321")).toEqual({
      cardIn: "#123456",
      cardOut: "#654321",
    });
    const tinted = expressCards(t, null, null);
    expect(tinted.cardIn).not.toBe("#C8A24A");
    expect(tinted.cardOut).not.toBe("#183B2B");
  });

  it("takes the theme's shapes and makes them bolder", () => {
    const square = expressShape(
      normaliseTheme({ radius: 0, buttonRadius: 0, cardStyle: "flat", headingCase: "upper" }),
    );
    expect(square["--x-card-radius"]).toBe("0px");
    expect(square["--x-btn-radius"]).toBe("0px");
    expect(square["--x-border-width"]).toBe("0px");
    expect(square["--x-head-case"]).toBe("uppercase");
    const round = expressShape(
      normaliseTheme({ radius: 1, buttonRadius: PILL, cardStyle: "outline", headingWeight: 400 }),
    );
    expect(round["--x-btn-radius"]).toBe("9999px");
    expect(round["--x-card-radius"]).toContain("1.6rem");
    expect(Number(round["--x-head-weight"])).toBeGreaterThanOrEqual(700);
    expect(Number(round["--x-icon-stroke"])).toBeGreaterThanOrEqual(2.25);
  });

  it("keeps outline buttons outlined, in the card's ink", () => {
    const v = cardVars("#F6E2A8", "outline");
    expect(v["--btn-bg"]).toBe("transparent");
    expect(v["--btn-fg"]).toBe(v["--foreground"]);
  });
});
