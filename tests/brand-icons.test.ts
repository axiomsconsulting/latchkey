import { describe, expect, it } from "vitest";

import { appIcons, appleIcon, smallIcon } from "../src/lib/brand-icons";

describe("site logo icons", () => {
  it("uses the key's set by default and each mark's own set otherwise", () => {
    expect(appIcons({ logoMark: "key", logoUrl: "" }).map((i) => i.src)).toEqual(["/icons/icon-192.png", "/icons/icon-512.png", "/icons/icon-maskable-512.png"]);
    expect(appIcons({ logoMark: "arch", logoUrl: "" })[2]).toMatchObject({ src: "/brand/icons/arch-maskable-512.png", purpose: "maskable" });
    expect(appleIcon({ logoMark: "monogram", logoUrl: "" })).toBe("/brand/icons/monogram-apple.png");
  });

  it("uses an uploaded logo as is, and draws a letter as SVG", () => {
    const up = { logoMark: "key" as const, logoUrl: "https://x.example/logo.png" };
    expect(appIcons(up)).toEqual([{ src: up.logoUrl, sizes: "any", purpose: "any" }]);
    expect(appleIcon(up)).toBe(up.logoUrl);
    expect(smallIcon({ logoMark: "initial", logoUrl: "" })).toBe("/api/public/brand/icon");
  });
});
