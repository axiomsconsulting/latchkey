import { describe, expect, it } from "vitest";

import {
  DEFAULT_POLICY,
  QUICK,
  THOROUGH,
  cameraFor,
  effectiveFlow,
  fromLegacy,
  guestFlow,
  lockOf,
  normaliseFlow,
  normalisePolicy,
  presetOf,
  toMethods,
  toRecords,
  visibleSteps,
} from "@/lib/checkin-flow";
import {
  DEFAULT_METHODS,
  MAX_FAILED_CHOICES,
  firstCheckout,
  lockedUntil,
  nightsBetween,
  threeCheckouts,
} from "@/lib/checkin-logic";
import { DEFAULT_RECORDS } from "@/lib/guest-records";

const uk = { uk: true };
const abroad = { uk: false };

describe("the check-in journey", () => {
  it("starts quick: find the stay, photo ID kept, a face photo", () => {
    const f = effectiveFlow(null, DEFAULT_POLICY, abroad);
    expect(f.steps.welcome_go).toBe(true);
    expect(f.steps.lead_id && f.steps.keep_id && f.steps.selfie).toBe(true);
    expect(f.steps.find_confirm || f.steps.every_adult_id || f.steps.last4).toBe(false);
    expect(f.checkout).toBe("three");
    expect(f.idCamera).toBe("front");
  });

  it("keeps the always-on steps on, and the register and who's staying on in the UK only", () => {
    const off = normaliseFlow({
      steps: {
        find_letter: false,
        find_checkout: false,
        self_declare: false,
        party: false,
        register: false,
      },
    });
    const here = effectiveFlow(off, DEFAULT_POLICY, uk);
    expect(here.steps.find_letter && here.steps.find_checkout && here.steps.self_declare).toBe(
      true,
    );
    expect(here.steps.register && here.steps.party).toBe(true);
    const there = effectiveFlow(off, DEFAULT_POLICY, abroad);
    expect(there.steps.register).toBe(false);
    expect(there.steps.party).toBe(false);
  });

  it("drops a step whose parent is off (no ID photo kept without the photo ID)", () => {
    const f = effectiveFlow(
      normaliseFlow({ steps: { lead_id: false, keep_id: true, every_adult_id: true } }),
      DEFAULT_POLICY,
      abroad,
    );
    expect(f.steps.keep_id).toBe(false);
    expect(f.steps.every_adult_id).toBe(false);
    expect(
      lockOf("keep_id", normaliseFlow({ steps: { lead_id: false } }), DEFAULT_POLICY, abroad),
    ).toBe("needs");
  });

  it("lets Latchkey require or remove a step for everyone, whatever the host chose", () => {
    const policy = normalisePolicy({
      defaults: QUICK,
      required: ["selfie", "find_letter"],
      removed: ["last4", "selfie"],
    });
    // Locked steps can't be listed; required wins over removed.
    expect(policy.required).toEqual(["selfie"]);
    expect(policy.removed).toEqual(["last4"]);
    const own = normaliseFlow({ steps: { selfie: false, last4: true } });
    const f = effectiveFlow(own, policy, abroad);
    expect(f.steps.selfie).toBe(true);
    expect(f.steps.last4).toBe(false);
    expect(lockOf("selfie", own, policy, abroad)).toBe("required");
    expect(visibleSteps(policy, abroad).map((s) => s.id)).not.toContain("last4");
    expect(visibleSteps(policy, abroad).map((s) => s.id)).not.toContain("register");
  });

  it("gives a step added later the starting choice for properties that never saw it", () => {
    const saved = { steps: { lead_id: true, selfie: false } };
    const f = normaliseFlow(saved, THOROUGH);
    expect(f.steps.selfie).toBe(false);
    expect(f.steps.find_confirm).toBe(true);
    expect(normaliseFlow({ checkout: "fortnight", idCamera: "side" }).checkout).toBe("three");
  });

  it("matches the older switches both ways", () => {
    const legacy = fromLegacy(
      { ...DEFAULT_METHODS, enabled: { photo_id: true, last4: false, self_declare: true } },
      { ...DEFAULT_RECORDS, facePhoto: true, checkEveryAdult: false },
    );
    expect(legacy.steps.last4).toBe(false);
    expect(legacy.steps.selfie).toBe(true);
    expect(legacy.steps.every_adult_id).toBe(false);
    expect(legacy.steps.welcome_go).toBe(true);
    const f = effectiveFlow(legacy, DEFAULT_POLICY, abroad);
    expect(toMethods(f)).toEqual({
      order: ["photo_id", "last4", "self_declare"],
      enabled: { photo_id: true, last4: false, self_declare: true },
    });
    expect(toRecords(f, { ...DEFAULT_RECORDS, regulatorConfirmed: true, keepDays: 14 })).toEqual({
      askWhoIsStaying: true,
      checkEveryAdult: false,
      idPhoto: false,
      facePhoto: true,
      keepDays: 14,
      regulatorConfirmed: true,
    });
  });

  it("names the preset the choices match", () => {
    expect(presetOf(QUICK, abroad, DEFAULT_POLICY)).toBe("quick");
    expect(presetOf(THOROUGH, abroad, DEFAULT_POLICY)).toBe("thorough");
    expect(
      presetOf(normaliseFlow({ steps: { selfie: false } }), abroad, DEFAULT_POLICY),
    ).toBeNull();
  });

  it("opens the front camera on a door tablet by default, and the obvious one on a phone", () => {
    expect(cameraFor("id", true, QUICK)).toBe("user");
    expect(cameraFor("face", true, QUICK)).toBe("user");
    expect(cameraFor("id", true, { ...QUICK, idCamera: "back" })).toBe("environment");
    expect(cameraFor("id", false, QUICK)).toBe("environment");
    expect(cameraFor("face", false, { ...QUICK, selfieCamera: "back" })).toBe("user");
  });

  it("sends the guest's screen only what it needs", () => {
    expect(guestFlow(THOROUGH)).toEqual({
      welcomeGo: true,
      confirm: true,
      checkout: "three",
      idCamera: "front",
      selfieCamera: "front",
    });
  });
});

describe("three check-out days to pick from", () => {
  const earliest = "2026-10-29";
  it("includes the real day among close ones, sorted, the same every time", () => {
    const days = threeCheckouts(["2026-11-01"], earliest, 12345);
    expect(days).toHaveLength(3);
    expect(days).toContain("2026-11-01");
    expect([...days].sort()).toEqual(days);
    for (const d of days) expect(Math.abs(nightsBetween("2026-11-01", d))).toBeLessThanOrEqual(2);
    expect(threeCheckouts(["2026-11-01"], earliest, 12345)).toEqual(days);
  });

  it("never offers a day before the first possible check-out", () => {
    const days = threeCheckouts(["2026-10-29"], earliest, 7);
    expect(days[0]).toBe("2026-10-29");
    expect(days.every((d) => d >= earliest)).toBe(true);
  });

  it("shows every real day for that initial when there are several", () => {
    expect(threeCheckouts(["2026-11-02", "2026-10-30"], earliest, 1)).toEqual(
      expect.arrayContaining(["2026-10-30", "2026-11-02"]),
    );
    const many = ["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-04"];
    expect(threeCheckouts(many, earliest, 1)).toEqual(many);
  });

  it("still shows three close days when nobody with that initial is arriving", () => {
    const days = threeCheckouts([], earliest, 99);
    expect(new Set(days).size).toBe(3);
    expect(days.every((d) => d >= earliest)).toBe(true);
  });

  it("counts nights and the first check-out day", () => {
    expect(nightsBetween("2026-10-28", "2026-10-31")).toBe(3);
    expect(firstCheckout("2026-10-28", 14)).toBe("2026-10-29");
    expect(firstCheckout("2026-10-28", 2)).toBe("2026-10-28");
  });

  it("pauses the device after two wrong picks", () => {
    const now = new Date("2026-10-28T15:00:00Z");
    const fail = (min: number) => ({
      succeeded: false,
      created_at: new Date(now.getTime() - min * 60_000).toISOString(),
    });
    expect(lockedUntil([fail(1)], now, MAX_FAILED_CHOICES)).toBeNull();
    expect(lockedUntil([fail(1), fail(2)], now, MAX_FAILED_CHOICES)).not.toBeNull();
    expect(lockedUntil([fail(1), fail(2)], now)).toBeNull();
  });
});
