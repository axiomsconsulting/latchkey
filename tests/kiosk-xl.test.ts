import { describe, expect, it } from "vitest";

import { cardVars, pageVars, resolveLook, xlCss } from "@/lib/kiosk-xl";
import { normaliseDefaults } from "@/lib/kiosk-saver";
import { normaliseTheme } from "@/lib/theme";

describe("the XL door tablet look", () => {
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
    const css = xlCss({ primary: "#a50d36", cardIn: "red;}body{x:1", cardOut: "#CFE3EC" });
    expect(css).toContain("--background:#a50d36");
    expect(css).toContain("--card:#F6E2A8");
    expect(css).not.toContain("body{");
    expect(css).toContain("[data-kiosk-xl] [data-kiosk-flow] aside{");
  });
});
