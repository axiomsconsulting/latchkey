import { describe, expect, it } from "vitest";

import { TAP_WINDOW_MS, countTap } from "@/lib/kiosk-taps";

describe("three taps", () => {
  it("fires on the third tap in quick succession", () => {
    let s = countTap([], 1000);
    expect(s.fired).toBe(false);
    s = countTap(s.taps, 1300);
    expect(s.fired).toBe(false);
    s = countTap(s.taps, 1600);
    expect(s).toEqual({ taps: [], fired: true });
  });

  it("forgets taps that are too far apart", () => {
    let s = countTap([], 0);
    s = countTap(s.taps, 400);
    s = countTap(s.taps, 400 + TAP_WINDOW_MS);
    expect(s.fired).toBe(false);
    expect(s.taps).toEqual([400 + TAP_WINDOW_MS]);
  });
});
