import { describe, expect, it } from "vitest";

import { settingLabel, withDemoDefaults } from "@/lib/demo-defaults";

describe("settings kept on a demo property", () => {
  const base = { name: "Hill", theme_config: { preset: "a" }, short_code: "tour", is_demo: true };
  it("go on top of its standard set-up", () => {
    const out = withDemoDefaults(base, {
      theme_config: { kioskLook: "xl", kioskTouch: "expanded" },
    });
    expect(out.theme_config).toEqual({ kioskLook: "xl", kioskTouch: "expanded" });
    expect(out.name).toBe("Hill");
  });
  it("leave everything else following the standard set-up", () => {
    expect(withDemoDefaults(base, null)).toEqual(base);
    expect(withDemoDefaults(base, "nonsense")).toEqual(base);
  });
  it("never replace what belongs to the rebuilt row", () => {
    const out = withDemoDefaults(base, {
      short_code: "other",
      is_demo: false,
      id: "x",
      host_id: "y",
      check_in_pin: "111111",
      kiosk_rest: { smart: true },
    });
    expect(out.short_code).toBe("tour");
    expect(out.is_demo).toBe(true);
    expect(out).not.toHaveProperty("id");
    expect(out).not.toHaveProperty("check_in_pin");
    expect(out.kiosk_rest).toEqual({ smart: true });
  });
  it("read plainly in Latchkey admin", () => {
    expect(settingLabel("kiosk_rest")).toBe("Kiosk rest");
  });
});
