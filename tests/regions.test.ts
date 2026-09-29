import { describe, expect, it } from "vitest";

import { isCountryCode, region } from "@/lib/regions";

describe("region", () => {
  it("uses UK wording by default", () => {
    expect(region(null).postcodeLabel).toBe("Postcode");
    expect(region(undefined).currency).toBe("GBP");
    expect(region("nonsense").code).toBe("GB");
  });

  it("uses American wording for a US property", () => {
    const us = region("us");
    expect(us.postcodeLabel).toBe("ZIP code");
    expect(us.regionLabel).toBe("State");
    expect(us.mobileLabel).toBe("Cell phone");
  });

  it("uses Eircode for Ireland and Province for Canada", () => {
    expect(region("IE").postcodeLabel).toBe("Eircode");
    expect(region("CA").regionLabel).toBe("Province");
  });
});

describe("isCountryCode", () => {
  it("accepts supported countries only", () => {
    expect(isCountryCode("gb")).toBe(true);
    expect(isCountryCode("AU")).toBe(true);
    expect(isCountryCode("ZZ")).toBe(false);
  });
});
