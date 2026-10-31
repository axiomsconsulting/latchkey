import { readFileSync } from "node:fs";
import { parse } from "acorn";
import { describe, expect, it } from "vitest";

import { esc, liteHtml, scriptJson, zoneOffsetMinutes } from "@/lib/kiosk-lite.server";
import { normaliseTheme } from "@/lib/theme";

describe("the compatible kiosk for older tablets", () => {
  it("has a script old browsers can run (plain ES5)", () => {
    const src = readFileSync("public/kiosk-lite.js", "utf8");
    expect(() => parse(src, { ecmaVersion: 5 })).not.toThrow();
    // Served without a charset: ASCII only, other characters as \u escapes.
    expect([...src].every((c) => c.charCodeAt(0) < 128)).toBe(true);
  });

  it("escapes the host's words and keeps script data safe", () => {
    expect(esc(`<b>"Tom's"</b> & co`)).toBe("&lt;b&gt;&quot;Tom&#39;s&quot;&lt;/b&gt; &amp; co");
    expect(scriptJson({ a: "</script><script>x" })).not.toContain("</script>");
  });

  it("works out the property's clock for the tablet", () => {
    expect(zoneOffsetMinutes("Europe/London", new Date("2026-07-01T12:00:00Z"))).toBe(60);
    expect(zoneOffsetMinutes("Europe/London", new Date("2026-12-01T12:00:00Z"))).toBe(0);
    expect(zoneOffsetMinutes("Asia/Tokyo", new Date("2026-12-01T12:00:00Z"))).toBe(540);
  });

  it("builds a page with plain colours and no modern CSS", async () => {
    const html = await liteHtml(
      { name: `Tom's <Inn>`, code: "toms", timezone: "Europe/London", theme: normaliseTheme(null) },
      "https://example.test",
    );
    expect(html).toContain("Tom&#39;s &lt;Inn&gt;");
    expect(html).toContain('src="/kiosk-lite.js?v=');
    expect(html).toContain("https://example.test/kiosk/toms?guest=1");
    expect(html).not.toMatch(/var\(--|color-mix|oklch|@layer/);
    expect(html).toContain("<svg");
    // The level is picked before anything draws; the welcome is the kiosk's.
    expect(html).toContain('"latchkey.kioskMode.toms"');
    expect(html).toContain('data-act="checkin"');
  });

  it("draws the theme's art, frame, features and icons as plain SVG", async () => {
    const theme = normaliseTheme({ presetId: "palace-heritage" });
    const html = await liteHtml(
      { name: "Palace", code: "pal", timezone: "Europe/London", theme },
      "https://example.test",
    );
    expect(html).not.toMatch(/var\(--|color-mix|oklch|@layer/);
    if (theme.artwork !== "none") expect(html).toContain('class="art');
    if (theme.frame !== "none") expect(html).toContain('class="frame"');
    if (theme.features.length) expect(html).toContain('class="feat"');
    expect(html).toContain('"icons":{');
  });
});
