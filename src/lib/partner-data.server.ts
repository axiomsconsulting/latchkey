/* eslint-disable @typescript-eslint/no-explicit-any -- the 0061 tables aren't in the generated types yet, and Stripe payloads are read field by field */
/**
 * Server helpers shared by the Commission Partner functions, webhook and
 * month close: the programme's settings and terms, identity keys, the
 * referral checks and the audit log. Server only, service role.
 *
 * Until migration 0061 is applied the tables don't exist: callers get
 * PartnersNotSetUp (shown as "Not set up yet") instead of an error.
 */
import { partnerConfig, type PartnerConfig } from "./partner-config";
import { termsFor, type TermsRow, type TermsSnapshot } from "./commission";
import {
  bonusDedupe,
  burst,
  disputeRate,
  fakeHost,
  priorHost,
  referralOutcome,
  selfReferral,
  trialCycling,
  type Flag,
  type HashedKey,
  type PriorHost,
} from "./partner-fraud";
import { hostLabel, identityValues } from "./partner-identity";
import { hashValues } from "./partner-identity.server";

// The generated database types don't know the new tables yet.
export type AnyDb = {
  from: (t: string) => any;
  rpc: (fn: string, args?: Record<string, unknown>) => any;
  auth?: any;
};

export class PartnersNotSetUp extends Error {
  constructor() {
    super("Commission Partners aren't set up yet: migration 0061 hasn't been applied.");
  }
}

export function isMissingTable(
  error: { code?: string; message?: string } | null | undefined,
): boolean {
  if (!error) return false;
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    error.code === "PGRST204" ||
    error.code === "42703" ||
    /relation .* does not exist|could not find the table|schema cache/i.test(error.message ?? "")
  );
}

/** Throws PartnersNotSetUp for a missing table, the error itself otherwise. */
export function check<T>(res: { data: T; error: { code?: string; message: string } | null }): T {
  if (res.error) {
    if (isMissingTable(res.error)) throw new PartnersNotSetUp();
    throw new Error(res.error.message);
  }
  return res.data;
}

export async function adminDb(): Promise<AnyDb> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as AnyDb;
}

/** The programme's settings: the defaults plus the super admin's overrides. */
export async function loadPartnerConfig(db: AnyDb): Promise<PartnerConfig> {
  const { data, error } = await db
    .from("site_settings")
    .select("commission_partner_programme")
    .eq("id", 1)
    .maybeSingle();
  if (error && !isMissingTable(error)) throw new Error(error.message);
  return partnerConfig(data?.commission_partner_programme ?? null);
}

export async function loadTerms(db: AnyDb): Promise<TermsRow[]> {
  return (check(await db.from("commission_terms").select("*").order("effective_from")) ??
    []) as TermsRow[];
}

export async function snapshotFor(
  db: AnyDb,
  signUpAt: string,
  partnerId: string,
  config: PartnerConfig,
): Promise<TermsSnapshot | null> {
  return termsFor(signUpAt, partnerId, await loadTerms(db), config.bonusFirstPaymentDeadlineDays);
}

export async function logPartnerEvent(
  db: AnyDb,
  e: {
    partner_id?: string | null;
    referral_id?: string | null;
    actor?: string | null;
    action: string;
    details?: Record<string, unknown>;
    ip_hash?: string | null;
  },
) {
  await db.from("partner_events").insert({
    partner_id: e.partner_id ?? null,
    referral_id: e.referral_id ?? null,
    actor: e.actor ?? null,
    action: e.action,
    details: e.details ?? {},
    ip_hash: e.ip_hash ?? null,
  });
}

/* ------------------------------------------------------------ identity */

type HostFacts = {
  businessName: string;
  createdAt: string;
  ownerIds: string[];
  emails: string[];
  emailVerified: boolean;
  phones: string[];
  addresses: Array<{ line: string; postcode: string | null }>;
  postcodes: string[];
  listingUrls: string[];
  town: string | null;
  subscriptionStatus: string | null;
};

/** What Latchkey knows about a business, for its identity keys and the checks. */
export async function hostFacts(db: AnyDb, hostId: string): Promise<HostFacts> {
  const { data: host } = await db
    .from("hosts")
    .select("business_name, contact_email, contact_phone, created_at, subscription_status")
    .eq("id", hostId)
    .single();
  const { data: members } = await db
    .from("host_members")
    .select("user_id, role")
    .eq("host_id", hostId);
  const ownerIds = ((members ?? []) as Array<{ user_id: string; role: string }>)
    .filter((m) => m.role === "owner")
    .map((m) => m.user_id);
  const emails: string[] = host?.contact_email ? [host.contact_email] : [];
  let emailVerified = false;
  for (const id of ownerIds) {
    const { data } = (await db.auth?.admin?.getUserById(id)) ?? { data: null };
    const u = data?.user as
      | {
          email?: string;
          email_confirmed_at?: string | null;
          is_anonymous?: boolean;
          app_metadata?: { provider?: string };
        }
      | undefined;
    if (u?.email) emails.push(u.email);
    if (
      u &&
      !u.is_anonymous &&
      (u.email_confirmed_at || ["google", "apple"].includes(u.app_metadata?.provider ?? ""))
    )
      emailVerified = true;
  }
  const { data: props } = await db
    .from("properties")
    .select("address, postcode, listing_links")
    .eq("host_id", hostId);
  const list = (props ?? []) as Array<{
    address: string | null;
    postcode: string | null;
    listing_links: Array<{ url?: string }> | null;
  }>;
  const first = list.find((p) => p.address)?.address ?? null;
  return {
    businessName: host?.business_name ?? "",
    createdAt: host?.created_at ?? new Date().toISOString(),
    ownerIds,
    emails,
    emailVerified,
    phones: host?.contact_phone ? [host.contact_phone] : [],
    addresses: list
      .filter((p) => p.address)
      .map((p) => ({ line: p.address!, postcode: p.postcode })),
    postcodes: list.map((p) => p.postcode).filter((x): x is string => !!x),
    listingUrls: list.flatMap((p) =>
      Array.isArray(p.listing_links)
        ? p.listing_links.map((l) => l.url).filter((u): u is string => !!u)
        : [],
    ),
    town: first
      ? (first
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
          .slice(-1)[0] ?? null)
      : null,
    subscriptionStatus: host?.subscription_status ?? null,
  };
}

export function labelFor(f: HostFacts): string {
  return hostLabel(f.businessName, f.town);
}

/** Saves a business's identity keys (hashes only); repeats are ignored. */
export async function saveHostKeys(
  db: AnyDb,
  hostId: string,
  f: HostFacts,
  extra: { ipHash?: string | null; deviceHash?: string | null; cardFingerprints?: string[] } = {},
): Promise<HashedKey[]> {
  const hashed = hashValues(
    identityValues({
      emails: f.emails,
      phones: f.phones,
      businessNames: [f.businessName],
      addresses: f.addresses,
      postcodes: f.postcodes,
      listingUrls: f.listingUrls,
      cardFingerprints: extra.cardFingerprints ?? [],
      ipHash: extra.ipHash ?? null,
      deviceHash: extra.deviceHash ?? null,
    }),
  );
  if (hashed.length) {
    check(
      await db.from("host_identity_keys").upsert(
        hashed.map((k) => ({ host_id: hostId, ...k })),
        { onConflict: "host_id,kind,value_hash", ignoreDuplicates: true },
      ),
    );
  }
  return (check(
    await db.from("host_identity_keys").select("kind, value_hash").eq("host_id", hostId),
  ) ?? []) as HashedKey[];
}

/* -------------------------------------------------------------- checks */

/** A referrals row as the server reads it. */
export type ReferralRow = {
  id: string;
  host_id: string | null;
  partner_id: string;
  owner_user_id: string | null;
  status: "pending_review" | "approved" | "rejected";
  reviewed_at: string | null;
  sign_up_at: string;
  terms_snapshot: import("./commission").TermsSnapshot;
  locked_at: string | null;
  qualifying_invoice_id: string | null;
  qualifying_charge_id: string | null;
  qualifying_payment_at: string | null;
  billing_interval: "month" | "year" | null;
  first_paid_month_end: string | null;
  paid_months_used: number;
  last_paid_period_end: string | null;
  qp_refunded_pence: number;
  qp_dispute: "open" | "won" | "lost" | null;
  status_detail: string;
  bonus_status: "not_eligible" | "pending" | "earned" | "withheld" | "reversed" | "paid";
  bonus_ineligible_reason: string | null;
  post_stop_gap_at: string | null;
};

/**
 * Runs every check on a referral and records the result: new flags (no
 * duplicates of an open one), fake-host flags cleared once the gaps are
 * filled, the bonus blocked for a repeat host, and, for a referral still
 * waiting for review, auto-rejection on a strong match (D20).
 */
export async function runReferralChecks(
  db: AnyDb,
  referralId: string,
  config: PartnerConfig,
  now = Date.now(),
): Promise<Flag[]> {
  const r = check(
    await db.from("referrals").select("*").eq("id", referralId).single(),
  ) as ReferralRow;
  if (!r.host_id) return [];
  const keys = (check(
    await db.from("host_identity_keys").select("kind, value_hash").eq("host_id", r.host_id),
  ) ?? []) as HashedKey[];
  const partnerKeys = (check(
    await db
      .from("partner_identity_keys")
      .select("kind, value_hash")
      .eq("partner_id", r.partner_id),
  ) ?? []) as HashedKey[];
  const hashes = [...new Set(keys.map((k) => k.value_hash))];
  const shared = hashes.length
    ? ((check(
        await db
          .from("host_identity_keys")
          .select("host_id, kind, value_hash")
          .in("value_hash", hashes)
          .neq("host_id", r.host_id),
      ) ?? []) as Array<HashedKey & { host_id: string }>)
    : [];
  const otherIds = [...new Set(shared.map((s) => s.host_id))];
  const { data: others } = otherIds.length
    ? await db
        .from("hosts")
        .select("id, created_at, subscription_status, stripe_subscription_id")
        .in("id", otherIds)
    : { data: [] };
  const f = await hostFacts(db, r.host_id);
  const earlier: PriorHost[] = (
    (others ?? []) as Array<{
      id: string;
      created_at: string;
      subscription_status: string | null;
      stripe_subscription_id: string | null;
    }>
  )
    .filter((h) => Date.parse(h.created_at) < Date.parse(f.createdAt))
    .map((h) => ({
      host_id: h.id,
      keys: shared.filter((s) => s.host_id === h.id),
      paid: !!h.stripe_subscription_id && h.subscription_status !== "trialing",
      created_at: h.created_at,
      cancelled_at: h.subscription_status === "canceled" ? h.created_at : null,
    }));
  const { count: trialFlags } = await db
    .from("trial_flags")
    .select("id", { count: "exact", head: true })
    .eq("host_id", r.host_id);
  const { data: claims } = await db
    .from("launch_bonus_claims")
    .select("identity_hashes, referral_id")
    .neq("referral_id", referralId);
  const { data: recent } = await db
    .from("referrals")
    .select("sign_up_at")
    .eq("partner_id", r.partner_id)
    .gte("sign_up_at", new Date(now - config.fraudBurstHours * 3_600_000).toISOString());
  const flags = [
    selfReferral(keys, partnerKeys),
    priorHost(keys, earlier, (trialFlags ?? 0) > 0),
    bonusDedupe(
      keys,
      (claims ?? []) as Array<{ identity_hashes: string[] }>,
      config.bonusDedupeScope,
    ),
    fakeHost(
      {
        listingUrls: f.listingUrls.length,
        emailVerified: f.emailVerified,
        phoneVerified: false,
        cardOnFile: !!r.qualifying_invoice_id,
      },
      config,
    ),
    trialCycling(keys, f.createdAt, earlier),
    burst(
      ((recent ?? []) as Array<{ sign_up_at: string }>).map((x) => x.sign_up_at),
      now,
      config,
    ),
  ].filter((x): x is Flag => !!x);

  const { data: open } = await db
    .from("fraud_flags")
    .select("id, kind")
    .eq("referral_id", referralId)
    .eq("status", "open");
  const openKinds = new Set(((open ?? []) as Array<{ kind: string }>).map((o) => o.kind));
  const fresh = flags.filter((fl) => !openKinds.has(fl.kind));
  if (fresh.length)
    check(
      await db.from("fraud_flags").insert(
        fresh.map((fl) => ({
          referral_id: referralId,
          partner_id: r.partner_id,
          kind: fl.kind,
          strength: fl.strength,
          details: fl.details,
        })),
      ),
    );
  // The gaps that made it look fake are filled (card on file after the first payment, a listing added): clear that flag.
  if (openKinds.has("fake_host") && !flags.some((fl) => fl.kind === "fake_host")) {
    await db
      .from("fraud_flags")
      .update({
        status: "dismissed",
        resolved_at: new Date(now).toISOString(),
        resolution_note: "Filled in since",
      })
      .eq("referral_id", referralId)
      .eq("kind", "fake_host")
      .eq("status", "open");
  }
  const outcome = referralOutcome(flags, config);
  const update: Record<string, unknown> = {
    flags: flags.map((fl) => ({ kind: fl.kind, strength: fl.strength })),
    updated_at: new Date(now).toISOString(),
  };
  if (outcome.bonusBlocked && ["pending", "withheld"].includes(r.bonus_status)) {
    update["bonus_status"] = "not_eligible";
    update["bonus_ineligible_reason"] = "prior_claim";
  }
  // Only a referral nobody has reviewed yet is rejected automatically; an admin's decision stands.
  if (r.status === "pending_review" && !r.reviewed_at && outcome.status === "rejected") {
    update["status"] = "rejected";
    update["reject_reason"] = outcome.reason;
  }
  check(await db.from("referrals").update(update).eq("id", referralId));
  if (fresh.length)
    await logPartnerEvent(db, {
      partner_id: r.partner_id,
      referral_id: referralId,
      action: "flags_raised",
      details: { flags: fresh.map((fl) => `${fl.kind}:${fl.strength}`) },
    });
  return flags;
}

/** A partner's referred payments refunded or disputed recently: a partner-level flag that holds payouts. */
export async function checkDisputeRate(
  db: AnyDb,
  partnerId: string,
  config: PartnerConfig,
  now = Date.now(),
) {
  const since = new Date(now - config.fraudWindowDays * 86_400_000).toISOString();
  const { data } = await db
    .from("commission_ledger")
    .select("kind, stripe_charge_id")
    .eq("partner_id", partnerId)
    .gte("created_at", since);
  const rows = (data ?? []) as Array<{ kind: string; stripe_charge_id: string | null }>;
  const paid = new Set(rows.filter((x) => x.kind === "commission").map((x) => x.stripe_charge_id))
    .size;
  const bad = new Set(
    rows
      .filter((x) => x.kind === "clawback" || x.kind === "dispute_hold")
      .map((x) => x.stripe_charge_id),
  ).size;
  const flag = disputeRate(paid, bad, config);
  if (!flag) return;
  const { count } = await db
    .from("fraud_flags")
    .select("id", { count: "exact", head: true })
    .eq("partner_id", partnerId)
    .is("referral_id", null)
    .eq("kind", "dispute_rate")
    .eq("status", "open");
  if (!count)
    await db.from("fraud_flags").insert({
      partner_id: partnerId,
      kind: "dispute_rate",
      strength: "weak",
      details: flag.details,
    });
}
