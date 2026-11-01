import { describe, expect, it } from "vitest";

import { photoFill, photoStage } from "../src/lib/photo-progress";

describe("photo progress", () => {
  it("says what's happening to an ID, step by step", () => {
    expect(photoStage("id", 0)).toBe("sending");
    expect(photoStage("id", 3000)).toBe("reading");
    expect(photoStage("id", 8000)).toBe("matching");
    expect(photoStage("id", 20000)).toBe("nearly");
    expect(photoStage("face", 5000)).toBe("saving");
  });
  it("fills fast, then slowly, and never finishes on its own", () => {
    expect(photoFill("id", 0)).toBe(0);
    expect(photoFill("id", 3000)).toBeCloseTo(0.5);
    expect(photoFill("id", 6000)).toBeGreaterThan(photoFill("id", 3000));
    expect(photoFill("id", 600000)).toBe(0.95);
    expect(photoFill("face", 1000)).toBeCloseTo(0.5);
  });
});
