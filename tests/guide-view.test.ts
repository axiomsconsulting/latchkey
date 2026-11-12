import { describe, expect, it } from "vitest";

import { hasMore, readGuideView, swipeStep, wrapIndex } from "../src/lib/guide-view";

describe("the guide's two views", () => {
  it("is the list unless the guest picked the gallery", () => {
    expect(readGuideView(null)).toBe("gallery");
    expect(readGuideView("list")).toBe("list");
    expect(readGuideView("gallery")).toBe("gallery");
    expect(readGuideView("nonsense")).toBe("gallery");
  });

  it("a level swipe moves one; a short or mostly up-and-down one doesn't", () => {
    expect(swipeStep(-80, 5)).toBe(1);
    expect(swipeStep(80, 5)).toBe(-1);
    expect(swipeStep(30, 0)).toBe(0);
    expect(swipeStep(-80, 90)).toBe(0);
  });

  it("goes round the attachments", () => {
    expect(wrapIndex(3, 3)).toBe(0);
    expect(wrapIndex(-1, 3)).toBe(2);
    expect(wrapIndex(0, 0)).toBe(0);
  });

  it("only cards with more than their top line get the …", () => {
    expect(hasMore({ rest: "", steps: 0, attachments: 0 })).toBe(false);
    expect(hasMore({ rest: "More text", steps: 0, attachments: 0 })).toBe(true);
    expect(hasMore({ rest: "", steps: 2, attachments: 0 })).toBe(true);
    expect(hasMore({ rest: "", steps: 0, attachments: 1 })).toBe(true);
  });
});
