/**
 * Commission Partner fraud checks (8.3-8.5): self-referral, prior hosts,
 * once-ever bonus, fake hosts, trial cycling, bursts and dispute rates.
 */
import { describe, expect, it } from "vitest";

import { PARTNER_DEFAULTS as C } from "../src/lib/partner-config";
import {
  bonusDedupe,
  burst,
  dedupeKeys,
  disputeRate,
  fakeHost,
  lateCodeAllowed,
  priorHost,
  referralOutcome,
  selfReferral,
  trialCycling,
  type HashedKey,
} from "../src/lib/partner-fraud";

const k = (kind: HashedKey["kind"], value_hash: string): HashedKey => ({ kind, value_hash });
const host = [
  k("email", "e1"),
  k("phone", "p1"),
  k("ip_hash", "ip1"),
  k("device_hash", "d1"),
  k("business_name", "b1"),
  k("property_address", "a1"),
];

describe("self-referral", () => {
  it("is strong for the same email, phone, card, company number or bank", () => {
    for (const kind of [
      "email",
      "phone",
      "card_fingerprint",
      "company_number",
      "bank_fingerprint",
    ] as const) {
      const keys = [...host, k(kind, "same")];
      expect(selfReferral(keys, [k(kind, "same")])).toMatchObject({
        kind: "self_referral",
        strength: "strong",
      });
    }
  });

  it("is weak for the same IP, device, email domain or name", () => {
    for (const kind of [
      "ip_hash",
      "device_hash",
      "email_domain",
      "legal_name",
      "business_name",
    ] as const) {
      expect(selfReferral([k(kind, "x")], [k(kind, "x")])).toMatchObject({ strength: "weak" });
    }
    expect(selfReferral(host, [k("email", "other")])).toBeNull();
  });
});

describe("prior hosts and repeat bonuses", () => {
  it("flags an earlier customer or trial user, strongly when email, card or company number match", () => {
    expect(
      priorHost(
        host,
        [{ host_id: "h0", keys: [k("email", "e1")], paid: true, created_at: "2026-01-01" }],
        false,
      ),
    ).toMatchObject({ kind: "prior_host", strength: "strong" });
    expect(
      priorHost(
        host,
        [
          {
            host_id: "h0",
            keys: [k("property_address", "a1")],
            paid: false,
            created_at: "2026-01-01",
          },
        ],
        false,
      ),
    ).toMatchObject({ strength: "weak" });
    expect(
      priorHost(
        host,
        [{ host_id: "h0", keys: [k("ip_hash", "ip1")], paid: false, created_at: "2026-01-01" }],
        false,
      ),
    ).toBeNull();
    expect(priorHost(host, [], true)).toMatchObject({
      strength: "weak",
      details: { trial_flag: true },
    });
  });

  it("blocks a second bonus for the same owner with any partner, ever", () => {
    const claims = [{ identity_hashes: dedupeKeys([k("email", "e1")], "owner_identity") }];
    expect(bonusDedupe(host, claims, "owner_identity")).toMatchObject({
      kind: "bonus_dedupe",
      strength: "strong",
    });
    expect(
      bonusDedupe(
        [k("email", "new"), k("card_fingerprint", "card")],
        [{ identity_hashes: ["card_fingerprint:card"] }],
        "owner_identity",
      ),
    ).not.toBeNull();
    expect(bonusDedupe([k("email", "new")], claims, "owner_identity")).toBeNull();
    // By business: the same owner's second business can earn its own.
    expect(bonusDedupe(host, claims, "business")).toBeNull();
  });
});

describe("genuine hosts and patterns", () => {
  it("keeps a referral in review while it lacks a listing, verified email or card", () => {
    expect(
      fakeHost(
        { listingUrls: 0, emailVerified: false, phoneVerified: false, cardOnFile: false },
        C,
      ),
    ).toMatchObject({ details: { missing: ["listing_url", "verified_email", "card_on_file"] } });
    expect(
      fakeHost({ listingUrls: 1, emailVerified: true, phoneVerified: false, cardOnFile: true }, C),
    ).toBeNull();
    expect(
      fakeHost(
        { listingUrls: 1, emailVerified: true, phoneVerified: false, cardOnFile: true },
        { ...C, requirePhoneOtp: true },
      ),
    ).not.toBeNull();
  });

  it("spots trial cycling", () => {
    const unpaid = (id: string) => ({
      host_id: id,
      keys: [k("email", "e1")],
      paid: false,
      created_at: "2026-01-01",
    });
    expect(trialCycling(host, "2026-11-01T00:00:00Z", [unpaid("a")])).toBeNull();
    expect(trialCycling(host, "2026-11-01T00:00:00Z", [unpaid("a"), unpaid("b")])).toMatchObject({
      kind: "trial_cycling",
      strength: "strong",
    });
    expect(
      trialCycling(host, "2026-11-01T00:00:00Z", [
        {
          host_id: "c",
          keys: [k("phone", "p1")],
          paid: true,
          created_at: "2026-06-01",
          cancelled_at: "2026-09-01T00:00:00Z",
        },
      ]),
    ).toMatchObject({ strength: "weak", details: { re_registered: true } });
  });

  it("flags bursts and high dispute rates", () => {
    const now = Date.parse("2026-11-01T12:00:00Z");
    const t = (h: number) => new Date(now - h * 3_600_000).toISOString();
    expect(burst([t(1), t(2), t(3), t(4)], now, C)).toBeNull();
    expect(burst([t(1), t(2), t(3), t(4), t(5)], now, C)).toMatchObject({
      kind: "burst",
      details: { count: 5 },
    });
    expect(burst([t(1), t(2), t(3), t(4), t(30)], now, C)).toBeNull();
    expect(disputeRate(10, 1, C)).toBeNull();
    expect(disputeRate(10, 2, C)).toMatchObject({ kind: "dispute_rate" });
    expect(disputeRate(2, 2, C)).toBeNull();
  });
});

describe("outcomes and late codes", () => {
  it("auto-rejects strong matches (admin can override), reviews everything else", () => {
    expect(
      referralOutcome([{ kind: "self_referral", strength: "strong", details: {} }], C),
    ).toEqual({ status: "rejected", reason: "self_referral", bonusBlocked: false });
    expect(
      referralOutcome([{ kind: "self_referral", strength: "strong", details: {} }], {
        ...C,
        strongMatchAction: "review",
      }).status,
    ).toBe("pending_review");
    expect(
      referralOutcome([{ kind: "self_referral", strength: "weak", details: {} }], C).status,
    ).toBe("pending_review");
    expect(referralOutcome([], C).status).toBe("pending_review");
    expect(referralOutcome([], { ...C, reviewRequired: false }).status).toBe("approved");
    expect(
      referralOutcome([{ kind: "bonus_dedupe", strength: "strong", details: {} }], C),
    ).toMatchObject({ status: "pending_review", bonusBlocked: true });
  });

  it("lets a code be added only while the account is being created by default (D6, agreement 6.2)", () => {
    const created = "2026-11-01T10:00:00Z";
    const at = (h: number) => Date.parse(created) + h * 3_600_000;
    expect(lateCodeAllowed(C, created, at(0.1), false, false)).toBe(true);
    // Set-up has saved its first property: the account exists, so no more codes.
    expect(lateCodeAllowed(C, created, at(0.2), false, true)).toBe(false);
    expect(lateCodeAllowed(C, created, at(30), false, false)).toBe(false);
    expect(
      lateCodeAllowed(
        { ...C, lateCodeEntry: "until_first_paid_invoice" },
        created,
        at(24 * 40),
        false,
        true,
      ),
    ).toBe(true);
    expect(
      lateCodeAllowed(
        { ...C, lateCodeEntry: "until_first_paid_invoice" },
        created,
        at(24 * 40),
        true,
        true,
      ),
    ).toBe(false);
    expect(
      lateCodeAllowed({ ...C, lateCodeEntry: "window_only" }, created, at(24 * 59), true, true),
    ).toBe(true);
    expect(
      lateCodeAllowed({ ...C, lateCodeEntry: "window_only" }, created, at(24 * 61), false, true),
    ).toBe(false);
  });
});
