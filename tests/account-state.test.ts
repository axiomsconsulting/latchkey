import { describe, expect, it } from "vitest";

import { accountActions, actionProblem } from "@/lib/account-state";

const owner = { owner: true, admin: false };
const admin = { owner: false, admin: true };
const nobody = { owner: false, admin: false };

describe("pausing and closing a business", () => {
  it("lets the owner or admin pause or close an open business", () => {
    expect(accountActions({}, owner)).toEqual({
      pause: true,
      resume: false,
      close: true,
      reopen: false,
    });
    expect(accountActions({}, admin).pause).toBe(true);
    expect(accountActions({}, nobody)).toEqual({
      pause: false,
      resume: false,
      close: false,
      reopen: false,
    });
  });

  it("lets the owner resume only what they paused; admin resumes anything", () => {
    const byOwner = { suspended_at: "2026-11-08", suspend_source: "owner" };
    const byAdmin = { suspended_at: "2026-11-08", suspend_source: "admin" };
    expect(accountActions(byOwner, owner).resume).toBe(true);
    expect(accountActions(byAdmin, owner).resume).toBe(false);
    expect(actionProblem("resume", byAdmin, owner)).toMatch(/Contact Latchkey support/);
    expect(accountActions(byAdmin, admin).resume).toBe(true);
    expect(accountActions(byOwner, owner).pause).toBe(false);
    // A paused business can still be closed.
    expect(accountActions(byOwner, owner).close).toBe(true);
  });

  it("only lets admin reopen a closed business", () => {
    const closed = { closed_at: "2026-11-08" };
    expect(accountActions(closed, owner)).toEqual({
      pause: false,
      resume: false,
      close: false,
      reopen: false,
    });
    expect(actionProblem("reopen", closed, owner)).toMatch(/Only Latchkey/);
    expect(accountActions(closed, admin).reopen).toBe(true);
  });
});
