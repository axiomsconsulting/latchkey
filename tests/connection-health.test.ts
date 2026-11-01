import { describe, expect, it } from "vitest";

import { line, sortLines } from "@/lib/connection-health";

describe("test all connections", () => {
  it("turns each check into one line with the fix when it isn't ok", () => {
    expect(line("t", "Twilio", { configured: false, fix: "Add keys" })).toMatchObject({
      status: "fail",
      fix: "Add keys",
    });
    expect(
      line("f", "Firecrawl", { configured: false, fix: "Add key", optional: true }).status,
    ).toBe("off");
    expect(
      line("s", "Stripe", { configured: true, ok: true, detail: "Live", fix: "x" }),
    ).toMatchObject({ status: "ok", fix: null });
    expect(
      line("s", "Stripe", { configured: true, ok: false, detail: "401", fix: "New key" }).status,
    ).toBe("fail");
  });

  it("puts what needs doing first", () => {
    const l = (key: string, status: "ok" | "warn" | "fail" | "off") => ({
      key,
      name: key,
      status,
      detail: "",
      fix: null,
    });
    expect(sortLines([l("a", "ok"), l("b", "fail"), l("c", "warn")]).map((x) => x.key)).toEqual([
      "b",
      "c",
      "a",
    ]);
  });
});
