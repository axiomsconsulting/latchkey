import { describe, expect, it } from "vitest";

import { amenityGroup, privateLines } from "@/lib/floor-map";

describe("Around the house cards", () => {
  it("sums private areas up per floor", () => {
    expect(
      privateLines({
        shared: [],
        private: [
          { name: "Lounge", level: 0 },
          { name: "Kitchen", level: 0 },
          { name: "Office", level: 1 },
        ],
        barriers: [],
        useful: [],
      }),
    ).toEqual(["Several private areas on the ground floor", "A private area on the first floor"]);
    expect(privateLines(null)).toEqual([]);
  });

  it("puts each thing in its card", () => {
    expect(amenityGroup({ kind: "kettle", yours: true })).toBe("yours");
    expect(amenityGroup({ kind: "fridge", yours: false })).toBe("comfort");
    expect(amenityGroup({ kind: "fire_blanket", yours: false })).toBe("safety");
  });
});
