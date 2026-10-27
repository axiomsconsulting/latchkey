/* eslint-disable @typescript-eslint/no-explicit-any -- the 0061/0062 tables aren't in the generated types yet */
/**
 * Commission Partner referrals: a click on a partner's link, attaching a new
 * business to its partner at set-up (the Sign-up Date, clause 3), and the
 * admin moving a referral to another partner (8.6). Codes are always checked
 * here on the server; whatever the browser sends is only a claim.
 */
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireOwner, requireSuperAdmin } from "@/lib/roles";
import { cleanRefCode } from "./attribution";

const DAY = 86_400_000;

async function requestHashes(deviceId: string | null | undefined) {
  const { requestIp } = await import("./ip-hash.server");
  const { stableHash } = await import("./partner-identity.server");
  return {
    ipHash: stableHash("ip", requestIp(getRequest().headers)),
    deviceHash: stableHash("device", deviceId ?? null),
  };
}

/** A visit through a partner's link: recorded once per new cookie, for an active partner only, rate-limited. */
export const recordReferralClick = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        code: z.string().max(40),
        path: z.string().max(200).optional(),
        deviceId: z.string().max(80).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const code = cleanRefCode(data.code);
    if (!code) return { ok: false };
    try {
      const { adminDb, check } = await import("./partner-data.server");
      const db = await adminDb();
      const partner = check(
        await db.from("partners").select("*").ilike("referral_code", code).maybeSingle(),
      ) as ({ id: string } & Record<string, any>) | null;
      if (!partner || !(await partnerCanRefer(db, partner))) return { ok: false };
      const { ipHash, deviceHash } = await requestHashes(data.deviceId);
      if (ipHash) {
        const { count } = await db
          .from("referral_clicks")
          .select("id", { count: "exact", head: true })
          .eq("ip_hash", ipHash)
          .gte("clicked_at", new Date(Date.now() - 3_600_000).toISOString());
        if ((count ?? 0) >= 30) return { ok: false };
      }
      check(
        await db.from("referral_clicks").insert({
          partner_id: partner.id,
          code,
          ip_hash: ipHash,
          device_hash: deviceHash,
          landing_path: data.path ?? null,
        }),
      );
      return { ok: true };
    } catch {
      // Not set up yet, or the hash secret is missing: the cookie still holds the code for set-up.
      return { ok: false };
    }
  });

export type AttachResult =
  | { ok: true; status: string }
  | {
      ok: false;
      reason:
        | "not_set_up"
        | "unknown_code"
        | "already"
        | "too_late"
        | "partner_is_owner"
        | "no_terms"
        | "own_code";
    };

const REASONS: Record<Exclude<AttachResult, { ok: true }>["reason"], string> = {
  not_set_up: "Referral codes can't be added just now.",
  unknown_code: "That code isn't one we recognise. Check it with your Commission Partner.",
  already: "This business already has a Commission Partner.",
  too_late: "A referral code can only be added when the account is first set up.",
  partner_is_owner: "Commission Partners can't refer their own business.",
  no_terms: "Referral codes can't be added just now.",
  own_code: "You can't use your own referral code.",
};

export function attachReasonText(r: AttachResult): string | null {
  return r.ok ? null : REASONS[r.reason];
}

/**
 * Links a new business to the Commission Partner whose code it signed up
 * with. The Sign-up Date is when the business was created (hosts.created_at),
 * and the terms in force then are snapshotted for good (6.5). The code must
 * belong to an active partner; with LATE_CODE_ENTRY "never" it can only be
 * added during set-up (the first day). Every referral starts in review.
 */
export const attachReferral = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        hostId: z.string().uuid(),
        code: z.string().max(40),
        source: z.enum(["link", "cookie", "typed"]),
        clickedAt: z.string().max(40).nullable().optional(),
        deviceId: z.string().max(80).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<AttachResult> => {
    await requireOwner(context.supabase, data.hostId);
    const code = cleanRefCode(data.code);
    if (!code) return { ok: false, reason: "unknown_code" };
    const {
      adminDb,
      check,
      hostFacts,
      labelFor,
      loadPartnerConfig,
      logPartnerEvent,
      PartnersNotSetUp,
      runReferralChecks,
      saveHostKeys,
      snapshotFor,
    } = await import("./partner-data.server");
    const db = await adminDb();
    try {
      const config = await loadPartnerConfig(db);
      const partner = check(
        await db.from("partners").select("*").ilike("referral_code", code).maybeSingle(),
      ) as ({ id: string; user_id: string } & Record<string, any>) | null;
      // 3.6, 19.4, 20.3(e): only an activated partner on the version in force, not stopped.
      if (!partner || !(await partnerCanRefer(db, partner)))
        return { ok: false, reason: "unknown_code" };
      const existing = check(
        await db.from("referrals").select("id").eq("host_id", data.hostId).maybeSingle(),
      );
      if (existing) return { ok: false, reason: "already" };

      const facts = await hostFacts(db, data.hostId);
      const now = Date.now();
      const paying =
        facts.subscriptionStatus === "active" || facts.subscriptionStatus === "past_due";
      const { lateCodeAllowed } = await import("./partner-fraud");
      const { count: properties } = await db
        .from("properties")
        .select("id", { count: "exact", head: true })
        .eq("host_id", data.hostId);
      if (!lateCodeAllowed(config, facts.createdAt, now, paying, (properties ?? 0) > 0))
        return { ok: false, reason: "too_late" };
      const userId = context.userId ?? null;
      if (partner.user_id === userId || facts.ownerIds.includes(partner.user_id))
        return { ok: false, reason: config.hostCanBePartner ? "own_code" : "partner_is_owner" };
      if (!config.hostCanBePartner && userId) {
        const mine = check(
          await db.from("partners").select("id").eq("user_id", userId).maybeSingle(),
        );
        if (mine) return { ok: false, reason: "partner_is_owner" };
      }

      const snapshot = await snapshotFor(db, facts.createdAt, partner.id, config);
      if (!snapshot) return { ok: false, reason: "no_terms" };

      // A link or cookie only counts with a recorded click from this device inside the window; otherwise it's a typed code.
      const { ipHash, deviceHash } = await requestHashes(data.deviceId);
      let source: "link" | "cookie" | "typed" = data.source;
      let clickedAt: string | null = null;
      if (source !== "typed") {
        const since = new Date(now - config.attributionWindowDays * DAY).toISOString();
        const click = deviceHash
          ? (check(
              await db
                .from("referral_clicks")
                .select("clicked_at")
                .eq("partner_id", partner.id)
                .eq("device_hash", deviceHash)
                .gte("clicked_at", since)
                .order("clicked_at")
                .limit(1)
                .maybeSingle(),
            ) as { clicked_at: string } | null)
          : null;
        if (click) clickedAt = click.clicked_at;
        else source = "typed";
      }

      await saveHostKeys(db, data.hostId, facts, { ipHash, deviceHash });
      const inserted = check(
        await db
          .from("referrals")
          .insert({
            host_id: data.hostId,
            partner_id: partner.id,
            owner_user_id: userId,
            source,
            clicked_at: clickedAt,
            sign_up_at: facts.createdAt,
            terms_id: snapshot.terms_id,
            terms_snapshot: snapshot,
            status: "pending_review",
            host_label: labelFor(facts),
          })
          .select("id")
          .single(),
      ) as { id: string };
      const flags = await runReferralChecks(db, inserted.id, config);
      await logPartnerEvent(db, {
        partner_id: partner.id,
        referral_id: inserted.id,
        actor: userId,
        action: "referral_attached",
        details: {
          source,
          terms: snapshot.label,
          flags: flags.map((f) => `${f.kind}:${f.strength}`),
        },
        ip_hash: ipHash,
      });
      const { data: after } = await db
        .from("referrals")
        .select("status")
        .eq("id", inserted.id)
        .single();
      return { ok: true, status: after?.status ?? "pending_review" };
    } catch (e) {
      if (e instanceof PartnersNotSetUp) return { ok: false, reason: "not_set_up" };
      // A second attach racing this one hits the one-partner-per-business rule.
      if (/duplicate key|unique/i.test(String(e))) return { ok: false, reason: "already" };
      throw e;
    }
  });

/** Whether this business has a Commission Partner (for the set-up field). */
export const myReferral = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ hostId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await requireOwner(context.supabase, data.hostId);
    try {
      const { adminDb, check } = await import("./partner-data.server");
      const db = await adminDb();
      const r = check(
        await db.from("referrals").select("id").eq("host_id", data.hostId).maybeSingle(),
      );
      return { setUp: true, attached: !!r };
    } catch {
      return { setUp: false, attached: false };
    }
  });

/**
 * The admin moves a referral to another partner (8.6), with a reason, logged.
 * Refused once the Qualifying Payment has locked it, unless forced.
 */
export const reassignReferral = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        hostId: z.string().uuid(),
        partnerId: z.string().uuid(),
        reason: z.string().trim().min(5).max(500),
        force: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireSuperAdmin(context.supabase);
    const {
      adminDb,
      check,
      hostFacts,
      labelFor,
      loadPartnerConfig,
      logPartnerEvent,
      runReferralChecks,
      saveHostKeys,
      snapshotFor,
    } = await import("./partner-data.server");
    const db = await adminDb();
    const config = await loadPartnerConfig(db);
    const actor = context.userId ?? null;
    const partner = check(
      await db.from("partners").select("id, status").eq("id", data.partnerId).single(),
    ) as { id: string; status: string };
    const r = check(
      await db
        .from("referrals")
        .select("id, partner_id, locked_at, sign_up_at")
        .eq("host_id", data.hostId)
        .maybeSingle(),
    ) as { id: string; partner_id: string; locked_at: string | null; sign_up_at: string } | null;
    if (r?.locked_at && !data.force)
      throw new Error(
        "This referral is locked by its first payment. Tick 'force' and give a reason to move it anyway.",
      );
    let referralId: string;
    if (r) {
      // Terms stay those of the Sign-up Date, looked up for the new partner (their own terms may differ).
      const snapshot = await snapshotFor(db, r.sign_up_at, partner.id, config);
      check(
        await db
          .from("referrals")
          .update({
            partner_id: partner.id,
            source: "admin",
            terms_id: snapshot?.terms_id ?? null,
            terms_snapshot: snapshot,
            updated_at: new Date().toISOString(),
          })
          .eq("id", r.id),
      );
      referralId = r.id;
    } else {
      const facts = await hostFacts(db, data.hostId);
      const snapshot = await snapshotFor(db, facts.createdAt, partner.id, config);
      if (!snapshot)
        throw new Error("No commission terms were in effect on this business's Sign-up Date.");
      await saveHostKeys(db, data.hostId, facts);
      referralId = (
        check(
          await db
            .from("referrals")
            .insert({
              host_id: data.hostId,
              partner_id: partner.id,
              source: "admin",
              sign_up_at: facts.createdAt,
              terms_id: snapshot.terms_id,
              terms_snapshot: snapshot,
              host_label: labelFor(facts),
            })
            .select("id")
            .single(),
        ) as { id: string }
      ).id;
    }
    await runReferralChecks(db, referralId, config);
    await logPartnerEvent(db, {
      partner_id: partner.id,
      referral_id: referralId,
      actor,
      action: "referral_reassigned",
      details: {
        from: r?.partner_id ?? null,
        to: partner.id,
        reason: data.reason,
        forced: !!data.force,
      },
    });
    return { ok: true };
  });

/** Whether a partner's code may create a Referred Host now (partner-activation.ts). */
async function partnerCanRefer(
  db: import("./partner-data.server").AnyDb,
  partner: Record<string, any>,
): Promise<boolean> {
  const { activationFor } = await import("./partner-agreement.functions");
  const { canRefer } = await import("./partner-activation");
  return canRefer(await activationFor(db, partner), Date.now());
}
