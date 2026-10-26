/**
 * Commission Partner fraud checks (agreement 8.3-8.5). Pure: hashes in,
 * flags out. Strong flags say "the same person or business" (email, phone,
 * card, company number, bank); weak ones only "worth a look" (IP, device,
 * email domain, names). What a flag does is decided by the caller:
 * STRONG_MATCH_ACTION rejects (admin can override with a reason) or reviews;
 * any open flag holds commission and withholds the bonus until resolved.
 */
import { STRONG_KINDS, WEAK_KINDS, type IdentityKind } from "./partner-identity";
import type { PartnerConfig } from "./partner-config";

export type HashedKey = { kind: IdentityKind; value_hash: string };
export type FlagKind =
  | "self_referral"
  | "prior_host"
  | "bonus_dedupe"
  | "fake_host"
  | "trial_cycling"
  | "burst"
  | "dispute_rate";
export type Flag = {
  kind: FlagKind;
  strength: "strong" | "weak";
  details: Record<string, unknown>;
};

const matches = (a: HashedKey[], b: HashedKey[]) => {
  const set = new Set(b.map((k) => `${k.kind}|${k.value_hash}`));
  return a.filter((k) => set.has(`${k.kind}|${k.value_hash}`));
};

/** The host against the partner, their business and anyone acting for them (8.3, 8.4). */
export function selfReferral(host: HashedKey[], partner: HashedKey[]): Flag | null {
  const hit = matches(host, partner);
  if (!hit.length) return null;
  const strong = hit.some((k) => STRONG_KINDS.has(k.kind));
  return {
    kind: "self_referral",
    strength: strong ? "strong" : "weak",
    details: { matched: [...new Set(hit.map((k) => k.kind))] },
  };
}

export type PriorHost = {
  host_id: string;
  keys: HashedKey[];
  paid: boolean;
  created_at: string;
  cancelled_at?: string | null;
};

/** An existing customer or trial user coming back (8.3): not a Referred Host unless the admin says so. */
export function priorHost(
  host: HashedKey[],
  earlier: PriorHost[],
  trialFlagged: boolean,
): Flag | null {
  const hits = earlier
    .map((h) => ({ h, kinds: [...new Set(matches(host, h.keys).map((k) => k.kind))] }))
    .filter((x) =>
      x.kinds.some(
        (k) =>
          STRONG_KINDS.has(k) ||
          k === "property_address" ||
          k === "listing_url" ||
          k === "business_postcode",
      ),
    );
  if (!hits.length && !trialFlagged) return null;
  const strong = hits.some((x) =>
    x.kinds.some((k) => k === "email" || k === "card_fingerprint" || k === "company_number"),
  );
  return {
    kind: "prior_host",
    strength: strong ? "strong" : "weak",
    details: {
      hosts: hits.map((x) => ({ host_id: x.h.host_id, matched: x.kinds })),
      trial_flag: trialFlagged,
    },
  };
}

/** Which keys decide "the same host" for the once-ever bonus (D7). */
export function dedupeKeys(keys: HashedKey[], scope: PartnerConfig["bonusDedupeScope"]): string[] {
  const kinds: IdentityKind[] =
    scope === "owner_identity"
      ? ["email", "phone", "card_fingerprint", "company_number", "legal_name"]
      : ["company_number", "card_fingerprint", "property_address", "listing_url", "business_name"];
  return keys.filter((k) => kinds.includes(k.kind)).map((k) => `${k.kind}:${k.value_hash}`);
}

/** Has this host's identity had a Launch Bonus before, with any partner, ever (6.4)? */
export function bonusDedupe(
  keys: HashedKey[],
  claims: Array<{ identity_hashes: string[] }>,
  scope: PartnerConfig["bonusDedupeScope"],
): Flag | null {
  const mine = new Set(dedupeKeys(keys, scope));
  const hit = claims.find((c) => c.identity_hashes.some((h) => mine.has(h)));
  return hit
    ? {
        kind: "bonus_dedupe",
        strength: "strong",
        details: {
          matched: hit.identity_hashes.filter((h) => mine.has(h)).map((h) => h.split(":")[0]),
        },
      }
    : null;
}

/** Signs of a real host (8.4: no non-genuine hosts). Anything missing keeps the referral in review. */
export function fakeHost(
  h: { listingUrls: number; emailVerified: boolean; phoneVerified: boolean; cardOnFile: boolean },
  config: Pick<PartnerConfig, "requireListingUrl" | "requirePhoneOtp">,
): Flag | null {
  const missing: string[] = [];
  if (config.requireListingUrl && h.listingUrls < 1) missing.push("listing_url");
  if (!h.emailVerified) missing.push("verified_email");
  if (config.requirePhoneOtp && !h.phoneVerified) missing.push("verified_phone");
  if (!h.cardOnFile) missing.push("card_on_file");
  return missing.length ? { kind: "fake_host", strength: "weak", details: { missing } } : null;
}

const DAY = 86_400_000;

/** Trials that never paid, or cancel-and-re-register within 90 days, by the same identity (8.4). */
export function trialCycling(
  host: HashedKey[],
  createdAt: string,
  earlier: PriorHost[],
): Flag | null {
  const same = earlier.filter((h) => matches(host, h.keys).some((k) => STRONG_KINDS.has(k.kind)));
  const unpaid = same.filter((h) => !h.paid).length;
  const created = Date.parse(createdAt);
  const recent = same.some(
    (h) =>
      h.cancelled_at &&
      created - Date.parse(h.cancelled_at) <= 90 * DAY &&
      created >= Date.parse(h.cancelled_at),
  );
  if (unpaid < 2 && !recent) return null;
  const strong = same.some((h) =>
    matches(host, h.keys).some(
      (k) => k.kind === "email" || k.kind === "card_fingerprint" || k.kind === "company_number",
    ),
  );
  return {
    kind: "trial_cycling",
    strength: strong ? "strong" : "weak",
    details: { unpaid_trials: unpaid, re_registered: recent },
  };
}

/** Many sign-ups on one code in a short time. */
export function burst(
  signUps: string[],
  now: number,
  config: Pick<PartnerConfig, "fraudBurstCount" | "fraudBurstHours">,
): Flag | null {
  const n = signUps.filter((t) => now - Date.parse(t) <= config.fraudBurstHours * 3_600_000).length;
  return n >= config.fraudBurstCount
    ? { kind: "burst", strength: "weak", details: { count: n, hours: config.fraudBurstHours } }
    : null;
}

/** A partner's referred payments refunded or disputed too often: payouts wait for a review. */
export function disputeRate(
  paid: number,
  disputedOrRefunded: number,
  config: Pick<PartnerConfig, "fraudDisputeRateBps" | "fraudWindowDays">,
): Flag | null {
  if (paid < 3) return null;
  const bps = Math.round((disputedOrRefunded * 10_000) / paid);
  return bps > config.fraudDisputeRateBps
    ? {
        kind: "dispute_rate",
        strength: "weak",
        details: {
          paid,
          disputed_or_refunded: disputedOrRefunded,
          window_days: config.fraudWindowDays,
        },
      }
    : null;
}

/** What the flags mean for a new referral. */
export function referralOutcome(
  flags: Flag[],
  config: Pick<PartnerConfig, "strongMatchAction" | "reviewRequired">,
): {
  status: "pending_review" | "approved" | "rejected";
  reason: string | null;
  bonusBlocked: boolean;
} {
  const bonusBlocked = flags.some((f) => f.kind === "bonus_dedupe");
  const strong = flags.find(
    (f) =>
      f.strength === "strong" &&
      (f.kind === "self_referral" || f.kind === "prior_host" || f.kind === "trial_cycling"),
  );
  if (strong && config.strongMatchAction === "auto_reject_with_override")
    return { status: "rejected", reason: strong.kind, bonusBlocked };
  if (flags.length || config.reviewRequired)
    return { status: "pending_review", reason: null, bonusBlocked };
  return { status: "approved", reason: null, bonusBlocked };
}

export { STRONG_KINDS, WEAK_KINDS };

/**
 * Whether a referral code can still be added to a business (D6). "never":
 * only during set-up (its first day), because the Sign-up Date is creating
 * the account through the code (clause 3, 8.1); the admin can still
 * reassign (8.6). The other options keep the Sign-up Date for terms.
 */
export function lateCodeAllowed(
  config: Pick<PartnerConfig, "lateCodeEntry" | "attributionWindowDays">,
  createdAt: string,
  now: number,
  paying: boolean,
): boolean {
  const age = now - Date.parse(createdAt);
  if (config.lateCodeEntry === "never") return age <= DAY;
  if (config.lateCodeEntry === "until_first_paid_invoice") return !paying;
  return age <= config.attributionWindowDays * DAY;
}
