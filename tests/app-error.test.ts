import { describe, expect, it } from "vitest";
import { appError, errorText, readAppError } from "@/lib/app-error";

describe("app errors", () => {
  it("round-trips a structured error, even with a prefix added on the way", () => {
    const e = appError({
      code: "stripe_connect_off",
      title: "Card payments can't be connected yet",
      body: "Latchkey is finishing its Stripe set-up.",
      steps: [{ text: "Send this to support", href: "https://x.test" }],
      detail: "Stripe said no",
    });
    const back = readAppError(new Error("Server error: " + e.message));
    expect(back).toMatchObject({
      code: "stripe_connect_off",
      title: "Card payments can't be connected yet",
      detail: "Stripe said no",
      support: true,
    });
    expect(back.steps[0]).toEqual({ text: "Send this to support", href: "https://x.test" });
  });
  it("wraps plain errors with generic next steps", () => {
    const back = readAppError(new Error("Network down"), "Couldn't connect Stripe");
    expect(back.title).toBe("Couldn't connect Stripe");
    expect(back.body).toBe("Network down");
    expect(back.steps.length).toBe(2);
  });
  it("writes copyable text", () => {
    const t = errorText(
      readAppError(
        appError({ code: "c", title: "T", body: "B", steps: [{ text: "Do it" }], detail: "D" }),
      ),
      { page: "/app/settings", business: "Trinity", at: new Date("2026-10-24T10:00:00Z") },
    );
    expect(t).toContain("1. Do it");
    expect(t).toContain("Code: c");
    expect(t).toContain("Business: Trinity");
    expect(t).toContain("When: 2026-10-24T10:00:00.000Z");
    expect(t.endsWith("Details:\nD")).toBe(true);
  });
});
