import { describe, expect, it } from "vitest";

import { DEFAULT_ART, guideArtFor } from "@/lib/guide-art";

const theme = { coverImageUrl: null, presetId: "heritage", guideArt: {} as Record<string, string> };

describe("guide card pictures", () => {
  it("a starting picture per section, the host's own over it, none when asked", () => {
    expect(guideArtFor("getting_in", theme)).toBe(DEFAULT_ART["getting_in"]);
    expect(
      guideArtFor("getting_in", { ...theme, guideArt: { getting_in: "https://x/a.jpg" } }),
    ).toBe("https://x/a.jpg");
    expect(guideArtFor("getting_in", { ...theme, guideArt: { getting_in: "none" } })).toBeNull();
    expect(guideArtFor("rules", { ...theme, guideArtOn: false })).toBeNull();
  });
  it("the host's own sections get the theme's cover", () => {
    expect(guideArtFor("custom_abc123", { ...theme, coverImageUrl: "https://x/cover.jpg" })).toBe(
      "https://x/cover.jpg",
    );
  });
});
