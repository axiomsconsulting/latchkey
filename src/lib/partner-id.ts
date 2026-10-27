/**
 * Commission Partner identity check (agreement v1.0 clause 3.4). Pure,
 * tested; the server side is partner-id.functions.ts and reuses the guest
 * ID reader (readIdDetails), judgeId and compareNames unchanged.
 *
 * Auto pass: a genuine passport, photocard driving licence or national ID
 * card (never a copy, printout or screen), in date, a selfie taken, and the
 * name on it matching the name typed when signing. Two automatic attempts;
 * after that, or on a partial name match, OMS reviews it by hand. Even an
 * auto pass needs OMS's approval before the account is activated (3.6).
 */
import { judgeId, type IdRead } from "./guest-records";
import { compareNames, type NameMatch } from "./name-match";

/** 3.4(a): only these can pass automatically; a residence permit or anything else goes to a person. */
export const AUTO_DOC_TYPES = ["passport", "driving_licence", "national_id"] as const;

export const MAX_AUTO_ATTEMPTS = 2;
/** Reads per partner per 24 hours (each costs an AI call). */
export const READS_PER_DAY = 5;

export type IdOutcome = {
  status: "auto_passed" | "auto_failed" | "manual_review";
  reason: string | null;
  nameMatch: NameMatch;
  expired: boolean;
  homemadeOrScreen: boolean;
};

/** The better of the two names to compare against: the signed name, then the application's legal name. */
export function bestNameMatch(
  read: string | null,
  signedName: string | null,
  legalName: string | null,
): NameMatch {
  const order: NameMatch[] = ["not_matched", "partial", "matched"];
  const a = compareNames(signedName, read);
  const b = compareNames(legalName, read);
  return order.indexOf(a) >= order.indexOf(b) ? a : b;
}

/** What one attempt means, given how many attempts came before it. */
export function judgePartnerId(o: {
  read: IdRead | null;
  today: string;
  selfieTaken: boolean;
  signedName: string | null;
  legalName: string | null;
  attempt: number;
}): IdOutcome {
  const last = o.attempt >= MAX_AUTO_ATTEMPTS;
  const fail = (reason: string, extra: Partial<IdOutcome> = {}): IdOutcome => ({
    status: last ? "manual_review" : "auto_failed",
    reason,
    nameMatch: "not_matched",
    expired: false,
    homemadeOrScreen: false,
    ...extra,
  });
  if (!o.read) return fail("unreadable");
  const homemade = o.read.looksHomemade || !o.read.isIdDocument;
  const verdict = judgeId(o.read, o.today);
  const nameMatch = bestNameMatch(o.read.fullName, o.signedName, o.legalName);
  if (!verdict.ok)
    return fail(verdict.reason === "not_photo_id" ? "not_photo_id" : "unreadable", {
      homemadeOrScreen: homemade,
      nameMatch,
    });
  if (verdict.expired) return fail("expired", { expired: true, nameMatch });
  if (!o.selfieTaken) return fail("no_selfie", { nameMatch });
  if (!AUTO_DOC_TYPES.includes(o.read.documentType as (typeof AUTO_DOC_TYPES)[number]))
    return {
      status: "manual_review",
      reason: "document_type",
      nameMatch,
      expired: false,
      homemadeOrScreen: false,
    };
  if (nameMatch === "matched")
    return {
      status: "auto_passed",
      reason: null,
      nameMatch,
      expired: false,
      homemadeOrScreen: false,
    };
  if (nameMatch === "partial")
    return {
      status: "manual_review",
      reason: "name_partial",
      nameMatch,
      expired: false,
      homemadeOrScreen: false,
    };
  return fail("name_not_matched", { nameMatch });
}

/** partners.id_check_status from the latest check. */
export function partnerIdStatus(
  check: { status: string } | null,
): "not_started" | "pending" | "manual_review" | "approved" | "rejected" {
  if (!check) return "not_started";
  if (check.status === "approved") return "approved";
  if (check.status === "rejected") return "rejected";
  if (check.status === "manual_review") return "manual_review";
  if (check.status === "auto_passed") return "pending";
  return "not_started";
}

export const ID_FAIL_WORDS: Record<string, string> = {
  unreadable:
    "We couldn't read the document. Try again in good light, with the whole document in the frame.",
  not_photo_id:
    "That didn't look like an original photo ID. Photograph the document itself, not a copy, a printout or a screen.",
  expired: "That document has expired. Please use one that's in date.",
  no_selfie: "Take a selfie too.",
  name_not_matched:
    "The name on the document doesn't match the name you signed with. Use your own ID, or contact us if your name has changed.",
  document_type: "We'll check this document by hand.",
  name_partial: "The name is a partial match, so we'll check it by hand.",
  ai_off: "Automatic reading is switched off, so we'll check it by hand.",
};

/** The partner-facing consent shown before the camera opens (agreement 3.4, 17.1). */
export const ID_CONSENT =
  "To protect hosts and stop fraud, we check the identity of every Commission Partner. We'll take a photo of your passport, driving licence or ID card and a selfie, and an AI service will read your name, date of birth, expiry date and country and check the document is genuine. We keep only the last 4 characters of your document number. Only OMS's authorised administrators can see the photos, and every view is logged. We delete the photos 30 days after we approve or reject your check, and keep the details we read and the result while you're a Commission Partner and for 6 years afterwards. See the partner section of our privacy notice.";
