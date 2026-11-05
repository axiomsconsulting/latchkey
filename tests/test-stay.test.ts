import { describe, expect, it } from "vitest";

import {
  suggestedName,
  surnameLetter,
  testNameProblem,
  testStayDates,
  testStayNote,
} from "@/lib/test-stay";

describe("a host's test check-in", () => {
  it("is for tonight only", () => {
    expect(testStayDates("2026-11-05")).toEqual({
      check_in_date: "2026-11-05",
      check_out_date: "2026-11-06",
    });
    expect(testStayDates("2026-12-31").check_out_date).toBe("2027-01-01");
  });
  it("says what it is in its notes", () => {
    const n = testStayNote("Sam Lee");
    expect(n).toContain("Sam Lee");
    expect(n).toContain("Not a real guest");
    expect(n).toContain("doesn't block");
  });
  it("needs a first name and surname", () => {
    expect(testNameProblem("Sam")).toBe(true);
    expect(testNameProblem("  Sam   Lee ")).toBe(false);
  });
  it("starts from the name they signed in with", () => {
    expect(suggestedName({ full_name: " Sam Lee " })).toBe("Sam Lee");
    expect(suggestedName({ name: "Sam Lee" })).toBe("Sam Lee");
    expect(suggestedName({})).toBe("");
    expect(suggestedName(null)).toBe("");
  });
  it("knows the surname letter the kiosk asks for", () => {
    expect(surnameLetter("Sam van Lee")).toBe("L");
  });
});
