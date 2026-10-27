/**
 * The Commission Partner agreement on the website (v1.0): Annex B values,
 * the Launch Bonus wording, placeholders, the settings check, the Markdown
 * reader, the signing boxes, activation and the identity check rules.
 */
import { createHash } from "crypto";
import { readFileSync } from "fs";
import { join } from "path";

import { describe, expect, it } from "vitest";

import { PARTNER_DEFAULTS } from "../src/lib/partner-config";
import {
  agreementValues,
  bonusText,
  contents,
  fillAgreement,
  fullNameProblem,
  parseMarkdown,
  settingsMismatch,
  sha256Hex,
  signingTicks,
  splitSigning,
  ukDate,
} from "../src/lib/partner-agreement";
import { activationBlockers, activationMissing, canRefer } from "../src/lib/partner-activation";
import { judgePartnerId, partnerIdStatus } from "../src/lib/partner-id";
import type { IdRead } from "../src/lib/guest-records";

const TEXT = readFileSync(join(__dirname, "../docs/legal/partner-agreement-v1.0.md"), "utf8");
const NO_BONUS = {
  label: "v0.5-launch",
  effective_from: "2026-10-26T00:00:00Z",
  bonus_amount_pence: null,
  bonus_tiers: null,
  bonus_end_date: null,
};
const values = (terms = NO_BONUS, noticeEmail: string | null = "partners@example.com") =>
  agreementValues({
    version: "1.0",
    publishedAt: "2026-11-01T10:00:00Z",
    bodySha256: "a".repeat(64),
    terms,
    settings: { launchDate: "2026-11-01", noticeEmail },
  });

describe("agreement text", () => {
  it("fills every placeholder, leaving the ones written as `code`", () => {
    const out = fillAgreement(TEXT, values());
    expect(out).not.toMatch(/\{\{(?!.*`)/);
    expect(out).toContain("`{{bonus_summary}}`");
    expect(out).toContain("Published on 1 November 2026");
    expect(out).toContain("1 November 2026 to 31 October 2027");
  });

  it("refuses an unknown placeholder rather than show a gap", () => {
    expect(() => fillAgreement("Hello {{nope}}", values())).toThrow(/unknown placeholder/);
  });

  it("says there's no Launch Bonus unless an amount and an end date are both set (Annex B)", () => {
    expect(bonusText(NO_BONUS)).toMatch(/No Launch Bonus currently applies/);
    expect(bonusText({ ...NO_BONUS, bonus_amount_pence: 2500 })).toMatch(/No Launch Bonus/);
    expect(bonusText({ ...NO_BONUS, bonus_end_date: "2027-01-31" })).toMatch(/No Launch Bonus/);
    expect(bonusText({ ...NO_BONUS, bonus_amount_pence: 2500, bonus_end_date: "2027-01-31" })).toBe(
      "**£25.00** for each Referred Host who signs up on or before **31 January 2027**, pays within 60 days of signing up and completes their first paid month.",
    );
    expect(
      bonusText({
        ...NO_BONUS,
        bonus_tiers: [
          { from_nth: 6, pence: 4000 },
          { from_nth: 1, pence: 2500 },
        ],
        bonus_end_date: "2027-01-31",
      }),
    ).toMatch(/£25.00 for your 1st to 5th host; £40.00 for your 6th host onwards/);
  });

  it("uses the notice email when set, and a safe fallback when not", () => {
    expect(fillAgreement(TEXT, values())).toContain("partners@example.com");
    expect(fillAgreement(TEXT, values(NO_BONUS, null))).toContain(
      "the email address shown in your Account",
    );
  });

  it("gives the same fingerprint for the same inputs", async () => {
    const a = await sha256Hex(fillAgreement(TEXT, values()));
    const b = await sha256Hex(fillAgreement(TEXT, values()));
    expect(a).toBe(b);
    expect(a).not.toBe(await sha256Hex(fillAgreement(TEXT, values(NO_BONUS, null))));
    expect(await sha256Hex("abc")).toBe(createHash("sha256").update("abc").digest("hex"));
  });

  it("keeps the v1.0 numbers in step with the programme settings", () => {
    expect(settingsMismatch(PARTNER_DEFAULTS)).toEqual([]);
    expect(settingsMismatch({ ...PARTNER_DEFAULTS, holdDays: 60 })).toEqual([
      "Hold Period is 60 days; the agreement says 45.",
    ]);
    expect(
      settingsMismatch({ ...PARTNER_DEFAULTS, minPayoutPence: 500, payoutCadence: "quarterly" }),
    ).toHaveLength(2);
  });

  it("reads the Markdown into headings, lists, the summary box and tables", () => {
    const blocks = parseMarkdown(fillAgreement(TEXT, values()));
    expect(blocks[0]).toMatchObject({
      type: "heading",
      level: 1,
      text: "Latchkey Commission Partner Agreement",
    });
    expect(blocks.some((b) => b.type === "quote")).toBe(true);
    expect(blocks.filter((b) => b.type === "table").length).toBe(2);
    expect(contents(blocks).map((c) => c.text)).toContain("17. Data protection");
    const { before, signing, after } = splitSigning(blocks);
    expect(before.length).toBeGreaterThan(50);
    expect(signing[0]).toMatchObject({ type: "heading", text: "Signing (shown on the website)" });
    expect(after.some((b) => b.type === "heading" && b.text.startsWith("Annex B"))).toBe(true);
  });

  it("takes the seven confirmation boxes word for word from the signing section", () => {
    const ticks = signingTicks(parseMarkdown(TEXT));
    expect(ticks).toHaveLength(7);
    expect(ticks[0]).toBe(
      "I have read the whole of the Latchkey Commission Partner Agreement version 1.0 and agree to it.",
    );
  });

  it("needs a full legal name of at least two words", () => {
    expect(fullNameProblem("Pat")).toMatch(/full legal name/);
    expect(fullNameProblem("Pat Partner")).toBeNull();
  });

  it("shows dates in UK time", () => {
    expect(ukDate("2026-12-31")).toBe("31 December 2026");
    expect(ukDate("2026-10-31T23:30:00Z")).toBe("31 October 2026");
    expect(ukDate("2026-08-31T23:30:00Z")).toBe("1 September 2026");
  });
});

describe("activation (3.6, 19.4, 20.1)", () => {
  const base = {
    status: "active",
    terminated_at: null,
    id_check_status: "approved",
    acceptance: { version: "1.0", oms_confirmed_at: "2026-11-02T00:00:00Z" },
    current: { version: "1.0", effective_from: "2026-11-01T00:00:00Z" },
  };
  const now = Date.parse("2026-12-01T00:00:00Z");

  it("works only when signed, identity approved and confirmed by OMS", () => {
    expect(canRefer(base, now)).toBe(true);
    expect(activationMissing({ ...base, acceptance: null }, now)).toEqual([
      "agreement",
      "oms_approval",
    ]);
    expect(activationMissing({ ...base, id_check_status: "manual_review" }, now)).toEqual([
      "id_check",
    ]);
    expect(
      activationMissing({ ...base, acceptance: { version: "1.0", oms_confirmed_at: null } }, now),
    ).toEqual(["oms_approval"]);
  });

  it("stops new referrals once a newer version is in force until it's accepted", () => {
    const newer = { ...base, current: { version: "1.1", effective_from: "2026-11-20T00:00:00Z" } };
    expect(activationMissing(newer, now)).toEqual(["new_version"]);
    expect(
      canRefer(
        { ...newer, current: { version: "1.1", effective_from: "2027-01-01T00:00:00Z" } },
        now,
      ),
    ).toBe(true);
  });

  it("treats the partner who was active before v1.0 as needing the agreement and ID", () => {
    expect(canRefer({ ...base, acceptance: null, id_check_status: null }, now)).toBe(false);
  });

  it("stops on the Stop Date, not before", () => {
    expect(activationMissing({ ...base, terminated_at: "2026-11-30T00:00:00Z" }, now)).toEqual([
      "stopped",
    ]);
    expect(canRefer({ ...base, terminated_at: "2027-01-01T00:00:00Z" }, now)).toBe(true);
  });

  it("lets OMS activate only once signed and verified", () => {
    expect(
      activationBlockers(
        {
          ...base,
          status: "pending_review",
          acceptance: { version: "1.0", oms_confirmed_at: null },
        },
        now,
      ),
    ).toEqual([]);
    expect(
      activationBlockers({ ...base, status: "pending_review", id_check_status: "pending" }, now),
    ).toEqual(["id_check"]);
  });
});

describe("partner identity check (3.4)", () => {
  const read = (o: Partial<IdRead> = {}): IdRead => ({
    isIdDocument: true,
    hasHolderPhoto: true,
    looksHomemade: false,
    documentType: "passport",
    fullName: "Pat Q Partner",
    dateOfBirth: "1990-01-01",
    expiryDate: "2030-01-01",
    issuingCountry: "GBR",
    numberLast4: "1234",
    nationality: "GBR",
    documentNumber: null,
    placeOfIssue: null,
    ...o,
  });
  const judge = (r: IdRead | null, attempt = 1) =>
    judgePartnerId({
      read: r,
      today: "2026-11-01",
      selfieTaken: true,
      signedName: "Pat Partner",
      legalName: "Pat Partner",
      attempt,
    });

  it("passes a genuine, in-date document whose name matches", () => {
    expect(judge(read()).status).toBe("auto_passed");
  });

  it("refuses something on a screen, a printout or a homemade card", () => {
    expect(judge(read({ looksHomemade: true }))).toMatchObject({
      status: "auto_failed",
      reason: "not_photo_id",
      homemadeOrScreen: true,
    });
    expect(judge(read({ isIdDocument: false })).reason).toBe("not_photo_id");
  });

  it("refuses an expired document", () => {
    expect(judge(read({ expiryDate: "2026-10-01" }))).toMatchObject({
      status: "auto_failed",
      reason: "expired",
      expired: true,
    });
  });

  it("sends a name that doesn't match to a person after two attempts", () => {
    expect(judge(read({ fullName: "Sam Other" }), 1).status).toBe("auto_failed");
    expect(judge(read({ fullName: "Sam Other" }), 2)).toMatchObject({
      status: "manual_review",
      reason: "name_not_matched",
    });
  });

  it("sends a partial match, a residence permit or other document to a person", () => {
    expect(judge(read({ fullName: "Pat Smith" })).status).toBe("manual_review");
    expect(judge(read({ documentType: "residence_permit" }))).toMatchObject({
      status: "manual_review",
      reason: "document_type",
    });
    expect(judge(read({ documentType: "other" })).status).toBe("manual_review");
  });

  it("maps checks onto the partner's status", () => {
    expect(partnerIdStatus(null)).toBe("not_started");
    expect(partnerIdStatus({ status: "auto_passed" })).toBe("pending");
    expect(partnerIdStatus({ status: "auto_failed" })).toBe("not_started");
    expect(partnerIdStatus({ status: "approved" })).toBe("approved");
  });
});
