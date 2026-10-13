import { describe, expect, it } from "vitest";

import { fieldChanges, rowName } from "../src/lib/activity";
import { canWrite, displayRole, isOwner, maskEmail, normaliseEmail } from "../src/lib/roles";

describe("roles", () => {
  it("lets owners and managers write, including legacy co-hosts", () => {
    expect(canWrite("owner")).toBe(true);
    expect(canWrite("manager")).toBe(true);
    expect(canWrite("co_host")).toBe(true);
  });

  it("keeps viewers, cleaners and strangers read-only", () => {
    expect(canWrite("viewer")).toBe(false);
    expect(canWrite("cleaner")).toBe(false);
    expect(canWrite(null)).toBe(false);
    expect(canWrite("admin")).toBe(false);
  });

  it("only treats owners as owners", () => {
    expect(isOwner("owner")).toBe(true);
    expect(isOwner("manager")).toBe(false);
    expect(isOwner("co_host")).toBe(false);
  });

  it("folds legacy roles into the three shown to people", () => {
    expect(displayRole("co_host")).toBe("manager");
    expect(displayRole("cleaner")).toBe("viewer");
    expect(displayRole(undefined)).toBe("viewer");
  });
});

describe("emails", () => {
  it("compares addresses without case or spaces", () => {
    expect(normaliseEmail("  Jane@Example.COM ")).toBe("jane@example.com");
  });

  it("masks an address the same way the database does", () => {
    expect(maskEmail("Jane@example.com")).toBe("j***@example.com");
  });
});

describe("activity lines", () => {
  it("names the row it was about", () => {
    expect(rowName({ display_name: { old: "Hill 1", new: "Hill One" } })).toBe("Hill One");
    expect(rowName({ name: "Hill Suites", check_in_pin: "[redacted]" })).toBe("Hill Suites");
    expect(rowName({ guest_full_name: "[redacted]" })).toBeNull();
  });

  it("lists field changes without ids, hiding redacted values", () => {
    const changes = fieldChanges("update", {
      display_name: { old: "Hill 1", new: "Hill One" },
      check_in_pin: { old: "[redacted]", new: "[redacted]" },
      room_id: { old: "a", new: "b" },
    });
    expect(changes).toEqual([
      { field: "display name", from: "Hill 1", to: "Hill One", hidden: false },
      { field: "check in pin", from: null, to: null, hidden: true },
    ]);
  });

  it("only lists fields for updates", () => {
    expect(fieldChanges("insert", { name: "x" })).toEqual([]);
  });
});
