import { describe, expect, it } from "vitest";

import { DEMO_EMAIL, DEMO_LOCKED, assertNotSharedDemo, isTour } from "../src/lib/demo-account";

describe("isTour", () => {
  it("is only the shared demo property at /p/tour", () => {
    expect(isTour({ is_demo: true, short_code: "tour" })).toBe(true);
  });

  it("keeps real-guest protections on hosts' own sample properties", () => {
    expect(isTour({ is_demo: true, short_code: "hill-ab12" })).toBe(false);
  });

  it("never treats a real property as the tour, whatever its code", () => {
    expect(isTour({ is_demo: false, short_code: "tour" })).toBe(false);
    expect(isTour({ short_code: "tour" })).toBe(false);
  });
});

describe("assertNotSharedDemo", () => {
  it("blocks the shared demo account", () => {
    expect(() => assertNotSharedDemo({ email: DEMO_EMAIL })).toThrow(DEMO_LOCKED);
  });

  it("lets real hosts through", () => {
    expect(() => assertNotSharedDemo({ email: "host@example.com" })).not.toThrow();
    expect(() => assertNotSharedDemo(null)).not.toThrow();
  });
});
