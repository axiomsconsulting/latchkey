import { describe, expect, it } from "vitest";

import { jumboBarLayout } from "../src/lib/jumbo-bar";

const base = { width: 1000, icons: 150, clock: 200, clockShort: 80, gap: 20 };

describe("jumboBarLayout", () => {
  it("keeps the clock in the middle while the name fits beside it", () => {
    expect(jumboBarLayout({ ...base, name: 300 })).toEqual({
      compact: false,
      clockLeft: 400,
      nameWidth: 300,
      scroll: false,
    });
  });
  it("moves the clock right for a longer name, never into the icons", () => {
    const l = jumboBarLayout({ ...base, name: 500 });
    expect(l).toEqual({ compact: false, clockLeft: 520, nameWidth: 500, scroll: false });
    expect(l.clockLeft + base.clock).toBeLessThanOrEqual(base.width - base.icons - base.gap);
  });
  it("then shows the time alone", () => {
    expect(jumboBarLayout({ ...base, name: 650 })).toEqual({
      compact: true,
      clockLeft: 670,
      nameWidth: 650,
      scroll: false,
    });
  });
  it("and scrolls a name too long even then, the clock still clear of the icons", () => {
    const l = jumboBarLayout({ ...base, name: 1200 });
    expect(l.compact).toBe(true);
    expect(l.scroll).toBe(true);
    expect(l.clockLeft + base.clockShort).toBe(base.width - base.icons - base.gap);
    expect(l.nameWidth).toBe(l.clockLeft - base.gap);
  });
  it("makes room when more icons appear (the mute button)", () => {
    const fewer = jumboBarLayout({ ...base, name: 500 });
    const more = jumboBarLayout({ ...base, icons: 300, name: 500 });
    expect(more.clockLeft + (more.compact ? base.clockShort : base.clock)).toBeLessThanOrEqual(
      base.width - 300 - base.gap,
    );
    expect(fewer.compact).toBe(false);
  });
});
