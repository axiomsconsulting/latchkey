/* eslint-disable @typescript-eslint/no-explicit-any -- the 0061 tables aren't in the generated types yet, and Stripe payloads are read field by field */
/**
 * Commission Partner programme: applying, Stripe payouts set-up (test mode
 * only unless explicitly allowed), the partner's own view, and the super
 * admin's tools (partners, referral review, fraud flags, terms, settings).
 * Payout runs live in partner-close.functions.ts.
 */
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireSuperAdmin } from "@/lib/roles";
import {
  applyFraudOutcome,
  newTermsProblem,
  raisedSnapshot,
  type LedgerLine,
  type TermsRow,
} from "./commission";
import { PARTNER_DEFAULTS, partnerConfig, trialDaysWarning } from "./partner-config";
import {
  canReceiveTransfers,
  eligibilityFor,
  makeReferralCode,
  onboardingLinkBody,
  platformSetupProblem,
  partnerAccountBody,
} from "./partner-eligibility";

type Ctx = { userId: string };

async function data() {
  return import("./partner-data.server");
}

function siteOrigin(): string {
  const env = process.env["PUBLIC_SITE_URL"];
  if (env) return env.replace(/\/+$/, "");
  try {
    return new URL(getRequest().url).origin;
  } catch {
    return "https://latchkey.omsestates.uk";
  }
}

async function requestHash(kind: "ip" | "device", v?: string | null) {
  const { stableHash } = await import("./partner-identity.server");
  if (kind === "device") return stableHash("device", v ?? null);
  const { requestIp } = await import("./ip-hash.server");
  return stableHash("ip", requestIp(getRequest().headers));
}

/* --------------------------------------------------------------- apply */

const applySchema = z.object({
  kind: z.enum(["individual", "business"]),
  legalName: z.string().trim().min(2).max(200),
  businessName: z.string().trim().max(200).optional(),
  businessType: z.string().trim().max(100).optional(),
  companyNumber: z.string().trim().max(30).optional(),
  country: z.string().trim().length(2),
  email: z.string().trim().email().max(254),
  phone: z.string().trim().max(30),
  vatNumber: z.string().trim().max(30).optional(),
  taxAck: z.literal(true),
  independentAck: z.literal(true),
  deviceId: z.string().max(80).nullable().optional(),
});

/** Apply to be an independent Latchkey Commission Partner. Checked again on the server: country, phone, one application per person. */
export const applyAsPartner = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => applySchema.parse(d))
  .handler(async ({ data: input, context }) => {
    const { adminDb, check, loadPartnerConfig, logPartnerEvent } = await data();
    const db = await adminDb();
    const config = await loadPartnerConfig(db);
    const userId = (context as Ctx).userId;
    const { checkPhone } = await import("./world");
    const phone = checkPhone(input.phone, input.country.toUpperCase());
    if (!phone.ok)
      throw new Error("Check your phone number: it doesn't look right for that country.");
    if (input.kind === "business" && !input.businessName)
      throw new Error("Add your business's name.");
    const existing = check(
      await db.from("partners").select("id").eq("user_id", userId).maybeSingle(),
    );
    if (existing)
      throw new Error("You've already applied. Your Commission Partner account is at /partners.");
    if (!config.hostCanBePartner) {
      const { count } = await db
        .from("host_members")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("role", "owner");
      if ((count ?? 0) > 0)
        throw new Error("Latchkey hosts can't also be Commission Partners for now.");
    }
    const elig = eligibilityFor(input.country, config);
    if (!elig.ok) throw new Error(elig.message);
    const now = new Date().toISOString();
    const row = check(
      await db
        .from("partners")
        .insert({
          user_id: userId,
          kind: input.kind,
          legal_name: input.legalName,
          business_name: input.businessName || null,
          business_type: input.businessType || null,
          company_number: input.companyNumber || null,
          country: input.country.toUpperCase(),
          email: input.email.toLowerCase(),
          phone_e164: phone.e164,
          vat_number: input.vatNumber || null,
          tax_ack_at: now,
          independent_ack_at: now,
          status: elig.status,
          payout_route: elig.route,
        })
        .select("id, status")
        .single(),
    ) as { id: string; status: string };
    await savePartnerKeys(db, row.id, {
      email: input.email,
      phone: phone.e164,
      legalName: input.legalName,
      businessName: input.businessName ?? null,
      companyNumber: input.companyNumber ?? null,
      ipHash: await requestHash("ip"),
      deviceHash: await requestHash("device", input.deviceId),
    });
    await logPartnerEvent(db, {
      partner_id: row.id,
      actor: userId,
      action: "partner_applied",
      details: { country: input.country.toUpperCase(), route: elig.route, status: elig.status },
    });
    return {
      status: row.status,
      message: elig.ok && elig.status === "waitlisted" ? elig.message : null,
    };
  });

async function savePartnerKeys(
  db: import("./partner-data.server").AnyDb,
  partnerId: string,
  p: {
    email?: string | null;
    phone?: string | null;
    legalName?: string | null;
    businessName?: string | null;
    companyNumber?: string | null;
    ipHash?: string | null;
    deviceHash?: string | null;
    bankFingerprint?: string | null;
  },
) {
  const { identityValues } = await import("./partner-identity");
  const { hashValues } = await import("./partner-identity.server");
  const hashed = hashValues(
    identityValues({
      emails: [p.email],
      phones: [p.phone],
      legalNames: [p.legalName],
      businessNames: [p.businessName],
      companyNumber: p.companyNumber ?? null,
      bankFingerprints: [p.bankFingerprint],
      ipHash: p.ipHash ?? null,
      deviceHash: p.deviceHash ?? null,
    }),
  );
  if (hashed.length)
    await db.from("partner_identity_keys").upsert(
      hashed.map((k) => ({ partner_id: partnerId, ...k })),
      { onConflict: "partner_id,kind,value_hash", ignoreDuplicates: true },
    );
}

/* ------------------------------------------------------- partner's view */

/** The signed-in Commission Partner's account: status, link, referred hosts (initials and town only), balance, payouts. */
export const myPartnerAccount = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { adminDb, isMissingTable } = await data();
    const db = await adminDb();
    const userId = (context as Ctx).userId;
    const { data: partner, error } = await db
      .from("partners")
      .select(
        "id, kind, legal_name, business_name, country, email, referral_code, status, payout_route, stripe_account_id, stripe_account_mode, payouts_enabled, terminated_at, created_at",
      )
      .eq("user_id", userId)
      .maybeSingle();
    if (error) {
      if (isMissingTable(error)) return { setUp: false as const };
      throw new Error(error.message);
    }
    if (!partner) return { setUp: true as const, partner: null };
    const [{ data: referrals }, { data: lines }, { data: payouts }] = await Promise.all([
      db
        .from("referrals")
        .select(
          "id, host_label, status, status_detail, paid_months_used, bonus_status, bonus_ineligible_reason, sign_up_at, terms_snapshot",
        )
        .eq("partner_id", partner.id)
        .order("sign_up_at", { ascending: false }),
      db
        .from("commission_ledger")
        .select("amount_pence, state, kind, payable_after, created_at")
        .eq("partner_id", partner.id),
      db
        .from("payouts")
        .select("id, amount_pence, status, route, sent_at, created_at, due_by")
        .eq("partner_id", partner.id)
        .order("created_at", { ascending: false })
        .limit(24),
    ]);
    const sum = (f: (l: { amount_pence: number; state: string }) => boolean) =>
      ((lines ?? []) as Array<{ amount_pence: number; state: string }>)
        .filter(f)
        .reduce((n, l) => n + l.amount_pence, 0);
    return {
      setUp: true as const,
      partner,
      referrals: ((referrals ?? []) as Array<Record<string, unknown> & { status: string }>).map(
        (r) => ({ ...r, status: r.status === "rejected" ? "not_counted" : r.status }),
      ),
      balance: {
        held: sum((l) => (l.state === "held" || l.state === "on_hold") && l.amount_pence > 0),
        payable: sum((l) => l.state === "payable"),
        paid: sum((l) => l.state === "paid"),
      },
      payouts: payouts ?? [],
      link: partner.referral_code
        ? `${siteOrigin()}/?ref=${encodeURIComponent(partner.referral_code)}`
        : null,
      minPayoutPence: PARTNER_DEFAULTS.minPayoutPence,
    };
  });

async function ownPartner(db: import("./partner-data.server").AnyDb, userId: string) {
  const { check } = await data();
  const p = check(
    await db.from("partners").select("*").eq("user_id", userId).maybeSingle(),
  ) as Record<string, any> | null;
  if (!p) throw new Error("You don't have a Commission Partner account yet.");
  return p;
}

/**
 * Stripe payouts set-up: makes the partner's Stripe account (matching the
 * platform profile, transfers only) the first time, then a
 * Stripe-hosted onboarding link. Test mode only unless live payouts are allowed, and never
 * live before Stripe has confirmed the platform profile (D1).
 */
export const startPartnerPayouts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { adminDb, check, loadPartnerConfig, logPartnerEvent } = await data();
    const { PartnerStripeError, partnerStripeMode, v1 } = await import("./partner-stripe.server");
    const db = await adminDb();
    const config = await loadPartnerConfig(db);
    const p = await ownPartner(db, (context as Ctx).userId);
    if (p["status"] !== "active")
      throw new Error("Payouts can be set up once your Commission Partner account is approved.");
    if (p["payout_route"] !== "express")
      throw new Error("Payouts in your country aren't through Stripe yet: we'll be in touch.");
    const mode = partnerStripeMode();
    if (mode === "live" && !config.stripePlatformProfileConfirmed)
      throw new Error("Live Commission Partner payouts aren't switched on yet.");
    let account = p["stripe_account_id"] as string | null;
    if (account && p["stripe_account_mode"] !== mode)
      throw new Error(
        "Your Stripe account was set up in the other Stripe mode: ask Latchkey's admin to reset it.",
      );
    // Latchkey's own Connect set-up refused by Stripe: plain words for the
    // partner, Stripe's code in the partner's log for the admin.
    const plain = async (e: unknown, step: string): Promise<never> => {
      const code = e instanceof PartnerStripeError ? e.code : null;
      const words = platformSetupProblem(code);
      if (words) {
        await logPartnerEvent(db, {
          partner_id: p["id"],
          actor: (context as Ctx).userId,
          action: "stripe_platform_setup_needed",
          details: { step, code, mode },
        });
        throw new Error(words);
      }
      throw e;
    };
    if (!account) {
      const created = await v1<{ id: string }>(
        "/accounts",
        partnerAccountBody({
          id: p["id"],
          country: p["country"],
          email: p["email"],
          kind: p["kind"],
          name: p["business_name"] || p["legal_name"],
        }),
        // A fresh key: Stripe keeps refused attempts under the earlier keys.
        { idempotencyKey: `partner_account_profile_${p["id"]}` },
      ).catch((e) => plain(e, "create_account"));
      account = created.id;
      check(
        await db
          .from("partners")
          .update({
            stripe_account_id: account,
            stripe_account_mode: mode,
            updated_at: new Date().toISOString(),
          })
          .eq("id", p["id"]),
      );
      await logPartnerEvent(db, {
        partner_id: p["id"],
        actor: (context as Ctx).userId,
        action: "stripe_account_created",
        details: { mode },
      });
    }
    const link = await v1<{ url: string }>(
      "/account_links",
      onboardingLinkBody(account, siteOrigin()),
    ).catch((e) => plain(e, "account_link"));
    return { url: link.url };
  });

/** The partner's own Stripe dashboard (a full dashboard: they sign in to Stripe themselves). */
export const partnerStripeDashboard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { adminDb } = await data();
    const p = await ownPartner(await adminDb(), (context as Ctx).userId);
    if (!p["stripe_account_id"]) throw new Error("Set up payouts first.");
    return { url: "https://dashboard.stripe.com/" };
  });

/** Asks Stripe whether the partner's account can be paid yet (also kept up to date by account.updated). */
export const refreshPartnerStripe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { adminDb, check } = await data();
    const { v1 } = await import("./partner-stripe.server");
    const db = await adminDb();
    const p = await ownPartner(db, (context as Ctx).userId);
    if (!p["stripe_account_id"]) return { payoutsEnabled: false };
    const id = encodeURIComponent(p["stripe_account_id"]);
    const acct = await v1<Parameters<typeof canReceiveTransfers>[0] & { requirements?: unknown }>(
      `/accounts/${id}`,
    );
    const ready = canReceiveTransfers(acct);
    check(
      await db
        .from("partners")
        .update({
          payouts_enabled: ready,
          stripe_requirements: acct?.requirements ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", p["id"]),
    );
    // The bank account's fingerprint, where Stripe shares it, for self-referral checks.
    const banks = await v1<{ data?: Array<{ fingerprint?: string }> }>(
      `/accounts/${id}/external_accounts?object=bank_account&limit=1`,
    ).catch(() => null);
    const fp = banks?.data?.[0]?.fingerprint;
    if (fp) await savePartnerKeys(db, p["id"], { bankFingerprint: fp });
    return { payoutsEnabled: ready };
  });

/* --------------------------------------------------------------- admin */

async function admin(context: unknown) {
  await requireSuperAdmin((context as { supabase: unknown }).supabase);
  const d = await data();
  const db = await d.adminDb();
  return { ...d, db, actor: (context as Ctx).userId, config: await d.loadPartnerConfig(db) };
}

/** Everything the Commission Partners admin tab shows. "Not set up yet" before migration 0061. */
export const adminPartnerOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { db, config, isMissingTable } = await admin(context);
    const { data: partners, error } = await db
      .from("partners")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      if (isMissingTable(error)) return { setUp: false as const };
      throw new Error(error.message);
    }
    const [
      { data: referrals },
      { data: flags },
      { data: terms },
      { data: payouts },
      { data: lines },
      { data: pricing },
      { data: clawbacks },
    ] = await Promise.all([
      db
        .from("referrals")
        .select(
          "id, host_id, partner_id, host_label, source, sign_up_at, status, reject_reason, review_note, flags, status_detail, paid_months_used, bonus_status, bonus_ineligible_reason, terms_snapshot, locked_at",
        )
        .order("created_at", { ascending: false })
        .limit(500),
      db
        .from("fraud_flags")
        .select("*")
        .eq("status", "open")
        .order("created_at", { ascending: false }),
      db.from("commission_terms").select("*").order("effective_from", { ascending: false }),
      db.from("payouts").select("*").order("created_at", { ascending: false }).limit(200),
      db.from("commission_ledger").select("partner_id, amount_pence, state"),
      db.from("platform_pricing").select("trial_days").eq("id", 1).maybeSingle(),
      db.from("clawbacks").select("*").in("status", ["open", "repayment_requested"]),
    ]);
    const bal: Record<string, { held: number; payable: number; paid: number }> = {};
    for (const l of (lines ?? []) as Array<{
      partner_id: string;
      amount_pence: number;
      state: string;
    }>) {
      const b = (bal[l.partner_id] ??= { held: 0, payable: 0, paid: 0 });
      if (l.state === "held" || l.state === "on_hold") b.held += l.amount_pence;
      else if (l.state === "payable") b.payable += l.amount_pence;
      else if (l.state === "paid") b.paid += l.amount_pence;
    }
    const { partnerStripeMode } = await import("./partner-stripe.server");
    let mode: string;
    try {
      mode = partnerStripeMode();
    } catch (e) {
      mode = e instanceof Error ? e.message : "not set up";
    }
    return {
      setUp: true as const,
      partners: partners ?? [],
      balances: bal,
      referrals: referrals ?? [],
      flags: flags ?? [],
      terms: terms ?? [],
      payouts: payouts ?? [],
      clawbacks: clawbacks ?? [],
      config,
      stripeMode: mode,
      trialWarning: trialDaysWarning(pricing?.trial_days ?? 30),
    };
  });

/** Approves a partner and issues their readable, unique referral code. */
export const approvePartner = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ partnerId: z.string().uuid() }).parse(d))
  .handler(async ({ data: input, context }) => {
    const { db, actor, check, logPartnerEvent } = await admin(context);
    const p = check(
      await db.from("partners").select("id, referral_code").eq("id", input.partnerId).single(),
    ) as { id: string; referral_code: string | null };
    let code = p.referral_code;
    for (let i = 0; !code && i < 10; i++) {
      const candidate = makeReferralCode(
        () => crypto.getRandomValues(new Uint32Array(1))[0]! / 2 ** 32,
      );
      const { data: taken } = await db
        .from("partners")
        .select("id")
        .ilike("referral_code", candidate)
        .maybeSingle();
      if (!taken) code = candidate;
    }
    if (!code) throw new Error("Couldn't make a unique code: try again.");
    check(
      await db
        .from("partners")
        .update({ status: "active", referral_code: code, updated_at: new Date().toISOString() })
        .eq("id", p.id),
    );
    await logPartnerEvent(db, {
      partner_id: p.id,
      actor,
      action: "partner_approved",
      details: { code },
    });
    return { code };
  });

/** Suspends, re-activates, waitlists or stops a partner (11.2, 11.3); stopping records the date, reason and whether it was for breach. */
export const setPartnerStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        partnerId: z.string().uuid(),
        status: z.enum(["active", "suspended", "waitlisted", "terminated"]),
        reason: z.string().trim().min(3).max(1000),
        breach: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data: input, context }) => {
    const { db, actor, check, logPartnerEvent } = await admin(context);
    const now = new Date().toISOString();
    const patch: Record<string, unknown> = { status: input.status, updated_at: now };
    if (input.status === "terminated")
      Object.assign(patch, {
        terminated_at: now,
        terminated_by: actor,
        termination_reason: input.reason,
        termination_for_breach: !!input.breach,
      });
    check(await db.from("partners").update(patch).eq("id", input.partnerId));
    await logPartnerEvent(db, {
      partner_id: input.partnerId,
      actor,
      action: `partner_${input.status}`,
      details: { reason: input.reason, breach: !!input.breach },
    });
    return { ok: true };
  });

/** Lines held for review go back to waiting out their Hold Period once nothing is open on the referral. */
async function releaseReviewHolds(db: import("./partner-data.server").AnyDb, referralId: string) {
  const { count } = await db
    .from("fraud_flags")
    .select("id", { count: "exact", head: true })
    .eq("referral_id", referralId)
    .eq("status", "open");
  const { data: r } = await db.from("referrals").select("status").eq("id", referralId).single();
  if ((count ?? 0) > 0 || r?.status !== "approved") return;
  await db
    .from("commission_ledger")
    .update({ state: "held" })
    .eq("referral_id", referralId)
    .eq("state", "on_hold")
    .in("note", ["under_review", "fraud_check"]);
}

/** Approves or rejects a referral after review; approving one rejected on a strong match needs an override reason. */
export const reviewReferral = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        referralId: z.string().uuid(),
        decision: z.enum(["approve", "reject"]),
        note: z.string().trim().max(1000).optional(),
        override: z.string().trim().max(1000).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data: input, context }) => {
    const { db, actor, check, logPartnerEvent } = await admin(context);
    const r = check(
      await db
        .from("referrals")
        .select("id, partner_id, status, reject_reason")
        .eq("id", input.referralId)
        .single(),
    ) as { id: string; partner_id: string; status: string; reject_reason: string | null };
    if (
      input.decision === "approve" &&
      r.status === "rejected" &&
      r.reject_reason &&
      !input.override?.trim()
    )
      throw new Error(
        "This referral was rejected on a strong match: give a reason to override it.",
      );
    const now = new Date().toISOString();
    check(
      await db
        .from("referrals")
        .update({
          status: input.decision === "approve" ? "approved" : "rejected",
          review_note: input.note ?? null,
          reviewed_by: actor,
          reviewed_at: now,
          updated_at: now,
          ...(input.decision === "reject" ? { reject_reason: input.note || "admin" } : {}),
        })
        .eq("id", r.id),
    );
    if (input.decision === "approve") {
      // An override clears the strong flags it overrides.
      if (input.override)
        await db
          .from("fraud_flags")
          .update({
            status: "dismissed",
            resolved_by: actor,
            resolved_at: now,
            resolution_note: `Override: ${input.override}`,
          })
          .eq("referral_id", r.id)
          .eq("status", "open");
      await releaseReviewHolds(db, r.id);
    }
    await logPartnerEvent(db, {
      partner_id: r.partner_id,
      referral_id: r.id,
      actor,
      action: `referral_${input.decision}d`,
      details: { note: input.note ?? null, override: input.override ?? null },
    });
    return { ok: true };
  });

/** Confirms a fraud flag (withhold or reverse everything, 6.7 via 8.4) or dismisses it (release). Ending the partner is a separate decision. */
export const resolveFraudFlag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        flagId: z.string().uuid(),
        outcome: z.enum(["confirm", "dismiss"]),
        note: z.string().trim().min(3).max(1000),
      })
      .parse(d),
  )
  .handler(async ({ data: input, context }) => {
    const { db, actor, check, logPartnerEvent } = await admin(context);
    const f = check(await db.from("fraud_flags").select("*").eq("id", input.flagId).single()) as {
      id: string;
      referral_id: string | null;
      partner_id: string | null;
      kind: string;
    };
    const now = new Date().toISOString();
    check(
      await db
        .from("fraud_flags")
        .update({
          status: input.outcome === "confirm" ? "confirmed" : "dismissed",
          resolved_by: actor,
          resolved_at: now,
          resolution_note: input.note,
        })
        .eq("id", f.id),
    );
    if (f.referral_id && input.outcome === "confirm") {
      const lines = (check(
        await db.from("commission_ledger").select("*").eq("referral_id", f.referral_id),
      ) ?? []) as LedgerLine[];
      const plan = applyFraudOutcome(lines);
      if (plan.voids.length)
        check(await db.from("commission_ledger").update({ state: "void" }).in("id", plan.voids));
      for (const l of plan.lines)
        check(
          await db.from("commission_ledger").insert({
            partner_id: f.partner_id,
            referral_id: f.referral_id,
            kind: "clawback",
            state: l.state,
            amount_pence: l.amount_pence,
            reverses_ledger_id: l.reverses_ledger_id,
            note: "fraud",
            created_by: actor,
          }),
        );
      if (plan.clawbacks.length)
        check(
          await db
            .from("clawbacks")
            .insert(plan.clawbacks.map((c) => ({ partner_id: f.partner_id, ...c }))),
        );
      check(
        await db
          .from("referrals")
          .update({
            status: "rejected",
            reject_reason: f.kind,
            bonus_status: "reversed",
            bonus_ineligible_reason: "fraud",
            updated_at: now,
          })
          .eq("id", f.referral_id),
      );
      await db
        .from("launch_bonus_claims")
        .update({ status: "reversed" })
        .eq("referral_id", f.referral_id);
    } else if (f.referral_id) {
      await releaseReviewHolds(db, f.referral_id);
    }
    await logPartnerEvent(db, {
      partner_id: f.partner_id,
      referral_id: f.referral_id,
      actor,
      action: `flag_${input.outcome}ed`,
      details: { kind: f.kind, note: input.note },
    });
    return { ok: true };
  });

const termsSchema = z.object({
  label: z.string().trim().min(2).max(60),
  partnerId: z.string().uuid().nullable().optional(),
  effectiveFrom: z.string().max(40),
  rateBps: z.number().int().min(0).max(10_000),
  paidMonthsCap: z.number().int().min(1).max(12),
  bonusAmountPence: z.number().int().min(0).nullable(),
  bonusTiers: z
    .array(z.object({ from_nth: z.number().int().min(1), pence: z.number().int().min(0) }))
    .max(20)
    .nullable(),
  bonusEndDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  bonusFirstPaymentDeadlineDays: z.number().int().min(1).max(366),
  noticeSentAt: z.string().max(40).nullable().optional(),
  appliesToExisting: z.boolean().optional(),
  writtenNoticeRef: z.string().trim().max(200).nullable().optional(),
});

/** New terms (6.5): reductions need the notice recorded and 30 days; increases may start at once; existing referrals keep theirs. */
export const saveCommissionTerms = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => termsSchema.parse(d))
  .handler(async ({ data: input, context }) => {
    const { db, actor, check, logPartnerEvent, loadTerms } = await admin(context);
    const rows = await loadTerms(db);
    const scope = rows.filter((r) => r.partner_id === (input.partnerId ?? null));
    const prev =
      [...scope].sort((a, b) => Date.parse(b.effective_from) - Date.parse(a.effective_from))[0] ??
      null;
    const next: Omit<TermsRow, "id"> = {
      label: input.label,
      partner_id: input.partnerId ?? null,
      effective_from: new Date(input.effectiveFrom).toISOString(),
      rate_bps: input.rateBps,
      paid_months_cap: input.paidMonthsCap,
      bonus_amount_pence: input.bonusAmountPence,
      bonus_tiers: input.bonusTiers?.length ? input.bonusTiers : null,
      bonus_end_date: input.bonusEndDate,
      bonus_first_payment_deadline_days: input.bonusFirstPaymentDeadlineDays,
      notice_sent_at: input.noticeSentAt ? new Date(input.noticeSentAt).toISOString() : null,
      applies_to_existing: !!input.appliesToExisting,
      written_notice_ref: input.writtenNoticeRef || null,
    };
    const problem = newTermsProblem(prev, next, Date.now());
    if (problem) throw new Error(problem);
    const saved = check(
      await db
        .from("commission_terms")
        .insert({ ...next, created_by: actor })
        .select("id")
        .single(),
    ) as { id: string };
    await logPartnerEvent(db, {
      partner_id: input.partnerId ?? null,
      actor,
      action: "terms_added",
      details: {
        label: input.label,
        effective_from: next.effective_from,
        rate_bps: next.rate_bps,
        bonus: next.bonus_amount_pence,
        end: next.bonus_end_date,
      },
    });
    return { id: saved.id };
  });

/** Raises existing referrals to new terms, only where the terms carry a written notice and only upwards (6.5). */
export const applyTermsToExisting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ termsId: z.string().uuid() }).parse(d))
  .handler(async ({ data: input, context }) => {
    const { db, actor, check, logPartnerEvent } = await admin(context);
    const row = check(
      await db.from("commission_terms").select("*").eq("id", input.termsId).single(),
    ) as TermsRow;
    if (!row.applies_to_existing || !row.written_notice_ref)
      throw new Error("These terms don't say they apply to hosts already referred.");
    if (Date.parse(row.effective_from) > Date.now())
      throw new Error("These terms haven't taken effect yet.");
    let q = db.from("referrals").select("id, terms_snapshot").lt("sign_up_at", row.effective_from);
    if (row.partner_id) q = q.eq("partner_id", row.partner_id);
    const refs = (check(await q) ?? []) as Array<{
      id: string;
      terms_snapshot: import("./commission").TermsSnapshot;
    }>;
    let raised = 0;
    for (const r of refs) {
      const next = raisedSnapshot(r.terms_snapshot, row);
      if (!next) continue;
      check(
        await db
          .from("referrals")
          .update({ terms_snapshot: next, terms_id: row.id, updated_at: new Date().toISOString() })
          .eq("id", r.id),
      );
      raised++;
    }
    await logPartnerEvent(db, {
      actor,
      action: "terms_applied_to_existing",
      details: { terms: row.label, notice: row.written_notice_ref, raised },
    });
    return { raised };
  });

/** The programme's settings (D-numbered decisions); only valid, changeable values are kept. */
export const saveProgrammeSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ settings: z.record(z.string(), z.unknown()) }).parse(d),
  )
  .handler(async ({ data: input, context }) => {
    const { db, actor, check, logPartnerEvent } = await admin(context);
    const clean = partnerConfig(input.settings);
    const changed = Object.fromEntries(
      Object.entries(clean).filter(
        ([k, v]) =>
          JSON.stringify(v) !== JSON.stringify((PARTNER_DEFAULTS as Record<string, unknown>)[k]),
      ),
    );
    check(
      await db.from("site_settings").update({ commission_partner_programme: changed }).eq("id", 1),
    );
    await logPartnerEvent(db, { actor, action: "programme_settings_saved", details: changed });
    return { settings: clean };
  });
