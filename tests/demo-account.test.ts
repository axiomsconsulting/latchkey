import { describe, expect, it } from "vitest";

import { DEMO_INTEGRATION_MODES, assertNotSharedDemo, DEMO_EMAIL } from "../src/lib/demo-account";
import { INTEGRATION_KEYS } from "../src/lib/integration-modes";

describe("shared public demo", () => {
  it("keeps every outside integration in demo mode, including ones added later", () => {
    for (const k of INTEGRATION_KEYS) expect(DEMO_INTEGRATION_MODES[k]).toBe("demo");
    expect(Object.keys(DEMO_INTEGRATION_MODES).sort()).toEqual([...INTEGRATION_KEYS].sort());
  });

  it("refuses locked actions for the shared account only", () => {
    expect(() => assertNotSharedDemo({ email: DEMO_EMAIL })).toThrow(/locked/);
    expect(() => assertNotSharedDemo({ email: "host@example.com" })).not.toThrow();
  });
});
